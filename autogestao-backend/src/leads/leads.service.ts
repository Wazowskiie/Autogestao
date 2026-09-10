import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { UpdateLeadStageDto } from './dto/update-lead-stage.dto';

const LEAD_INCLUDE = {
  customer: true,
  vehicle: { include: { photos: true } },
  assignedSeller: { select: { id: true, name: true } },
} as const;

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dealershipId: string, dto: CreateLeadDto) {
    let customerId = dto.customerId;

    // Se não foi passado um customerId mas sim dados do cliente, cria o cliente
    if (!customerId && dto.customerName) {
      const customer = await this.prisma.customer.create({
        data: {
          dealershipId,
          name: dto.customerName,
          phone: dto.customerPhone,
          email: dto.customerEmail,
        },
      });
      customerId = customer.id;
    }

    return this.prisma.lead.create({
      data: {
        dealershipId,
        customerId,
        vehicleId: dto.vehicleId,
        assignedSellerId: dto.assignedSellerId,
        source: dto.source,
        notes: dto.notes,
        stage: 'new',
      },
      include: LEAD_INCLUDE,
    });
  }

  async findAll(dealershipId: string) {
    const leads = await this.prisma.lead.findMany({
      where: { dealershipId },
      include: LEAD_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    // Agrupa por estágio para o kanban do frontend
    const grouped = {
      new: [] as typeof leads,
      contacted: [] as typeof leads,
      negotiating: [] as typeof leads,
      won: [] as typeof leads,
      lost: [] as typeof leads,
    };

    for (const lead of leads) {
      const stage = lead.stage as keyof typeof grouped;
      if (grouped[stage]) grouped[stage].push(lead);
    }

    return grouped;
  }

  async findOne(dealershipId: string, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, dealershipId },
      include: LEAD_INCLUDE,
    });
    if (!lead) throw new NotFoundException('Lead não encontrado');
    return lead;
  }

  async updateStage(dealershipId: string, id: string, dto: UpdateLeadStageDto) {
    await this.findOne(dealershipId, id);
    return this.prisma.lead.update({
      where: { id },
      data: { stage: dto.stage },
      include: LEAD_INCLUDE,
    });
  }

  async update(dealershipId: string, id: string, dto: UpdateLeadDto) {
    await this.findOne(dealershipId, id);
    return this.prisma.lead.update({
      where: { id },
      data: dto,
      include: LEAD_INCLUDE,
    });
  }

  async remove(dealershipId: string, id: string) {
    await this.findOne(dealershipId, id);
    await this.prisma.lead.delete({ where: { id } });
    return { success: true };
  }
}
