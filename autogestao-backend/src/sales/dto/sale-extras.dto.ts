import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { FINANCING_STATUSES, FinancingStatus } from './create-sale.dto';

export { SaleExpenseDto } from './create-sale.dto';

// Itens do pós-venda
export const CHECKLIST_KEYS = ['atpv', 'communication', 'transfer', 'keys', 'manual', 'documents'] as const;
export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];

export class CancelSaleDto {
  @IsString() @MinLength(3, { message: 'Informe o motivo do cancelamento' }) @MaxLength(500)
  reason: string;

  // Quanto a loja devolve ao cliente (vira despesa no Financeiro)
  @IsOptional() @IsNumber({}, { message: 'Valor devolvido inválido' }) @Min(0) @Type(() => Number)
  refundAmount?: number;
}

export class UpdateSaleExpenseDto {
  @IsOptional() @IsBoolean() paid?: boolean;
}

export class UpdateFinancingDto {
  @IsOptional() @IsString() @MaxLength(80) bank?: string;
  @IsOptional() @IsIn(FINANCING_STATUSES, { message: 'Situação do financiamento inválida' }) status?: FinancingStatus;
  @IsOptional() @IsDateString() receivedAt?: string;
  @IsOptional() @IsNumber({}, { message: 'Valor do retorno inválido' }) @Min(0) @Type(() => Number) returnAmount?: number;
}

export class UpdateCommissionDto {
  @IsOptional() @IsNumber({}, { message: 'Comissão inválida' }) @Min(0) @Type(() => Number) amount?: number;
  @IsOptional() @IsBoolean() paid?: boolean;
}

export class UpdateChecklistDto {
  @IsIn(CHECKLIST_KEYS, { message: 'Item do pós-venda inválido' }) key: ChecklistKey;
  @IsBoolean() done: boolean;
}

export class UpdateWarrantyDto {
  @IsOptional() @IsInt() @Min(0) @Max(3650) @Type(() => Number) days?: number;
  @IsOptional() @IsString() @MaxLength(300) coverage?: string;
}
