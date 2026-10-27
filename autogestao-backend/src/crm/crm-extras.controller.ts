import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { RequiresFeature } from '../plans/requires-feature.decorator';
import { CrmExtrasService } from './crm-extras.service';
import { CrmFollowupQueryDto, CrmFollowupStatusDto, CrmMessageSentDto, CrmReportQueryDto, CrmSettingsDto, CrmTemplateDto, CrmTradeInDto, CrmWishDto } from './crm-extras.dto';

@Roles('owner', 'admin', 'seller')
@RequiresFeature('crm')
@Controller('crm')
export class CrmExtrasController {
  constructor(private readonly x: CrmExtrasService) {}

  @Get('settings') settings(@CurrentUser() u: AuthenticatedUser) { return this.x.settings(u); }
  @Put('settings') updateSettings(@CurrentUser() u: AuthenticatedUser, @Body() dto: CrmSettingsDto) { return this.x.updateSettings(u, dto); }

  @Get('templates') templates(@CurrentUser() u: AuthenticatedUser) { return this.x.templates(u); }
  @Post('templates') createTemplate(@CurrentUser() u: AuthenticatedUser, @Body() dto: CrmTemplateDto) { return this.x.createTemplate(u, dto); }
  @Patch('templates/:id') updateTemplate(@CurrentUser() u: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CrmTemplateDto) { return this.x.updateTemplate(u, id, dto); }
  @Delete('templates/:id') removeTemplate(@CurrentUser() u: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) { return this.x.removeTemplate(u, id); }

  @Post('leads/:id/message-sent') messageSent(@CurrentUser() u: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CrmMessageSentDto) { return this.x.messageSent(u, id, dto); }
  @Put('leads/:id/trade-in') tradeIn(@CurrentUser() u: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CrmTradeInDto) { return this.x.updateTradeIn(u, id, dto); }

  @Get('leads/:id/wishes') wishes(@CurrentUser() u: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) { return this.x.wishes(u, id); }
  @Post('leads/:id/wishes') createWish(@CurrentUser() u: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CrmWishDto) { return this.x.createWish(u, id, dto); }
  @Patch('wishes/:id') updateWish(@CurrentUser() u: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CrmWishDto) { return this.x.updateWish(u, id, dto); }
  @Delete('wishes/:id') removeWish(@CurrentUser() u: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) { return this.x.removeWish(u, id); }
  @Get('wish-matches') wishMatches(@CurrentUser() u: AuthenticatedUser) { return this.x.wishMatches(u); }
  @Post('wish-matches/:id/dismiss') dismiss(@CurrentUser() u: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) { return this.x.dismissMatch(u, id); }

  @Get('followups') followups(@CurrentUser() u: AuthenticatedUser, @Query() q: CrmFollowupQueryDto) { return this.x.followups(u, q); }
  @Patch('followups/:id') followupStatus(@CurrentUser() u: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CrmFollowupStatusDto) { return this.x.followupStatus(u, id, dto.status); }
  @Post('followups/:id/opportunity') opportunity(@CurrentUser() u: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) { return this.x.followupOpportunity(u, id); }

  @Get('report') report(@CurrentUser() u: AuthenticatedUser, @Query() q: CrmReportQueryDto) { return this.x.report(u, q); }
}
