import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString,
  Min, MinLength, ValidateNested,
} from 'class-validator';
import { VehicleType } from '../../generated/prisma/client';

export enum PaymentMethod {
  cash = 'cash',
  financing = 'financing',
  consortium = 'consortium',
  pix = 'pix',
  card = 'card',
  transfer = 'transfer',
  promissory = 'promissory',
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
}