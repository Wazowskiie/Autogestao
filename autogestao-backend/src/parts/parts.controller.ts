import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreatePartDto } from './dto/create-part.dto';
import { QueryPartDto } from './dto/query-part.dto';
import { UpdatePartDto } from './dto/update-part.dto';
import { PartsService } from './parts.service';

class AdjustStockDto {
  @Type(() => Number)
  @IsInt()
  qty: number; // positivo = entrada, negativo = saída
}

@Controller('parts')
export class PartsController {
  constructor(private readonly partsService: PartsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryPartDto) {
    return this.partsService.findAll(user.dealershipId, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.partsService.findOne(user.dealershipId, id);
  }

  @Roles('owner', 'admin', 'seller')
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePartDto) {
    return this.partsService.create(user.dealershipId, dto);
  }

  @Roles('owner', 'admin', 'seller')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePartDto,
  ) {
    return this.partsService.update(user.dealershipId, id, dto);
  }

  @Roles('owner', 'admin', 'seller')
  @Patch(':id/stock')
  adjustStock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.partsService.adjustStock(user.dealershipId, id, dto.qty);
  }

  @Roles('owner', 'admin')
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.partsService.remove(user.dealershipId, id);
  }
}
