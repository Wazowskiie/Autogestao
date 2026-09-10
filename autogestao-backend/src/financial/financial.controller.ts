import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';
import { FinancialService } from './financial.service';

@Controller('financial')
export class FinancialController {
  constructor(private readonly financialService: FinancialService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryTransactionDto) {
    return this.financialService.findAll(user.dealershipId, query);
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser, @Query('month') month?: string) {
    return this.financialService.summary(user.dealershipId, month);
  }

  @Roles('owner', 'admin')
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTransactionDto) {
    return this.financialService.create(user.dealershipId, dto);
  }

  @Roles('owner', 'admin')
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.financialService.remove(user.dealershipId, id);
  }
}
