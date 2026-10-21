import { applyDecorators, CanActivate, ExecutionContext, Injectable, SetMetadata, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlanFeature } from './plan-catalog';
import { PlansService } from './plans.service';

const KEY = 'plan_feature';

@Injectable()
export class PlanFeatureGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly plans: PlansService) {}

  async canActivate(ctx: ExecutionContext) {
    const feature = this.reflector.getAllAndOverride<PlanFeature | undefined>(KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!feature) return true;
    const user = ctx.switchToHttp().getRequest().user;
    if (!user?.dealershipId) return true; // rota pública: quem trata é o próprio serviço
    await this.plans.assertFeature(user.dealershipId, feature);
    return true;
  }
}

/** Só deixa usar a rota se o plano da loja tiver esse recurso */
export const RequiresFeature = (feature: PlanFeature) => applyDecorators(SetMetadata(KEY, feature), UseGuards(PlanFeatureGuard));
