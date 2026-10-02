import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RenaveService } from './renave.service';
import { SaveRenaveConfigDto } from './dto/save-renave-config.dto';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';

// Rotas protegidas pelo guard global de autenticação (nenhum @Public() aqui).
@Controller('renave')
export class RenaveController {
  constructor(private readonly renaveService: RenaveService) {}

  // Sempre responde 200: { config: ... | null, signupUrl: ... }
  @Get()
  getConfig(@Req() req: Request & { user: AuthenticatedUser }) {
    return this.renaveService.getConfig(req.user.dealershipId);
  }

  // Salva os dados (rascunho), sem enviar nada
  @Post()
  saveConfig(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() dto: SaveRenaveConfigDto,
  ) {
    return this.renaveService.saveConfig(req.user.dealershipId, dto);
  }

  // Salva e envia o e-mail pedindo a liberação ao Renave Fácil
  @Post('request-activation')
  requestActivation(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() dto: SaveRenaveConfigDto,
  ) {
    return this.renaveService.requestActivation(req.user.dealershipId, dto);
  }
}