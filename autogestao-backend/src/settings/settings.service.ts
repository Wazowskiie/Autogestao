import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { TokenEncryptionService } from '../common/crypto/token-encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService, UploadedFileLike } from '../vehicle-details/storage.service';
import { ChangePasswordDto, InterestBandDto, UpdateDealershipDto, UpdateFiscalDto, UpdateMeDto, UpdateUserDto } from './settings.dto';
import { PlansService } from '../plans/plans.service';

const isManager = (u: AuthenticatedUser) => u.role === 'owner' || u.role === 'admin';
const digits = (v?: string | null) => (v ?? '').replace(/\D/g, '');

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    @Optional() private readonly plans?: PlansService,
  ) {}

  private needManager(u: AuthenticatedUser) {
    if (!isManager(u)) throw new ForbiddenException('Só o dono ou o administrador pode mudar as configurações da loja.');
  }

  // ================= Visão geral =================

  async get(u: AuthenticatedUser) {
    const [d, user, renave] = await Promise.all([
      this.prisma.dealership.findUniqueOrThrow({ where: { id: u.dealershipId } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: u.userId }, select: { id: true, name: true, email: true, role: true } }),
      this.prisma.renaveIntegration.findUnique({ where: { dealershipId: u.dealershipId }, select: { partner: true, status: true, active: true } }),
    ]);

    return {
      me: user,
      canEdit: isManager(u),
      dealership: {
        name: d.name, slug: d.slug, cnpj: d.cnpj, phone: d.phone, city: d.city, state: d.state,
        logoUrl: d.logoUrl, coverUrl: d.coverUrl, primaryColor: d.primaryColor,
        street: d.focusNfeLogradouro, number: d.focusNfeNumero, district: d.focusNfeBairro, zip: d.focusNfeCep,
        minDownPaymentPercent: d.minDownPaymentPercent != null ? Number(d.minDownPaymentPercent) : null,
      },
      // O token da NF-e nunca sai do servidor: só dizemos se ele existe
      fiscal: isManager(u)
        ? {
            configured: !!d.focusNfeTokenEncrypted,
            ambiente: d.focusNfeAmbiente,
            cnpj: d.cnpj,
            inscricaoEstadual: d.focusNfeInscricaoEstadual,
            regimeTributario: d.focusNfeRegimeTributario,
            logradouro: d.focusNfeLogradouro,
            numero: d.focusNfeNumero,
            bairro: d.focusNfeBairro,
            municipio: d.focusNfeMunicipio,
            uf: d.focusNfeUf,
            cep: d.focusNfeCep,
          }
        : null,
      integrations: {
        nfe: { configured: !!d.focusNfeTokenEncrypted, ambiente: d.focusNfeAmbiente, enabled: process.env.ENABLE_FISCAL !== 'false' },
        renave: renave ? { partner: renave.partner, status: renave.status, active: renave.active } : null,
        assistant: { enabled: !!process.env.ANTHROPIC_API_KEY, model: process.env.ASSISTANT_MODEL || 'claude-sonnet-5-5' },
        plateLookup: { enabled: !!process.env.PLACAS_API_TOKEN },
        chat: { provider: process.env.CHAT_PROVIDER || 'demo' },
      },
    };
  }

  // ================= Loja =================

  async updateDealership(u: AuthenticatedUser, dto: UpdateDealershipDto) {
    this.needManager(u);
    const cnpj = dto.cnpj !== undefined ? digits(dto.cnpj) || null : undefined;
    if (cnpj && cnpj.length !== 14) throw new BadRequestException('O CNPJ precisa ter 14 números.');
    if (cnpj) {
      const other = await this.prisma.dealership.findFirst({ where: { cnpj, NOT: { id: u.dealershipId } }, select: { id: true } });
      if (other) throw new BadRequestException('Este CNPJ já está em uso por outra loja.');
    }
    if (dto.slug) {
      if (u.role !== 'owner') throw new BadRequestException('Só o dono pode mudar o endereço do site.');
      if (['admin', 'api', 'loja', 'login', 'app', 'www', 'files'].includes(dto.slug)) throw new BadRequestException('Esse endereço é reservado. Escolha outro.');
      const other = await this.prisma.dealership.findFirst({ where: { slug: dto.slug, NOT: { id: u.dealershipId } }, select: { id: true } });
      if (other) throw new BadRequestException('Esse endereço já está em uso por outra loja.');
    }
    await this.prisma.dealership.update({
      where: { id: u.dealershipId },
      data: {
        name: dto.name,
        ...(dto.slug ? { slug: dto.slug } : {}),
        cnpj,
        phone: dto.phone !== undefined ? digits(dto.phone) || null : undefined,
        city: dto.city !== undefined ? dto.city || null : undefined,
        state: dto.state !== undefined ? dto.state.toUpperCase() || null : undefined,
        primaryColor: dto.primaryColor,
        minDownPaymentPercent: dto.minDownPaymentPercent === undefined ? undefined : dto.minDownPaymentPercent || null,
        focusNfeLogradouro: dto.street !== undefined ? dto.street || null : undefined,
        focusNfeNumero: dto.number !== undefined ? dto.number || null : undefined,
        focusNfeBairro: dto.district !== undefined ? dto.district || null : undefined,
        focusNfeCep: dto.zip !== undefined ? digits(dto.zip) || null : undefined,
        // A cidade/UF da nota acompanham a da loja, se ainda não tiverem sido preenchidas
        ...(dto.city ? { focusNfeMunicipio: dto.city } : {}),
        ...(dto.state ? { focusNfeUf: dto.state.toUpperCase() } : {}),
      },
    });
    return this.get(u);
  }

  async uploadImage(u: AuthenticatedUser, kind: 'logo' | 'cover', file: UploadedFileLike) {
    this.needManager(u);
    this.storage.assertImage(file);
    const current = await this.prisma.dealership.findUniqueOrThrow({ where: { id: u.dealershipId }, select: { logoUrl: true, coverUrl: true } });
    const { url } = await this.storage.savePublic(`${u.dealershipId}/loja`, file);
    await this.prisma.dealership.update({ where: { id: u.dealershipId }, data: kind === 'logo' ? { logoUrl: url } : { coverUrl: url } });
    await this.storage.removePublicByUrl(kind === 'logo' ? current.logoUrl : current.coverUrl);
    return this.get(u);
  }

  async removeImage(u: AuthenticatedUser, kind: 'logo' | 'cover') {
    this.needManager(u);
    const current = await this.prisma.dealership.findUniqueOrThrow({ where: { id: u.dealershipId }, select: { logoUrl: true, coverUrl: true } });
    await this.prisma.dealership.update({ where: { id: u.dealershipId }, data: kind === 'logo' ? { logoUrl: null } : { coverUrl: null } });
    await this.storage.removePublicByUrl(kind === 'logo' ? current.logoUrl : current.coverUrl);
    return this.get(u);
  }

  // ================= Minha conta =================

  async updateMe(u: AuthenticatedUser, dto: UpdateMeDto) {
    await this.prisma.user.update({ where: { id: u.userId }, data: { name: dto.name } });
    return this.get(u);
  }

  async changePassword(u: AuthenticatedUser, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: u.userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (!(await argon2.verify(user.passwordHash, dto.currentPassword))) {
      throw new BadRequestException('A senha atual está errada.');
    }
    if (dto.currentPassword === dto.newPassword) throw new BadRequestException('A nova senha precisa ser diferente da atual.');
    await this.prisma.user.update({ where: { id: u.userId }, data: { passwordHash: await argon2.hash(dto.newPassword) } });
    await this.prisma.auditLog.create({ data: { dealershipId: u.dealershipId, userId: u.userId, action: 'password_changed', entity: 'user', entityId: u.userId } }).catch(() => undefined);
    return { ok: true };
  }

  // ================= Usuários da loja =================

  /** Todo mundo que tem acesso: dono, administradores e vendedores */
  async listUsers(u: AuthenticatedUser) {
    this.needManager(u);
    const [users, spec] = await Promise.all([
      this.prisma.user.findMany({
        where: { dealershipId: u.dealershipId },
        select: { id: true, name: true, email: true, role: true, active: true, createdAt: true, jobTitle: true },
        orderBy: [{ active: 'desc' }, { role: 'asc' }, { name: 'asc' }],
      }),
      this.plans ? this.plans.spec(u.dealershipId) : Promise.resolve(null),
    ]);
    return {
      users,
      activeCount: users.filter((x) => x.active).length,
      limit: spec?.userLimit ?? null,
      planName: spec?.name ?? null,
    };
  }

  async updateUser(u: AuthenticatedUser, id: string, dto: UpdateUserDto) {
    this.needManager(u);
    const target = await this.prisma.user.findFirst({ where: { id, dealershipId: u.dealershipId } });
    if (!target) throw new NotFoundException('Usuário não encontrado');
    if (target.role === 'owner') throw new BadRequestException('O dono da loja não pode ser desativado nem mudar de função.');
    if (target.id === u.userId) throw new BadRequestException('Você não pode mudar o seu próprio acesso por aqui.');
    // Administrador mexe só em vendedores; mexer em administradores e trocar função é com o dono
    if (u.role !== 'owner' && (target.role === 'admin' || dto.role !== undefined)) {
      throw new ForbiddenException('Só o dono pode alterar administradores ou trocar a função de alguém.');
    }

    if (dto.active === true && !target.active && this.plans) await this.plans.assertUserSlot(u.dealershipId);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { active: dto.active, role: dto.role } }),
      // Desativado: derruba o login dele na hora
      ...(dto.active === false ? [this.prisma.refreshToken.updateMany({ where: { userId: id, revoked: false }, data: { revoked: true } })] : []),
    ]);
    await this.prisma.auditLog
      .create({ data: { dealershipId: u.dealershipId, userId: u.userId, action: 'user_updated', entity: 'user', entityId: id, metadata: { ...dto } } })
      .catch(() => undefined);
    return this.listUsers(u);
  }

  // ================= Nota fiscal (Focus NFe) =================

  async updateFiscal(u: AuthenticatedUser, dto: UpdateFiscalDto) {
    this.needManager(u);
    const d = await this.prisma.dealership.findUniqueOrThrow({ where: { id: u.dealershipId }, select: { focusNfeTokenEncrypted: true } });
    if (!dto.token && !d.focusNfeTokenEncrypted) throw new BadRequestException('Informe o token da Focus NFe.');
    const cnpj = digits(dto.cnpj);
    if (cnpj.length !== 14) throw new BadRequestException('O CNPJ precisa ter 14 números.');
    const other = await this.prisma.dealership.findFirst({ where: { cnpj, NOT: { id: u.dealershipId } }, select: { id: true } });
    if (other) throw new BadRequestException('Este CNPJ já está em uso por outra loja.');

    let tokenEncrypted: string | undefined;
    if (dto.token) {
      try {
        tokenEncrypted = new TokenEncryptionService(this.config).encrypt(dto.token);
      } catch {
        throw new BadRequestException('Falta a TOKEN_ENCRYPTION_KEY no .env do backend para guardar o token com segurança.');
      }
    }

    await this.prisma.dealership.update({
      where: { id: u.dealershipId },
      data: {
        ...(tokenEncrypted ? { focusNfeTokenEncrypted: tokenEncrypted } : {}),
        cnpj,
        focusNfeAmbiente: dto.ambiente,
        focusNfeInscricaoEstadual: dto.inscricaoEstadual || null,
        focusNfeRegimeTributario: dto.regimeTributario ?? null,
        focusNfeLogradouro: dto.logradouro,
        focusNfeNumero: dto.numero,
        focusNfeBairro: dto.bairro,
        focusNfeMunicipio: dto.municipio,
        focusNfeUf: dto.uf.toUpperCase(),
        focusNfeCep: digits(dto.cep),
      },
    });
    return this.get(u);
  }

  // ================= Faixas de juros =================

  async listBands(u: AuthenticatedUser) {
    return this.prisma.interestRate.findMany({ where: { dealershipId: u.dealershipId }, orderBy: { minInstallments: 'asc' } });
  }

  /** Confere se a faixa não cruza com outra (ex.: 9–12x e 12–15x) */
  private async checkBand(u: AuthenticatedUser, dto: InterestBandDto, ignoreId?: string) {
    if (dto.minInstallments > dto.maxInstallments) {
      throw new BadRequestException('O número inicial de parcelas precisa ser menor ou igual ao final.');
    }
    const clash = await this.prisma.interestRate.findFirst({
      where: {
        dealershipId: u.dealershipId,
        ...(ignoreId ? { NOT: { id: ignoreId } } : {}),
        minInstallments: { lte: dto.maxInstallments },
        maxInstallments: { gte: dto.minInstallments },
      },
    });
    if (clash) {
      throw new BadRequestException(`Essa faixa cruza com a de ${clash.minInstallments}x a ${clash.maxInstallments}x. Ajuste os números.`);
    }
  }

  async createBand(u: AuthenticatedUser, dto: InterestBandDto) {
    this.needManager(u);
    await this.checkBand(u, dto);
    await this.prisma.interestRate.create({ data: { dealershipId: u.dealershipId, ...dto } });
    return this.listBands(u);
  }

  async updateBand(u: AuthenticatedUser, id: string, dto: InterestBandDto) {
    this.needManager(u);
    const band = await this.prisma.interestRate.findFirst({ where: { id, dealershipId: u.dealershipId } });
    if (!band) throw new NotFoundException('Faixa não encontrada');
    await this.checkBand(u, dto, id);
    await this.prisma.interestRate.update({ where: { id }, data: dto });
    return this.listBands(u);
  }

  async deleteBand(u: AuthenticatedUser, id: string) {
    this.needManager(u);
    const band = await this.prisma.interestRate.findFirst({ where: { id, dealershipId: u.dealershipId } });
    if (!band) throw new NotFoundException('Faixa não encontrada');
    const count = await this.prisma.interestRate.count({ where: { dealershipId: u.dealershipId } });
    // Se apagar a última, o sistema recriaria a tabela padrão sozinho
    if (count <= 1) throw new BadRequestException('Deixe pelo menos uma faixa cadastrada.');
    await this.prisma.interestRate.delete({ where: { id } });
    return this.listBands(u);
  }
}
