import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAdDto, UpdateAdDto } from './ads.dto';
import { PublishAdDto } from './publish-ad.dto';

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
      const currentPhotos = ad.vehicle?.photos.map((photo) => photo.url) ?? savedPhotos;
      const priceChanged = ad.vehicle ? ad.price.toString() !== ad.vehicle.price.toString() : false;
      const photosChanged = JSON.stringify(savedPhotos) !== JSON.stringify(currentPhotos);
      const unavailable = !ad.vehicle || ad.vehicle.status !== 'available' || ad.status === 'archived';
      return {
        ...ad,
        inventorySync: {
          priceChanged,
          photosChanged,
          unavailable,
          needsAttention: priceChanged || photosChanged || unavailable,
          requiresExternalRemoval: ad.status === 'published' && unavailable,
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
        vehicleSnapshot: { brand: vehicle.brand, model: vehicle.model, version: vehicle.version, year: vehicle.year, km: vehicle.km, vehicleId: vehicle.id },
      },
    });
  }

  async update(dealershipId: string, id: string, dto: UpdateAdDto) {
    const ad = await this.get(dealershipId, id);
    if (ad.status !== 'draft' || !ad.vehicleId) throw new BadRequestException('Somente rascunhos vinculados ao estoque podem ser editados.');
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
    if (ad.status !== 'draft' || !ad.vehicleId) {
      throw new BadRequestException('Somente rascunhos vinculados ao estoque podem ser sincronizados.');
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

  /** Registra uma publicação feita manualmente fora do AutoGestão. */
  async markPublished(dealershipId: string, id: string, userId: string, dto: PublishAdDto) {
    return this.prisma.$transaction(async (tx) => {
      const ad = await tx.adListing.findFirst({ where: { id, dealershipId }, include: { vehicle: { select: { status: true } } } });
      if (!ad) throw new NotFoundException('Anúncio não encontrado.');
      if (ad.status !== 'draft' || !ad.vehicle || ad.vehicle.status !== 'available') {
        throw new BadRequestException('Somente rascunhos com veículo disponível podem ser marcados como publicados.');
      }
      const urls = Array.isArray(ad.photos) ? ad.photos.filter((p) => typeof p === 'string') : [];
      if (!ad.title.trim() || !ad.description.trim() || Number(ad.price) <= 0 || !urls.length) {
        throw new BadRequestException('Preencha título, descrição, preço e fotos antes de registrar a publicação.');
      }
      const updated = await tx.adListing.updateMany({
        where: { id, dealershipId, status: 'draft', vehicle: { status: 'available' } },
        data: { status: 'published', externalUrl: dto.externalUrl, publishedAt: new Date(), publishedById: userId, removedAt: null, removedById: null },
      });
      if (!updated.count) throw new BadRequestException('O anúncio mudou de estado. Atualize a página e tente novamente.');
      return tx.adListing.findUniqueOrThrow({ where: { id } });
    });
  }

  /** Registra a retirada manual na plataforma externa; não remove nada na OLX/Instagram. */
  async markRemoved(dealershipId: string, id: string, userId: string) {
    const updated = await this.prisma.adListing.updateMany({
      where: { id, dealershipId, status: 'published' },
      data: { status: 'removed', removedAt: new Date(), removedById: userId },
    });
    if (!updated.count) throw new BadRequestException('Somente anúncios publicados podem ser marcados como retirados.');
    return this.prisma.adListing.findFirst({ where: { id, dealershipId } });
  }

  async remove(dealershipId: string, id: string) {
    const ad = await this.get(dealershipId, id);
    if (ad.status !== 'draft') throw new BadRequestException('Somente rascunhos podem ser excluídos.');
    await this.prisma.adListing.delete({ where: { id } });
    return { success: true };
  }
}
