import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2, { message: 'o nome da loja deve ter ao menos 2 caracteres' })
  dealershipName: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'a URL da loja deve conter apenas letras minúsculas, números e hífen',
  })
  dealershipSlug: string;

  @IsString()
  @MinLength(2, { message: 'informe seu nome completo' })
  ownerName: string;

  @IsEmail({}, { message: 'informe um e-mail válido' })
  ownerEmail: string;

  @IsString()
  @MinLength(8, { message: 'a senha deve ter ao menos 8 caracteres' })
  password: string;
}
