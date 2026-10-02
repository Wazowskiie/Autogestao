import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const RENAVE_PARTNERS = ['Renave Fácil', 'InfoSimples', 'SERPRO Direto'] as const;
export type RenavePartner = (typeof RENAVE_PARTNERS)[number];

export class SaveRenaveConfigDto {
  @IsIn(RENAVE_PARTNERS, { message: 'Parceiro inválido' })
  partner: RenavePartner;

  @IsBoolean()
  isExistingClient: boolean;

  // Dados da revenda enviados ao parceiro (todos opcionais ao salvar;
  // obrigatórios só na hora de solicitar a liberação)
  @IsOptional() @IsString() @MaxLength(20) cnpj?: string;
  @IsOptional() @IsString() @MaxLength(150) legalName?: string;       // razão social
  @IsOptional() @IsString() @MaxLength(150) tradeName?: string;       // nome fantasia
  @IsOptional() @IsString() @MaxLength(150) responsibleName?: string; // responsável
  @IsOptional() @IsString() @MaxLength(20) mobile?: string;           // celular
  @IsOptional() @IsString() @MaxLength(20) phone?: string;            // telefone fixo
  @IsOptional() @IsString() @MaxLength(150) email?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(2) uf?: string;
}