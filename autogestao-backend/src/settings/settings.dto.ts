import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, IsObject } from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

// ---------- Dados da loja ----------
export class UpdateDealershipDto {
  @IsOptional() @trim() @IsString() @MinLength(2, { message: 'Nome da loja muito curto' }) @MaxLength(100) name?: string;
  @IsOptional() @trim() @IsString() @MaxLength(20) cnpj?: string;
  @IsOptional() @trim() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @trim() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @trim() @IsString() @MaxLength(2) state?: string;
  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Cor inválida' }) primaryColor?: string;
  // WhatsApp e redes sociais (link ou @). Ver social-links.ts
  @IsOptional() @IsObject() socialLinks?: Record<string, string | null>;
  // Endereço do site: chronosauto.com.br/loja/<slug>
  @IsOptional() @trim() @IsString() @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'Use só letras minúsculas, números e hífen (ex: chronos-auto)' }) @MinLength(3, { message: 'Endereço do site muito curto' }) @MaxLength(40) slug?: string;
  // Endereço (aparece no contrato e nas promissórias; é o mesmo da nota fiscal)
  @IsOptional() @trim() @IsString() @MaxLength(120) street?: string;
  @IsOptional() @trim() @IsString() @MaxLength(20) number?: string;
  @IsOptional() @trim() @IsString() @MaxLength(80) district?: string;
  @IsOptional() @trim() @IsString() @MaxLength(10) zip?: string;
  // Entrada mínima nas promissórias (%); null remove o mínimo
  @IsOptional() @IsNumber({}, { message: 'Entrada mínima inválida' }) @Min(0) @Max(100, { message: 'A entrada mínima vai até 100%' }) @Type(() => Number) minDownPaymentPercent?: number | null;
}

// ---------- Minha conta ----------
export class UpdateMeDto {
  @trim() @IsString() @MinLength(2, { message: 'Nome muito curto' }) @MaxLength(100) name: string;
}

export class ChangePasswordDto {
  @IsString() @MinLength(1, { message: 'Informe a senha atual' }) currentPassword: string;
  @IsString() @MinLength(8, { message: 'A nova senha precisa ter pelo menos 8 caracteres' }) @MaxLength(100) newPassword: string;
}

// ---------- Nota fiscal (Focus NFe) ----------
export class UpdateFiscalDto {
  // Token só é enviado quando a pessoa quer trocar (em branco = mantém o atual)
  @IsOptional() @trim() @IsString() @MaxLength(200) token?: string;
  @trim() @IsString() @MinLength(14, { message: 'CNPJ inválido' }) @MaxLength(20) cnpj: string;
  @IsIn(['homologacao', 'producao']) ambiente: 'homologacao' | 'producao';
  @IsOptional() @trim() @IsString() @MaxLength(20) inscricaoEstadual?: string;
  @IsOptional() @IsInt() @IsIn([1, 2, 3]) @Type(() => Number) regimeTributario?: 1 | 2 | 3;
  @trim() @IsString() @MinLength(2, { message: 'Informe a rua' }) logradouro: string;
  @trim() @IsString() @MinLength(1, { message: 'Informe o número' }) numero: string;
  @trim() @IsString() @MinLength(2, { message: 'Informe o bairro' }) bairro: string;
  @trim() @IsString() @MinLength(2, { message: 'Informe a cidade' }) municipio: string;
  @trim() @IsString() @Matches(/^[A-Za-z]{2}$/, { message: 'UF inválida' }) uf: string;
  @trim() @IsString() @Matches(/^\d{5}-?\d{3}$/, { message: 'CEP inválido' }) cep: string;
}

// ---------- Faixas de juros das promissórias ----------
export class InterestBandDto {
  @IsInt({ message: 'Parcelas inválidas' }) @Min(1) @Max(60, { message: 'Máximo de 60 parcelas' }) @Type(() => Number) minInstallments: number;
  @IsInt({ message: 'Parcelas inválidas' }) @Min(1) @Max(60, { message: 'Máximo de 60 parcelas' }) @Type(() => Number) maxInstallments: number;
  @IsNumber({}, { message: 'Porcentagem inválida' }) @Min(0) @Max(500) @Type(() => Number) rate: number;
}

// ---------- Usuários da loja ----------
export class UpdateUserDto {
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsIn(['admin', 'seller'], { message: 'Função inválida' }) role?: 'admin' | 'seller';
}
