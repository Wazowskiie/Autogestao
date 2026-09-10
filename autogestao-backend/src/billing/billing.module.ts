import { Module } from '@nestjs/common';
import { AsaasService } from './asaas.service';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  controllers: [BillingController],
  providers: [AsaasService, BillingService],
})
export class BillingModule {}
