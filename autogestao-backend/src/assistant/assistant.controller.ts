import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AssistantChatDto, AssistantConfirmDto } from './assistant.dto';
import { AssistantService } from './assistant.service';

@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get('status')
  status() {
    return this.assistant.status();
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('chat')
  chat(@CurrentUser() user: AuthenticatedUser, @Body() dto: AssistantChatDto) {
    return this.assistant.chat(user, dto);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('confirm')
  confirm(@CurrentUser() user: AuthenticatedUser, @Body() dto: AssistantConfirmDto) {
    return this.assistant.confirm(user, dto.token);
  }
}
