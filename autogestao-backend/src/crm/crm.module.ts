import { Module } from '@nestjs/common';
import { CrmService } from './crm.service';
import { CrmController } from './crm.controller';
import { CrmExtrasService } from './crm-extras.service';
import { CrmExtrasController } from './crm-extras.controller';
@Module({ controllers: [CrmController, CrmExtrasController], providers: [CrmService, CrmExtrasService], exports: [CrmService] })
export class CrmModule {}
