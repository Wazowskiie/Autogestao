import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class QueryPromissoryNoteDto {
  @IsOptional()
  @IsString()
  saleId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  paid?: boolean;

  @IsOptional()
  @IsString()
  month?: string; // YYYY-MM (filtra por dueDate)

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
