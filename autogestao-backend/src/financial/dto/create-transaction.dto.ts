import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export enum TransactionType {
  revenue = 'revenue',
  expense = 'expense',
}

export class CreateTransactionDto {
  @IsEnum(TransactionType, { message: 'Escolha se é receita ou despesa' })
  type: TransactionType;

  @IsString()
  @MinLength(2, { message: 'Escolha uma categoria' })
  category: string;

  @IsNumber({}, { message: 'O valor precisa ser um número' })
  @Min(0.01, { message: 'O valor precisa ser maior que zero' })
  @Type(() => Number)
  amount: number;

  // Se estiver pago: data do pagamento. Se estiver a pagar: data de vencimento.
  @IsOptional()
  @IsDateString({}, { message: 'Data inválida' })
  date?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  saleId?: string;

  // Veículo ligado à despesa/receita (para calcular o lucro real do veículo)
  @IsOptional()
  @IsString()
  vehicleId?: string;

  // true = pago/recebido, false = a pagar/a receber. Se não vier, considera pago.
  @IsOptional()
  @IsBoolean()
  paid?: boolean;

  // Repetir todo mês: quantidade de meses (ex.: aluguel por 12 meses)
  @IsOptional()
  @IsInt({ message: 'A quantidade de meses precisa ser um número inteiro' })
  @Min(2, { message: 'Para repetir, informe pelo menos 2 meses' })
  @Max(24, { message: 'Repita por no máximo 24 meses' })
  @Type(() => Number)
  repeatMonths?: number;
}