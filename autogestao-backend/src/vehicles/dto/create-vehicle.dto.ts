import { Type } from 'class-transformer';
import {
  IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min, MinLength,
} from 'class-validator';
import { VehicleStatus, VehicleType } from '../../generated/prisma/client';

export { VehicleStatus, VehicleType };

export class CreateVehicleDto {
  @IsString() @MinLength(1) brand: string;
  @IsString() @MinLength(1) model: string;

  @IsOptional() @IsString() version?: string;

  // Ano modelo
  @IsInt() @Min(1900) @Type(() => Number) year: number;
  // Ano de fabricação (opcional)
  @IsOptional() @IsInt() @Min(1900) @Type(() => Number) manufactureYear?: number;

  @IsInt() @Min(0) @Type(() => Number) km: number;

  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() plate?: string;

  // Identificação
  @IsOptional() @IsString() chassis?: string;   // chassi ou nº de série/quadro
  @IsOptional() @IsString() renavam?: string;

  // Motor
  @IsOptional() @IsInt() @Min(0) @Type(() => Number) engineCc?: number;    // cilindrada (motos)
  @IsOptional() @IsInt() @Min(0) @Type(() => Number) motorPower?: number;  // potência em W (elétricos)

  // Subtipo quando type = other (ex.: "Bicicleta elétrica")
  @IsOptional() @IsString() category?: string;

  @IsOptional() @IsString() fuel?: string;
  @IsOptional() @IsString() transmission?: string;

  @IsOptional() @IsInt() @Min(0) @Type(() => Number) doors?: number;
  @IsOptional() @IsString() origin?: string;
  @IsOptional() @IsInt() @Min(0) @Type(() => Number) ownerCount?: number;

  @IsOptional() @IsBoolean() ipvaPaid?: boolean;
  @IsOptional() @IsBoolean() acceptsTrade?: boolean;
  @IsOptional() @IsBoolean() hasSpareKey?: boolean;
  @IsOptional() @IsBoolean() hasManual?: boolean;

  @IsNumber({}, { message: 'Preço de custo inválido' }) @Min(0) @Type(() => Number) cost: number;
  @IsNumber({}, { message: 'Preço de venda inválido' }) @Min(0) @Type(() => Number) price: number;

  @IsOptional() @IsEnum(VehicleStatus) status?: VehicleStatus;
  @IsEnum(VehicleType) type: VehicleType;

  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString({ each: true }) optionals?: string[];
}