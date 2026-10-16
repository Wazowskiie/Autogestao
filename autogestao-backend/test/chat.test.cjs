const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
require('reflect-metadata');
const { PrismaClient } = require('../dist/src/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { ChatService } = require('../dist/src/chat/chat.service');
const { ChatAiService, CHAT_VEHICLE_SELECT, parseOllamaReply } = require('../dist/src/chat/chat-ai.service');
let db, server, prisma, service, a, b, user, vehicle;
before(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
  db = await PGlite.create();
  const dir = path.join(__dirname, '../prisma/migrations');
  for (const name of fs.readdirSync(dir).sort()) {
    const file = path.join(dir, name, 'migration.sql');
    if (fs.existsSync(file)) await db.exec(fs.readFileSync(file, 'utf8'));
  }
  server = new PGLiteSocketServer({ db, port: 55439, host: '127.0.0.1', maxConnections: 10 });
  await server.start();
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:55439/postgres', max: 1 }) });
  await prisma.$connect();
  a = await prisma.dealership.create({ data: { name: 'Loja A', slug: 'test-a' } });
  b = await prisma.dealership.create({ data: { name: 'Loja B', slug: 'test-b' } });
  user = await prisma.user.create({ data: { dealershipId: a.id, name: 'Vendedor', email: 'agent@example.invalid', passwordHash: 'unused' } });
  vehicle = await prisma.vehicle.create({ data: { dealershipId: a.id, brand: 'Honda', model: 'CG', year: 2024, cost: 10000, price: 15000 } });
  service = new ChatService(prisma, { reply: async () => 'Resposta de teste' });
});
after(async () => { if(prisma) await prisma.$disconnect(); if(server) await server.stop(); if(db) await db.close(); });

test('Sessão pública não revela hash e é isolada por loja/token', async () => {
  const s = await service.start('test-a');
  assert.equal(s.token.length, 64);
  assert(!('tokenHash' in s.conversation));
  assert(!('dealershipId' in s.conversation));
  assert.equal((await service.read('test-a', s.token)).id, s.conversation.id);
  await assert.rejects(service.read('test-b', s.token), /expirada/);
  await assert.rejects(service.read('test-a', 'invalid'), /inválida/);
  await assert.rejects(service.detail(b.id, s.conversation.id), /não encontrada/);
});
test('Mensagem repetida não duplica nem chama IA novamente', async () => {
  const s = await service.start('test-a');
  const dto = { content: 'Quero uma moto', clientMessageId: randomUUID() };
  await service.send('test-a', s.token, dto);
  const c = await service.send('test-a', s.token, dto);
  assert.equal(c.messages.filter(m => m.role === 'user').length, 1);
  assert.equal(c.messages.filter(m => m.content === 'Resposta de teste').length, 1);
});
test('Contato exige consentimento e reutiliza cliente/lead da loja', async () => {
  const s = await service.start('test-a');
  const data = { name: 'Maria Cliente', phone: '11999990001', consent: true, vehicleId: vehicle.id };
  await assert.rejects(service.contact('test-a', s.token, { ...data, consent: false }), /Autorize/);
  await service.contact('test-a', s.token, data);
  await service.contact('test-a', s.token, data);
  const second = await service.start('test-a');
  await service.contact('test-a', second.token, data);
  assert.equal(await prisma.customer.count({ where: { dealershipId: a.id, phone: data.phone } }), 1);
  const leads = await prisma.lead.findMany({ where: { dealershipId: a.id, customer: { phone: data.phone } } });
  assert.equal(leads.length, 1); assert.equal(leads[0].vehicleId, vehicle.id);
  const other = await service.start('test-b');
  await assert.rejects(service.contact('test-b', other.token, data), /não disponível/);
  await service.contact('test-b', other.token, { ...data, vehicleId: undefined });
  assert.equal(await prisma.customer.count({ where: { phone: data.phone } }), 2);
});
test('Assumir pausa IA, permite resposta humana e encerrar bloqueia envio', async () => {
  const s = await service.start('test-a');
  await service.setMode(a.id, s.conversation.id, 'human', user.id);
  await service.send('test-a', s.token, { content: 'Olá vendedor', clientMessageId: randomUUID() });
  await service.agentReply(a.id, s.conversation.id, user.id, { content: 'Olá! Podemos ajudar.', clientMessageId: randomUUID() });
  let c = await service.read('test-a', s.token);
  assert(c.messages.some(m => m.role === 'agent'));
  assert(!c.messages.some(m => m.content === 'Resposta de teste'));
  await service.setMode(a.id, c.id, 'closed', user.id);
  await assert.rejects(service.send('test-a', s.token, { content: 'teste', clientMessageId: randomUUID() }), /encerrada/);
});
test('Resposta pendente de IA é descartada após transferência para humano', async () => {
  const s = await service.start('test-a');
  let resolveReply, markStarted;
  const started = new Promise(r => { markStarted = r; });
  const delayed = new ChatService(prisma, { reply: async () => { markStarted(); return new Promise(r => { resolveReply = r; }); } });
  const pending = delayed.send('test-a', s.token, { content: 'Interesse', clientMessageId: randomUUID() });
  await started;
  await service.setMode(a.id, s.conversation.id, 'human', user.id);
  resolveReply('Resposta atrasada');
  await pending;
  assert(!(await service.read('test-a', s.token)).messages.some(m => m.content === 'Resposta atrasada'));
});
test('Provedor de IA recebe apenas campos públicos e loja correta', async () => {
  assert(!('cost' in CHAT_VEHICLE_SELECT)); assert(!('chassis' in CHAT_VEHICLE_SELECT));
  const original = global.fetch;
  let payload;
  global.fetch = async (_url, options) => { payload = JSON.parse(options.body); return { ok: true, json: async () => ({ output: [{ type: 'reasoning' }, { type: 'message', content: [{ type: 'output_text', text: 'Resposta IA' }] }] }) }; };
  const config = { get: (key, fallback) => ({ CHAT_PROVIDER: 'openai', OPENAI_MODEL: 'model-test', OPENAI_API_KEY: 'test-only' }[key] ?? fallback) };
  try {
    const ai = new ChatAiService(prisma, config);
    assert.equal(await ai.reply(a.id, [{ role: 'user', content: 'Olá' }]), 'Resposta IA');
    assert(payload.instructions.includes('Loja A')); assert(!payload.instructions.includes('Loja B'));
    assert(!payload.instructions.includes('passwordHash')); assert(!payload.instructions.includes('tokenHash'));
    assert.equal(payload.store, false);
  } finally { global.fetch = original; }
});
test('Falha do provedor é persistida como orientação de atendimento humano', async () => {
  const s = await service.start('test-a');
  const failed = new ChatService(prisma, { reply: async () => { throw new Error('Provider down'); } });
  const c = await failed.send('test-a', s.token, { content: 'Olá', clientMessageId: randomUUID() });
  assert(c.messages.some(m => m.content.includes('temporariamente indisponível')));
});

test('Usuário desativado não autentica no painel', async () => {
  const { JwtStrategy } = require('../dist/src/auth/strategies/jwt.strategy');
  const strategy = new JwtStrategy({ getOrThrow: () => 'test-jwt-key' }, prisma);
  await prisma.user.update({ where: { id: user.id }, data: { active: false } });
  await assert.rejects(strategy.validate({ sub: user.id, dealershipId: a.id, role: 'seller' }), /Sessão inválida/);
  await prisma.user.update({ where: { id: user.id }, data: { active: true } });
});

test('Ollama usa endpoint local sem chave e envia contexto restrito', async () => {
  const original = global.fetch;
  let url, payload, headers;
  global.fetch = async (target, options) => {
    if (String(target).endsWith('/api/show')) return { ok: true, json: async () => ({ thinking: { values: [true] }, capabilities: ['thinking'] }) };
    url = String(target); payload = JSON.parse(options.body); headers = options.headers;
    return { ok: true, json: async () => ({ message: { content: JSON.stringify({ reply: 'Olá da IA local' }), thinking: 'Internal reasoning must stay private' }, done_reason: 'stop' }) };
  };
  try {
    const config = { get: (key, fallback) => ({ CHAT_PROVIDER: 'ollama', OLLAMA_MODEL: 'qwen3:4b' }[key] ?? fallback) };
    const ai = new ChatAiService(prisma, config);
    assert.equal(await ai.reply(a.id, [{role: 'user', content:'Procuro uma moto'}]), 'Olá da IA local');
    assert.equal(url, 'http://127.0.0.1:11434/api/chat'); assert(!headers.Authorization);
    assert.equal(payload.stream, false); assert.equal(payload.think, true);
    assert.deepEqual(payload.format.required, ['reply']);
    assert(payload.messages[0].content.includes('Loja A')); assert(!payload.messages[0].content.includes('Loja B'));
    assert.equal(ai.timeoutMs(), 120000);
  } finally { global.fetch = original; }
});

test('Raciocínio separado, bruto ou truncado nunca vira resposta ao cliente', () => {
  assert.equal(parseOllamaReply({ message: { content: '{"reply":"Olá! Veja os veículos disponíveis."}', thinking: 'Okay let me think' } }), 'Olá! Veja os veículos disponíveis.');
  assert.throws(() => parseOllamaReply({ message: { content: 'Okay, the user said...', thinking: 'Private reasoning' } }));
  assert.throws(() => parseOllamaReply({ message: { thinking: 'Private reasoning only' } }));
  assert.throws(() => parseOllamaReply({ message: { content: '{"reply":"<think>unfinished"}' } }));
  assert.throws(() => parseOllamaReply({ message: { content: '{"reply":"Resposta"}' }, done_reason: 'length' }));
  assert.equal(parseOllamaReply({ message: { content: '{"reply":"<think>internal</think>Olá!"}' } }), 'Olá!');
});
test('Modelo cloud não é aceito no modo local', async () => {
  const config = { get: (key, fallback) => ({ CHAT_PROVIDER: 'ollama', OLLAMA_MODEL: 'qwen3:cloud' }[key] ?? fallback) };
  await assert.rejects(new ChatAiService(prisma, config).reply(a.id, []), /modelo local/);
});

test('Modelo sem raciocínio recebe think false e responde normalmente', async () => {
  const original = global.fetch;
  let chatPayload;
  global.fetch = async (target, options) => {
    if (String(target).endsWith('/api/show')) return { ok: true, json: async () => ({ thinking: { values: [false] } }) };
    chatPayload = JSON.parse(options.body);
    return { ok: true, json: async () => ({ message: { content: '{"reply":"Veja os veículos disponíveis."}' }, done_reason: 'stop' }) };
  };
  try {
    const config = { get: (key, fallback) => ({ CHAT_PROVIDER: 'ollama', OLLAMA_MODEL: 'qwen3:4b-instruct' }[key] ?? fallback) };
    assert.equal(await new ChatAiService(prisma, config).reply(a.id, [{ role: 'user', content: 'Olá' }]), 'Veja os veículos disponíveis.');
    assert.equal(chatPayload.think, false);
  } finally { global.fetch = original; }
});
