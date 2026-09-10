import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StorefrontService {
  constructor(private readonly prisma: PrismaService) {}

  async getDealership(slug: string) {
    const dealership = await this.prisma.dealership.findUnique({ where: { slug } });
    if (!dealership) throw new NotFoundException('Loja não encontrada');

    const vehicleCount = await this.prisma.vehicle.count({
      where: { dealershipId: dealership.id, status: 'available' },
    });

    // Não expõe dados sensíveis (CNPJ não é segredo, mas mantemos a resposta enxuta)
    return {
      id: dealership.id,
      name: dealership.name,
      slug: dealership.slug,
      city: dealership.city,
      state: dealership.state,
      phone: dealership.phone,
      logoUrl: dealership.logoUrl,
      coverUrl: dealership.coverUrl,
      primaryColor: dealership.primaryColor,
      vehicleCount,
    };
  }

  async listVehicles(
    slug: string,
    query: { search?: string; type?: string; minPrice?: number; maxPrice?: number; page?: number; pageSize?: number },
  ) {
    const dealership = await this.prisma.dealership.findUnique({ where: { slug } });
    if (!dealership) throw new NotFoundException('Loja não encontrada');

    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 24, 50);

    const where: any = {
      dealershipId: dealership.id,
      status: 'available', // a vitrine só mostra o que está disponível
    };

    if (query.search) {
      where.OR = [
        { brand: { contains: query.search, mode: 'insensitive' } },
        { model: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.type) where.type = query.type;
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.price = {};
      if (query.minPrice !== undefined) where.price.gte = query.minPrice;
      if (query.maxPrice !== undefined) where.price.lte = query.maxPrice;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.vehicle.findMany({
        where,
        include: { photos: { orderBy: { order: 'asc' } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    // Remove o custo (preço de compra) da resposta pública — informação privada da revenda
    const publicItems = items.map(({ cost, createdById, dealershipId, ...rest }) => rest);

    return { items: publicItems, total, page, pageSize };
  }

  async getVehicle(slug: string, vehicleId: string) {
    const dealership = await this.prisma.dealership.findUnique({ where: { slug } });
    if (!dealership) throw new NotFoundException('Loja não encontrada');

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, dealershipId: dealership.id, status: 'available' },
      include: { photos: { orderBy: { order: 'asc' } } },
    });
    if (!vehicle) throw new NotFoundException('Veículo não encontrado');

    const { cost, createdById, dealershipId, ...publicVehicle } = vehicle;
    return publicVehicle;
  }
}
