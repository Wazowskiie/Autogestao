import { Module } from '@nestjs/common';
import { TokenEncryptionService } from '../common/crypto/token-encryption.service';
import { WhatsappController, WhatsappWebhookController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';

@Module({ controllers: [WhatsappController, WhatsappWebhookController], providers: [WhatsappService, TokenEncryptionService] })
export class WhatsappModule {}
