import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

// Formato das mensagens da API do Claude (Anthropic)
export type LlmContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string | LlmContentBlock[];
}

export interface LlmTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  tools: LlmTool[];
}

export interface LlmResponse {
  content: LlmContentBlock[];
  stop_reason: string | null;
}

/**
 * Conversa com o Claude pela API da Anthropic.
 * A chave fica só no .env do backend (ANTHROPIC_API_KEY) e nunca vai para o navegador.
 */
@Injectable()
export class AssistantLlmService {
  private readonly logger = new Logger('Assistente');

  get enabled() {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  get model() {
    return process.env.ASSISTANT_MODEL || 'claude-sonnet-5-5';
  }

  async create(req: LlmRequest): Promise<LlmResponse> {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new ServiceUnavailableException(
        'A assistente ainda não foi configurada. Coloque a ANTHROPIC_API_KEY no .env do backend.',
      );
    }

    let res: Response;
    try {
      res = await fetch(`${(process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: Number(process.env.ASSISTANT_MAX_TOKENS) || 2000,
          system: req.system,
          tools: req.tools,
          messages: req.messages,
        }),
        signal: AbortSignal.timeout(Number(process.env.ASSISTANT_TIMEOUT_MS) || 90_000),
      });
    } catch {
      throw new ServiceUnavailableException('Não consegui falar com a assistente agora. Tente de novo em instantes.');
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.warn(`Anthropic respondeu ${res.status}: ${body.slice(0, 500)}`);
      if (res.status === 401 || res.status === 403) {
        throw new ServiceUnavailableException('A chave da assistente (ANTHROPIC_API_KEY) é inválida ou não tem permissão.');
      }
      if (res.status === 404 || res.status === 400) {
        throw new ServiceUnavailableException(
          `A assistente recusou o pedido. Confira o ASSISTANT_MODEL no .env (atual: ${this.model}).`,
        );
      }
      if (res.status === 429) {
        throw new ServiceUnavailableException('A assistente atingiu o limite de uso da conta. Tente daqui a pouco.');
      }
      throw new ServiceUnavailableException('A assistente está indisponível no momento. Tente de novo em instantes.');
    }

    const data = (await res.json()) as LlmResponse;
    return { content: Array.isArray(data.content) ? data.content : [], stop_reason: data.stop_reason ?? null };
  }
}
