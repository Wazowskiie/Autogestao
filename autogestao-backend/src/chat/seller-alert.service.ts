// Avisa os vendedores no WhatsApp quando um cliente pede para falar com vendedor no chat do site.
// Usa o WhatsApp oficial da loja (Meta) e um modelo de mensagem aprovado, como a Meta exige
// para mensagens que a loja envia por conta própria.
import { Injectable, Logger, Optional } from '@nestjs/common';
import { TokenEncryptionService } from '../common/crypto/token-encryption.service';
import { PrismaService } from '../prisma/prisma.service';

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

/** Parâmetro de modelo da Meta: sem quebra de linha, tab ou 4+ espaços seguidos */
export const templateParam = (s: string, max = 200) => s.replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim().slice(0, max) || '-';

/** Número do vendedor no formato internacional (Brasil por padrão) */
export function waNumber(phone: string) {
  const d = phone.replace(/\D/g, '');
  if (d.length < 10) return null;
  return d.startsWith('55') && d.length >= 12 ? d : `55${d}`;
}

@Injectable()
export class SellerAlertService {
  private readonly log = new Logger('AvisoVendedores');
  fetchImpl: FetchLike = (url, init) => fetch(url, init as RequestInit) as unknown as ReturnType<FetchLike>;
  constructor(private readonly prisma: PrismaService, @Optional() private readonly crypto?: TokenEncryptionService) {}

  /** Envia o aviso para todos os vendedores ativos com telefone. Nunca lança erro. */
  async notify(dealershipId: string, conversationId: string): Promise<{ sent: number; reason?: string }> {
    try {
      const account = await this.prisma.whatsappAccount.findUnique({ where: { dealershipId } });
      if (!account || account.status !== 'connected') return { sent: 0, reason: 'WhatsApp oficial não conectado' };
      if (!account.sellerAlertTemplate) return { sent: 0, reason: 'Modelo de aviso não configurado' };
      if (!this.crypto) return { sent: 0, reason: 'Criptografia não configurada' };
      const sellers = await this.prisma.user.findMany({ where: { dealershipId, role: 'seller', active: true, phone: { not: null } }, select: { phone: true } });
      if (!sellers.length) return { sent: 0, reason: 'Nenhum vendedor com telefone' };
      const c = await this.prisma.chatConversation.findUnique({
        where: { id: conversationId },
        select: { customer: { select: { name: true } }, messages: { where: { role: 'user' }, orderBy: { createdAt: 'desc' }, take: 2, select: { content: true } } },
      });
      const who = c?.customer?.name ?? 'Visitante do site';
      const asked = (c?.messages ?? []).reverse().map((m) => m.content).join(' / ') || 'quer falar com um vendedor';
      const link = `${(process.env.PUBLIC_APP_URL || 'https://chronosauto.com.br').replace(/\/$/, '')}`;
      const token = this.crypto.decrypt(account.accessTokenEnc);
      const version = process.env.META_GRAPH_VERSION || 'v25.0';
      let sent = 0;
      for (const s of sellers) {
        const to = waNumber(s.phone!);
        if (!to) continue;
        const res = await this.fetchImpl(`https://graph.facebook.com/${version}/${account.phoneNumberId}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp', to, type: 'template',
            template: {
              name: account.sellerAlertTemplate, language: { code: account.sellerAlertLang || 'pt_BR' },
              components: [{ type: 'body', parameters: [
                { type: 'text', text: templateParam(who, 60) },
                { type: 'text', text: templateParam(asked, 200) },
                { type: 'text', text: templateParam(link, 200) },
              ] }],
            },
          }),
        }).catch(() => null);
        if (res?.ok) sent++;
        else this.log.warn(`Aviso não enviado (status ${res?.status ?? 'rede'})`);
      }
      return { sent };
    } catch {
      this.log.warn('Falha ao avisar vendedores; nenhum conteúdo registrado');
      return { sent: 0, reason: 'Falha ao enviar' };
    }
  }
}
