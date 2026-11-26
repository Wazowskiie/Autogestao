import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SaveWhatsappAccountDto {
  // "Identificação do número de telefone" no painel da Meta
  @IsString() @Matches(/^\d{6,30}$/, { message: 'O Phone number ID tem só números (copie do painel da Meta).' })
  phoneNumberId: string;

  // "Identificação da conta do WhatsApp Business"
  @IsOptional() @IsString() @Matches(/^\d{0,30}$/, { message: 'O WABA ID tem só números.' })
  wabaId?: string;

  // Token permanente (usuário do sistema). Em branco = mantém o atual
  @IsOptional() @IsString() @MaxLength(1000)
  accessToken?: string;

  // Chave secreta do app (Configurações do app → Básico). Em branco = mantém a atual
  @IsOptional() @IsString() @MaxLength(200)
  appSecret?: string;
}

export class EmbeddedSignupDto {
  // Código de uso único que a janela da Meta devolve (vale poucos minutos)
  @IsString() @MinLength(10) @MaxLength(2000) code: string;
  @IsString() @Matches(/^\d{6,30}$/, { message: 'Phone number ID inválido.' }) phoneNumberId: string;
  @IsString() @Matches(/^\d{6,30}$/, { message: 'WABA ID inválido.' }) wabaId: string;
  @IsOptional() @IsString() @Matches(/^\d{0,30}$/) businessId?: string;
}

export class SendWhatsappDto {
  @IsString() @MinLength(1) @MaxLength(4096) text: string;
}

export class SellerAlertDto {
  // Nome do modelo aprovado na Meta (ex.: aviso_vendedor). Vazio desliga o aviso
  @IsOptional() @IsString() @MaxLength(512) template?: string | null;
  @IsOptional() @IsString() @MaxLength(10) lang?: string;
}
