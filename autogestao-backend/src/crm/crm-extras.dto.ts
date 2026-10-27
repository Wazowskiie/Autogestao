import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

class PostSaleSettingsDto {
  @IsOptional() @IsBoolean() birthday?: boolean;
  @IsOptional() @IsBoolean() review?: boolean;
  @IsOptional() @IsBoolean() upgrade?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(30) @Max(3650) reviewDays?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(30) @Max(3650) upgradeDays?: number;
}
export class CrmSettingsDto {
  @IsOptional() @IsBoolean() roundRobin?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(168) slaHours?: number;
  @IsOptional() @ValidateNested() @Type(() => PostSaleSettingsDto) postSale?: PostSaleSettingsDto;
}

export const TEMPLATE_CATEGORIES = ['geral', 'primeiro_contato', 'disponivel', 'proposta', 'retorno', 'desejo', 'aniversario', 'revisao', 'recompra'] as const;
export class CrmTemplateDto {
  @IsString() @MinLength(2) @MaxLength(80) title: string;
  @IsString() @MinLength(2) @MaxLength(1500) body: string;
  @IsOptional() @IsIn(TEMPLATE_CATEGORIES) category?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(999) sort?: number;
}

export class CrmWishDto {
  @IsOptional() @IsIn(['car', 'moto', 'truck', 'other']) type?: string | null;
  @IsOptional() @IsString() @MaxLength(60) brand?: string | null;
  @IsOptional() @IsString() @MaxLength(80) model?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1950) @Max(2100) yearMin?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1950) @Max(2100) yearMax?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) priceMax?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) kmMax?: number | null;
  @IsOptional() @IsString() @MaxLength(500) notes?: string | null;
  @IsOptional() @IsIn(['active', 'fulfilled', 'canceled']) status?: string;
}

export class CrmTradeInDto {
  @IsOptional() @IsIn(['car', 'moto', 'truck', 'other']) type?: string;
  @IsOptional() @IsString() @MaxLength(10) plate?: string;
  @IsOptional() @IsString() @MaxLength(60) brand?: string;
  @IsOptional() @IsString() @MaxLength(80) model?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1950) @Max(2100) year?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) km?: number;
  @IsOptional() @IsString() @MaxLength(40) color?: string;
  // Quanto o cliente quer pela moto dele
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) expectedValue?: number;
  // Quanto a loja avaliou
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) evaluatedValue?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  // true = apaga a troca do lead
  @IsOptional() @IsBoolean() remove?: boolean;
}

export class CrmMessageSentDto {
  @IsString() @MinLength(1) @MaxLength(2000) text: string;
  @IsOptional() @IsString() @MaxLength(80) templateTitle?: string;
}

export class CrmFollowupStatusDto { @IsIn(['open', 'done', 'dismissed']) status: string; }
export class CrmFollowupQueryDto {
  @IsOptional() @IsIn(['open', 'done', 'dismissed']) status?: string;
}
export class CrmReportQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

// Formulário do site
export class PublicLeadDto {
  @IsString() @MinLength(2) @MaxLength(100) name: string;
  @IsString() @MinLength(8) @MaxLength(30) phone: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsUUID() vehicleId?: string;
  @IsOptional() @IsString() @MaxLength(1000) message?: string;
  @IsOptional() @IsString() @MaxLength(200) tradeIn?: string;
  @IsOptional() @IsIn(['interest', 'financing', 'visit']) kind?: 'interest' | 'financing' | 'visit';
  // Campo escondido: robôs preenchem, pessoas não
  @IsOptional() @IsString() @MaxLength(200) website?: string;
}
