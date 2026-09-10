import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

class ClienteDto {
  @IsString() @IsNotEmpty() nome: string;
  @IsOptional() @IsString() cpf?: string;
  @IsOptional() @IsString() cnpj?: string;
  @IsString() @IsNotEmpty() logradouro: string;
  @IsString() @IsNotEmpty() numero: string;
  @IsString() @IsNotEmpty() bairro: string;
  @IsString() @IsNotEmpty() municipio: string;
  @IsString() @IsNotEmpty() uf: string;
  @IsString() @IsNotEmpty() cep: string;
  @IsOptional() @IsString() telefone?: string;
}

class VeiculoDto {
  @IsString() @IsNotEmpty() marca: string;
  @IsString() @IsNotEmpty() modelo: string;
  @IsNumber() anoModelo: number;
  @IsString() @IsNotEmpty() placa: string;
  @IsString() @IsNotEmpty() chassi: string;
  @IsOptional() @IsString() cfop?: string;
  @IsOptional() @IsString() ncm?: string;
}

export class EmitirNotaVendaDto {
  @IsString() @IsNotEmpty() ref: string;

  @ValidateNested()
  @Type(() => ClienteDto)
  cliente: ClienteDto;

  @ValidateNested()
  @Type(() => VeiculoDto)
  veiculo: VeiculoDto;

  @IsNumber() @IsPositive() valorVenda: number;
}

export class CancelarNotaDto {
  @IsString() @IsNotEmpty() justificativa: string;
}

export class ConfigurarIntegracaoFocusNfeDto {
  @IsString() @IsNotEmpty() token: string;
  @IsString() @IsNotEmpty() cnpj: string;
  @IsIn(['homologacao', 'producao']) ambiente: 'homologacao' | 'producao';
  @IsOptional() @IsString() inscricaoEstadual?: string;
  @IsOptional() @IsNumber() regimeTributario?: 1 | 2 | 3;
  @IsString() @IsNotEmpty() logradouro: string;
  @IsString() @IsNotEmpty() numero: string;
  @IsString() @IsNotEmpty() bairro: string;
  @IsString() @IsNotEmpty() municipio: string;
  @IsString() @IsNotEmpty() uf: string;
  @IsString() @IsNotEmpty() cep: string;
}
