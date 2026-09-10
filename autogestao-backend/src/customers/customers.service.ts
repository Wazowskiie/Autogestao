import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { QueryCustomerDto } from './dto/query-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dealershipId: string, dto: CreateCustomerDto) {
    return this.prisma.customer.create({
      data: {
        dealershipId,
        name: dto.name,
        document: dto.document,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
      },
    });
  }

  async findAll(dealershipId: string, query: QueryCustomerDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: any = {
      dealershipId,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search, mode: 'insensitive' } },
              { document: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.customer.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(dealershipId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, dealershipId },
      include: {
        leads: { orderBy: { createdAt: 'desc' }, take: 5 },
        sales: { orderBy: { soldAt: 'desc' }, take: 5 },
      },
    });

    if (!customer) throw new NotFoundException('Cliente não encontrado');
    return customer;
  }

  async update(dealershipId: string, id: string, dto: UpdateCustomerDto) {
    await this.findOne(dealershipId, id);
    return this.prisma.customer.update({ where: { id }, data: dto });
  }

  async remove(dealershipId: string, id: string) {
    await this.findOne(dealershipId, id);
    await this.prisma.customer.delete({ where: { id } });
    return { success: true };
  }
}
