import { Module } from '@nestjs/common';
import { PlansModule } from '../plans/plans.module';
import { AutentiqueClient } from './autentique.client';
import { EsignController, EsignWebhookController } from './esign.controller';
import { EsignService } from './esign.service';

@Module({
  imports: [PlansModule],
  controllers: [EsignController, EsignWebhookController],
  providers: [EsignService, AutentiqueClient],
})
export class EsignModule {}
