import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaymentMethod } from './create-sale.dto';
export class UpdateSaleDto {
  @IsOptional() @IsString() @MaxLength(6000) notes?: string;
  @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: string;
}
