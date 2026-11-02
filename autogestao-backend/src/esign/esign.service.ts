import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { AutentiqueClient, documentIdsFromEvent } from './autentique.client';
import { CreateSignatureDto, SignerDto } from './esign.dto';

export interface StoredSigner {
  name: string;
  email: string;
  phone: string | null;
  role: 'buyer' | 'store' | 'witness' | 'other';
  channel: 'email' | 'whatsapp';
  /** id da assinatura no provedor */
  publicId?: string | null;
  signed: boolean;
  signedAt: string | null;
  rejected?: boolean;
}

const MB = 1024 * 1024;

const startOfMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); };
/** (85) 98955-7980 -> +5585989557980 */
export function toWhatsapp(phone?: string | null) {
  const d = (phone ?? '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) return `+55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return `+${d}`;
  return null;
}

@Injectable()
export class EsignService {
  private readonly log = new Logger('Assinatura');

  constructor(private readonly prisma: PrismaService, private readonly provider: AutentiqueClient, private readonly plans: PlansService) {}

  /** O que a tela precisa saber: se está configurado, se o plano tem e quantos já foram usados no mês */
  async overview(dealershipId: string) {
    const spec = await this.plans.spec(dealershipId);
    const used = await this.prisma.saleSignature.count({ where: { dealershipId, createdAt: { gte: startOfMonth() }, status: { not: 'error' } } });
    return {
      configured: this.provider.configured,
      sandbox: this.provider.sandbox,
      planAllows: spec.features.includes('esign'),
      planName: spec.name,
      limit: spec.esignPerMonth,
      used,
    };
  }

  private async findSale(user: AuthenticatedUser, saleId: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, dealershipId: user.dealershipId, ...(user.role === 'seller' ? { sellerId: user.userId } : {}) },
      select: { id: true, contractNumber: true, status: true },
    });
    if (!sale) throw new NotFoundException('Venda não encontrada');
    return sale;
  }

  private async findOne(user: AuthenticatedUser, id: string) {
    const sig = await this.prisma.saleSignature.findFirst({
      where: { id, dealershipId: user.dealershipId, ...(user.role === 'seller' ? { sale: { sellerId: user.userId } } : {}) },
    });
    if (!sig) throw new NotFoundException('Assinatura não encontrada');
    return sig;
  }

  async list(user: AuthenticatedUser, saleId: string) {
    await this.findSale(user, saleId);
    return this.prisma.saleSignature.findMany({ where: { saleId, dealershipId: user.dealershipId }, orderBy: { createdAt: 'desc' } });
  }

  private normalizeSigners(signers: SignerDto[]): StoredSigner[] {
    if (!signers?.length) throw new BadRequestException('Informe quem vai assinar.');
    if (signers.length > 6) throw new BadRequestException('No máximo 6 pessoas por documento.');
    const seen = new Set<string>();
    return signers.map((s) => {
      const channel = s.channel === 'whatsapp' ? 'whatsapp' : 'email';
      const email = s.email?.trim().toLowerCase() || '';
      if (channel === 'email' && !email) throw new BadRequestException(`Informe o e-mail de ${s.name}.`);
      if (channel === 'whatsapp' && !toWhatsapp(s.phone)) throw new BadRequestException(`Informe o WhatsApp de ${s.name} com DDD.`);
      const key = channel === 'email' ? email : toWhatsapp(s.phone)!;
      if (seen.has(key)) throw new BadRequestException(`${channel === 'email' ? `O e-mail ${email}` : 'O mesmo WhatsApp'} aparece mais de uma vez. Cada pessoa precisa de um contato diferente.`);
      seen.add(key);
      return { name: s.name.trim(), email, phone: s.phone?.trim() || null, role: s.role, channel, publicId: null, signed: false, signedAt: null, rejected: false };
    });
  }

  /** Pasta da loja na conta da Chronos (criada no primeiro envio; se falhar, o documento vai sem pasta) */
  private async folderFor(dealershipId: string) {
    const d = await this.prisma.dealership.findUniqueOrThrow({ where: { id: dealershipId }, select: { name: true, esignFolderId: true } });
    if (d.esignFolderId) return { folder: d.esignFolderId, name: d.name };
    try {
      const folder = await this.provider.createFolder(`${d.name} (${dealershipId.slice(0, 8)})`);
      await this.prisma.dealership.update({ where: { id: dealershipId }, data: { esignFolderId: folder } });
      return { folder, name: d.name };
    } catch (e) {
      this.log.warn(`Pasta da loja não criada: ${e instanceof Error ? e.message : e}`);
      return { folder: null, name: d.name };
    }
  }

  async create(user: AuthenticatedUser, saleId: string, dto: CreateSignatureDto, file?: { buffer: Buffer; mimetype: string; size: number }) {
    const ov = await this.overview(user.dealershipId);
    if (!ov.configured) throw new HttpException('A assinatura eletrônica ainda não foi configurada no servidor.', HttpStatus.SERVICE_UNAVAILABLE);
    await this.plans.assertFeature(user.dealershipId, 'esign');
    if (ov.used >= ov.limit) {
      throw new HttpException(`A loja já enviou os ${ov.limit} documentos do mês do plano ${ov.planName}. No mês que vem libera de novo.`, HttpStatus.TOO_MANY_REQUESTS);
    }
    const sale = await this.findSale(user, saleId);
    if (sale.status === 'canceled' && dto.printId !== 'distrato') throw new BadRequestException('Esta venda foi cancelada.');
    if (!file?.buffer?.length) throw new BadRequestException('O PDF do documento não chegou.');
    if (file.mimetype !== 'application/pdf' || file.buffer.subarray(0, 4).toString() !== '%PDF') throw new BadRequestException('O arquivo precisa ser um PDF.');
    if (file.size > 5 * MB) throw new BadRequestException('O PDF passou de 5 MB. Tente o impresso sem fotos.');
    const signers = this.normalizeSigners(dto.signers);

    const sig = await this.prisma.saleSignature.create({
      data: {
        dealershipId: user.dealershipId, saleId, printId: dto.printId, title: dto.title.trim().slice(0, 150),
        signers: signers as object[], status: 'sending', createdById: user.userId,
      },
    });
    try {
      const { folder, name } = await this.folderFor(user.dealershipId);
      const created = await this.provider.createDocument({
        folderId: folder,
        name: `${dto.title} - ${sale.contractNumber ?? sale.id.slice(0, 8)}`,
        message: dto.message?.trim() || `${name} enviou "${dto.title}" para você assinar.`,
        pdf: file.buffer,
        signers: signers.map((s) => ({
          name: s.name, email: s.channel === 'email' ? s.email : null,
          whatsapp: s.channel === 'whatsapp' ? toWhatsapp(s.phone) : null,
          action: s.role === 'witness' ? 'SIGN_AS_A_WITNESS' : 'SIGN',
        })),
      });
      // liga cada signatário ao id da assinatura (pelo e-mail; os de WhatsApp pela ordem)
      const free = [...created.signatures];
      const withIds = signers.map((s) => {
        let i = s.email ? free.findIndex((x) => x.email === s.email) : -1;
        if (i < 0) i = free.findIndex((x) => !x.email || !signers.some((o) => o.email && o.email === x.email));
        const m = i >= 0 ? free.splice(i, 1)[0] : null;
        return { ...s, publicId: m?.publicId ?? null };
      });
      return this.prisma.saleSignature.update({
        where: { id: sig.id },
        data: { externalId: created.id, signers: withIds as object[], status: 'waiting', sentAt: new Date(), lastError: null },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erro ao enviar para a Autentique';
      await this.prisma.saleSignature.update({ where: { id: sig.id }, data: { status: 'error', lastError: message.slice(0, 500) } });
      throw e;
    }
  }

  /** Busca no provedor quem já assinou e atualiza a situação */
  async sync(id: string) {
    const sig = await this.prisma.saleSignature.findUnique({ where: { id } });
    if (!sig?.externalId || sig.status === 'canceled') return sig;
    const st = await this.provider.document(sig.externalId);
    const signers = (sig.signers as unknown as StoredSigner[]).map((s) => {
      const r = st.signatures.find((x) => (s.publicId && x.publicId === s.publicId) || (!s.publicId && s.email && x.email === s.email));
      return r ? { ...s, publicId: r.publicId, signed: !!r.signedAt, signedAt: r.signedAt ?? s.signedAt, rejected: !!r.rejectedAt } : s;
    });
    const allSigned = signers.length > 0 && signers.every((s) => s.signed);
    const status = signers.some((s) => s.rejected) ? 'rejected' : allSigned ? 'signed' : sig.status === 'error' ? 'error' : 'waiting';
    return this.prisma.saleSignature.update({
      where: { id },
      data: {
        signers: signers as object[], status,
        completedAt: status === 'signed' ? sig.completedAt ?? new Date() : sig.completedAt,
        canceledAt: status === 'rejected' ? sig.canceledAt ?? new Date() : sig.canceledAt,
      },
    });
  }

  async refresh(user: AuthenticatedUser, id: string) {
    const sig = await this.findOne(user, id);
    return this.sync(sig.id);
  }

  /** Aviso da Autentique (alguém assinou, recusou, finalizou). Não confia no conteúdo: consulta a Autentique de novo. */
  async webhook(rawBody: Buffer | undefined, body: unknown, signature?: string) {
    if (!this.provider.verifyWebhook(rawBody, signature)) throw new ForbiddenException('Assinatura do aviso não confere');
    for (const docId of documentIdsFromEvent(body)) {
      const sig = await this.prisma.saleSignature.findUnique({ where: { externalId: docId } });
      if (!sig) continue;
      try { await this.sync(sig.id); } catch (e) { this.log.warn(`Falha ao atualizar ${docId}: ${e instanceof Error ? e.message : e}`); }
    }
    return { ok: true };
  }

  async download(user: AuthenticatedUser, id: string) {
    const sig = await this.findOne(user, id);
    if (!sig.externalId) throw new BadRequestException('Este documento não chegou à Autentique.');
    const d = await this.provider.document(sig.externalId);
    const url = d.signedFile ?? d.original;
    if (!url) throw new BadRequestException('O arquivo ainda não está disponível. Tente de novo em alguns segundos.');
    return { url, signed: !!d.signedFile && sig.status === 'signed' };
  }

  async cancel(user: AuthenticatedUser, id: string) {
    const sig = await this.findOne(user, id);
    if (sig.status === 'signed') throw new BadRequestException('O documento já foi assinado por todos e não pode ser cancelado.');
    if (sig.externalId && sig.status !== 'canceled' && sig.status !== 'error') await this.provider.deleteDocument(sig.externalId);
    return this.prisma.saleSignature.update({ where: { id }, data: { status: 'canceled', canceledAt: new Date() } });
  }

  /** Manda o link de novo para quem ainda não assinou */
  async resend(user: AuthenticatedUser, id: string) {
    const sig = await this.findOne(user, id);
    if (sig.status !== 'waiting' || !sig.externalId) throw new BadRequestException('Só dá para reenviar documentos aguardando assinatura.');
    const st = await this.provider.document(sig.externalId);
    const pending = st.signatures.filter((s) => !s.signedAt && !s.rejectedAt).map((s) => s.publicId);
    await this.provider.resend(pending);
    return { resent: pending.length };
  }
}
