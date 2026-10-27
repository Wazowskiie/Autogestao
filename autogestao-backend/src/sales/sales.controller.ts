import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateSaleDto } from './dto/create-sale.dto';
import { QuerySaleDto } from './dto/query-sale.dto';
import { SalesService } from './sales.service';
import { UpdateSaleDto } from './dto/update-sale.dto';
import {
  CancelSaleDto, SaleExpenseDto, UpdateChecklistDto, UpdateCommissionDto, UpdateFinancingDto, UpdateSaleExpenseDto, UpdateWarrantyDto,
} from './dto/sale-extras.dto';

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

  /** Financiamentos aguardando o banco */
  @Get('financing-pending')
  financingPending(@CurrentUser() user: AuthenticatedUser) {
    return this.salesService.financingPending(user.dealershipId, user);
  }

  /** Pós-venda: transferências pendentes e prazos */
  @Get('after-sales')
  afterSales(@CurrentUser() user: AuthenticatedUser) {
    return this.salesService.afterSales(user.dealershipId, user);
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

  // ---------- Depois da venda ----------
  @Roles('owner', 'admin')
  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CancelSaleDto) {
    return this.salesService.cancel(user.dealershipId, id, dto);
  }

  @Roles('owner', 'admin')
  @Post(':id/expenses')
  addExpense(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SaleExpenseDto) {
    return this.salesService.addExpense(user.dealershipId, id, dto);
  }

  @Roles('owner', 'admin')
  @Patch(':id/expenses/:expenseId')
  updateExpense(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('expenseId') expenseId: string, @Body() dto: UpdateSaleExpenseDto) {
    return this.salesService.updateExpense(user.dealershipId, id, expenseId, dto);
  }

  @Roles('owner', 'admin')
  @Delete(':id/expenses/:expenseId')
  removeExpense(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('expenseId') expenseId: string) {
    return this.salesService.removeExpense(user.dealershipId, id, expenseId);
  }

  @Roles('owner', 'admin')
  @Patch(':id/payments/:paymentId/financing')
  updateFinancing(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('paymentId') paymentId: string, @Body() dto: UpdateFinancingDto) {
    return this.salesService.updateFinancing(user.dealershipId, id, paymentId, dto);
  }

  @Roles('owner', 'admin')
  @Patch(':id/commission')
  updateCommission(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateCommissionDto) {
    return this.salesService.updateCommission(user.dealershipId, id, dto);
  }

  @Patch(':id/checklist')
  updateChecklist(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateChecklistDto) {
    return this.salesService.updateChecklist(user.dealershipId, id, dto, user);
  }

  @Roles('owner', 'admin')
  @Patch(':id/warranty')
  updateWarranty(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateWarrantyDto) {
    return this.salesService.updateWarranty(user.dealershipId, id, dto);
  }
}
