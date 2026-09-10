import { IsEnum, IsString } from 'class-validator';

export enum BillingType {
  PIX = 'PIX',
  BOLETO = 'BOLETO',
  CREDIT_CARD = 'CREDIT_CARD',
}

export class CheckoutDto {
  @IsString()
  planId: string;

  @IsEnum(BillingType)
  billingType: BillingType;
}
