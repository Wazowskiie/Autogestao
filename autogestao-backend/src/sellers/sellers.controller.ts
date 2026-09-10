import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateSellerDto, SellersService, UpdateSellerDto } from './sellers.service';

@Controller('sellers')
export class SellersController {
  constructor(private readonly sellersService: SellersService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('month') month?: string) {
    return this.sellersService.findAll(user.dealershipId, month);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.sellersService.findOne(user.dealershipId, id);
  }

  @Roles('owner', 'admin')
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSellerDto) {
    return this.sellersService.create(user.dealershipId, dto);
  }

  @Roles('owner', 'admin')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateSellerDto,
  ) {
    return this.sellersService.update(user.dealershipId, id, dto);
  }

  @Roles('owner', 'admin')
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.sellersService.remove(user.dealershipId, id);
  }
}
