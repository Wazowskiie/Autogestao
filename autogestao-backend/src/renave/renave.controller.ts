import { Body, Controller, Get, NotFoundException, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RenaveService } from './renave.service';
import { SaveRenaveConfigDto } from './dto/save-renave-config.dto';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type'; // mesmo tipo usado no auth.controller.ts

// Rotas protegidas pelo guard global de autenticação (nenhum @Public() aqui).
@Controller('renave')
export class RenaveController {
  constructor(private readonly renaveService: RenaveService) {}

  @Get()
  async getConfig(@Req() req: Request & { user: AuthenticatedUser }) {
    const config = await this.renaveService.getConfig(req.user.dealershipId);
    if (!config) throw new NotFoundException();
    return config;
  }

  @Post()
  async saveConfig(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() dto: SaveRenaveConfigDto,
  ) {
    return this.renaveService.saveConfig(req.user.dealershipId, dto);
  }
}