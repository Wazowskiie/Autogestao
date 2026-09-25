import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateInterestRateDto } from './dto/update-interest-rate.dto';

// Tabela padrão da foto
const DEFAULT_RATES = [
  { minInstallments: 4,  maxInstallments: 6,  rate: 40 },
  { minInstallments: 7,  maxInstallments: 8,  rate: 50 },
  { minInstallments: 9,  maxInstallments: 12, rate: 65 },
  { minInstallments: 13, maxInstallments: 15, rate: 75 },
  { minInstallments: 16, maxInstallments: 18, rate: 85 },
];

@Injectable()
export class InterestRatesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(dealershipId: string) {
    const rates = await this.prisma.interestRate.findMany({
      where: { dealershipId },
      orderBy: { minInstallments: 'asc' },
    });

    // Se não tem nenhuma taxa cadastrada ainda, cria as padrões
    if (rates.length === 0) {
      await this.prisma.interestRate.createMany({
        data: DEFAULT_RATES.map(r => ({ ...r, dealershipId })),
      });
      return this.prisma.interestRate.findMany({
        where: { dealershipId },
        orderBy: { minInstallments: 'asc' },
      });
    }

    return rates;
  }

  async getRateForInstallments(dealershipId: string, installments: number): Promise<number> {
    const rates = await this.findAll(dealershipId);
    const match = rates.find(
      r => installments >= r.minInstallments && installments <= r.maxInstallments,
    );
    if (!match) throw new NotFoundException(`Nenhuma taxa configurada para ${installments} parcelas`);
    return Number(match.rate);
  }

  async update(dealershipId: string, id: string, dto: UpdateInterestRateDto) {
    const rate = await this.prisma.interestRate.findFirst({ where: { id, dealershipId } });
    if (!rate) throw new NotFoundException('Taxa não encontrada');
    return this.prisma.interestRate.update({ where: { id }, data: { rate: dto.rate } });
  }

  // Divide um total em parcelas de valor inteiro (sem centavos).
  // Todas as parcelas ficam iguais e a última ajusta a diferença.
  // Ex.: R$ 14.025 em 12x = 11x de R$ 1.169 + última de R$ 1.166
  static splitInstallments(total: number, installments: number) {
    if (installments <= 1) {
      return { installmentValue: total, lastInstallmentValue: total };
    }

    const installmentValue = Math.ceil(total / installments);
    const lastInstallmentValue =
      Math.round((total - installmentValue * (installments - 1)) * 100) / 100;

    // Segurança para valores muito pequenos: se a última ficaria zerada ou negativa,
    // volta a dividir com centavos
    if (lastInstallmentValue <= 0) {
      const centsValue = Math.round((total / installments) * 100) / 100;
      return {
        installmentValue: centsValue,
        lastInstallmentValue: Math.round((total - centsValue * (installments - 1)) * 100) / 100,
      };
    }

    return { installmentValue, lastInstallmentValue };
  }

  // Calcula o total das promissórias: valor financiado + juros
  static calculate(financedAmount: number, installments: number, rate: number) {
    // ANTES: financedAmount * (rate / 100)  -> calculava só os juros (errado)
    // AGORA: financedAmount * (1 + rate / 100) -> valor financiado + juros
    const totalPromissory = Math.round(financedAmount * (1 + rate / 100));
    const { installmentValue, lastInstallmentValue } =
      InterestRatesService.splitInstallments(totalPromissory, installments);

    return {
      rate,
      totalPromissory,
      installmentValue,
      lastInstallmentValue,
      installments,
    };
  }
}