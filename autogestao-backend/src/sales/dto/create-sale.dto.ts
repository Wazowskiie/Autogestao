import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsDateString, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString,
  Max, Min, MinLength, ValidateNested,
} from 'class-validator';
import { VehicleType } from '../../generated/prisma/client';

// Forma de pagamento "principal" da venda (usada na edição e em vendas antigas)
export enum PaymentMethod {
  cash = 'cash',
  financing = 'financing',
  consortium = 'consortium',
  pix = 'pix',
  card = 'card',
  transfer = 'transfer',
  promissory = 'promissory',
}

// Formas que podem ser combinadas numa mesma venda
export const SALE_PAYMENT_METHODS = [
  'pix', 'cash', 'transfer', 'card_credit', 'card_debit', 'financing', 'consortium', 'promissory',
] as const;
export type SalePaymentMethod = (typeof SALE_PAYMENT_METHODS)[number];

// Uma parte do pagamento (ex.: R$ 5.000 no PIX, R$ 12.000 no cartão em 10x)
export class SalePaymentDto {
  @IsIn(SALE_PAYMENT_METHODS, { message: 'Forma de pagamento inválida' })
  method: SalePaymentMethod;

  @IsNumber({}, { message: 'Valor do pagamento inválido' })
  @Min(0.01, { message: 'Informe o valor de cada forma de pagamento' })
  @Type(() => Number)
  amount: number;

  // Cartão de crédito: em quantas vezes
  @IsOptional() @IsInt() @Min(1) @Max(24) @Type(() => Number)
  installments?: number;

  // Cartão: taxa da maquininha em %
  @IsOptional()
  @IsNumber({}, { message: 'Taxa da maquininha inválida' })
  @Min(0) @Max(30, { message: 'Taxa da maquininha muito alta, confira o valor' })
  @Type(() => Number)
  feePercent?: number;

  @IsOptional() @IsString()
  notes?: string;
}

// Veículo que o cliente deu como parte do pagamento
export class TradeInDto {
  @IsEnum(VehicleType) type: VehicleType;
  @IsString() @MinLength(1, { message: 'Informe a marca do veículo da troca' }) brand: string;
  @IsString() @MinLength(1, { message: 'Informe o modelo do veículo da troca' }) model: string;
  @IsOptional() @IsString() version?: string;
  @IsInt() @Min(1900, { message: 'Ano do veículo da troca inválido' }) @Type(() => Number) year: number;
  @IsOptional() @IsInt() @Min(1900) @Type(() => Number) manufactureYear?: number;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() plate?: string;
  @IsOptional() @IsString() chassis?: string;
  @IsOptional() @IsString() renavam?: string;
  @IsOptional() @IsString() fuel?: string;
  @IsOptional() @IsInt() @Min(0) @Type(() => Number) km?: number;
  @IsOptional() @IsInt() @Min(0) @Type(() => Number) engineCc?: number;

  // Valor da avaliação: quanto a revenda está pagando pelo veículo
  @IsNumber({}, { message: 'Valor da avaliação inválido' })
  @Min(0.01, { message: 'Informe o valor da avaliação' })
  @Type(() => Number)
  value: number;
}

export class CreateSaleDto {
  @IsString()
  vehicleId: string;

  @IsString()
  customerId: string;

  @IsOptional()
  @IsString()
  sellerId?: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  cost: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsDateString()
  soldAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5, { message: 'No máximo 5 veículos na troca' })
  @ValidateNested({ each: true })
  @Type(() => TradeInDto)
  tradeIns?: TradeInDto[];

  // Formas de pagamento. Somadas com a troca, precisam fechar o preço da venda.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10, { message: 'No máximo 10 formas de pagamento' })
  @ValidateNested({ each: true })
  @Type(() => SalePaymentDto)
  payments?: SalePaymentDto[];
}