import { Global, Module } from '@nestjs/common';
import { PlanFeatureGuard } from './requires-feature.decorator';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';

// Global: qualquer módulo pode checar o plano da loja sem importar nada
@Global()
@Module({
  controllers: [PlansController],
  providers: [PlansService, PlanFeatureGuard],
  exports: [PlansService, PlanFeatureGuard],
})
export class PlansModule {}
