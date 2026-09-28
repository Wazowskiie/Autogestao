import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { QueryVehicleDto } from './dto/query-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehiclesService } from './vehicles.service';
import { PlateLookupService } from './plate-lookup.service';

@Controller('vehicles')
export class VehiclesController {
  constructor(
    private readonly vehiclesService: VehiclesService,
    private readonly plateLookupService: PlateLookupService,
  ) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryVehicleDto) {
    return this.vehiclesService.findAll(user.dealershipId, query);
  }

  // Consulta os dados do veículo pela placa (API Placas, com cache no banco).
  // Fica ANTES do ":id" para não ser confundida com a busca por id.
  @Roles('owner', 'admin', 'seller')
  @Get('plate/:plate')
  lookupPlate(@Param('plate') plate: string) {
    return this.plateLookupService.lookup(plate);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.vehiclesService.findOne(user.dealershipId, id);
  }

  @Roles('owner', 'admin', 'seller')
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateVehicleDto) {
    return this.vehiclesService.create(user.dealershipId, user.userId, dto);
  }

  @Roles('owner', 'admin', 'seller')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.vehiclesService.update(user.dealershipId, id, dto);
  }

  @Roles('owner', 'admin')
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.vehiclesService.remove(user.dealershipId, id);
  }
}