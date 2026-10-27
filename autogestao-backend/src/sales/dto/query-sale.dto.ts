import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class QuerySaleDto {
  @IsOptional()
  @IsString()
  month?: string; // formato: YYYY-MM

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
