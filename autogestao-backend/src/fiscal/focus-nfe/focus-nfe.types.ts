export interface EmitenteNfe {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string;
  logradouro: string;
  numero: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  inscricaoEstadual?: string;
  regimeTributario?: 1 | 2 | 3;
}

export interface ClienteNfe {
  nome: string;
  cpf?: string;
  cnpj?: string;
  logradouro: string;
  numero: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  telefone?: string;
}

export interface VeiculoNfe {
  marca: string;
  modelo: string;
  anoModelo: number;
  placa: string;
  chassi: string;
  cfop?: string;
  ncm?: string;
  icmsOrigem?: number;
  icmsCst?: string;
}

export type AmbienteFocusNfe = 'homologacao' | 'producao';

export interface StatusNfe {
  status: 'processando_autorizacao' | 'autorizado' | 'erro_autorizacao' | 'cancelado' | string;
  status_sefaz?: string;
  mensagem_sefaz?: string;
  chave_nfe?: string;
  numero?: string;
  serie?: string;
  caminho_xml_nota_fiscal?: string;
  caminho_danfe?: string;
  [key: string]: unknown;
}
