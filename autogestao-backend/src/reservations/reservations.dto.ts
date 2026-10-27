import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export const DEPOSIT_METHODS = ['pix', 'cash', 'transfer', 'card_credit', 'card_debit'] as const;

export class CreateReservationDto {
  @IsString() vehicleId: string;
  @IsString() customerId: string;

  @IsOptional() @IsNumber({}, { message: 'Valor do sinal inválido' }) @Min(0) @Type(() => Number)
  deposit?: number;

  @IsOptional() @IsIn(DEPOSIT_METHODS, { message: 'Forma de pagamento do sinal inválida' })
  depositMethod?: (typeof DEPOSIT_METHODS)[number];

  // Até quando o veículo fica reservado (AAAA-MM-DD)
  @IsOptional() @IsDateString()
  expiresAt?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  notes?: string;
}

export class UpdateReservationDto {
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class CancelReservationDto {
  // true = a loja devolve o sinal; false = a loja fica com o sinal
  @IsBoolean() refund: boolean;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class QueryReservationDto {
  @IsOptional() @IsIn(['active', 'converted', 'canceled']) status?: string;
  @IsOptional() @IsString() vehicleId?: string;
}
