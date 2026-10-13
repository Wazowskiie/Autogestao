import { Transform, Type } from 'class-transformer';
import {
  IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUrl, MaxLength, Min, MinLength,
} from 'class-validator';

// Campos que chegam vazios ("") viram undefined, para não salvar texto em branco
const emptyToUndefined = () =>
  Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value));

// ---------- Arquivos ----------
export const FILE_CATEGORIES = ['vehicle', 'supplier', 'owner_document'] as const;

export class UploadFileDto {
  @IsIn(FILE_CATEGORIES, { message: 'Categoria de arquivo inválida' })
  category: (typeof FILE_CATEGORIES)[number];

  @IsOptional() @emptyToUndefined() @IsString() @MaxLength(150) name?: string;
}

export class CreateLinkDto {
  @IsString() @MinLength(1, { message: 'Informe um nome para o link' }) @MaxLength(150) name: string;
  @IsUrl({ require_protocol: true }, { message: 'Link inválido. Comece com https://' }) url: string;
}

// ---------- NF-e ----------
export class CreateInvoiceDto {
  @IsIn(['issued', 'received']) direction: 'issued' | 'received';
  @IsOptional() @emptyToUndefined() @IsString() number?: string;
  @IsOptional() @emptyToUndefined() @IsString() series?: string;
  @IsOptional() @emptyToUndefined() @IsString() accessKey?: string;
  @IsOptional() @emptyToUndefined() @IsString() operation?: string;
  @IsOptional() @emptyToUndefined() @IsString() cfop?: string;
  @IsOptional() @IsIn(['entrada', 'saida']) type?: 'entrada' | 'saida';
  @IsOptional() @IsIn(['authorized', 'canceled', 'processing']) status?: string;
  @IsOptional() @emptyToUndefined() @IsString() issuerName?: string;
  @IsOptional() @emptyToUndefined() @IsString() issuerDocument?: string;
  @IsOptional() @emptyToUndefined() @IsString() recipientName?: string;
  @IsOptional() @emptyToUndefined() @IsString() recipientDocument?: string;
  @IsOptional() @IsNumber({}, { message: 'Valor inválido' }) @Min(0) @Type(() => Number) amount?: number;
  @IsOptional() @emptyToUndefined() @IsDateString({}, { message: 'Data inválida' }) issuedAt?: string;
}

export class ImportInvoiceXmlDto {
  @IsIn(['issued', 'received']) direction: 'issued' | 'received';
}

// ---------- RENAVE ----------
const RENAVE_STATUS = ['not_sent', 'pending', 'done', 'error'];

export class UpdateRenaveDto {
  @IsOptional() @IsIn(RENAVE_STATUS) entryStatus?: string;
  @IsOptional() @emptyToUndefined() @IsDateString() entryAt?: string;
  @IsOptional() @emptyToUndefined() @IsString() entryProtocol?: string;
  @IsOptional() @IsIn(RENAVE_STATUS) exitStatus?: string;
  @IsOptional() @emptyToUndefined() @IsDateString() exitAt?: string;
  @IsOptional() @emptyToUndefined() @IsString() exitProtocol?: string;
  @IsOptional() @IsString() notes?: string;
}

// ---------- Lançamentos ----------
export class CreateExpenseDto {
  @IsIn(['budget', 'expense', 'revenue']) kind: 'budget' | 'expense' | 'revenue';
  @IsString() @MinLength(1, { message: 'Informe a descrição' }) description: string;
  @IsNumber({}, { message: 'Valor inválido' }) @Min(0) @Type(() => Number) amount: number;
  @IsOptional() @emptyToUndefined() @IsDateString({}, { message: 'Data inválida' }) date?: string;
  @IsOptional() @emptyToUndefined() @IsString() supplier?: string;
  @IsOptional() @emptyToUndefined() @IsString() requester?: string;
  @IsOptional() @IsIn(['pending', 'paid']) status?: 'pending' | 'paid';
  @IsOptional() @IsBoolean() addToCost?: boolean;
}

export class UpdateExpenseDto {
  @IsOptional() @IsString() @MinLength(1) description?: string;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) amount?: number;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() supplier?: string;
  @IsOptional() @IsString() requester?: string;
  @IsOptional() @IsIn(['pending', 'paid', 'approved', 'rejected']) status?: string;
  @IsOptional() @IsBoolean() addToCost?: boolean;
}

// ---------- Entrada ----------
export class UpsertAcquisitionDto {
  @IsOptional() @emptyToUndefined() @IsDateString({}, { message: 'Data de entrada inválida' }) entryDate?: string;
  @IsOptional() @IsIn(['own', 'consigned']) ownershipType?: 'own' | 'consigned';
  @IsOptional() @IsString() supplierName?: string;
  @IsOptional() @IsString() supplierDocument?: string;
  @IsOptional() @IsString() supplierPhone?: string;
  @IsOptional() @IsString() documentOwnerName?: string;
  @IsOptional() @IsString() documentOwnerDocument?: string;
  @IsOptional() @IsNumber({}, { message: 'Valor de compra inválido' }) @Min(0) @Type(() => Number) purchaseValue?: number;
  @IsOptional() @IsNumber({}, { message: 'Valor de quitação inválido' }) @Min(0) @Type(() => Number) payoffValue?: number;
  @IsOptional() @IsNumber({}, { message: 'Valor de débitos inválido' }) @Min(0) @Type(() => Number) debtsValue?: number;
  @IsOptional() @IsString() notes?: string;
}

// ---------- Pendências ----------
export class CreatePendencyDto {
  @IsString() @MinLength(1, { message: 'Descreva a pendência' }) @MaxLength(300) description: string;
}

export class UpdatePendencyDto {
  @IsOptional() @IsBoolean() done?: boolean;
  @IsOptional() @IsString() @MinLength(1) description?: string;
}

// ---------- Web ----------
export class UpsertWebDto {
  @IsOptional() @IsString() @MaxLength(150) title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber({}, { message: 'Preço web inválido' }) @Min(0) @Type(() => Number) webPrice?: number | null;
  @IsOptional() @IsNumber({}, { message: 'Preço promocional inválido' }) @Min(0) @Type(() => Number) promoPrice?: number | null;
  @IsOptional() @IsString() youtubeUrl?: string;
  @IsOptional() @IsBoolean() featured?: boolean;
  @IsOptional() @IsBoolean() published?: boolean;
}