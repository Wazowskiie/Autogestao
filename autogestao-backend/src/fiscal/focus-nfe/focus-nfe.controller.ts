import { RequiresFeature } from '../../plans/requires-feature.decorator';
import { PlansService } from '../../plans/plans.service';
import { Roles } from '../../common/decorators/roles.decorator';
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
@RequiresFeature('nfe')
@Controller('fiscal/nfe')
export class FocusNfeController {
  constructor(private readonly focusNfeService: FocusNfeService, private readonly plans: PlansService) {}

  @Post()
  async emitir(@Req() req: AuthenticatedRequest, @Body() dto: EmitirNotaVendaDto) {
    const dealershipId = req.user.dealershipId;
    await this.plans.assertNfe(dealershipId); // limite de notas por mês do plano
    const result = await this.focusNfeService.emitirNotaVenda({
      dealershipId,
      ref: dto.ref,
      cliente: dto.cliente,
      veiculo: dto.veiculo,
      valorVenda: dto.valorVenda,
    });
    await this.plans.logUse(dealershipId, req.user.userId, 'nfe_issued', dto.ref);
    return result;
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

  @Roles('owner', 'admin')
  @Post('configuracao')
  async configurar(@Req() req: AuthenticatedRequest, @Body() dto: ConfigurarIntegracaoFocusNfeDto) {
    const dealershipId = req.user.dealershipId;
    return this.focusNfeService.configurarIntegracao(dealershipId, dto);
  }
}