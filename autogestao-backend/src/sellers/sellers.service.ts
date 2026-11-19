import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException, Optional } from '@nestjs/common';
import { PlansService } from '../plans/plans.service';
import * as argon2 from 'argon2';
import {
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { isSeller } from '../common/seller-view';

export class CreateSellerDto {
  @IsString({ message: 'O nome deve ser um texto' })
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres' })
  name: string;

  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  @IsString({ message: 'A senha deve ser um texto' })
  @MinLength(8, { message: 'A senha deve ter ao menos 8 caracteres' })
  password: string;

  @IsOptional()
  @IsString({ message: 'O telefone deve ser um texto' })
  @MaxLength(20, { message: 'Telefone inválido' })
  phone?: string;

  @IsOptional()
  @IsString({ message: 'O cargo deve ser um texto' })
  jobTitle?: string; // ex: "Vendedor", "Vendedor Sênior", "Gerente de Vendas"

  @IsOptional()
  @IsNumber({}, { message: 'A comissão deve ser um número' })
  @Min(0, { message: 'A comissão não pode ser negativa' })
  @Max(100, { message: 'A comissão não pode ser maior que 100' })
  commissionRate?: number; // percentual, ex: 3 = 3%

  // Comissão (%) quando a venda tem promissórias / financiamento. Vazio = usa a da venda à vista
  @IsOptional()
  @IsNumber({}, { message: 'A comissão deve ser um número' })
  @Min(0, { message: 'A comissão não pode ser negativa' })
  @Max(100, { message: 'A comissão não pode ser maior que 100' })
  commissionRatePromissory?: number | null;

  @IsOptional()
  @IsNumber({}, { message: 'A comissão deve ser um número' })
  @Min(0, { message: 'A comissão não pode ser negativa' })
  @Max(100, { message: 'A comissão não pode ser maior que 100' })
  commissionRateFinancing?: number | null;

  @IsOptional()
  @IsString({ message: 'O CPF deve ser um texto' })
  @MaxLength(20, { message: 'CPF inválido' })
  cpf?: string;


  @IsOptional()
  @IsBoolean({ message: 'O campo ativo deve ser verdadeiro ou falso' })
  active?: boolean;
}

export class UpdateSellerDto {
  @IsOptional()
  @IsString({ message: 'O nome deve ser um texto' })
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres' })
  name?: string;

  // Nova senha (opcional): o dono/admin troca a senha de um vendedor que esqueceu a dele
  @IsOptional()
  @IsString({ message: 'A senha deve ser um texto' })
  @MinLength(8, { message: 'A senha deve ter ao menos 8 caracteres' })
  password?: string;

  @IsOptional()
  @IsString({ message: 'O telefone deve ser um texto' })
  @MaxLength(20, { message: 'Telefone inválido' })
  phone?: string;

  @IsOptional()
  @IsString({ message: 'O cargo deve ser um texto' })
  jobTitle?: string;

  @IsOptional()
  @IsNumber({}, { message: 'A comissão deve ser um número' })
  @Min(0, { message: 'A comissão não pode ser negativa' })
  @Max(100, { message: 'A comissão não pode ser maior que 100' })
  commissionRate?: number;

  // Comissão (%) quando a venda tem promissórias / financiamento. Vazio = usa a da venda à vista
  @IsOptional()
  @IsNumber({}, { message: 'A comissão deve ser um número' })
  @Min(0, { message: 'A comissão não pode ser negativa' })
  @Max(100, { message: 'A comissão não pode ser maior que 100' })
  commissionRatePromissory?: number | null;

  @IsOptional()
  @IsNumber({}, { message: 'A comissão deve ser um número' })
  @Min(0, { message: 'A comissão não pode ser negativa' })
  @Max(100, { message: 'A comissão não pode ser maior que 100' })
  commissionRateFinancing?: number | null;

  @IsOptional()
  @IsString({ message: 'O CPF deve ser um texto' })
  @MaxLength(20, { message: 'CPF inválido' })
  cpf?: string;

  @IsOptional()
  @IsBoolean({ message: 'O campo ativo deve ser verdadeiro ou falso' })
  active?: boolean;
}

const SELLER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  jobTitle: true,
  commissionRate: true,
  commissionRatePromissory: true,
  commissionRateFinancing: true,
  cpf: true,
  active: true,
  createdAt: true,
} as const;

@Injectable()
export class SellersService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly plans?: PlansService) {}

  async findAll(dealershipId: string, month?: string, actor?: AuthenticatedUser) {
    const sellers = await this.prisma.user.findMany({
      // Vendedor logado: só os próprios números (não vê os colegas)
      where: { dealershipId, role: 'seller', active: true, ...(isSeller(actor) ? { id: actor!.userId } : {}) },
      select: SELLER_SELECT,
    });

    const where: any = { dealershipId };
    if (month) {
      const [year, m] = month.split('-').map(Number);
      where.soldAt = {
        gte: new Date(year, m - 1, 1),
        lt: new Date(year, m, 1),
      };
    }

    // Injeta métricas de vendas em cada vendedor
    const result = await Promise.all(
      sellers.map(async (seller) => {
        const sales = await this.prisma.sale.findMany({
          where: { ...where, sellerId: seller.id, status: 'active' },
        });

        const totalRevenue = sales.reduce((sum, s) => sum + Number(s.price), 0);
        const totalProfit = sales.reduce((sum, s) => sum + Number(s.profit), 0);
        const commission = sales.reduce((sum, s) => sum + Number(s.commissionAmount), 0);
        const commissionPending = sales.filter((s) => !s.commissionPaidAt).reduce((sum, s) => sum + Number(s.commissionAmount), 0);

        return {
          ...seller,
          metrics: {
            salesCount: sales.length,
            totalRevenue,
            totalProfit: isSeller(actor) ? null : totalProfit,
            commission,
            commissionPending,
          },
        };
      }),
    );

    return result;
  }

  async findOne(dealershipId: string, id: string, actor?: AuthenticatedUser) {
    if (isSeller(actor) && id !== actor!.userId) throw new NotFoundException('Vendedor não encontrado');
    const seller = await this.prisma.user.findFirst({
      where: { id, dealershipId, role: 'seller' },
      select: { ...SELLER_SELECT, role: true },
    });
    if (!seller) throw new NotFoundException('Vendedor não encontrado');
    return seller;
  }

  async create(dealershipId: string, dto: CreateSellerDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Este e-mail já está em uso');

    if (!dto.password || dto.password.length < 8) {
      throw new BadRequestException('A senha deve ter ao menos 8 caracteres');
    }

    if (dto.phone && dto.phone.replace(/\D/g, '').length < 10) {
      throw new BadRequestException('Telefone inválido');
    }

    if (
      dto.commissionRate !== undefined &&
      (dto.commissionRate < 0 || dto.commissionRate > 100)
    ) {
      throw new BadRequestException('Comissão deve estar entre 0 e 100');
    }

    // Limite de usuários do plano
    if (this.plans) await this.plans.assertUserSlot(dealershipId);

    const passwordHash = await argon2.hash(dto.password);

    const seller = await this.prisma.user.create({
      data: {
        dealershipId,
        name: dto.name,
        email: dto.email,
        passwordHash,
        phone: dto.phone,
        jobTitle: dto.jobTitle ?? 'Vendedor',
        commissionRate: dto.commissionRate ?? 0,
        commissionRatePromissory: dto.commissionRatePromissory ?? null,
        commissionRateFinancing: dto.commissionRateFinancing ?? null,
        cpf: dto.cpf ? dto.cpf.replace(/\D/g, '') || null : null,
        active: dto.active ?? true,
        role: 'seller',
      },
      select: SELLER_SELECT,
    });

    return seller;
  }

  async update(dealershipId: string, id: string, dto: UpdateSellerDto) {
    const current = await this.findOne(dealershipId, id);
    // Reativar um vendedor também conta no limite de usuários do plano
    if (dto.active === true && !(current as { active?: boolean }).active && this.plans) await this.plans.assertUserSlot(dealershipId);

    if (
      dto.commissionRate !== undefined &&
      (dto.commissionRate < 0 || dto.commissionRate > 100)
    ) {
      throw new BadRequestException('Comissão deve estar entre 0 e 100');
    }

    const { password, ...data } = dto;
    if (data.cpf !== undefined) data.cpf = data.cpf.replace(/\D/g, '') || (null as unknown as string);
    if (!password) return this.prisma.user.update({ where: { id }, data, select: SELLER_SELECT });

    // Senha nova: grava o hash e derruba as sessões abertas com a senha antiga
    const passwordHash = await argon2.hash(password);
    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { ...data, passwordHash }, select: SELLER_SELECT }),
      this.prisma.refreshToken.updateMany({ where: { userId: id, revoked: false }, data: { revoked: true } }),
    ]);
    return updated;
  }

  async remove(dealershipId: string, id: string) {
    await this.findOne(dealershipId, id);
    // Soft delete: desativa em vez de apagar, preservando histórico de vendas
    await this.prisma.user.update({
      where: { id },
      data: { active: false },
    });
    return { success: true };
  }
}