import {
  BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { UploadedFileLike } from '../vehicle-details/storage.service';
import { ChangePasswordDto, InterestBandDto, UpdateDealershipDto, UpdateFiscalDto, UpdateMeDto } from './settings.dto';
import { SettingsService } from './settings.service';

const id = new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException('Identificador inválido') });
const kindOf = (k: string): 'logo' | 'cover' => {
  if (k !== 'logo' && k !== 'cover') throw new BadRequestException('Imagem inválida');
  return k;
};

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(@CurrentUser() u: AuthenticatedUser) {
    return this.settings.get(u);
  }

  // ---------- Loja (dono/admin) ----------
  @Roles('owner', 'admin')
  @Patch('dealership')
  updateDealership(@CurrentUser() u: AuthenticatedUser, @Body() dto: UpdateDealershipDto) {
    return this.settings.updateDealership(u, dto);
  }

  @Roles('owner', 'admin')
  @Post('dealership/:kind')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  uploadImage(@CurrentUser() u: AuthenticatedUser, @Param('kind') kind: string, @UploadedFile() file: UploadedFileLike) {
    return this.settings.uploadImage(u, kindOf(kind), file);
  }

  @Roles('owner', 'admin')
  @Delete('dealership/:kind')
  removeImage(@CurrentUser() u: AuthenticatedUser, @Param('kind') kind: string) {
    return this.settings.removeImage(u, kindOf(kind));
  }

  // ---------- Minha conta (todos) ----------
  @Patch('me')
  updateMe(@CurrentUser() u: AuthenticatedUser, @Body() dto: UpdateMeDto) {
    return this.settings.updateMe(u, dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('me/password')
  changePassword(@CurrentUser() u: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    return this.settings.changePassword(u, dto);
  }

  // ---------- Nota fiscal (dono/admin) ----------
  @Roles('owner', 'admin')
  @Put('fiscal')
  updateFiscal(@CurrentUser() u: AuthenticatedUser, @Body() dto: UpdateFiscalDto) {
    return this.settings.updateFiscal(u, dto);
  }

  // ---------- Faixas de juros das promissórias ----------
  @Get('interest-rates')
  listBands(@CurrentUser() u: AuthenticatedUser) {
    return this.settings.listBands(u);
  }

  @Roles('owner', 'admin')
  @Post('interest-rates')
  createBand(@CurrentUser() u: AuthenticatedUser, @Body() dto: InterestBandDto) {
    return this.settings.createBand(u, dto);
  }

  @Roles('owner', 'admin')
  @Put('interest-rates/:id')
  updateBand(@CurrentUser() u: AuthenticatedUser, @Param('id', id) bandId: string, @Body() dto: InterestBandDto) {
    return this.settings.updateBand(u, bandId, dto);
  }

  @Roles('owner', 'admin')
  @Delete('interest-rates/:id')
  deleteBand(@CurrentUser() u: AuthenticatedUser, @Param('id', id) bandId: string) {
    return this.settings.deleteBand(u, bandId);
  }
}
