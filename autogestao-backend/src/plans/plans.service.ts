import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import {
  FEATURE_LABELS, PLAN_CATALOG, PlanFeature, PlanSpec, TRIAL_DAYS, TRIAL_PLAN_ID, UNLIMITED, findSpec, planHighlights,
} from './plan-catalog';

const DAY = 86_400_000;

/** Primeiro instante do mês/dia atual no horário de Brasília */
function startOf(unit: 'month' | 'day') {
  const [y, m, d] = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, unit === 'month' ? 1 : d, 3, 0, 0)); // 00:00 de Brasília = 03:00 UTC
}

const fmtLimit = (n: number) => (n >= UNLIMITED ? 'ilimitado' : String(n));

@Injectable()
export class PlansService implements OnModuleInit {
  private readonly logger = new Logger('Planos');

  constructor(private readonly prisma: PrismaService) {}

  /** Deixa a tabela "plans" do banco igual ao catálogo do código */
  async onModuleInit() {
    try {
      await this.syncCatalog();
    } catch (e) {
      this.logger.warn(`Não consegui atualizar os planos no banco: ${(e as Error).message}`);
    }
  }

  async syncCatalog() {
    for (const p of PLAN_CATALOG) {
      const data = { name: p.name, price: p.price, vehicleLimit: p.vehicleLimit, userLimit: p.userLimit, features: planHighlights(p) };
      await this.prisma.plan.upsert({ where: { id: p.id }, update: data, create: { id: p.id, ...data } });
    }
  }

  // ================= Assinatura da loja =================

  /** Busca a assinatura; loja sem assinatura ganha o teste grátis */
  async subscription(dealershipId: string) {
    let sub = await this.prisma.subscription.findUnique({ where: { dealershipId }, include: { plan: true } });
    if (!sub) {
      await this.prisma.plan.upsert({ where: { id: TRIAL_PLAN_ID }, update: {}, create: (() => {
        const p = findSpec(TRIAL_PLAN_ID);
        return { id: p.id, name: p.name, price: p.price, vehicleLimit: p.vehicleLimit, userLimit: p.userLimit, features: planHighlights(p) };
      })() });
      sub = await this.prisma.subscription.create({
        data: { dealershipId, planId: TRIAL_PLAN_ID, status: 'trialing', currentPeriodEnd: new Date(Date.now() + TRIAL_DAYS * DAY) },
        include: { plan: true },
      });
    } else if (sub.status === 'trialing' && !sub.currentPeriodEnd) {
      // Assinaturas antigas sem data de fim do teste: começa a contar agora
      sub = await this.prisma.subscription.update({
        where: { id: sub.id }, data: { currentPeriodEnd: new Date(Date.now() + TRIAL_DAYS * DAY) }, include: { plan: true },
      });
    }
    return sub;
  }

  async entitlements(dealershipId: string) {
    const sub = await this.subscription(dealershipId);
    const spec = findSpec(sub.planId, sub.plan.name);
    const trialActive = sub.status === 'trialing' && !!sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > Date.now();
    return {
      spec,
      status: sub.status,
      trialActive,
      trialEndsAt: sub.status === 'trialing' ? sub.currentPeriodEnd : null,
      // No teste grátis (ou com PLAN_SWITCH_FREE=true no .env) a troca é na hora, sem pagar
      canSwitchFree: trialActive || process.env.PLAN_SWITCH_FREE === 'true',
    };
  }

  async spec(dealershipId: string): Promise<PlanSpec> {
    return (await this.entitlements(dealershipId)).spec;
  }

  async has(dealershipId: string, feature: PlanFeature) {
    return (await this.spec(dealershipId)).features.includes(feature);
  }

  async assertFeature(dealershipId: string, feature: PlanFeature) {
    const spec = await this.spec(dealershipId);
    if (!spec.features.includes(feature)) {
      const needed = PLAN_CATALOG.find((p) => p.features.includes(feature));
      throw new ForbiddenException(
        `${FEATURE_LABELS[feature]} não faz parte do plano ${spec.name}.` + (needed ? ` Disponível a partir do plano ${needed.name} (veja em Planos).` : ''),
      );
    }
  }

  // ================= Limites =================

  private countStock(dealershipId: string) {
    return this.prisma.vehicle.count({ where: { dealershipId, status: { not: 'sold' } } });
  }

  private countUsers(dealershipId: string) {
    return this.prisma.user.count({ where: { dealershipId, active: true } });
  }

  private countLog(dealershipId: string, action: string, since: Date) {
    return this.prisma.auditLog.count({ where: { dealershipId, action, createdAt: { gte: since } } });
  }

  async assertVehicleSlot(dealershipId: string) {
    const spec = await this.spec(dealershipId);
    if (spec.vehicleLimit >= UNLIMITED) return;
    if ((await this.countStock(dealershipId)) >= spec.vehicleLimit) {
      throw new ForbiddenException(`O plano ${spec.name} permite até ${spec.vehicleLimit} veículos em estoque. Venda algum ou mude de plano para cadastrar mais.`);
    }
  }

  async assertUserSlot(dealershipId: string) {
    const spec = await this.spec(dealershipId);
    if ((await this.countUsers(dealershipId)) >= spec.userLimit) {
      throw new ForbiddenException(`O plano ${spec.name} permite até ${spec.userLimit} usuários. Desative alguém ou mude de plano.`);
    }
  }

  /** Confere antes de gastar uma consulta de placa na API (consulta guardada no cache não conta) */
  async assertPlateLookup(dealershipId: string) {
    const spec = await this.spec(dealershipId);
    if ((await this.countLog(dealershipId, 'plate_lookup', startOf('month'))) >= spec.plateLookupsPerMonth) {
      throw new HttpException(
        `Você usou as ${spec.plateLookupsPerMonth} consultas de placa do plano ${spec.name} neste mês. Preencha os dados à mão ou mude de plano.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async assertNfe(dealershipId: string) {
    const spec = await this.spec(dealershipId);
    if (spec.nfePerMonth <= 0) await this.assertFeature(dealershipId, 'nfe');
    if ((await this.countLog(dealershipId, 'nfe_issued', startOf('month'))) >= spec.nfePerMonth) {
      throw new HttpException(`Você emitiu as ${spec.nfePerMonth} notas do plano ${spec.name} neste mês. Mude de plano para emitir mais.`, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  /** Perguntas para a assistente: limite por loja, por dia */
  async assertAssistant(dealershipId: string) {
    const spec = await this.spec(dealershipId);
    if (spec.assistantPerDay <= 0) await this.assertFeature(dealershipId, 'assistant');
    if ((await this.countLog(dealershipId, 'assistant_question', startOf('day'))) >= spec.assistantPerDay) {
      throw new HttpException(`A loja usou as ${spec.assistantPerDay} perguntas de hoje do plano ${spec.name}. Amanhã libera de novo.`, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  /** Registra um uso (placa, nota, pergunta) para contar no limite do plano */
  async logUse(dealershipId: string, userId: string | null, action: 'plate_lookup' | 'nfe_issued' | 'assistant_question', entityId?: string) {
    await this.prisma.auditLog
      .create({ data: { dealershipId, userId, action, entity: 'plan_usage', entityId: entityId ?? null } })
      .catch((e) => this.logger.warn(`Não registrei o uso ${action}: ${(e as Error).message}`));
  }

  async usage(dealershipId: string) {
    const [vehicles, users, plateLookups, nfe, assistant] = await Promise.all([
      this.countStock(dealershipId),
      this.countUsers(dealershipId),
      this.countLog(dealershipId, 'plate_lookup', startOf('month')),
      this.countLog(dealershipId, 'nfe_issued', startOf('month')),
      this.countLog(dealershipId, 'assistant_question', startOf('day')),
    ]);
    return { vehicles, users, plateLookups, nfe, assistant };
  }

  // ================= Telas =================

  catalog() {
    return PLAN_CATALOG.map((p) => ({ ...p, highlights: planHighlights(p) }));
  }

  async current(u: AuthenticatedUser) {
    const [e, usage] = await Promise.all([this.entitlements(u.dealershipId), this.usage(u.dealershipId)]);
    return {
      plan: { ...e.spec, highlights: planHighlights(e.spec) },
      status: e.status,
      trialActive: e.trialActive,
      trialEndsAt: e.trialEndsAt,
      trialDaysLeft: e.trialActive && e.trialEndsAt ? Math.max(0, Math.ceil((e.trialEndsAt.getTime() - Date.now()) / DAY)) : 0,
      canSwitchFree: e.canSwitchFree,
      features: e.spec.features,
      usage,
    };
  }

  /** Confere se a loja cabe no plano (ex.: não dá para ir pro Básico com 45 motos em estoque) */
  async assertFits(dealershipId: string, target: PlanSpec) {
    const usage = await this.usage(dealershipId);
    if (target.vehicleLimit < UNLIMITED && usage.vehicles > target.vehicleLimit) {
      throw new BadRequestException(
        `Você tem ${usage.vehicles} veículos em estoque e o plano ${target.name} permite ${fmtLimit(target.vehicleLimit)}. Venda ou exclua alguns antes de trocar.`,
      );
    }
    if (usage.users > target.userLimit) {
      throw new BadRequestException(
        `A loja tem ${usage.users} usuários ativos e o plano ${target.name} permite ${target.userLimit}. Desative alguém em Vendedores antes de trocar.`,
      );
    }
  }

  async changePlan(u: AuthenticatedUser, planId: string) {
    const target = PLAN_CATALOG.find((p) => p.id === planId);
    if (!target) throw new BadRequestException('Plano não encontrado');
    const e = await this.entitlements(u.dealershipId);
    if (e.spec.id === target.id) return this.current(u);
    if (!e.canSwitchFree) {
      throw new BadRequestException('Seu teste grátis terminou. Para trocar de plano, faça o pagamento do novo plano.');
    }
    await this.assertFits(u.dealershipId, target);
    await this.prisma.subscription.update({ where: { dealershipId: u.dealershipId }, data: { planId: target.id } });
    await this.prisma.auditLog
      .create({ data: { dealershipId: u.dealershipId, userId: u.userId, action: 'plan_changed', entity: 'subscription', metadata: { from: e.spec.id, to: target.id } } })
      .catch(() => undefined);
    return this.current(u);
  }
}
