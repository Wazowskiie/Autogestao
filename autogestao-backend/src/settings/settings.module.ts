import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageService } from '../vehicle-details/storage.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [ConfigModule],
  controllers: [SettingsController],
  providers: [SettingsService, StorageService],
})
export class SettingsModule {}
