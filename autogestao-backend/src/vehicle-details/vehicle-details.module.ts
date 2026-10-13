import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { VehicleDetailsController } from './vehicle-details.controller';
import { VehicleDetailsService } from './vehicle-details.service';

@Module({
  controllers: [VehicleDetailsController],
  providers: [VehicleDetailsService, StorageService],
})
export class VehicleDetailsModule {}