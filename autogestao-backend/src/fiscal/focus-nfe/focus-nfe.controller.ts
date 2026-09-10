import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../../auth/types/jwt-payload.type';
import { FocusNfeService } from './focus-nfe.service';
import {
  CancelarNotaDto,
  ConfigurarIntegracaoFocusNfeDto,
  EmitirNotaVendaDto,
} from './dto/focus-nfe.dto';

interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

// Não precisa de @UseGuards aqui — o projeto já aplica JwtAuthGuard e
// RolesGuard globalmente via APP_GUARD no app.module.ts.
@Controller('fiscal/nfe')
export class FocusNfeController {
  constructor(private readonly focusNfeService: FocusNfeService) {}

  @Post()
  async emitir(@Req() req: AuthenticatedRequest, @Body() dto: EmitirNotaVendaDto) {
    const dealershipId = req.user.dealershipId;
    return this.focusNfeService.emitirNotaVenda({
      dealershipId,
      ref: dto.ref,
      cliente: dto.cliente,
      veiculo: dto.veiculo,
      valorVenda: dto.valorVenda,
    });
  }

  @Get(':ref')
  async consultar(@Req() req: AuthenticatedRequest, @Param('ref') ref: string) {
    const dealershipId = req.user.dealershipId;
    return this.focusNfeService.consultarStatus(dealershipId, ref);
  }

  @Delete(':ref')
  async cancelar(
    @Req() req: AuthenticatedRequest,
    @Param('ref') ref: string,
    @Body() dto: CancelarNotaDto
  ) {
    const dealershipId = req.user.dealershipId;
    return this.focusNfeService.cancelarNota(dealershipId, ref, dto.justificativa);
  }

  @Post('configuracao')
  async configurar(@Req() req: AuthenticatedRequest, @Body() dto: ConfigurarIntegracaoFocusNfeDto) {
    const dealershipId = req.user.dealershipId;
    return this.focusNfeService.configurarIntegracao(dealershipId, dto);
  }
}