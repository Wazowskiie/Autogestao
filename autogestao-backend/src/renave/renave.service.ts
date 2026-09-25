import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service'; // ajuste o caminho se necessário
import { SaveRenaveConfigDto } from './dto/save-renave-config.dto';

@Injectable()
export class RenaveService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(dealershipId: string) {
    return this.prisma.renaveIntegration.findUnique({
      where: { dealershipId },
    });
  }

  async saveConfig(dealershipId: string, dto: SaveRenaveConfigDto) {
    return this.prisma.renaveIntegration.upsert({
      where: { dealershipId },
      create: {
        dealershipId,
        partner: dto.partner,
        isExistingClient: dto.isExistingClient,
        active: true,
      },
      update: {
        partner: dto.partner,
        isExistingClient: dto.isExistingClient,
        active: true,
      },
    });
  }
}