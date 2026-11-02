import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateSignatureDto } from './esign.dto';
import { EsignService } from './esign.service';

@Roles('owner', 'admin', 'seller')
@Controller('esign')
export class EsignController {
  constructor(private readonly esign: EsignService) {}

  @Get('overview') overview(@CurrentUser() u: AuthenticatedUser) { return this.esign.overview(u.dealershipId); }

  @Get('sales/:saleId') list(@CurrentUser() u: AuthenticatedUser, @Param('saleId', ParseUUIDPipe) saleId: string) {
    return this.esign.list(u, saleId);
  }

  /** multipart: file (PDF) + printId, title, message, signers (JSON) */
  @Post('sales/:saleId')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 16 * 1024 * 1024 } }))
  create(
    @CurrentUser() u: AuthenticatedUser, @Param('saleId', ParseUUIDPipe) saleId: string,
    @Body() dto: CreateSignatureDto, @UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    return this.esign.create(u, saleId, dto, file);
  }

  @Post(':id/refresh') refresh(@CurrentUser() u: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) { return this.esign.refresh(u, id); }
  @Post(':id/download') download(@CurrentUser() u: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) { return this.esign.download(u, id); }
  @Post(':id/resend') resend(@CurrentUser() u: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) { return this.esign.resend(u, id); }
  @Roles('owner', 'admin') @Post(':id/cancel') cancel(@CurrentUser() u: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) { return this.esign.cancel(u, id); }
}

/** Aviso da Autentique (JSON). Sem login: confere a x-autentique-signature e consulta a Autentique de novo. */
@Public()
@SkipThrottle()
@Controller('esign/webhook')
export class EsignWebhookController {
  constructor(private readonly esign: EsignService) {}

  @Post()
  @HttpCode(200)
  receive(@Req() req: Request & { rawBody?: Buffer }, @Body() body: unknown, @Headers('x-autentique-signature') signature?: string) {
    return this.esign.webhook(req.rawBody, body, signature);
  }
}
