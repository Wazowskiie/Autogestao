import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
import { TransactionType } from './create-transaction.dto';

export class QueryTransactionDto {
  @IsOptional()
  @IsString()
  month?: string; // YYYY-MM

  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Use AAAA-MM' })
  from?: string; // período: de (AAAA-MM)

  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Use AAAA-MM' })
  to?: string; // período: até (AAAA-MM)

  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 50;
}
