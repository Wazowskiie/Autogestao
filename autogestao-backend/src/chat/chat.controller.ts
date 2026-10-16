import { Body, Controller, Get, Headers, Param, Patch, Post, Query, ParseIntPipe, DefaultValuePipe, BadRequestException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { ChatService } from './chat.service';
import { ChatContactDto, ChatModeDto, SendChatDto } from './chat.dto';

@Public()
@Controller('storefront/:slug/chat')
export class PublicChatController {
  constructor(private readonly service: ChatService) {}
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post() start(@Param('slug') slug: string) { return this.service.start(slug); }
  @Get() read(@Param('slug') slug: string, @Headers('x-chat-token') token?: string) { return this.service.read(slug, token); }
  @Throttle({ default: { limit: 12, ttl: 60000 } })
  @Post('messages') send(@Param('slug') slug: string, @Headers('x-chat-token') token: string | undefined, @Body() dto: SendChatDto) { return this.service.send(slug, token, dto); }
  @Post('contact') contact(@Param('slug') slug: string, @Headers('x-chat-token') token: string | undefined, @Body() dto: ChatContactDto) { return this.service.contact(slug, token, dto); }
  @Post('handover') handover(@Param('slug') slug: string, @Headers('x-chat-token') token?: string) { return this.service.handover(slug, token); }
}

@Roles('owner', 'admin', 'seller')
@Controller('chat')
export class AgentChatController {
  constructor(private readonly service: ChatService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser, @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number) {
    if (page < 1 || page > 100000) throw new BadRequestException('Página inválida');
    return this.service.list(user.dealershipId, page, user);
  }
  @Get(':id') detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.detail(user.dealershipId, id, user); }
  @Patch(':id/mode') mode(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ChatModeDto) { return this.service.setMode(user.dealershipId, id, dto.mode, user.userId, user); }
  @Post(':id/messages') reply(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SendChatDto) { return this.service.agentReply(user.dealershipId, id, user.userId, dto, user); }
}
