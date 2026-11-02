import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { D4SignClient } from './d4sign.client';
import { CreateSignatureDto, SignerDto } from './esign.dto';

export interface StoredSigner {
  name: string;
  email: string;
  phone: string | null;
  role: 'buyer' | 'store' | 'witness' | 'other';
  channel: 'email' | 'whatsapp';
  signed: boolean;
  signedAt: string | null;
}

const MB = 1024 * 1024;
const ACT: Record<StoredSigner['role'], '1' | '4' | '5'> = { buyer: '4', store: '4', witness: '5', other: '1' };

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

  constructor(private readonly prisma: PrismaService, private readonly d4: D4SignClient, private readonly plans: PlansService) {}

  /** O que a tela precisa saber: se está configurado, se o plano tem e quantos já foram usados no mês */
  async overview(dealershipId: string) {
    const spec = await this.plans.spec(dealershipId);
    const used = await this.prisma.saleSignature.count({ where: { dealershipId, createdAt: { gte: startOfMonth() }, status: { not: 'error' } } });
    return {
      configured: this.d4.configured,
      sandbox: this.d4.sandbox,
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
      const email = s.email.trim().toLowerCase();
      if (seen.has(email)) throw new BadRequestException(`O e-mail ${email} aparece mais de uma vez. Cada pessoa precisa de um e-mail diferente.`);
      seen.add(email);
      const channel = s.channel === 'whatsapp' ? 'whatsapp' : 'email';
      if (channel === 'whatsapp' && !toWhatsapp(s.phone)) throw new BadRequestException(`Informe o WhatsApp de ${s.name} com DDD.`);
      return { name: s.name.trim(), email, phone: s.phone?.trim() || null, role: s.role, channel, signed: false, signedAt: null };
    });
  }

  /** Pasta da loja dentro do cofre da Chronos (criada no primeiro envio) */
  private async folderFor(dealershipId: string) {
    const d = await this.prisma.dealership.findUniqueOrThrow({ where: { id: dealershipId }, select: { name: true, d4signFolderUuid: true } });
    if (d.d4signFolderUuid) return { folder: d.d4signFolderUuid, name: d.name };
    const folder = await this.d4.createFolder(`${d.name} (${dealershipId.slice(0, 8)})`);
    await this.prisma.dealership.update({ where: { id: dealershipId }, data: { d4signFolderUuid: folder } });
    return { folder, name: d.name };
  }

  private webhookUrl() {
    const base = (process.env.PUBLIC_API_URL || '').replace(/\/$/, '');
    // A D4Sign só alcança endereços públicos
    if (!/^https:\/\//.test(base) || /localhost|127\.0\.0\.1/.test(base)) return null;
    return `${base}/api/v1/esign/webhook`;
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
    if (file.size > 15 * MB) throw new BadRequestException('O PDF passou de 15 MB. Tente o impresso sem fotos.');
    const signers = this.normalizeSigners(dto.signers);

    const sig = await this.prisma.saleSignature.create({
      data: {
        dealershipId: user.dealershipId, saleId, printId: dto.printId, title: dto.title.trim().slice(0, 150),
        signers: signers as object[], status: 'sending', createdById: user.userId,
      },
    });
    try {
      const { folder, name } = await this.folderFor(user.dealershipId);
      const docUuid = await this.d4.uploadPdf(folder, `${dto.title} - ${sale.contractNumber ?? sale.id.slice(0, 8)}.pdf`, file.buffer.toString('base64'));
      await this.prisma.saleSignature.update({ where: { id: sig.id }, data: { externalId: docUuid } });
      await this.d4.addSigners(docUuid, signers.map((s) => ({
        email: s.email, act: ACT[s.role], whatsapp: s.channel === 'whatsapp' ? toWhatsapp(s.phone) : null,
      })));
      const hook = this.webhookUrl();
      if (hook) await this.d4.registerWebhook(docUuid, hook).catch((e) => this.log.warn(`Webhook não cadastrado: ${e.message}`));
      await this.d4.send(docUuid, dto.message?.trim() || `${name} enviou "${dto.title}" para você assinar.`);
      return this.prisma.saleSignature.update({ where: { id: sig.id }, data: { status: 'waiting', sentAt: new Date(), lastError: null } });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erro ao enviar para a D4Sign';
      await this.prisma.saleSignature.update({ where: { id: sig.id }, data: { status: 'error', lastError: message.slice(0, 500) } });
      throw e;
    }
  }

  /** Busca na D4Sign quem já assinou e atualiza a situação */
  async sync(id: string) {
    const sig = await this.prisma.saleSignature.findUnique({ where: { id } });
    if (!sig?.externalId || sig.status === 'canceled') return sig;
    const st = await this.d4.status(sig.externalId);
    const signers = (sig.signers as unknown as StoredSigner[]).map((s) => {
      const r = st.signers.find((x) => x.email === s.email);
      return r ? { ...s, signed: r.signed, signedAt: r.signedAt ?? s.signedAt } : s;
    });
    const allSigned = signers.length > 0 && signers.every((s) => s.signed);
    const status = st.statusId === 6 ? 'canceled' : st.statusId === 4 || allSigned ? 'signed' : sig.status === 'error' ? 'error' : 'waiting';
    return this.prisma.saleSignature.update({
      where: { id },
      data: {
        signers: signers as object[], status,
        completedAt: status === 'signed' ? sig.completedAt ?? new Date() : sig.completedAt,
        canceledAt: status === 'canceled' ? sig.canceledAt ?? new Date() : sig.canceledAt,
      },
    });
  }

  async refresh(user: AuthenticatedUser, id: string) {
    const sig = await this.findOne(user, id);
    return this.sync(sig.id);
  }

  /** Aviso da D4Sign (alguém assinou, finalizou ou cancelou). Não confia no conteúdo: consulta a D4Sign de novo. */
  async webhook(body: Record<string, unknown>, hmac?: string) {
    const uuid = String(body?.uuid ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(uuid)) return { ok: true };
    if (!this.d4.verifyHmac(uuid, hmac)) throw new ForbiddenException('Assinatura do aviso não confere');
    const sig = await this.prisma.saleSignature.findUnique({ where: { externalId: uuid } });
    if (!sig) return { ok: true };
    try { await this.sync(sig.id); } catch (e) { this.log.warn(`Falha ao atualizar ${uuid}: ${e instanceof Error ? e.message : e}`); }
    return { ok: true };
  }

  async download(user: AuthenticatedUser, id: string) {
    const sig = await this.findOne(user, id);
    if (!sig.externalId) throw new BadRequestException('Este documento não chegou à D4Sign.');
    return { url: await this.d4.downloadUrl(sig.externalId), signed: sig.status === 'signed' };
  }

  async cancel(user: AuthenticatedUser, id: string) {
    const sig = await this.findOne(user, id);
    if (sig.status === 'signed') throw new BadRequestException('O documento já foi assinado por todos e não pode ser cancelado.');
    if (sig.externalId && sig.status !== 'canceled' && sig.status !== 'error') await this.d4.cancel(sig.externalId, 'Cancelado pela loja');
    return this.prisma.saleSignature.update({ where: { id }, data: { status: 'canceled', canceledAt: new Date() } });
  }

  /** Manda o link de novo para quem ainda não assinou */
  async resend(user: AuthenticatedUser, id: string) {
    const sig = await this.findOne(user, id);
    if (sig.status !== 'waiting' || !sig.externalId) throw new BadRequestException('Só dá para reenviar documentos aguardando assinatura.');
    const st = await this.d4.status(sig.externalId);
    const pending = st.signers.filter((s) => !s.signed && s.keySigner);
    for (const s of pending) await this.d4.resend(sig.externalId, s.email, s.keySigner!);
    return { resent: pending.length };
  }
}
