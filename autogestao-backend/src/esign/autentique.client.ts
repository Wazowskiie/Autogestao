import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Cliente da API da Autentique (GraphQL): https://docs.autentique.com.br/api
 * A conta é uma só, da Chronos: cada loja ganha uma pasta própria.
 *
 * .env:
 *   AUTENTIQUE_TOKEN           chave da API (painel da Autentique → Configurações → API)
 *   AUTENTIQUE_SANDBOX         true = documentos de teste (não são cobrados, sem validade jurídica). Padrão: true
 *   AUTENTIQUE_WEBHOOK_SECRET  segredo do webhook cadastrado no painel (confere os avisos)
 */

const URL_API = 'https://api.autentique.com.br/v2/graphql';

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string | FormData }) =>
  Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface SignerRequest {
  name: string;
  email?: string | null;
  /** +5585999999999 para receber pelo WhatsApp */
  whatsapp?: string | null;
  action: 'SIGN' | 'SIGN_AS_A_WITNESS';
}

export interface SignatureState {
  publicId: string;
  email: string | null;
  name: string | null;
  signedAt: string | null;
  rejectedAt: string | null;
}

@Injectable()
export class AutentiqueClient {
  fetchImpl: FetchLike = (url, init) => fetch(url, init as RequestInit) as unknown as ReturnType<FetchLike>;

  get configured() { return !!process.env.AUTENTIQUE_TOKEN; }
  /** Enquanto não mudar para false no .env, tudo vai como teste */
  get sandbox() { return process.env.AUTENTIQUE_SANDBOX !== 'false'; }

  private async call<T>(body: string | FormData): Promise<T> {
    if (!this.configured) throw new ServiceUnavailableException('A assinatura eletrônica ainda não foi configurada no servidor.');
    const headers: Record<string, string> = { Authorization: `Bearer ${process.env.AUTENTIQUE_TOKEN}` };
    if (typeof body === 'string') headers['Content-Type'] = 'application/json';
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await this.fetchImpl(URL_API, { method: 'POST', headers, body });
    } catch {
      throw new BadGatewayException('Não foi possível falar com a Autentique agora. Tente de novo em alguns minutos.');
    }
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    const err = data?.errors?.[0]?.message ?? (res.ok ? null : data?.message ?? `erro ${res.status}`);
    if (res.status === 429) throw new ServiceUnavailableException('A Autentique recusou por excesso de pedidos. Tente de novo em um minuto.');
    if (res.status === 401 || res.status === 403) throw new ServiceUnavailableException('A chave da Autentique no servidor é inválida ou expirou.');
    if (err) throw new BadGatewayException(`A Autentique recusou o pedido: ${err}`);
    return data.data as T;
  }

  private gql<T>(query: string, variables: Record<string, unknown> = {}) {
    return this.call<T>(JSON.stringify({ query, variables }));
  }

  /** Pasta da loja (organiza os documentos de cada loja) */
  async createFolder(name: string) {
    const r = await this.gql<{ createFolder: { id: string } }>(
      'mutation($folder: FolderInput!) { createFolder(folder: $folder) { id } }',
      { folder: { name: name.slice(0, 100) } },
    );
    return r.createFolder.id;
  }

  /** Sobe o PDF já com os signatários; a Autentique manda os links */
  async createDocument(input: { folderId: string | null; name: string; message: string; pdf: Buffer; signers: SignerRequest[] }) {
    const query = `mutation($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!${input.folderId ? ', $folder: UUID' : ''}) {
      createDocument(sandbox: ${this.sandbox ? 'true' : 'false'}, document: $document, signers: $signers, file: $file${input.folderId ? ', folder_id: $folder' : ''}) {
        id
        signatures { public_id name email action { name } }
      }
    }`;
    const variables: Record<string, unknown> = {
      document: { name: input.name.slice(0, 150), message: input.message.slice(0, 500), refusable: true },
      signers: input.signers.map((s) => (s.whatsapp
        ? { name: s.name, phone: s.whatsapp, delivery_method: 'DELIVERY_METHOD_WHATSAPP', action: s.action }
        : { email: s.email, action: s.action })),
      file: null,
      ...(input.folderId ? { folder: input.folderId } : {}),
    };
    const form = new FormData();
    form.append('operations', JSON.stringify({ query, variables }));
    form.append('map', JSON.stringify({ file: ['variables.file'] }));
    form.append('file', new Blob([new Uint8Array(input.pdf)], { type: 'application/pdf' }), 'documento.pdf');
    const r = await this.call<{ createDocument: { id: string; signatures: { public_id: string; name: string | null; email: string | null; action: { name: string } | null }[] } }>(form);
    if (!r?.createDocument?.id) throw new BadGatewayException('A Autentique não devolveu o documento criado.');
    return {
      id: r.createDocument.id,
      // a primeira assinatura costuma ser a do dono da conta (Chronos), sem ação: fica de fora
      signatures: r.createDocument.signatures.filter((s) => s.action).map((s) => ({ publicId: s.public_id, name: s.name, email: s.email?.toLowerCase() ?? null })),
    };
  }

  /** Situação de cada assinatura e o link do PDF assinado */
  async document(id: string) {
    const r = await this.gql<{ document: { id: string; files: { original: string | null; signed: string | null } | null; signatures: { public_id: string; name: string | null; email: string | null; action: { name: string } | null; signed: { created_at: string } | null; rejected: { created_at: string } | null }[] } | null }>(
      `query($id: UUID!) { document(id: $id) {
        id files { original signed }
        signatures { public_id name email action { name } signed { created_at } rejected { created_at } }
      } }`,
      { id },
    );
    if (!r?.document) throw new BadGatewayException('Documento não encontrado na Autentique.');
    return {
      original: r.document.files?.original ?? null,
      signedFile: r.document.files?.signed ?? null,
      signatures: r.document.signatures.filter((s) => s.action).map<SignatureState>((s) => ({
        publicId: s.public_id, email: s.email?.toLowerCase() ?? null, name: s.name,
        signedAt: s.signed?.created_at ?? null, rejectedAt: s.rejected?.created_at ?? null,
      })),
    };
  }

  async deleteDocument(id: string) {
    await this.gql('mutation($id: UUID!) { deleteDocument(id: $id) }', { id });
  }

  async resend(publicIds: string[]) {
    if (!publicIds.length) return;
    await this.gql('mutation($ids: [UUID!]!) { resendSignatures(public_ids: $ids) }', { ids: publicIds });
  }

  /** Confere o cabeçalho x-autentique-signature (HMAC-SHA256 do corpo, em hex) */
  verifyWebhook(rawBody: Buffer | undefined, header?: string) {
    const secret = process.env.AUTENTIQUE_WEBHOOK_SECRET;
    if (!secret) return true; // sem segredo: o aviso só dispara uma nova consulta à Autentique
    if (!rawBody || !header) return false;
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const got = header.replace(/^sha256=/i, '').trim().toLowerCase();
    return got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  }
}

/** Acha o(s) id(s) de documento num aviso da Autentique (o formato varia por tipo de evento) */
export function documentIdsFromEvent(body: any): string[] {
  const e = body?.event ?? body;
  const d = e?.data ?? {};
  const ids = [d?.object?.id, d?.id, d?.document, d?.document?.id, d?.object?.document, d?.object?.document?.id]
    .filter((x) => typeof x === 'string' && /^[\w-]{8,100}$/.test(x));
  return [...new Set(ids as string[])];
}
