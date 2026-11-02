import { Module } from '@nestjs/common';
import { PlansModule } from '../plans/plans.module';
import { D4SignClient } from './d4sign.client';
import { EsignController, EsignWebhookController } from './esign.controller';
import { EsignService } from './esign.service';

@Module({
  imports: [PlansModule],
  controllers: [EsignController, EsignWebhookController],
  providers: [EsignService, D4SignClient],
})
export class EsignModule {}
