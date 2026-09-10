import { IsDateString, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @MinLength(2, { message: 'o nome deve ter ao menos 2 caracteres' })
  name: string;

  @IsOptional() @IsString() document?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail({}, { message: 'informe um e-mail válido' }) email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsDateString() birthDate?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() howMet?: string;
  @IsOptional() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() notes?: string;
}
