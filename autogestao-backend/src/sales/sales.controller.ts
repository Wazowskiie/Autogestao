import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateSaleDto } from './dto/create-sale.dto';
import { QuerySaleDto } from './dto/query-sale.dto';
import { SalesService } from './sales.service';
import { UpdateSaleDto } from './dto/update-sale.dto';

@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QuerySaleDto) {
    return this.salesService.findAll(user.dealershipId, query, user);
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser, @Query('month') month?: string) {
    return this.salesService.summary(user.dealershipId, month, user);
  }

  /** Dados para imprimir o contrato de venda e as notas promissórias */
  @Get(':id/documents')
  documents(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.salesService.documents(user.dealershipId, id, user);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.salesService.findOne(user.dealershipId, id, user);
  }

  @Roles('owner', 'admin', 'seller')
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSaleDto) {
    return this.salesService.create(user.dealershipId, user.userId, dto, user);
  }

  // Editar e excluir só para owner e admin
  @Roles('owner', 'admin')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() data: UpdateSaleDto,
  ) {
    return this.salesService.update(user.dealershipId, id, data);
  }

  @Roles('owner', 'admin')
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.salesService.remove(user.dealershipId, id);
  }
}
