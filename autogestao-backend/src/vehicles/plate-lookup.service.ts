import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Quanto tempo uma placa consultada fica guardada antes de consultar de novo (em dias)
const CACHE_DAYS = 90;

export interface PlateLookupResult {
  plate: string;
  brand: string;
  model: string;
  version: string | null;
  year: number | null;
  manufactureYear: number | null;
  color: string | null;
  fuel: string | null;          // texto original, ex.: "Alcool / Gasolina"
  engineCc: number | null;      // cilindrada, ex.: 160
  origin: string | null;        // "Nacional" ou "Importado"
  type: 'car' | 'moto' | 'truck' | null;
  city: string | null;
  uf: string | null;
  situation: string | null;     // ex.: "Sem restrição"
  fipe: { code: string; label: string; value: number | null; reference: string | null } | null;
  cached: boolean;              // true = veio do banco, não gastou consulta
}

// "HONDA" -> "Honda", "CB TWISTER" -> "Cb Twister"; siglas curtas (VW, BMW) ficam maiúsculas
function prettify(text?: string | null) {
  if (!text) return '';
  return text
    .trim()
    .split(/\s+/)
    .map((word) => (word.length <= 3 && /^[A-Z]+$/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join(' ');
}

// "R$ 28.799,00" -> 28799
function parseMoney(text?: string | null) {
  if (!text) return null;
  const n = Number(text.replace(/[^\d,]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function toNumber(text?: string | number | null) {
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function guessType(data: any): 'car' | 'moto' | 'truck' | null {
  const text = `${data?.extra?.tipo_veiculo ?? ''} ${data?.extra?.segmento ?? ''}`.toLowerCase();
  if (/moto|ciclomotor|motoneta/.test(text)) return 'moto';
  if (/caminh|utilit|onibus|ônibus|micro/.test(text)) return 'truck';
  if (text.trim()) return 'car';

  // Sem "extra": tenta pelo tipo da FIPE (1 = carro, 2 = moto, 3 = caminhão)
  const fipeType = data?.fipe?.dados?.[0]?.tipo_modelo;
  if (fipeType === 2) return 'moto';
  if (fipeType === 3) return 'truck';
  if (fipeType === 1) return 'car';

  // Não dá pra saber: mantém o tipo que a pessoa escolheu
  return null;
}

// Transforma a resposta da API Placas no formato que o nosso formulário usa
// Pega o primeiro valor preenchido entre vários nomes de campo possíveis
function pick(...values: any[]): string {
  for (const v of values) {
    if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
  }
  return '';
}

// Algumas respostas trazem marca e modelo juntos, ex.: "HONDA/CG 160 FAN"
function splitBrandModel(text: string) {
  const [brand, ...rest] = text.split('/');
  return { brand: brand?.trim() ?? '', model: rest.join('/').trim() };
}

// A resposta tem dados de veículo de verdade?
export function hasVehicleData(result: PlateLookupResult) {
  return Boolean(result.brand && result.model);
}

function mapResult(plate: string, data: any, cached: boolean): PlateLookupResult {
  data = data ?? {};
  const joined = splitBrandModel(
    pick(data.marcaModelo, data.MARCA_MODELO, data?.extra?.marca_modelo, data?.extra?.marcaModelo),
  );
  const brandRaw = pick(data.MARCA, data.marca, data?.extra?.marca, joined.brand);
  const model = pick(data.MODELO, data.modelo, data?.extra?.modelo, joined.model);
  const rawVersion = data.VERSAO || data.SUBMODELO || '';

  // Da FIPE, pega o resultado com maior "score" (o mais parecido com o veículo)
  const fipeList: any[] = Array.isArray(data?.fipe?.dados) ? data.fipe.dados : [];
  const bestFipe = fipeList.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];

  const version =
    rawVersion && rawVersion.toUpperCase() !== String(model).toUpperCase()
      ? prettify(rawVersion)
      : bestFipe?.texto_modelo ?? null;

  const origin = data.origem || data?.extra?.nacionalidade || null;

  return {
    plate,
    brand: prettify(brandRaw),
    model: prettify(model),
    version,
    year: toNumber(data.anoModelo || data?.extra?.ano_modelo || data.ano),
    manufactureYear: toNumber(data.ano || data?.extra?.ano_fabricacao),
    color: data.cor ? prettify(data.cor) : null,
    fuel: data?.extra?.combustivel || null,
    engineCc: toNumber(data?.extra?.cilindradas),
    origin: origin ? prettify(origin) : null,
    type: guessType(data),
    city: data.municipio || null,
    uf: data.uf || null,
    situation: data.situacao || null,
    fipe: bestFipe
      ? {
          code: bestFipe.codigo_fipe,
          label: bestFipe.texto_modelo,
          value: parseMoney(bestFipe.texto_valor),
          reference: bestFipe.mes_referencia?.trim() ?? null,
        }
      : null,
    cached,
  };
}

@Injectable()
export class PlateLookupService {
  constructor(private readonly prisma: PrismaService) {}

  async lookup(rawPlate: string): Promise<PlateLookupResult> {
    // Aceita "abc-1234", "ABC 1D23" etc. e deixa no formato ABC1234 / ABC1D23
    const plate = String(rawPlate ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)) {
      throw new BadRequestException('Placa inválida. Use o formato ABC1234 ou ABC1D23.');
    }

    // 1) Já consultamos essa placa recentemente? Então não gasta consulta.
    const cached = await this.prisma.plateLookup.findUnique({ where: { plate } });
    const maxAge = CACHE_DAYS * 24 * 60 * 60 * 1000;
    if (cached && Date.now() - cached.createdAt.getTime() < maxAge) {
      const fromCache = mapResult(plate, cached.data, true);
      // Só usa o cache se ele tiver dados de verdade (resposta vazia é ignorada)
      if (hasVehicleData(fromCache)) return fromCache;
    }

    // 2) Consulta na API Placas
    const token = process.env.PLACAS_API_TOKEN;
    if (!token) {
      throw new InternalServerErrorException('Consulta de placa não configurada (falta PLACAS_API_TOKEN no .env).');
    }

    let res: Response;
    try {
      res = await fetch(`https://wdapi2.com.br/consulta/${plate}/${token}`, {
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new BadGatewayException('Não foi possível consultar a placa agora. Tente novamente.');
    }

    // Códigos de erro da documentação da API Placas
    if (res.status === 401) throw new BadRequestException('Placa inválida.');
    if (res.status === 402) throw new ServiceUnavailableException('Token da API Placas inválido. Confira o PLACAS_API_TOKEN.');
    if (res.status === 406) throw new NotFoundException('Nenhum veículo encontrado para esta placa.');
    if (res.status === 429) throw new ServiceUnavailableException('Acabaram as consultas de placa. Recarregue o saldo na API Placas.');
    if (!res.ok) throw new BadGatewayException('A consulta de placa falhou. Tente novamente.');

    let data: any;
    try {
      data = await res.json();
    } catch {
      throw new BadGatewayException('A API Placas respondeu num formato inesperado. Tente novamente.');
    }

    const result = mapResult(plate, data, false);

    // Resposta sem marca/modelo: NÃO salva no cache e mostra o motivo
    if (!hasVehicleData(result)) {
      console.warn(`[API Placas] ${plate} veio sem dados do veículo. Resposta completa:`, JSON.stringify(data));
      const motivo = pick(data?.mensagemRetorno, data?.message, data?.mensagem, data?.erro, data?.error);
      throw new NotFoundException(
        motivo
          ? `A API Placas não retornou os dados: ${motivo}`
          : 'A API Placas não retornou os dados deste veículo. Preencha manualmente.',
      );
    }

    // 3) Guarda no banco para as próximas vezes
    await this.prisma.plateLookup.upsert({
      where: { plate },
      create: { plate, data },
      update: { data, createdAt: new Date() },
    });

    return result;
  }
}