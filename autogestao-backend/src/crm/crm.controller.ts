import { Body, Controller, Get, Param, Patch, Post, Query, ParseUUIDPipe, DefaultValuePipe, ParseIntPipe, BadRequestException } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CrmService } from './crm.service';
import { CrmActivityDto, CrmArchiveDto, CrmContactDto, CrmLeadDto, CrmQueryDto, CrmSaleDto, CrmTaskDto, CrmTaskQueryDto, CrmTaskStatusDto } from './crm.dto';
@Roles('owner','admin','seller')
@Controller('crm')
export class CrmController {
  constructor(private readonly service: CrmService) {}
  @Get('leads') list(@CurrentUser() u:AuthenticatedUser,@Query() q:CrmQueryDto){return this.service.list(u,q);}
  @Get('board') board(@CurrentUser() u:AuthenticatedUser,@Query() q:CrmQueryDto){return this.service.board(u,q);}
  @Get('summary') summary(@CurrentUser() u:AuthenticatedUser,@Query() q:CrmQueryDto){return this.service.summary(u,q);}
  @Get('options') options(@CurrentUser() u:AuthenticatedUser,@Query('search') search?:string){return this.service.options(u,search);}
  @Get('export') export(@CurrentUser() u:AuthenticatedUser,@Query() q:CrmQueryDto){return this.service.exportCsv(u,q);}
  @Post('leads') create(@CurrentUser() u:AuthenticatedUser,@Body() dto:CrmLeadDto){return this.service.create(u,dto);}
  @Get('leads/:id') detail(@CurrentUser() u:AuthenticatedUser,@Param('id',ParseUUIDPipe) id:string){return this.service.detail(u,id);}
  @Patch('leads/:id') update(@CurrentUser() u:AuthenticatedUser,@Param('id',ParseUUIDPipe) id:string,@Body() dto:CrmLeadDto){return this.service.update(u,id,dto);}
  @Patch('leads/:id/contact') contact(@CurrentUser() u:AuthenticatedUser,@Param('id',ParseUUIDPipe) id:string,@Body() dto:CrmContactDto){return this.service.contact(u,id,dto);}
  @Roles('owner','admin') @Patch('leads/:id/archive') archive(@CurrentUser() u:AuthenticatedUser,@Param('id',ParseUUIDPipe) id:string,@Body() dto:CrmArchiveDto){return this.service.archive(u,id,dto.archived);}
  @Post('leads/:id/activities') activity(@CurrentUser() u:AuthenticatedUser,@Param('id',ParseUUIDPipe) id:string,@Body() dto:CrmActivityDto){return this.service.activity(u,id,dto);}
  @Get('leads/:id/history') history(@CurrentUser() u:AuthenticatedUser,@Param('id',ParseUUIDPipe) id:string,@Query('page',new DefaultValuePipe(1),ParseIntPipe) page:number){if(page<1)throw new BadRequestException('Página inválida');return this.service.history(u,id,page);}
  @Get('tasks') tasks(@CurrentUser() u:AuthenticatedUser,@Query() q:CrmTaskQueryDto){return this.service.tasks(u,q);}
  @Get('reminders') reminders(@CurrentUser() u:AuthenticatedUser){return this.service.reminders(u);}
  @Post('leads/:id/tasks') task(@CurrentUser() u:AuthenticatedUser,@Param('id',ParseUUIDPipe) id:string,@Body() dto:CrmTaskDto){return this.service.saveTask(u,id,dto);}
  @Patch('leads/:id/tasks/:taskId') editTask(@CurrentUser() u:AuthenticatedUser,@Param('id',ParseUUIDPipe) id:string,@Param('taskId',ParseUUIDPipe) taskId:string,@Body() dto:CrmTaskDto){return this.service.saveTask(u,id,dto,taskId);}
  @Patch('tasks/:id/status') taskStatus(@CurrentUser() u:AuthenticatedUser,@Param('id',ParseUUIDPipe) id:string,@Body() dto:CrmTaskStatusDto){return this.service.taskStatus(u,id,dto.status);}
  @Get('leads/:id/sales') sales(@CurrentUser() u:AuthenticatedUser,@Param('id',ParseUUIDPipe) id:string){return this.service.eligibleSales(u,id);}
  @Post('leads/:id/sale') linkSale(@CurrentUser() u:AuthenticatedUser,@Param('id',ParseUUIDPipe) id:string,@Body() dto:CrmSaleDto){return this.service.linkSale(u,id,dto.saleId);}
}
