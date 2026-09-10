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

  // Calcula o total e parcelas das promissórias com arredondamento
  static calculate(vehiclePrice: number, installments: number, rate: number) {
    const totalPromissory = vehiclePrice * (rate / 100);
    const rawInstallment = totalPromissory / installments;
    // Arredonda pra cima no centavo e ajusta a última parcela
    const roundedInstallment = Math.ceil(rawInstallment * 100) / 100;
    const lastInstallment = Math.round((totalPromissory - roundedInstallment * (installments - 1)) * 100) / 100;

    return {
      rate,
      totalPromissory: Math.round(totalPromissory * 100) / 100,
      installmentValue: roundedInstallment,
      lastInstallmentValue: lastInstallment,
      installments,
    };
  }
}
