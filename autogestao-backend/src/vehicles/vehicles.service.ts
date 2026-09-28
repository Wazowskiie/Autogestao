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

// "abc-1d23" -> "ABC1D23"
function normalizePlate(plate?: string | null) {
  if (!plate) return null;
  const p = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return p || null;
}

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dealershipId: string, userId: string, dto: CreateVehicleDto) {
    await this.assertWithinPlanLimit(dealershipId);

    const type = dto.type ?? 'car';

    // ANTES: só alguns campos eram salvos (placa, cor, combustível etc. se perdiam).
    // AGORA: salva tudo que veio do formulário.
    return this.prisma.vehicle.create({
      data: {
        dealershipId,
        createdById: userId,
        type,
        category: type === 'other' ? dto.category ?? null : null,
        status: dto.status ?? 'available',

        brand: dto.brand,
        model: dto.model,
        version: dto.version ?? null,
        year: dto.year,
        manufactureYear: dto.manufactureYear ?? null,
        km: dto.km,

        color: dto.color ?? null,
        plate: normalizePlate(dto.plate),
        chassis: dto.chassis ? dto.chassis.toUpperCase().trim() : null,
        renavam: dto.renavam ? dto.renavam.replace(/\D/g, '') : null,

        engineCc: dto.engineCc ?? null,
        motorPower: dto.motorPower ?? null,
        fuel: dto.fuel ?? null,
        transmission: dto.transmission ?? null,
        doors: dto.doors ?? null,
        origin: dto.origin ?? null,
        ownerCount: dto.ownerCount ?? null,

        ipvaPaid: dto.ipvaPaid ?? false,
        acceptsTrade: dto.acceptsTrade ?? false,
        hasSpareKey: dto.hasSpareKey ?? false,
        hasManual: dto.hasManual ?? false,

        cost: dto.cost,
        price: dto.price,
        description: dto.description ?? null,
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
              // Agora também dá pra buscar pela placa (com ou sem hífen)
              { plate: { contains: query.search.toUpperCase().replace(/[^A-Z0-9]/g, ''), mode: 'insensitive' } },
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

    const data: Prisma.VehicleUpdateInput = { ...dto } as Prisma.VehicleUpdateInput;
    if (dto.plate !== undefined) data.plate = normalizePlate(dto.plate);
    if (dto.chassis) data.chassis = dto.chassis.toUpperCase().trim();
    if (dto.renavam) data.renavam = dto.renavam.replace(/\D/g, '');
    // Se deixou de ser "Outros", limpa o subtipo
    if (dto.type && dto.type !== 'other') data.category = null;

    return this.prisma.vehicle.update({ where: { id }, data });
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