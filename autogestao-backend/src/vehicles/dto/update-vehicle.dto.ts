import { Type } from 'class-transformer';
import {
  IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min, MinLength,
} from 'class-validator';
import { VehicleStatus, VehicleType } from '../../generated/prisma/client';

export class UpdateVehicleDto {
  @IsOptional() @IsString() @MinLength(1) brand?: string;
  @IsOptional() @IsString() @MinLength(1) model?: string;
  @IsOptional() @IsString() version?: string;
  @IsOptional() @IsInt() @Min(1900) @Type(() => Number) year?: number;
  @IsOptional() @IsInt() @Min(0) @Type(() => Number) km?: number;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() plate?: string;
  @IsOptional() @IsString() fuel?: string;
  @IsOptional() @IsString() transmission?: string;
  @IsOptional() @IsInt() @Min(0) @Type(() => Number) doors?: number;
  @IsOptional() @IsString() origin?: string;
  @IsOptional() @IsInt() @Min(0) @Type(() => Number) ownerCount?: number;
  @IsOptional() @IsBoolean() ipvaPaid?: boolean;
  @IsOptional() @IsBoolean() acceptsTrade?: boolean;
  @IsOptional() @IsBoolean() hasSpareKey?: boolean;
  @IsOptional() @IsBoolean() hasManual?: boolean;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) cost?: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) price?: number;
  @IsOptional() @IsEnum(VehicleStatus) status?: VehicleStatus;
  @IsOptional() @IsEnum(VehicleType) type?: VehicleType;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString({ each: true }) optionals?: string[];
}
