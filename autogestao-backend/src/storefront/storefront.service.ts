import { socialUrls, SocialLinks } from '../settings/social-links';
import { createPublicLead } from '../crm/crm-helpers';
import { PublicLeadDto } from '../crm/crm-extras.dto';
import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../prisma/prisma.service';

const PUBLIC_VEHICLE_SELECT = {
  id: true, brand: true, model: true, version: true, year: true, manufactureYear: true,
  km: true, color: true, price: true, status: true, type: true,
  // descrição pública = a da aba Web; vehicle.description é observação interna e não vai para o site
  web: { select: { description: true } },
  optionals: true, fuel: true, transmission: true, doors: true,
  createdAt: true, updatedAt: true, photos: { orderBy: { order: 'asc' as const } },
} as const;

/** Formato público: description vem da aba Web */
function toPublic<T extends { web?: { description: string | null } | null }>(v: T) {
  const { web, ...rest } = v;
  return { ...rest, description: web?.description ?? null };
}

@Injectable()
export class StorefrontService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly plans?: PlansService) {}

  async createLead(slug: string, dto: PublicLeadDto) {
    const dealership = await this.prisma.dealership.findUnique({ where: { slug }, select: { id: true } });
    if (!dealership) throw new NotFoundException('Loja não encontrada');
    return createPublicLead(this.prisma, dealership.id, dto);
  }

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
      // WhatsApp e redes sociais já como links
      social: socialUrls(dealership.socialLinks as SocialLinks | null),
      whatsapp: (dealership.socialLinks as SocialLinks | null)?.whatsapp ?? null,
      vehicleCount,
      // O site só mostra o chat se o plano da loja tiver "Atendimentos"
      chatEnabled: this.plans ? await this.plans.has(dealership.id, 'chat') : true,
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
        select: PUBLIC_VEHICLE_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    // Remove o custo (preço de compra) da resposta pública — informação privada da revenda
    return { items: items.map(toPublic), total, page, pageSize };
  }

  async getVehicle(slug: string, vehicleId: string) {
    const dealership = await this.prisma.dealership.findUnique({ where: { slug } });
    if (!dealership) throw new NotFoundException('Loja não encontrada');

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, dealershipId: dealership.id, status: 'available' },
      select: PUBLIC_VEHICLE_SELECT,
    });
    if (!vehicle) throw new NotFoundException('Veículo não encontrado');

    return toPublic(vehicle);
  }
}
