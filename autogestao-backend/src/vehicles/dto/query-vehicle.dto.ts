import { VehicleStatus, VehicleType } from '../../generated/prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min, Matches, IsBoolean } from 'class-validator';

export class QueryVehicleDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;

  @IsOptional()
  @IsEnum(VehicleType)
  type?: VehicleType;

  // Só o que está na loja (disponível ou reservado)
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  inStock?: boolean;

  // Data de entrada no estoque (AAAA-MM)
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Use AAAA-MM' })
  from?: string; // entrada: de (AAAA-MM)

  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Use AAAA-MM' })
  to?: string; // entrada: até (AAAA-MM)

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;
}
