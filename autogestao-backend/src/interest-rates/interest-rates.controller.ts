import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UpdateInterestRateDto } from './dto/update-interest-rate.dto';
import { InterestRatesService } from './interest-rates.service';

@Controller('interest-rates')
export class InterestRatesController {
  constructor(private readonly interestRatesService: InterestRatesService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.interestRatesService.findAll(user.dealershipId);
  }

  // Endpoint público de cálculo — usado pelo frontend no modal de venda
  @Get('calculate')
  calculate(
    @CurrentUser() user: AuthenticatedUser,
    @Query('vehiclePrice') vehiclePrice: string,
    @Query('installments') installments: string,
  ) {
    return this.interestRatesService
      .getRateForInstallments(user.dealershipId, Number(installments))
      .then(rate =>
        InterestRatesService.calculate(Number(vehiclePrice), Number(installments), rate),
      );
  }

  // Só owner e admin podem editar as taxas
  @Roles('owner', 'admin')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateInterestRateDto,
  ) {
    return this.interestRatesService.update(user.dealershipId, id, dto);
  }
}
