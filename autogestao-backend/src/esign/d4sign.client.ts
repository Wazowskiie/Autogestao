import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Cliente da API da D4Sign (https://docapi.d4sign.com.br).
 * A conta é uma só, da Chronos: cada loja ganha uma pasta dentro do cofre.
 *
 * .env:
 *   D4SIGN_BASE_URL     https://sandbox.d4sign.com.br/api/v1 (testes) ou https://secure.d4sign.com.br/api/v1 (produção)
 *   D4SIGN_TOKEN_API    tokenAPI (menu "Dev API" da D4Sign)
 *   D4SIGN_CRYPT_KEY    cryptKey (menu "Dev API" da D4Sign)
 *   D4SIGN_SAFE_UUID    UUID do cofre onde os documentos ficam
 *   D4SIGN_HMAC_SECRET  "Secret Key MAC" para conferir os avisos (webhook) — opcional, mas recomendado
 */

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) =>
  Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface D4SignSignerInput {
  email: string;
  /** Telefone com DDI (+55...) para receber o link pelo WhatsApp */
  whatsapp?: string | null;
  /** 1 = assinar, 4 = assinar como parte, 5 = testemunha */
  act: '1' | '4' | '5';
}

export interface D4SignSignerStatus {
  email: string;
  signed: boolean;
  signedAt: string | null;
  keySigner: string | null;
}

@Injectable()
export class D4SignClient {
  fetchImpl: FetchLike = (url, init) => fetch(url, init as RequestInit) as unknown as ReturnType<FetchLike>;

  private get base() { return (process.env.D4SIGN_BASE_URL || 'https://sandbox.d4sign.com.br/api/v1').replace(/\/$/, ''); }
  get safeUuid() { return process.env.D4SIGN_SAFE_UUID || ''; }
  get configured() { return !!(process.env.D4SIGN_TOKEN_API && this.safeUuid); }
  get sandbox() { return this.base.includes('sandbox'); }

  private url(path: string) {
    const q = new URLSearchParams({ tokenAPI: process.env.D4SIGN_TOKEN_API ?? '' });
    if (process.env.D4SIGN_CRYPT_KEY) q.set('cryptKey', process.env.D4SIGN_CRYPT_KEY);
    return `${this.base}${path}?${q.toString()}`;
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    if (!this.configured) throw new ServiceUnavailableException('A assinatura eletrônica ainda não foi configurada no servidor.');
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await this.fetchImpl(this.url(path), {
        method,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new BadGatewayException('Não foi possível falar com a D4Sign agora. Tente de novo em alguns minutos.');
    }
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
    if (!res.ok) {
      const msg = typeof data?.message === 'string' ? data.message : Array.isArray(data?.message) ? data.message.join(' ') : '';
      if (res.status === 429 || /limit/i.test(msg)) {
        throw new ServiceUnavailableException('A D4Sign recusou por excesso de envios nesta hora. Tente de novo mais tarde.');
      }
      throw new BadGatewayException(`A D4Sign recusou o pedido${msg ? `: ${msg}` : ''}.`);
    }
    return data as T;
  }

  /** Cria a pasta da loja dentro do cofre e devolve o UUID */
  async createFolder(name: string) {
    const r = await this.call<{ uuid?: string }>('POST', `/folders/${this.safeUuid}/create`, { folder_name: name.slice(0, 100) });
    if (!r?.uuid) throw new BadGatewayException('A D4Sign não devolveu a pasta da loja.');
    return r.uuid;
  }

  /** Envia o PDF (em base64) e devolve o UUID do documento */
  async uploadPdf(folderUuid: string | null, name: string, base64: string) {
    const r = await this.call<{ uuid?: string }>('POST', `/documents/${this.safeUuid}/uploadbinary`, {
      base64_binary_file: base64, mime_type: 'application/pdf', name: name.slice(0, 150),
      ...(folderUuid ? { uuid_folder: folderUuid } : {}),
    });
    if (!r?.uuid) throw new BadGatewayException('A D4Sign não devolveu o documento enviado.');
    return r.uuid;
  }

  async addSigners(docUuid: string, signers: D4SignSignerInput[]) {
    await this.call('POST', `/documents/${docUuid}/createlist`, {
      signers: signers.map((s) => ({
        email: s.email, act: s.act, foreign: '0', certificadoicpbr: '0', assinatura_presencial: '0',
        docauth: '0', docauthandselfie: '0', embed_methodauth: 'email', embed_smsnumber: '', upload_allow: '0', upload_obs: '',
        ...(s.whatsapp ? { whatsapp_number: s.whatsapp } : {}),
      })),
    });
  }

  async registerWebhook(docUuid: string, url: string) {
    await this.call('POST', `/documents/${docUuid}/webhooks`, { url });
  }

  async send(docUuid: string, message: string) {
    await this.call('POST', `/documents/${docUuid}/sendtosigner`, { skip_email: '0', workflow: '0', message: message.slice(0, 500) });
  }

  /** Situação do documento e de cada signatário */
  async status(docUuid: string): Promise<{ statusId: number; signers: D4SignSignerStatus[] }> {
    const r = await this.call<any>('GET', `/documents/${docUuid}/list`);
    const doc = Array.isArray(r) ? r[0] : r;
    const list = Array.isArray(doc?.list) ? doc.list : doc?.list ? Object.values(doc.list) : [];
    return {
      statusId: Number(doc?.statusId) || 0,
      signers: (list as any[]).map((s) => ({
        email: String(s.email ?? '').toLowerCase(),
        signed: String(s.signed) === '1',
        signedAt: s.sign_info?.date_signed_atom || s.sign_info?.date_signed || null,
        keySigner: s.key_signer ?? null,
      })),
    };
  }

  /** Link temporário para baixar o PDF assinado */
  async downloadUrl(docUuid: string) {
    const r = await this.call<{ url?: string }>('POST', `/documents/${docUuid}/download`, { type: 'PDF', language: 'pt' });
    if (!r?.url) throw new BadGatewayException('A D4Sign não devolveu o link do documento.');
    return r.url;
  }

  async cancel(docUuid: string, comment: string) {
    await this.call('POST', `/documents/${docUuid}/cancel`, { comment: comment.slice(0, 200) });
  }

  async resend(docUuid: string, email: string, keySigner: string) {
    await this.call('POST', `/documents/${docUuid}/resend`, { email, key_signer: keySigner });
  }

  /** Confere o cabeçalho Content-Hmac (sha256 do UUID do documento com a Secret Key MAC) */
  verifyHmac(docUuid: string, header?: string) {
    const secret = process.env.D4SIGN_HMAC_SECRET;
    if (!secret) return true; // sem secret configurada: o aviso só dispara uma nova consulta à D4Sign
    if (!header) return false;
    const expected = createHmac('sha256', secret).update(docUuid).digest('hex');
    const got = header.replace(/^sha256=/i, '').trim().toLowerCase();
    return got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  }
}
