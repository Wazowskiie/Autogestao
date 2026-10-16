import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { UpdateLeadStageDto } from './dto/update-lead-stage.dto';
import { CrmService } from '../crm/crm.service';
import { CrmLeadDto } from '../crm/crm.dto';

@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: CrmService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.leadsService.legacyGrouped(user);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.leadsService.detail(user, id);
  }

  @Roles('owner', 'admin', 'seller')
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CrmLeadDto) {
    return this.leadsService.create(user, dto);
  }

  @Roles('owner', 'admin', 'seller')
  @Patch(':id/stage')
  updateStage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateLeadStageDto,
  ) {
    return this.leadsService.update(user, id, { stage: dto.stage });
  }

  @Roles('owner', 'admin', 'seller')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CrmLeadDto,
  ) {
    return this.leadsService.update(user, id, dto);
  }

  @Roles('owner', 'admin')
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.leadsService.archive(user, id, true);
  }
}
