import { Module } from '@nestjs/common';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { PlateLookupService } from './plate-lookup.service';

@Module({
  controllers: [VehiclesController],
  providers: [VehiclesService, PlateLookupService],
})
export class VehiclesModule {}