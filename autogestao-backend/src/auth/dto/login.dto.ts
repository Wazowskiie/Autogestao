import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'informe um e-mail válido' })
  email: string;

  @IsString()
  password: string;
}
