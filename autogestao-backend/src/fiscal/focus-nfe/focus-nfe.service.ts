import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { TokenEncryptionService } from '../../common/crypto/token-encryption.service';
// ⚠️ AJUSTE o caminho de import abaixo para o local real do seu PrismaService
import { PrismaService } from '../../prisma/prisma.service';
import { montarNotaVeiculo } from './montar-nota-veiculo';
import { AmbienteFocusNfe, ClienteNfe, StatusNfe, VeiculoNfe } from './focus-nfe.types';

const URLS_POR_AMBIENTE: Record<AmbienteFocusNfe, string> = {
  homologacao: 'https://homologacao.focusnfe.com.br/v2',
  producao: 'https://api.focusnfe.com.br/v2',
};

@Injectable()
export class FocusNfeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenEncryption: TokenEncryptionService
  ) {}

  /**
   * Emite a NF-e de venda de um veículo em nome do dealership informado.
   * Cada loja usa seu próprio CNPJ, token e ambiente (homologação/produção).
   */
  async emitirNotaVenda(params: {
    dealershipId: string;
    ref: string; // identificador único da nota no seu sistema (ex: id da venda)
    cliente: ClienteNfe;
    veiculo: VeiculoNfe;
    valorVenda: number;
  }) {
    const { dealershipId, ref, cliente, veiculo, valorVenda } = params;

    const dealership = await this.prisma.dealership.findUnique({
      where: { id: dealershipId },
    });

    if (!dealership) {
      throw new NotFoundException(`Dealership ${dealershipId} não encontrado.`);
    }
    if (!dealership.focusNfeTokenEncrypted || !dealership.cnpj) {
      throw new BadRequestException(
        'Esta loja ainda não tem a integração com a Focus NFe configurada (token/CNPJ ausentes).'
      );
    }

    const token = this.tokenEncryption.decrypt(dealership.focusNfeTokenEncrypted);
    const ambiente = (dealership.focusNfeAmbiente as AmbienteFocusNfe) ?? 'homologacao';
    const http = this.buildHttpClient(token, ambiente);

    const payload = montarNotaVeiculo({
      emitente: {
        cnpj: dealership.cnpj,
        razaoSocial: dealership.name,
        logradouro: dealership.focusNfeLogradouro ?? '',
        numero: dealership.focusNfeNumero ?? '',
        bairro: dealership.focusNfeBairro ?? '',
        municipio: dealership.focusNfeMunicipio ?? '',
        uf: dealership.focusNfeUf ?? '',
        cep: dealership.focusNfeCep ?? '',
        inscricaoEstadual: dealership.focusNfeInscricaoEstadual ?? undefined,
        regimeTributario: (dealership.focusNfeRegimeTributario as 1 | 2 | 3) ?? 3,
      },
      cliente,
      veiculo,
      valorVenda,
    });

    return this.request(http, 'post', '/nfe', payload, { params: { ref } });
  }

  /** Consulta o status de uma NF-e já emitida, pela `ref` usada na emissão. */
  async consultarStatus(dealershipId: string, ref: string): Promise<StatusNfe> {
    const dealership = await this.prisma.dealership.findUnique({
      where: { id: dealershipId },
    });
    if (!dealership?.focusNfeTokenEncrypted) {
      throw new NotFoundException('Integração Focus NFe não configurada para esta loja.');
    }

    const token = this.tokenEncryption.decrypt(dealership.focusNfeTokenEncrypted);
    const ambiente = (dealership.focusNfeAmbiente as AmbienteFocusNfe) ?? 'homologacao';
    const http = this.buildHttpClient(token, ambiente);

    return this.request(http, 'get', `/nfe/${ref}`);
  }

  /** Cancela uma NF-e autorizada. Justificativa precisa ter 15+ caracteres (exigência da SEFAZ). */
  async cancelarNota(dealershipId: string, ref: string, justificativa: string) {
    if (justificativa.trim().length < 15) {
      throw new BadRequestException('A justificativa de cancelamento precisa ter ao menos 15 caracteres.');
    }

    const dealership = await this.prisma.dealership.findUnique({
      where: { id: dealershipId },
    });
    if (!dealership?.focusNfeTokenEncrypted) {
      throw new NotFoundException('Integração Focus NFe não configurada para esta loja.');
    }

    const token = this.tokenEncryption.decrypt(dealership.focusNfeTokenEncrypted);
    const ambiente = (dealership.focusNfeAmbiente as AmbienteFocusNfe) ?? 'homologacao';
    const http = this.buildHttpClient(token, ambiente);

    return this.request(http, 'delete', `/nfe/${ref}`, undefined, { params: { justificativa } });
  }

  /** Salva (criptografado) o token de uma loja recém-configurada na Focus NFe. */
  async configurarIntegracao(
    dealershipId: string,
    dados: {
      token: string;
      cnpj: string;
      ambiente: AmbienteFocusNfe;
      inscricaoEstadual?: string;
      regimeTributario?: 1 | 2 | 3;
      logradouro: string;
      numero: string;
      bairro: string;
      municipio: string;
      uf: string;
      cep: string;
    }
  ) {
    const tokenEncrypted = this.tokenEncryption.encrypt(dados.token);

    return this.prisma.dealership.update({
      where: { id: dealershipId },
      data: {
        focusNfeTokenEncrypted: tokenEncrypted,
        cnpj: dados.cnpj, // reaproveita o campo cnpj que já existe no Dealership
        focusNfeAmbiente: dados.ambiente,
        focusNfeInscricaoEstadual: dados.inscricaoEstadual,
        focusNfeRegimeTributario: dados.regimeTributario,
        focusNfeLogradouro: dados.logradouro,
        focusNfeNumero: dados.numero,
        focusNfeBairro: dados.bairro,
        focusNfeMunicipio: dados.municipio,
        focusNfeUf: dados.uf,
        focusNfeCep: dados.cep,
      },
      select: { id: true, name: true, focusNfeAmbiente: true }, // nunca retorne o token
    });
  }

  private buildHttpClient(token: string, ambiente: AmbienteFocusNfe): AxiosInstance {
    return axios.create({
      baseURL: URLS_POR_AMBIENTE[ambiente],
      auth: { username: token, password: '' },
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });
  }

  private async request(
    http: AxiosInstance,
    method: 'get' | 'post' | 'delete',
    url: string,
    data?: unknown,
    extraConfig: Record<string, unknown> = {}
  ) {
    try {
      const response = await http.request({ method, url, data, ...extraConfig });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        // Log temporário de depuração — mostra o erro completo da Focus NFe
        // direto no terminal, sem passar pelo filtro de exceções do projeto.
        console.error('--- ERRO FOCUS NFE (debug) ---');
        console.error('Status:', error.response.status);
        console.error('Dados retornados:', JSON.stringify(error.response.data, null, 2));
        console.error('-------------------------------');

        throw new BadRequestException({
          message: `Focus NFe respondeu ${error.response.status}`,
          detalhes: error.response.data,
        });
      }
      throw error;
    }
  }
}