import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAdDto, UpdateAdDto } from './ads.dto';

@Injectable()
export class AdsService {
  constructor(private readonly prisma: PrismaService) {}

  vehicles(dealershipId: string) {
    return this.prisma.vehicle.findMany({
      where: { dealershipId, status: 'available' },
      select: {
        id: true, brand: true, model: true, version: true, year: true,
        km: true, price: true, description: true,
        photos: { select: { url: true, order: true }, orderBy: { order: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async list(dealershipId: string) {
    const ads = await this.prisma.adListing.findMany({
      where: { dealershipId },
      include: {
        vehicle: {
          select: {
            id: true, brand: true, model: true, year: true,
            status: true, price: true,
            photos: { select: { url: true, order: true }, orderBy: { order: 'asc' } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return ads.map((ad) => {
      const savedPhotos = Array.isArray(ad.photos)
        ? ad.photos.filter((item): item is string => typeof item === 'string')
        : [];
      const currentPhotos = ad.vehicle.photos.map((photo) => photo.url);
      const priceChanged = ad.price.toString() !== ad.vehicle.price.toString();
      const photosChanged = JSON.stringify(savedPhotos) !== JSON.stringify(currentPhotos);
      const unavailable = ad.vehicle.status !== 'available';
      return {
        ...ad,
        inventorySync: {
          priceChanged,
          photosChanged,
          unavailable,
          needsAttention: priceChanged || photosChanged || unavailable,
        },
      };
    });
  }

  async get(dealershipId: string, id: string) {
    const ad = await this.prisma.adListing.findFirst({ where: { id, dealershipId } });
    if (!ad) throw new NotFoundException('Anúncio não encontrado.');
    return ad;
  }

  async create(dealershipId: string, dto: CreateAdDto) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId, dealershipId, status: 'available' },
      include: { photos: { orderBy: { order: 'asc' } } },
    });
    if (!vehicle) throw new BadRequestException('Veículo indisponível ou não encontrado nesta concessionária.');
    const existing = await this.prisma.adListing.findFirst({
      where: { dealershipId, vehicleId: vehicle.id, channel: dto.channel },
    });
    if (existing) throw new BadRequestException('Já existe um rascunho deste veículo para este canal.');
    return this.prisma.adListing.create({
      data: {
        dealershipId, vehicleId: vehicle.id, channel: dto.channel,
        title: dto.title?.trim() || `${vehicle.brand} ${vehicle.model} ${vehicle.year}`,
        description: dto.description ?? vehicle.description ?? '',
        price: vehicle.price,
        photos: vehicle.photos.map((photo) => photo.url),
        status: 'draft',
      },
    });
  }

  async update(dealershipId: string, id: string, dto: UpdateAdDto) {
    const ad = await this.get(dealershipId, id);
    if (ad.status !== 'draft') throw new BadRequestException('Somente rascunhos podem ser editados.');
    return this.prisma.adListing.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
      },
    });
  }

  /** Atualiza apenas o preço e as fotos do rascunho. Não modifica título nem descrição. */
  async syncInventory(dealershipId: string, id: string) {
    const ad = await this.get(dealershipId, id);
    if (ad.status !== 'draft') {
      throw new BadRequestException('Somente rascunhos podem ser sincronizados.');
    }
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: ad.vehicleId, dealershipId },
      include: { photos: { orderBy: { order: 'asc' } } },
    });
    if (!vehicle) throw new NotFoundException('Veículo não encontrado no estoque.');
    if (vehicle.status !== 'available') {
      throw new BadRequestException('Veículo indisponível. Revise o anúncio antes de continuar.');
    }
    return this.prisma.adListing.update({
      where: { id },
      data: {
        price: vehicle.price,
        photos: vehicle.photos.map((photo) => photo.url),
      },
    });
  }

  async remove(dealershipId: string, id: string) {
    const ad = await this.get(dealershipId, id);
    if (ad.status !== 'draft') throw new BadRequestException('Somente rascunhos podem ser excluídos.');
    await this.prisma.adListing.delete({ where: { id } });
    return { success: true };
  }
}
