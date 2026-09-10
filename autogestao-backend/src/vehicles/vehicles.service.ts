import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { QueryVehicleDto } from './dto/query-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dealershipId: string, userId: string, dto: CreateVehicleDto) {
    await this.assertWithinPlanLimit(dealershipId);

    return this.prisma.vehicle.create({
      data: {
        dealershipId,
        createdById: userId,
        brand: dto.brand,
        model: dto.model,
        year: dto.year,
        km: dto.km,
        cost: dto.cost,
        price: dto.price,
        type: dto.type ?? 'car',
        status: dto.status ?? 'available',
        description: dto.description,
        optionals: dto.optionals ?? [],
      },
    });
  }

  async findAll(dealershipId: string, query: QueryVehicleDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.VehicleWhereInput = {
      dealershipId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.search
        ? {
            OR: [
              { brand: { contains: query.search, mode: 'insensitive' } },
              { model: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.vehicle.findMany({
        where,
        include: { photos: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(dealershipId: string, id: string) {
    // O filtro por dealershipId aqui é o que garante o isolamento entre
    // revendas: mesmo sabendo o id de um veículo de outra revenda, a busca
    // simplesmente não o encontra.
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, dealershipId },
      include: { photos: true },
    });

    if (!vehicle) {
      throw new NotFoundException('Veículo não encontrado');
    }

    return vehicle;
  }

  async update(dealershipId: string, id: string, dto: UpdateVehicleDto) {
    await this.findOne(dealershipId, id);
    return this.prisma.vehicle.update({ where: { id }, data: dto });
  }

  async remove(dealershipId: string, id: string) {
    await this.findOne(dealershipId, id);
    await this.prisma.vehicle.delete({ where: { id } });
    return { success: true };
  }

  private async assertWithinPlanLimit(dealershipId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { dealershipId },
      include: { plan: true },
    });

    // Sem assinatura ainda (ex.: revenda em onboarding) — não bloqueia.
    // Quando o módulo de cobrança (fase 4) estiver no ar, toda revenda
    // passa a ter uma subscription desde o registro.
    if (!subscription) return;

    const currentCount = await this.prisma.vehicle.count({
      where: { dealershipId },
    });

    if (currentCount >= subscription.plan.vehicleLimit) {
      throw new ForbiddenException(
        `Seu plano permite até ${subscription.plan.vehicleLimit} veículos em estoque. Faça upgrade para cadastrar mais.`,
      );
    }
  }
}
