import { Type } from 'class-transformer';
import { IsNumber, Min, Max } from 'class-validator';

export class UpdateInterestRateDto {
  @IsNumber()
  @Min(0)
  @Max(500)
  @Type(() => Number)
  rate: number; // porcentagem ex: 40, 50, 65...
}
