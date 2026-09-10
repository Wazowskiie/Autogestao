import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePartDto } from './dto/create-part.dto';
import { QueryPartDto } from './dto/query-part.dto';
import { UpdatePartDto } from './dto/update-part.dto';

@Injectable()
export class PartsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dealershipId: string, dto: CreatePartDto) {
    return this.prisma.part.create({
      data: {
        dealershipId,
        name: dto.name,
        sku: dto.sku,
        cost: dto.cost,
        price: dto.price,
        stockQty: dto.stockQty ?? 0,
        category: dto.category,
      },
    });
  }

  async findAll(dealershipId: string, query: QueryPartDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const where: any = { dealershipId };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
        { category: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.category) where.category = { contains: query.category, mode: 'insensitive' };
    if (query.lowStock) where.stockQty = { lte: 2 };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.part.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.part.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(dealershipId: string, id: string) {
    const part = await this.prisma.part.findFirst({ where: { id, dealershipId } });
    if (!part) throw new NotFoundException('Peça não encontrada');
    return part;
  }

  async update(dealershipId: string, id: string, dto: UpdatePartDto) {
    await this.findOne(dealershipId, id);
    return this.prisma.part.update({ where: { id }, data: dto });
  }

  async adjustStock(dealershipId: string, id: string, qty: number) {
    const part = await this.findOne(dealershipId, id);
    const newQty = part.stockQty + qty;
    if (newQty < 0) throw new BadRequestException('Estoque insuficiente');
    return this.prisma.part.update({
      where: { id },
      data: { stockQty: newQty },
    });
  }

  async remove(dealershipId: string, id: string) {
    await this.findOne(dealershipId, id);
    await this.prisma.part.delete({ where: { id } });
    return { success: true };
  }
}
