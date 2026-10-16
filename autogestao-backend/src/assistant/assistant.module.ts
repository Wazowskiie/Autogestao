import { Module } from '@nestjs/common';
import { CrmModule } from '../crm/crm.module';
import { StorageService } from '../vehicle-details/storage.service';
import { VehicleDetailsService } from '../vehicle-details/vehicle-details.service';
import { AssistantLlmService } from './assistant-llm.service';
import { AssistantToolsService } from './assistant-tools.service';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({
  imports: [CrmModule],
  controllers: [AssistantController],
  providers: [AssistantService, AssistantLlmService, AssistantToolsService, VehicleDetailsService, StorageService],
})
export class AssistantModule {}
