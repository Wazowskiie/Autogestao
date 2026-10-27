import { Body, Controller, Delete, Get, Headers, Header, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequiresFeature } from '../plans/requires-feature.decorator';
import { SaveWhatsappAccountDto, SendWhatsappDto } from './whatsapp.dto';
import { WhatsappService } from './whatsapp.service';

@Roles('owner', 'admin', 'seller')
@RequiresFeature('crm')
@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly wa: WhatsappService) {}

  @Get('account') account(@CurrentUser() u: AuthenticatedUser) { return this.wa.account(u); }
  @Roles('owner', 'admin') @Put('account') save(@CurrentUser() u: AuthenticatedUser, @Body() dto: SaveWhatsappAccountDto) { return this.wa.saveAccount(u, dto); }
  @Roles('owner', 'admin') @Post('account/test') test(@CurrentUser() u: AuthenticatedUser) { return this.wa.test(u); }
  @Roles('owner', 'admin') @Delete('account') remove(@CurrentUser() u: AuthenticatedUser) { return this.wa.removeAccount(u); }

  @Get('unread') unread(@CurrentUser() u: AuthenticatedUser) { return this.wa.unread(u); }
  @Get('leads/:id') conversation(@CurrentUser() u: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) { return this.wa.conversation(u, id); }
  @Post('leads/:id/send') send(@CurrentUser() u: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SendWhatsappDto) { return this.wa.send(u, id, dto.text); }
}

/** Endereço que a Meta chama. Sem login: a segurança é o token de verificação e a assinatura da Meta. */
@Public()
@SkipThrottle()
@Controller('whatsapp/webhook')
export class WhatsappWebhookController {
  constructor(private readonly wa: WhatsappService) {}

  @Get()
  @Header('Content-Type', 'text/plain')
  verify(@Query('hub.mode') mode?: string, @Query('hub.verify_token') token?: string, @Query('hub.challenge') challenge?: string) {
    return this.wa.verify(mode, token, challenge);
  }

  @Post()
  @HttpCode(200)
  receive(@Req() req: Request & { rawBody?: Buffer }, @Headers('x-hub-signature-256') signature: string | undefined, @Body() body: unknown) {
    return this.wa.receive(req.rawBody, signature, body);
  }
}
