import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { AdsService } from './ads.service';
import { CreateAdDto, UpdateAdDto } from './ads.dto';
import { PublishAdDto } from './publish-ad.dto';
@Controller('ads')
export class AdsController {
  constructor(private readonly ads: AdsService) {}
  @Get('vehicles') vehicles(@CurrentUser() user: AuthenticatedUser) { return this.ads.vehicles(user.dealershipId); }
  @Get('listings') list(@CurrentUser() user: AuthenticatedUser) { return this.ads.list(user.dealershipId); }
  @Get('listings/:id') get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.ads.get(user.dealershipId, id); }
  @Roles('owner', 'admin', 'seller')
  @Post('listings') create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAdDto) { return this.ads.create(user.dealershipId, dto); }
  @Roles('owner', 'admin', 'seller')
  @Patch('listings/:id') update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateAdDto) { return this.ads.update(user.dealershipId, id, dto); }
  @Roles('owner', 'admin', 'seller')
  @Post('listings/:id/sync-inventory')
  syncInventory(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.ads.syncInventory(user.dealershipId, id); }
  @Roles('owner', 'admin', 'seller')
  @Post('listings/:id/mark-published')
  markPublished(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: PublishAdDto) {
    return this.ads.markPublished(user.dealershipId, id, user.userId, dto);
  }
  @Roles('owner', 'admin', 'seller')
  @Post('listings/:id/mark-removed')
  markRemoved(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ads.markRemoved(user.dealershipId, id, user.userId);
  }
  @Roles('owner', 'admin')
  @Delete('listings/:id') remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.ads.remove(user.dealershipId, id); }
}
