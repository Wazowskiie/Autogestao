import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf, ValidateNested } from 'class-validator';

export class SignerDto {
  @IsString() @MinLength(2, { message: 'Informe o nome de quem vai assinar' }) @MaxLength(120)
  name: string;

  // Obrigatório quando o link vai por e-mail
  @IsOptional() @ValidateIf((o) => o.email !== '') @IsEmail({}, { message: 'E-mail de quem vai assinar inválido' })
  email?: string;

  @IsOptional() @IsString() @MaxLength(30)
  phone?: string;

  @IsIn(['buyer', 'store', 'witness', 'other'], { message: 'Papel do signatário inválido' })
  role: 'buyer' | 'store' | 'witness' | 'other';

  // Por onde recebe o link: e-mail ou WhatsApp
  @IsIn(['email', 'whatsapp'], { message: 'Escolha e-mail ou WhatsApp' })
  channel: 'email' | 'whatsapp';
}

/** Chega como multipart (o PDF vai junto), então "signers" vem como texto JSON */
export class CreateSignatureDto {
  @IsString() @Matches(/^[a-z][a-z-]{1,40}$/, { message: 'Impresso inválido' })
  printId: string;

  @IsString() @MinLength(2) @MaxLength(150)
  title: string;

  @IsOptional() @IsString() @MaxLength(500)
  message?: string;

  @Transform(({ value }) => { if (typeof value !== 'string') return value; try { return JSON.parse(value); } catch { return value; } })
  @IsArray({ message: 'Lista de quem vai assinar inválida' }) @ArrayMinSize(1, { message: 'Informe quem vai assinar' }) @ArrayMaxSize(6)
  @ValidateNested({ each: true }) @Type(() => SignerDto)
  signers: SignerDto[];
}
