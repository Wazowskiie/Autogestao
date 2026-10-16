import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatAiService } from './chat-ai.service';
import { AgentChatController, PublicChatController } from './chat.controller';
@Module({ providers: [ChatService, ChatAiService], controllers: [PublicChatController, AgentChatController] })
export class ChatModule {}
