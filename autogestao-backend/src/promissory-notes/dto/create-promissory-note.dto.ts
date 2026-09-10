import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNumber, IsString, Min } from 'class-validator';

export class CreatePromissoryNoteDto {
  @IsString()
  saleId: string;

  @IsString()
  customerId: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  totalInstallments: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  totalAmount: number;

  @IsDateString()
  firstDueDate: string; // data do primeiro vencimento
}
