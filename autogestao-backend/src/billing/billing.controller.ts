import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from './billing.service';
import { CheckoutDto } from './dto/checkout.dto';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('plans')
  listPlans() {
    return this.prisma.plan.findMany({ orderBy: { price: 'asc' } });
  }

  @Get('status')
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getStatus(user.dealershipId);
  }

  @Roles('owner', 'admin')
  @Post('checkout')
  async checkout(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckoutDto) {
    const account = await this.prisma.user.findUniqueOrThrow({ where: { id: user.userId } });
    return this.billingService.checkout(user.dealershipId, account.email, account.name, dto);
  }

  // Endpoint público — chamado pelo Asaas, não pelo seu frontend.
  // Configure essa URL em Configurações > Integrações > Webhooks no painel do Asaas.
  @Public()
  @Post('webhook')
  webhook(@Body() payload: any) {
    return this.billingService.handleWebhook(payload);
  }
}
