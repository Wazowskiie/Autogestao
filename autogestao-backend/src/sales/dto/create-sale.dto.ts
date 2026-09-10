import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export enum PaymentMethod {
  cash = 'cash',
  financing = 'financing',
  consortium = 'consortium',
  pix = 'pix',
  card = 'card',
  transfer = 'transfer',
  promissory = 'promissory',
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
}