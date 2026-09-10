import { IsDateString, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateCustomerDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() document?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsDateString() birthDate?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() howMet?: string;
  @IsOptional() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() notes?: string;
}
