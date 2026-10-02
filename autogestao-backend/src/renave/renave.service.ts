import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SaveRenaveConfigDto } from './dto/save-renave-config.dto';

const RENAVE_FACIL = 'Renave Fácil';

// ---------- Ajudantes ----------
function digits(value?: string | null) {
  return (value ?? '').replace(/\D/g, '');
}

function clean(value?: string | null) {
  const v = (value ?? '').trim();
  return v || null;
}

function formatCnpj(value?: string | null) {
  const d = digits(value);
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : value ?? '';
}

function formatPhone(value?: string | null) {
  const d = digits(value);
  if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  return value ?? '';
}

// Confere os dígitos verificadores do CNPJ
function isValidCnpj(value?: string | null) {
  const c = digits(value);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = (base: string, weights: number[]) => {
    const sum = base.split('').reduce((acc, n, i) => acc + Number(n) * weights[i], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const d1 = calc(c.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(c.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return c.endsWith(`${d1}${d2}`);
}

function escapeHtml(text?: string | null) {
  return (text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Transforma o que veio do formulário no formato do banco
function toData(dto: SaveRenaveConfigDto) {
  return {
    partner: dto.partner,
    isExistingClient: dto.isExistingClient,
    cnpj: digits(dto.cnpj) || null,
    legalName: clean(dto.legalName),
    tradeName: clean(dto.tradeName),
    responsibleName: clean(dto.responsibleName),
    mobile: digits(dto.mobile) || null,
    phone: digits(dto.phone) || null,
    email: clean(dto.email)?.toLowerCase() ?? null,
    city: clean(dto.city),
    uf: clean(dto.uf)?.toUpperCase() ?? null,
  };
}

@Injectable()
export class RenaveService {
  constructor(private readonly prisma: PrismaService) {}

  // Devolve a configuração da revenda + o link de cadastro de parceiro
  async getConfig(dealershipId: string) {
    const config = await this.prisma.renaveIntegration.findUnique({ where: { dealershipId } });
    const partnerId = process.env.RENAVE_PARTNER_ID;
    return {
      config,
      signupUrl: partnerId ? `https://app.renavefacil.net/#/signup?pid=${partnerId}` : null,
    };
  }

  // Salva os dados sem enviar nada (rascunho)
  async saveConfig(dealershipId: string, dto: SaveRenaveConfigDto) {
    const data = toData(dto);
    return this.prisma.renaveIntegration.upsert({
      where: { dealershipId },
      create: { dealershipId, ...data, status: 'draft', active: false },
      update: data,
    });
  }

  // Salva os dados e envia o e-mail pedindo a liberação da integração
  async requestActivation(dealershipId: string, dto: SaveRenaveConfigDto) {
    if (dto.partner !== RENAVE_FACIL) {
      throw new BadRequestException('Por enquanto, a solicitação automática está disponível só para o Renave Fácil.');
    }

    const data = toData(dto);

    // Confere os dados obrigatórios antes de enviar
    const missing: string[] = [];
    if (!data.cnpj) missing.push('CNPJ');
    if (!data.legalName) missing.push('razão social');
    if (!data.responsibleName) missing.push('responsável');
    if (!data.mobile) missing.push('celular');
    if (!data.email) missing.push('e-mail');
    if (!data.city) missing.push('cidade');
    if (!data.uf) missing.push('UF');
    if (missing.length) {
      throw new BadRequestException(`Preencha: ${missing.join(', ')}.`);
    }
    if (!isValidCnpj(data.cnpj)) throw new BadRequestException('CNPJ inválido. Confira os números.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email!)) throw new BadRequestException('E-mail inválido.');
    if (data.mobile!.length < 10) throw new BadRequestException('Celular inválido. Informe com DDD.');
    if (!/^[A-Z]{2}$/.test(data.uf!)) throw new BadRequestException('UF inválida. Use a sigla, ex: CE.');

    // Salva primeiro, para não perder o que foi digitado se o e-mail falhar
    await this.prisma.renaveIntegration.upsert({
      where: { dealershipId },
      create: { dealershipId, ...data, status: 'draft', active: false },
      update: data,
    });

    await this.sendActivationEmail(data);

    return this.prisma.renaveIntegration.update({
      where: { dealershipId },
      data: { status: 'requested', requestedAt: new Date(), active: false },
    });
  }

  // Envia o e-mail para o Renave Fácil usando a API do Resend
  private async sendActivationEmail(data: ReturnType<typeof toData>) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    const to = process.env.RENAVE_CONTACT_EMAIL;
    const copy = process.env.AUTOGESTAO_ADMIN_EMAIL; // opcional: recebe uma cópia

    if (!apiKey || !from || !to) {
      throw new ServiceUnavailableException('Envio de e-mail não configurado (RESEND_API_KEY, EMAIL_FROM ou RENAVE_CONTACT_EMAIL no .env).');
    }

    const rows: [string, string][] = [
      ['CNPJ', formatCnpj(data.cnpj)],
      ['Razão social', data.legalName ?? ''],
      ['Nome fantasia', data.tradeName ?? '—'],
      ['Responsável', data.responsibleName ?? ''],
      ['Celular', formatPhone(data.mobile)],
      ['Telefone', data.phone ? formatPhone(data.phone) : '—'],
      ['E-mail', data.email ?? ''],
      ['Cidade/UF', `${data.city ?? ''} / ${data.uf ?? ''}`],
    ];

    const html = `
      <div style="font-family: Arial, sans-serif; font-size: 15px; color: #1f2937; max-width: 600px;">
        <div style="height: 8px; background: #185FA5;"></div>
        <div style="padding: 24px;">
          <p>Olá equipe Renave Fácil,</p>
          <p>A empresa parceira identificada abaixo acaba de realizar o cadastro no Renave Fácil, solicita o contato da equipe comercial do <strong>Renave Fácil</strong> e a liberação da integração <strong>Renave Fácil</strong> e <strong>AutoGestão</strong>:</p>
          <p style="line-height: 1.8;">
            ${rows.map(([label, value]) => `<strong>${label}:</strong> ${escapeHtml(value)}`).join('<br>')}
          </p>
          <p style="margin-top: 32px;">Atenciosamente,<br><strong>Equipe AutoGestão</strong></p>
        </div>
        <div style="height: 8px; background: #185FA5;"></div>
      </div>`;

    const text = [
      'Olá equipe Renave Fácil,',
      '',
      'A empresa parceira identificada abaixo acaba de realizar o cadastro no Renave Fácil, solicita o contato da equipe comercial do Renave Fácil e a liberação da integração Renave Fácil e AutoGestão:',
      '',
      ...rows.map(([label, value]) => `${label}: ${value}`),
      '',
      'Atenciosamente,',
      'Equipe AutoGestão',
    ].join('\n');

    let res: Response;
    try {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [to],
          ...(copy ? { bcc: [copy] } : {}),
          reply_to: data.email,
          subject: `Liberação de integração AutoGestão - ${data.tradeName || data.legalName}`,
          html,
          text,
        }),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new BadGatewayException('Não foi possível enviar o e-mail agora. Tente novamente em alguns minutos.');
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[Renave] Falha ao enviar e-mail:', res.status, detail);
      throw new BadGatewayException('O envio do e-mail falhou. Tente novamente ou fale com o suporte.');
    }
  }
}