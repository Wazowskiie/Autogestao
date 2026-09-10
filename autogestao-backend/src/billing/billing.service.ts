import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AsaasService } from './asaas.service';
import { CheckoutDto } from './dto/checkout.dto';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly asaas: AsaasService,
  ) {}

  async getStatus(dealershipId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { dealershipId },
      include: { plan: true },
    });
    if (!subscription) throw new NotFoundException('Assinatura não encontrada');
    return subscription;
  }

  async checkout(dealershipId: string, userEmail: string, userName: string, dto: CheckoutDto) {
    const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
    if (!plan) throw new NotFoundException('Plano não encontrado');

    let subscription = await this.prisma.subscription.findUnique({ where: { dealershipId } });

    // Garante que existe um cliente no Asaas vinculado a essa revenda.
    let asaasCustomerId = subscription?.paymentGatewayCustomerId ?? null;
    if (!asaasCustomerId) {
      const customer = await this.asaas.createCustomer({ name: userName, email: userEmail });
      asaasCustomerId = customer.id;
    }

    // Se já existe uma assinatura ativa no Asaas, cancela antes de criar a nova
    // (troca de plano = nova cobrança recorrente).
    if (subscription?.paymentGatewaySubscriptionId) {
      try {
        await this.asaas.cancelSubscription(subscription.paymentGatewaySubscriptionId);
      } catch {
        // segue mesmo se o cancelamento falhar (ex: já estava cancelada)
      }
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextDueDate = tomorrow.toISOString().split('T')[0];

    const asaasSubscription = await this.asaas.createSubscription({
      customerId: asaasCustomerId,
      value: Number(plan.price),
      billingType: dto.billingType,
      nextDueDate,
      description: `Assinatura AutoGestão — Plano ${plan.name}`,
    });

    subscription = await this.prisma.subscription.upsert({
      where: { dealershipId },
      create: {
        dealershipId,
        planId: plan.id,
        status: 'trialing',
        paymentGatewayCustomerId: asaasCustomerId,
        paymentGatewaySubscriptionId: asaasSubscription.id,
      },
      update: {
        planId: plan.id,
        status: 'trialing',
        paymentGatewayCustomerId: asaasCustomerId,
        paymentGatewaySubscriptionId: asaasSubscription.id,
      },
      include: { plan: true },
    });

    // Busca a primeira cobrança gerada pra devolver o link de pagamento / PIX
    const payments = await this.asaas.getSubscriptionPayments(asaasSubscription.id);
    const firstPayment = payments.data?.[0];

    let pix: { encodedImage: string; payload: string } | null = null;
    if (firstPayment && dto.billingType === 'PIX') {
      try {
        pix = await this.asaas.getPixQrCode(firstPayment.id);
      } catch {
        pix = null;
      }
    }

    return {
      subscription,
      payment: firstPayment
        ? {
            id: firstPayment.id,
            status: firstPayment.status,
            invoiceUrl: firstPayment.invoiceUrl,
            bankSlipUrl: firstPayment.bankSlipUrl ?? null,
          }
        : null,
      pix,
    };
  }

  // Webhook do Asaas — mapeia o evento de pagamento pro status da assinatura.
  async handleWebhook(payload: any) {
    const event = payload?.event as string;
    const asaasSubscriptionId = payload?.payment?.subscription as string | undefined;

    if (!asaasSubscriptionId) return { received: true };

    const subscription = await this.prisma.subscription.findFirst({
      where: { paymentGatewaySubscriptionId: asaasSubscriptionId },
    });
    if (!subscription) return { received: true };

    const statusMap: Record<string, 'active' | 'past_due' | 'canceled'> = {
      PAYMENT_CONFIRMED: 'active',
      PAYMENT_RECEIVED: 'active',
      PAYMENT_OVERDUE: 'past_due',
      PAYMENT_DELETED: 'canceled',
      SUBSCRIPTION_DELETED: 'canceled',
    };

    const newStatus = statusMap[event];
    if (!newStatus) return { received: true };

    const currentPeriodEnd = new Date();
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: newStatus,
        ...(newStatus === 'active' ? { currentPeriodEnd } : {}),
      },
    });

    return { received: true };
  }
}
