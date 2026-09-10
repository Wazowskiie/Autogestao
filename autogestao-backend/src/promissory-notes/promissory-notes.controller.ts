import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreatePromissoryNoteDto } from './dto/create-promissory-note.dto';
import { QueryPromissoryNoteDto } from './dto/query-promissory-note.dto';
import { PromissoryNotesService } from './promissory-notes.service';

@Controller('promissory-notes')
export class PromissoryNotesController {
  constructor(private readonly service: PromissoryNotesService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryPromissoryNoteDto) {
    return this.service.findAll(user.dealershipId, query);
  }

  @Roles('owner', 'admin', 'seller')
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePromissoryNoteDto) {
    return this.service.create(user.dealershipId, dto);
  }

  @Roles('owner', 'admin', 'seller')
  @Patch(':id/pay')
  pay(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.pay(user.dealershipId, id);
  }

  @Roles('owner', 'admin')
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.remove(user.dealershipId, id);
  }
}
