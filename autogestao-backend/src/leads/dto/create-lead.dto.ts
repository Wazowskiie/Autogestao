import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export enum LeadSource {
  whatsapp = 'whatsapp', instagram = 'instagram', site = 'site',
  indicacao = 'indicacao', olx = 'olx', webmotors = 'webmotors',
  presencial = 'presencial', outro = 'outro',
}

export enum LeadTemperature {
  hot = 'hot', warm = 'warm', cold = 'cold',
}

export class CreateLeadDto {
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() vehicleId?: string;
  @IsOptional() @IsString() assignedSellerId?: string;
  @IsOptional() @IsEnum(LeadSource) source?: LeadSource;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsEnum(LeadTemperature) temperature?: LeadTemperature;
  @IsOptional() @IsNumber() @Type(() => Number) budget?: number;
  @IsOptional() @IsString() paymentIntent?: string;
  @IsOptional() @IsString() nextActionDate?: string;
  @IsOptional() @IsString() nextActionNote?: string;

  // Dados do cliente quando não existe ainda no sistema
  @IsOptional() @IsString() customerName?: string;
  @IsOptional() @IsString() customerPhone?: string;
  @IsOptional() @IsString() customerEmail?: string;
}
