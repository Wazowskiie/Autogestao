import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatAiService } from './chat-ai.service';
import { SellerAlertService } from './seller-alert.service';
import { TokenEncryptionService } from '../common/crypto/token-encryption.service';
import { AgentChatController, PublicChatController } from './chat.controller';
@Module({ providers: [ChatService, ChatAiService, SellerAlertService, TokenEncryptionService], controllers: [PublicChatController, AgentChatController] })
export class ChatModule {}
