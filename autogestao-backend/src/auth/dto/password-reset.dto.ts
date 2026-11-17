import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail({}, { message: 'informe um e-mail válido' })
  email: string;
}

export class ResetPasswordDto {
  @IsString() @MinLength(20) @MaxLength(200)
  token: string;

  @IsString()
  @MinLength(8, { message: 'a senha deve ter ao menos 8 caracteres' })
  @MaxLength(200)
  password: string;
}
