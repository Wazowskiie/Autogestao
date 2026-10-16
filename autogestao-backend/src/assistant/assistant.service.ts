import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { PrismaService } from '../prisma/prisma.service';
import { AssistantLlmService, LlmContentBlock, LlmMessage } from './assistant-llm.service';
import { ACTION_NAMES, ACTION_TOOLS, AssistantToolsService, READ_TOOLS, currentMonthBR } from './assistant-tools.service';
import { SYSTEM_GUIDE } from './assistant.guide';
import { AssistantChatDto } from './assistant.dto';

const MAX_ROUNDS = 8;               // idas e voltas com as ferramentas por pergunta
const ACTION_TTL_MS = 15 * 60_000;  // o cartão de confirmação vale 15 minutos

export interface PendingActionCard {
  token: string;
  tool: string;
  summary: string;
}

const ROLE_LABEL: Record<string, string> = { owner: 'dono da loja', admin: 'administrador', seller: 'vendedor' };

@Injectable()
export class AssistantService {
  private readonly logger = new Logger('Assistente');
  // Contador de perguntas por pessoa por dia (limite de custo)
  private readonly usage = new Map<string, number>();
  // Confirmações já usadas (não deixa confirmar a mesma ação duas vezes)
  private readonly usedTokens = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: AssistantLlmService,
    private readonly tools: AssistantToolsService,
  ) {}

  status() {
    return { enabled: this.llm.enabled, dailyLimit: this.dailyLimit };
  }

  private get dailyLimit() {
    return Number(process.env.ASSISTANT_DAILY_LIMIT) || 150;
  }

  private secret() {
    const s = process.env.ASSISTANT_SECRET || process.env.JWT_ACCESS_SECRET;
    if (!s) throw new HttpException('Configure JWT_ACCESS_SECRET no .env do backend.', HttpStatus.INTERNAL_SERVER_ERROR);
    return s;
  }

  private countUse(u: AuthenticatedUser) {
    const key = `${u.userId}:${new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })}`;
    const used = (this.usage.get(key) ?? 0) + 1;
    if (used > this.dailyLimit) {
      throw new HttpException(`Você chegou ao limite de ${this.dailyLimit} perguntas por hoje. Amanhã libera de novo.`, HttpStatus.TOO_MANY_REQUESTS);
    }
    this.usage.set(key, used);
    if (this.usage.size > 5000) this.usage.clear();
  }

  private async systemPrompt(u: AuthenticatedUser, page?: string) {
    const [user, shop] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: u.userId }, select: { name: true } }),
      this.prisma.dealership.findUnique({ where: { id: u.dealershipId }, select: { name: true } }),
    ]);
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'short' });
    const manager = u.role !== 'seller';
    return `Você é a assistente virtual do AutoGestão, sistema de gestão da loja "${shop?.name ?? 'loja'}".
Você está conversando com ${user?.name ?? 'um usuário'}, que é ${ROLE_LABEL[u.role] ?? u.role}.
Agora é ${now} (horário de Brasília). Mês atual: ${currentMonthBR()}.${page ? `\nA pessoa está na tela: ${page}.` : ''}

COMO RESPONDER
- Sempre em português do Brasil, de forma simples, curta e direta, como uma colega de trabalho prestativa. Quem usa não é técnico.
- Para números e dados da loja, use SEMPRE as ferramentas. Nunca invente valores, nomes, placas ou ids.
- Se a ferramenta não trouxer o dado, diga que não encontrou e sugira onde olhar no sistema.
- Use listas curtas e **negrito** só quando ajudar. Valores sempre em reais (R$).
- Não mostre ids técnicos para a pessoa; use os ids só para chamar as ferramentas.
${manager ? '' : '- Esta pessoa é vendedora: não tem acesso a custo, lucro, financeiro ou promissórias. Se pedir, explique com gentileza que isso é só para o dono ou administrador.\n'}
AÇÕES
- Ferramentas que começam com "PREPARA" não fazem nada sozinhas: elas mostram um cartão para a pessoa confirmar.
- Depois de preparar, diga em uma frase o que vai acontecer e peça para ela clicar em **Confirmar** no cartão. Nunca diga que já fez.
- Prepare uma ação só quando a pessoa pedir ou concordar. Se faltar informação importante (ex.: nome do cliente, valor), pergunte antes.

TEXTOS
- Você pode escrever anúncios de veículos, mensagens de WhatsApp para clientes, mensagens de cobrança educadas e descrições.
- Para anúncio, busque os dados do veículo antes (detalhes_veiculo) e use só informações verdadeiras. Nunca mencione custo, lucro, chassi ou Renavam em texto para cliente.
- Entregue o texto pronto para copiar, sem explicações longas.

AJUDA COM O SISTEMA
${SYSTEM_GUIDE}`;
  }

  async chat(u: AuthenticatedUser, dto: AssistantChatDto) {
    const history = dto.messages.slice(-24);
    if (!history.length || history[history.length - 1].role !== 'user') {
      throw new BadRequestException('A última mensagem precisa ser sua.');
    }
    this.countUse(u);

    // A conversa enviada pelo navegador tem só os textos; as ferramentas rodam aqui dentro
    const messages: LlmMessage[] = [];
    for (const m of history) {
      const text = m.content.trim();
      if (!text) continue;
      const last = messages[messages.length - 1];
      if (last && last.role === m.role && typeof last.content === 'string') last.content += `\n\n${text}`;
      else messages.push({ role: m.role, content: text });
    }
    if (messages[0]?.role !== 'user') messages.shift();

    const system = await this.systemPrompt(u, dto.page);
    const tools = [...READ_TOOLS, ...ACTION_TOOLS];
    const actions: PendingActionCard[] = [];
    const usedTools: string[] = [];
    let reply = '';

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const res = await this.llm.create({ system, messages, tools });
      const text = res.content.filter((b): b is Extract<LlmContentBlock, { type: 'text' }> => b.type === 'text').map((b) => b.text).join('\n').trim();
      const calls = res.content.filter((b): b is Extract<LlmContentBlock, { type: 'tool_use' }> => b.type === 'tool_use');

      if (res.stop_reason !== 'tool_use' || calls.length === 0) {
        reply = text;
        break;
      }

      messages.push({ role: 'assistant', content: res.content });
      const results: LlmContentBlock[] = [];
      for (const call of calls) {
        usedTools.push(call.name);
        try {
          if (ACTION_NAMES.has(call.name)) {
            const prepared = await this.tools.prepare(u, call.name, call.input ?? {});
            const card = { token: this.sign(u, prepared.tool, prepared.input), tool: prepared.tool, summary: prepared.summary };
            actions.push(card);
            results.push({
              type: 'tool_result', tool_use_id: call.id,
              content: JSON.stringify({ status: 'aguardando_confirmacao', mostrado_para_a_pessoa: prepared.summary }),
            });
          } else {
            const data = await this.tools.runRead(u, call.name, call.input ?? {});
            results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(data).slice(0, 30_000) });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Erro ao consultar';
          results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify({ erro: message }), is_error: true });
        }
      }
      messages.push({ role: 'user', content: results });
      reply = text;
      if (round === MAX_ROUNDS - 1) reply ||= 'Essa pergunta precisou de muitas consultas. Pode tentar perguntar de um jeito mais específico?';
    }

    return {
      reply: reply || (actions.length ? 'Preparei a ação abaixo. Confira e clique em Confirmar.' : 'Não consegui montar uma resposta. Pode reformular?'),
      actions,
      usedTools,
    };
  }

  // ---------- Confirmação das ações ----------

  private sign(u: AuthenticatedUser, tool: string, input: Record<string, unknown>) {
    const payload = Buffer.from(JSON.stringify({
      n: randomUUID(), u: u.userId, d: u.dealershipId, t: tool, i: input, e: Date.now() + ACTION_TTL_MS,
    })).toString('base64url');
    const sig = createHmac('sha256', this.secret()).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  }

  private verify(u: AuthenticatedUser, token: string) {
    const [payload, sig] = String(token ?? '').split('.');
    if (!payload || !sig) throw new BadRequestException('Confirmação inválida.');
    const expected = createHmac('sha256', this.secret()).update(payload).digest();
    const given = Buffer.from(sig, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new BadRequestException('Confirmação inválida.');
    let data: { n: string; u: string; d: string; t: string; i: Record<string, unknown>; e: number };
    try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw new BadRequestException('Confirmação inválida.'); }
    if (data.u !== u.userId || data.d !== u.dealershipId) throw new BadRequestException('Esta confirmação é de outro usuário.');
    if (Date.now() > data.e) throw new BadRequestException('Esta confirmação expirou. Peça de novo para a assistente.');
    if (this.usedTokens.has(data.n)) throw new BadRequestException('Esta ação já foi confirmada.');
    return data;
  }

  async confirm(u: AuthenticatedUser, token: string) {
    const data = this.verify(u, token);
    this.usedTokens.set(data.n, data.e);
    for (const [k, exp] of this.usedTokens) if (exp < Date.now()) this.usedTokens.delete(k);
    try {
      const message = await this.tools.execute(u, data.t, data.i);
      this.logger.log(`Ação "${data.t}" confirmada por ${u.userId}`);
      await this.prisma.auditLog.create({
        data: { dealershipId: u.dealershipId, userId: u.userId, action: `assistant_${data.t}`, entity: 'assistant', metadata: data.i as any },
      }).catch(() => undefined);
      return { ok: true, message };
    } catch (err) {
      this.usedTokens.delete(data.n); // deu erro: deixa tentar de novo
      throw err;
    }
  }
}
