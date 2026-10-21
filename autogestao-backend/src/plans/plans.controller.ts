import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsString } from 'class-validator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PlansService } from './plans.service';

class ChangePlanDto {
  @IsString() planId: string;
}

@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  /** Os planos com tudo o que cada um tem */
  @Get()
  list() {
    return this.plans.catalog();
  }

  /** Plano atual da loja, o que está liberado e quanto já foi usado */
  @Get('current')
  current(@CurrentUser() u: AuthenticatedUser) {
    return this.plans.current(u);
  }

  /** Troca de plano na hora (durante o teste grátis) */
  @Roles('owner', 'admin')
  @Post('change')
  change(@CurrentUser() u: AuthenticatedUser, @Body() dto: ChangePlanDto) {
    return this.plans.changePlan(u, dto.planId);
  }
}
