const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
require('reflect-metadata');
const { PrismaClient } = require('../dist/src/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { CrmService } = require('../dist/src/crm/crm.service');
const { VehicleDetailsService } = require('../dist/src/vehicle-details/vehicle-details.service');
const { StorageService } = require('../dist/src/vehicle-details/storage.service');
const { AssistantToolsService } = require('../dist/src/assistant/assistant-tools.service');
const { AssistantService } = require('../dist/src/assistant/assistant.service');

// IA simulada: devolve as respostas da fila, na ordem
class FakeLlm {
  constructor() { this.queue = []; this.calls = []; this.enabled = true; }
  async create(req) { this.calls.push(req); const r = this.queue.shift(); if (!r) throw new Error('fila vazia'); return typeof r === 'function' ? r(req) : r; }
}
let db, server, prisma, tools, llm, assistant, shop, owner, seller, otherShopOwner, vehicle;
const actor = (u) => ({ userId: u.id, dealershipId: u.dealershipId, role: u.role });
const ask = (u, text) => assistant.chat(actor(u), { messages: [{ role: 'user', content: text }] });

before(async () => {
  process.env.JWT_ACCESS_SECRET = 'segredo-de-teste';
  process.env.STORAGE_DIR = fs.mkdtempSync(path.join(require('os').tmpdir(), 'st-'));
  const { PGlite } = await import('@electric-sql/pglite');
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
  db = await PGlite.create();
  const dir = path.join(__dirname, '../prisma/migrations');
  for (const name of fs.readdirSync(dir).sort()) { const f = path.join(dir, name, 'migration.sql'); if (fs.existsSync(f)) await db.exec(fs.readFileSync(f, 'utf8')); }
  server = new PGLiteSocketServer({ db, port: 55470, host: '127.0.0.1', maxConnections: 10 }); await server.start();
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:55470/postgres', max: 1 }) }); await prisma.$connect();
  tools = new AssistantToolsService(prisma, new CrmService(prisma), new VehicleDetailsService(prisma, new StorageService()));
  llm = new FakeLlm(); assistant = new AssistantService(prisma, llm, tools);
  shop = await prisma.dealership.create({ data: { name: 'Mundo das Motos', slug: 'mdm' } });
  const other = await prisma.dealership.create({ data: { name: 'Outra', slug: 'outra' } });
  owner = await prisma.user.create({ data: { dealershipId: shop.id, role: 'owner', name: 'Isabel', email: 'i@x.invalid', passwordHash: 'x' } });
  seller = await prisma.user.create({ data: { dealershipId: shop.id, role: 'seller', name: 'João', email: 'j@x.invalid', passwordHash: 'x' } });
  otherShopOwner = await prisma.user.create({ data: { dealershipId: other.id, role: 'owner', name: 'Fulano', email: 'f@x.invalid', passwordHash: 'x' } });
  vehicle = await prisma.vehicle.create({ data: { dealershipId: shop.id, brand: 'Honda', model: 'PCX 160', year: 2026, type: 'moto', price: 28000, cost: 25000, plate: 'UUT6I26', color: 'Preta', createdAt: new Date(Date.now() - 70 * 86400000) } });
  await prisma.vehicle.create({ data: { dealershipId: other.id, brand: 'Honda', model: 'Biz', year: 2020, price: 9000, cost: 7000 } });
});
after(async () => { if (prisma) await prisma.$disconnect(); if (server) await server.stop(); if (db) await db.close(); });

test('Consulta de estoque usa a ferramenta e só mostra veículos da própria loja', async () => {
  llm.queue.push({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'buscar_veiculos', input: { parado_ha_dias_min: 60 } }] });
  llm.queue.push((req) => {
    const result = JSON.parse(req.messages.at(-1).content[0].content);
    assert.equal(result.total, 1); assert.equal(result.veiculos[0].veiculo, 'Honda PCX 160 2026 (UUT6I26)'); assert.equal(result.veiculos[0].custo, 'R$ 25.000,00');
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Você tem 1 veículo parado há mais de 60 dias: Honda PCX 160.' }] };
  });
  const r = await ask(owner, 'quais motos estão paradas há mais de 60 dias?');
  assert.match(r.reply, /PCX 160/); assert.deepEqual(r.usedTools, ['buscar_veiculos']); assert.equal(r.actions.length, 0);
  assert.match(llm.calls[0].system, /Mundo das Motos/); assert.match(llm.calls[0].system, /Isabel/);
});

test('Vendedor não vê custo nem financeiro', async () => {
  const v = await tools.runRead(actor(seller), 'buscar_veiculos', {});
  assert.equal(v.veiculos[0].custo, undefined);
  await assert.rejects(tools.runRead(actor(seller), 'resumo_financeiro', {}), /Só o dono/);
  await assert.rejects(tools.runRead(actor(seller), 'promissorias', { situacao: 'vencidas' }), /Só o dono/);
  const d = await tools.runRead(actor(seller), 'detalhes_veiculo', { veiculo_id: vehicle.id });
  assert.equal(d.custo_total, undefined);
});

test('Erro numa ferramenta volta para a IA em vez de quebrar a conversa', async () => {
  llm.queue.push({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'resumo_financeiro', input: {} }] });
  llm.queue.push((req) => {
    const block = req.messages.at(-1).content[0]; assert.equal(block.is_error, true); assert.match(block.content, /Só o dono/);
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'O financeiro é só para o dono ou administrador.' }] };
  });
  const r = await ask(seller, 'quanto entrou no caixa?');
  assert.match(r.reply, /dono/);
});

test('Ação só acontece depois de confirmar, e não pode ser repetida nem adulterada', async () => {
  llm.queue.push({ stop_reason: 'tool_use', content: [{ type: 'text', text: 'Vou preparar.' }, { type: 'tool_use', id: 't1', name: 'adicionar_pendencia', input: { veiculo_id: vehicle.id, descricao: 'Trocar óleo' } }] });
  llm.queue.push({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Preparei. Clique em Confirmar.' }] });
  const r = await ask(owner, 'adiciona pendência de trocar óleo na PCX');
  assert.equal(r.actions.length, 1); assert.match(r.actions[0].summary, /Trocar óleo/);
  assert.equal(await prisma.vehiclePendency.count(), 0); // nada foi feito ainda

  const [payload, sig] = r.actions[0].token.split('.');
  const tampered = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url')), i: { veiculo_id: vehicle.id, descricao: 'Outra coisa' } })).toString('base64url');
  await assert.rejects(assistant.confirm(actor(owner), `${tampered}.${sig}`), /inválida/);
  await assert.rejects(assistant.confirm(actor(seller), r.actions[0].token), /outro usuário/);

  const ok = await assistant.confirm(actor(owner), r.actions[0].token);
  assert.equal(ok.ok, true); assert.equal(await prisma.vehiclePendency.count(), 1);
  await assert.rejects(assistant.confirm(actor(owner), r.actions[0].token), /já foi confirmada/);
});

test('Criar lead e tarefa pelo chat', async () => {
  const p = await tools.prepare(actor(seller), 'criar_lead', { nome: 'Mateus Andrade', telefone: '85999990000', veiculo_id: vehicle.id, temperatura: 'hot' });
  assert.match(p.summary, /Mateus Andrade/); assert.match(p.summary, /PCX 160/);
  await tools.execute(actor(seller), 'criar_lead', p.input);
  const lead = await prisma.lead.findFirst({ include: { customer: true } });
  assert.equal(lead.customer.name, 'Mateus Andrade'); assert.equal(lead.assignedSellerId, seller.id);
  const t = await tools.prepare(actor(seller), 'criar_tarefa_crm', { lead_id: lead.id, titulo: 'Ligar para confirmar visita', vencimento: new Date(Date.now() + 3600e3).toISOString() });
  await tools.execute(actor(seller), 'criar_tarefa_crm', t.input);
  const tasks = await tools.runRead(actor(seller), 'tarefas_crm', { periodo: 'proximas' });
  assert.ok(tasks.tarefas.some((x) => x.titulo === 'Ligar para confirmar visita'));
  const leads = await tools.runRead(actor(seller), 'buscar_leads', { texto: 'Mateus' });
  assert.equal(leads.total, 1);
});

test('Vendedor não pode alterar preço; outra loja não acha o veículo', async () => {
  await assert.rejects(tools.prepare(actor(seller), 'alterar_preco_veiculo', { veiculo_id: vehicle.id, novo_preco: 1 }), /Só o dono/);
  await assert.rejects(tools.prepare(actor(otherShopOwner), 'adicionar_pendencia', { veiculo_id: vehicle.id, descricao: 'x y' }), /não encontrado/);
  const p = await tools.prepare(actor(owner), 'alterar_preco_veiculo', { veiculo_id: vehicle.id, novo_preco: 27500 });
  await tools.execute(actor(owner), 'alterar_preco_veiculo', p.input);
  assert.equal(Number((await prisma.vehicle.findUnique({ where: { id: vehicle.id } })).price), 27500);
});

test('Despesa no veículo entra nos lançamentos e no financeiro; resumo de vendas funciona', async () => {
  const p = await tools.prepare(actor(owner), 'lancar_despesa_veiculo', { veiculo_id: vehicle.id, descricao: 'Pneu traseiro', valor: 350 });
  await tools.execute(actor(owner), 'lancar_despesa_veiculo', p.input);
  const fin = await tools.runRead(actor(owner), 'resumo_financeiro', {});
  assert.equal(fin.despesas_a_pagar, 'R$ 350,00');
  const vendas = await tools.runRead(actor(owner), 'resumo_vendas', {});
  assert.equal(vendas.quantidade, 0);
});
