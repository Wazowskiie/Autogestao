import { Body, Controller, Delete, Get, Injectable, Module, NotFoundException, ConflictException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UnitDto {
  @Transform(trim) @IsString() @MinLength(2, { message: 'O nome da filial deve ter ao menos 2 caracteres' }) @MaxLength(60)
  name: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  address?: string;
}

export class UpdateUnitDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(2, { message: 'O nome da filial deve ter ao menos 2 caracteres' }) @MaxLength(60)
  name?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  address?: string;
}

const isUniqueError = (e: unknown) => (e as { code?: string })?.code === 'P2002';

@Injectable()
export class UnitsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Filiais com quantos veículos disponíveis cada uma tem e quanto valem (preço de venda) */
  async list(dealershipId: string) {
    const [units, stats] = await Promise.all([
      this.prisma.storeUnit.findMany({ where: { dealershipId }, orderBy: { name: 'asc' } }),
      this.prisma.vehicle.groupBy({
        by: ['unitId'], where: { dealershipId, status: 'available' }, _count: { _all: true }, _sum: { price: true },
      }),
    ]);
    const byUnit = new Map(stats.map((s) => [s.unitId, { count: s._count._all, value: Number(s._sum.price ?? 0) }]));
    return units.map((u) => ({ ...u, available: byUnit.get(u.id)?.count ?? 0, availableValue: byUnit.get(u.id)?.value ?? 0 }));
  }

  async create(dealershipId: string, dto: UnitDto) {
    try {
      return await this.prisma.storeUnit.create({ data: { dealershipId, name: dto.name, address: dto.address || null } });
    } catch (e) {
      if (isUniqueError(e)) throw new ConflictException('Já existe uma filial com esse nome');
      throw e;
    }
  }

  async update(dealershipId: string, id: string, dto: UpdateUnitDto) {
    await this.get(dealershipId, id);
    try {
      return await this.prisma.storeUnit.update({
        where: { id },
        data: { ...(dto.name !== undefined ? { name: dto.name } : {}), ...(dto.address !== undefined ? { address: dto.address || null } : {}) },
      });
    } catch (e) {
      if (isUniqueError(e)) throw new ConflictException('Já existe uma filial com esse nome');
      throw e;
    }
  }

  /** Excluir a filial não apaga veículos: eles ficam "sem filial" */
  async remove(dealershipId: string, id: string) {
    await this.get(dealershipId, id);
    await this.prisma.storeUnit.delete({ where: { id } });
    return { success: true };
  }

  /** Garante que a filial é desta revenda (usado também pelo cadastro de veículos) */
  async get(dealershipId: string, id: string) {
    const unit = await this.prisma.storeUnit.findFirst({ where: { id, dealershipId } });
    if (!unit) throw new NotFoundException('Filial não encontrada');
    return unit;
  }
}

@Controller('units')
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  // Todos da loja veem as filiais (o vendedor filtra o estoque por elas)
  @Get()
  list(@CurrentUser() u: AuthenticatedUser) { return this.units.list(u.dealershipId); }

  @Roles('owner', 'admin')
  @Post()
  create(@CurrentUser() u: AuthenticatedUser, @Body() dto: UnitDto) { return this.units.create(u.dealershipId, dto); }

  @Roles('owner', 'admin')
  @Patch(':id')
  update(@CurrentUser() u: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUnitDto) {
    return this.units.update(u.dealershipId, id, dto);
  }

  @Roles('owner', 'admin')
  @Delete(':id')
  remove(@CurrentUser() u: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) { return this.units.remove(u.dealershipId, id); }
}

@Module({ controllers: [UnitsController], providers: [UnitsService], exports: [UnitsService] })
export class UnitsModule {}
