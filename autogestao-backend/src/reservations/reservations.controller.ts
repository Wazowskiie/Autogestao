import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CancelReservationDto, CreateReservationDto, QueryReservationDto, UpdateReservationDto } from './reservations.dto';
import { ReservationsService } from './reservations.service';

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() q: QueryReservationDto) {
    return this.reservations.list(user.dealershipId, q);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReservationDto) {
    return this.reservations.create(user.dealershipId, user.userId, dto, user);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateReservationDto) {
    return this.reservations.update(user.dealershipId, id, dto);
  }

  // Devolver ou reter o sinal é decisão do dono/admin
  @Roles('owner', 'admin')
  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CancelReservationDto) {
    return this.reservations.cancel(user.dealershipId, id, dto);
  }
}
