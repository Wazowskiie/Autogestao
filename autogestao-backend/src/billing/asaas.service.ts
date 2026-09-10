import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface AsaasCustomer {
  id: string;
  name: string;
  email: string;
}

interface AsaasSubscription {
  id: string;
  status: string;
  nextDueDate: string;
}

interface AsaasPayment {
  id: string;
  status: string;
  invoiceUrl: string;
  bankSlipUrl?: string;
}

@Injectable()
export class AsaasService {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>('ASAAS_BASE_URL') ?? 'https://api-sandbox.asaas.com/v3';
    this.apiKey = this.config.getOrThrow<string>('ASAAS_API_KEY');
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        access_token: this.apiKey,
        ...options.headers,
      },
    });

    const data = await res.json();

    if (!res.ok) {
      const message = data?.errors?.[0]?.description ?? 'Erro ao comunicar com o Asaas';
      throw new InternalServerErrorException(message);
    }

    return data as T;
  }

  async createCustomer(params: { name: string; email: string; cpfCnpj?: string }) {
    return this.request<AsaasCustomer>('/customers', {
      method: 'POST',
      body: JSON.stringify({
        name: params.name,
        email: params.email,
        // Asaas sandbox aceita CPF de teste quando não informado; em produção isso é obrigatório.
        cpfCnpj: params.cpfCnpj ?? '24971563792',
      }),
    });
  }

  async createSubscription(params: {
    customerId: string;
    value: number;
    billingType: 'PIX' | 'BOLETO' | 'CREDIT_CARD';
    nextDueDate: string; // YYYY-MM-DD
    description: string;
  }) {
    return this.request<AsaasSubscription>('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        customer: params.customerId,
        billingType: params.billingType,
        value: params.value,
        nextDueDate: params.nextDueDate,
        cycle: 'MONTHLY',
        description: params.description,
      }),
    });
  }

  async cancelSubscription(subscriptionId: string) {
    return this.request<{ deleted: boolean }>(`/subscriptions/${subscriptionId}`, {
      method: 'DELETE',
    });
  }

  async getSubscriptionPayments(subscriptionId: string) {
    return this.request<{ data: AsaasPayment[] }>(`/subscriptions/${subscriptionId}/payments`);
  }

  async getPixQrCode(paymentId: string) {
    return this.request<{ encodedImage: string; payload: string }>(
      `/payments/${paymentId}/pixQrCode`,
    );
  }
}
