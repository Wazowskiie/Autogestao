import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class QuerySaleDto {
  @IsOptional()
  @IsString()
  month?: string; // formato: YYYY-MM

  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Use AAAA-MM' })
  from?: string; // período: de (AAAA-MM)

  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Use AAAA-MM' })
  to?: string; // período: até (AAAA-MM)

  @IsOptional()
  @IsString()
  sellerId?: string;

  @IsOptional()
  @IsIn(['active', 'canceled'])
  status?: 'active' | 'canceled';

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
