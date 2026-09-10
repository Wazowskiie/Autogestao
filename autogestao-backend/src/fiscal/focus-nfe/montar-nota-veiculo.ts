import { ClienteNfe, EmitenteNfe, VeiculoNfe } from './focus-nfe.types';

/**
 * Monta o payload de uma NF-e (modelo 55) para venda de veículo.
 *
 * ⚠️ Os campos abaixo variam por estado/regime tributário e precisam ser
 * revisados com seu contador antes de operar em produção:
 *  - regimeTributario do emitente
 *  - cfop / ncm do item
 *  - icmsOrigem / icmsCst (tributação de veículo usado costuma ter regra
 *    própria, com frequência base de cálculo reduzida)
 *
 * Referência completa: https://campos.focusnfe.com.br/nfe/NotaFiscalXML.html
 */
export function montarNotaVeiculo(params: {
  emitente: EmitenteNfe;
  cliente: ClienteNfe;
  veiculo: VeiculoNfe;
  valorVenda: number;
}) {
  const { emitente, cliente, veiculo, valorVenda } = params;

  return {
    natureza_operacao: 'Venda de veículo usado',
    data_emissao: new Date().toISOString(),
    tipo_documento: 1,
    local_destino: cliente.uf === emitente.uf ? 1 : 2,
    finalidade_emissao: 1,
    consumidor_final: 1,
    presenca_comprador: 1,

    cnpj_emitente: emitente.cnpj,
    nome_emitente: emitente.razaoSocial,
    nome_fantasia_emitente: emitente.nomeFantasia,
    logradouro_emitente: emitente.logradouro,
    numero_emitente: emitente.numero,
    bairro_emitente: emitente.bairro,
    municipio_emitente: emitente.municipio,
    uf_emitente: emitente.uf,
    cep_emitente: emitente.cep,
    inscricao_estadual_emitente: emitente.inscricaoEstadual,
    regime_tributario_emitente: emitente.regimeTributario ?? 3,

    nome_destinatario: cliente.nome,
    ...(cliente.cpf ? { cpf_destinatario: cliente.cpf } : { cnpj_destinatario: cliente.cnpj }),
    indicador_inscricao_estadual_destinatario: 9,
    logradouro_destinatario: cliente.logradouro,
    numero_destinatario: cliente.numero,
    bairro_destinatario: cliente.bairro,
    municipio_destinatario: cliente.municipio,
    uf_destinatario: cliente.uf,
    cep_destinatario: cliente.cep,
    pais_destinatario: 'Brasil',
    telefone_destinatario: cliente.telefone,

    valor_produtos: valorVenda,
    valor_total: valorVenda,
    modalidade_frete: 9,

    items: [
      {
        numero_item: 1,
        codigo_produto: veiculo.placa || veiculo.chassi,
        descricao: `${veiculo.marca} ${veiculo.modelo} ${veiculo.anoModelo} - Placa ${veiculo.placa} - Chassi ${veiculo.chassi}`,
        cfop: veiculo.cfop ?? '5102',
        ncm: veiculo.ncm ?? '87032310',
        unidade_comercial: 'UN',
        quantidade_comercial: 1,
        valor_unitario_comercial: valorVenda,
        valor_bruto: valorVenda,
        unidade_tributavel: 'UN',
        quantidade_tributavel: 1,
        valor_unitario_tributavel: valorVenda,
        icms_origem: veiculo.icmsOrigem ?? 0,
        icms_situacao_tributaria: veiculo.icmsCst ?? '41',
      },
    ],
  };
}
