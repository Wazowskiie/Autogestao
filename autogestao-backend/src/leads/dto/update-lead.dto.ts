import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { LeadSource, LeadTemperature } from './create-lead.dto';
import { LeadStage } from './update-lead-stage.dto';

export class UpdateLeadDto {
  @IsOptional() @IsEnum(LeadStage) stage?: LeadStage;
  @IsOptional() @IsString() vehicleId?: string;
  @IsOptional() @IsString() assignedSellerId?: string;
  @IsOptional() @IsEnum(LeadSource) source?: LeadSource;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsEnum(LeadTemperature) temperature?: LeadTemperature;
  @IsOptional() @IsNumber() @Type(() => Number) budget?: number;
  @IsOptional() @IsString() paymentIntent?: string;
  @IsOptional() @IsString() nextActionDate?: string;
  @IsOptional() @IsString() nextActionNote?: string;
}
