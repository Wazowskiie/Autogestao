import { useEffect, useState } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { CheckCircle2, Clock, ExternalLink, Loader2, Send, ShieldCheck } from 'lucide-react';
import { getRenaveState, requestRenaveActivation, saveRenaveConfig } from './renave-api';
import type { RenaveCompanyData, RenaveConfig, RenavePartner } from './renave-api';
import * as api from '../../lib/api';

const PARTNERS: RenavePartner[] = ['Renave Fácil'];
const AVAILABLE_PARTNERS: RenavePartner[] = ['Renave Fácil'];

const BENEFITS = [
  'Envio automático dos dados de veículos cadastrados no estoque',
  'Sincronização automática de clientes e vendas',
  'Notas fiscais enviadas direto para o RENAVE',
  'Menos retrabalho e menos erros de digitação',
];

const EMPTY_COMPANY: RenaveCompanyData = {
  cnpj: '', legalName: '', tradeName: '', responsibleName: '',
  mobile: '', phone: '', email: '', city: '', uf: '',
};

// ---------- Máscaras ----------
function onlyDigits(v: string) {
  return v.replace(/\D/g, '');
}
function maskCnpj(v: string) {
  const d = onlyDigits(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}
function maskPhone(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function companyFromConfig(config: RenaveConfig | null): RenaveCompanyData {
  if (!config) return EMPTY_COMPANY;
  return {
    cnpj: maskCnpj(config.cnpj ?? ''),
    legalName: config.legalName ?? '',
    tradeName: config.tradeName ?? '',
    responsibleName: config.responsibleName ?? '',
    mobile: maskPhone(config.mobile ?? ''),
    phone: maskPhone(config.phone ?? ''),
    email: config.email ?? '',
    city: config.city ?? '',
    uf: config.uf ?? '',
  };
}

export function Renave() {
  const [partner, setPartner] = useState<RenavePartner>('Renave Fácil');
  const [isExistingClient, setIsExistingClient] = useState<boolean | null>(null);
  const [createdAccount, setCreatedAccount] = useState(false);
  const [company, setCompany] = useState<RenaveCompanyData>(EMPTY_COMPANY);
  const [config, setConfig] = useState<RenaveConfig | null>(null);
  const [signupUrl, setSignupUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<'save' | 'request' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([getRenaveState(), api.getMe().catch(() => null)])
      .then(([state, me]) => {
        if (cancelled) return;
        setSignupUrl(state.signupUrl);
        setConfig(state.config);
        if (state.config) {
          setPartner(state.config.partner);
          setIsExistingClient(state.config.isExistingClient);
          setCompany(companyFromConfig(state.config));
          // Se já salvou dados antes, considera que a conta já foi criada
          if (state.config.cnpj) setCreatedAccount(true);
        } else if (me) {
          // Primeira vez: já sugere o nome da revenda e o e-mail de quem está logado
          setCompany((c) => ({ ...c, tradeName: me.dealership.name, responsibleName: me.user.name, email: me.user.email }));
        }
      })
      .catch(() => {
        if (!cancelled) setError('Não foi possível carregar a configuração atual.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const isAvailable = AVAILABLE_PARTNERS.includes(partner);
  const status = config?.partner === partner ? config.status : undefined;
  const canFillCompany = isExistingClient === true || (isExistingClient === false && createdAccount);

  const setField = (field: keyof RenaveCompanyData, value: string) =>
    setCompany((c) => ({ ...c, [field]: value }));

  function buildPayload() {
    return {
      partner,
      isExistingClient: isExistingClient ?? false,
      ...company,
      cnpj: onlyDigits(company.cnpj),
      mobile: onlyDigits(company.mobile),
      phone: onlyDigits(company.phone),
      uf: company.uf.toUpperCase(),
    };
  }

  // Checagem rápida antes de enviar (o backend confere de novo)
  function validateForRequest() {
    const missing: string[] = [];
    if (onlyDigits(company.cnpj).length !== 14) missing.push('CNPJ');
    if (!company.legalName.trim()) missing.push('razão social');
    if (!company.responsibleName.trim()) missing.push('responsável');
    if (onlyDigits(company.mobile).length < 10) missing.push('celular com DDD');
    if (!company.email.trim()) missing.push('e-mail');
    if (!company.city.trim()) missing.push('cidade');
    if (company.uf.trim().length !== 2) missing.push('UF');
    return missing;
  }

  async function handleSave() {
    if (isExistingClient === null) {
      setError('Diga se a revenda já é cliente do parceiro.');
      return;
    }
    setSaving('save');
    setError(null);
    setSuccess(null);
    try {
      const saved = await saveRenaveConfig(buildPayload());
      setConfig(saved);
      setSuccess('Dados salvos.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar. Tente novamente.');
    } finally {
      setSaving(null);
    }
  }

  async function handleRequest() {
    setError(null);
    setSuccess(null);
    const missing = validateForRequest();
    if (missing.length) {
      setError(`Preencha: ${missing.join(', ')}.`);
      return;
    }
    setSaving('request');
    try {
      const saved = await requestRenaveActivation(buildPayload());
      setConfig(saved);
      setSuccess('Solicitação enviada! O Renave Fácil vai entrar em contato para liberar a integração.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível enviar a solicitação. Tente novamente.');
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando integração…
      </div>
    );
  }

  return (
        <div className="flex h-full flex-col gap-8 overflow-y-auto p-10">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Integrações &nbsp;›&nbsp; Renave
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Integração RENAVE</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Conecte o AutoGestão a um parceiro homologado do RENAVE e envie dados de veículos,
          clientes e notas fiscais automaticamente.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-10 p-8 lg:flex-row">
          {/* Coluna esquerda: fluxo */}
          <div className="flex flex-1 flex-col">
            {/* Status atual */}
            {status === 'requested' && (
              <div className="mb-6 flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong>Aguardando liberação.</strong> Solicitação enviada
                  {config?.requestedAt ? ` em ${new Date(config.requestedAt).toLocaleDateString('pt-BR')}` : ''}.
                  O Renave Fácil vai entrar em contato com a revenda.
                </span>
              </div>
            )}
            {status === 'active' && (
              <div className="mb-6 flex items-start gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span><strong>Integração ativa.</strong> Os dados já podem ser enviados ao RENAVE.</span>
              </div>
            )}

            <Label htmlFor="parceiro" className="mb-2">
              Escolha um parceiro para contratar o Renave
            </Label>
            <Select value={partner} onValueChange={(value) => { setPartner(value as RenavePartner); setError(null); setSuccess(null); }}>
              <SelectTrigger id="parceiro" className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PARTNERS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}{!AVAILABLE_PARTNERS.includes(p) ? ' (em breve)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {!isAvailable ? (
              <div className="mt-6 rounded-lg bg-muted/50 px-4 py-4 text-sm text-muted-foreground">
                A integração com <strong className="text-foreground">{partner}</strong> estará disponível em breve.
                Por enquanto, use o <strong className="text-foreground">Renave Fácil</strong>.
              </div>
            ) : (
              <>
                <div className="my-7 h-px bg-border" />

                {/* Passo 1: conta no parceiro */}
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Passo 1</div>
                <div className="mb-3.5 text-sm font-semibold">A revenda já tem conta no {partner}?</div>
                <RadioGroup
                  className="flex items-center gap-7"
                  value={isExistingClient === null ? undefined : isExistingClient ? 'sim' : 'nao'}
                  onValueChange={(value) => setIsExistingClient(value === 'sim')}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="sim" id="clienteSim" />
                    <Label htmlFor="clienteSim" className="cursor-pointer font-normal">Sim</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="nao" id="clienteNao" />
                    <Label htmlFor="clienteNao" className="cursor-pointer font-normal">Não</Label>
                  </div>
                </RadioGroup>

                {isExistingClient === false && (
                  <div className="mt-5 rounded-lg border bg-muted/30 px-4 py-4">
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Crie a conta da revenda no Renave Fácil pelo botão abaixo. Depois,{' '}
                      <strong className="text-foreground">confirme o cadastro pelo e-mail</strong> que o Renave Fácil enviar e volte aqui.
                    </p>
                    {signupUrl ? (
                      <Button asChild variant="outline" className="mt-3">
                        <a href={signupUrl} target="_blank" rel="noopener noreferrer">
                          Criar conta no Renave Fácil
                          <ExternalLink className="ml-2 h-4 w-4" />
                        </a>
                      </Button>
                    ) : (
                      <p className="mt-3 text-sm text-destructive">Link de cadastro não configurado (RENAVE_PARTNER_ID).</p>
                    )}
                    <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
                      <input type="checkbox" checked={createdAccount} onChange={(e) => setCreatedAccount(e.target.checked)} />
                      Já criei e confirmei a conta
                    </label>
                  </div>
                )}

                {/* Passo 2: dados da empresa */}
                {canFillCompany && (
                  <>
                    <div className="my-7 h-px bg-border" />
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Passo 2</div>
                    <div className="mb-1 text-sm font-semibold">Dados da revenda</div>
                    <p className="mb-4 text-xs text-muted-foreground">
                      Use os mesmos dados do cadastro no Renave Fácil. Eles serão enviados para liberar a integração.
                    </p>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="cnpj" className="mb-1.5">CNPJ *</Label>
                        <Input id="cnpj" placeholder="00.000.000/0000-00" inputMode="numeric"
                          value={company.cnpj} onChange={(e) => setField('cnpj', maskCnpj(e.target.value))} />
                      </div>
                      <div>
                        <Label htmlFor="razao" className="mb-1.5">Razão social *</Label>
                        <Input id="razao" placeholder="Como no CNPJ" value={company.legalName}
                          onChange={(e) => setField('legalName', e.target.value)} />
                      </div>
                      <div>
                        <Label htmlFor="fantasia" className="mb-1.5">Nome fantasia</Label>
                        <Input id="fantasia" value={company.tradeName}
                          onChange={(e) => setField('tradeName', e.target.value)} />
                      </div>
                      <div>
                        <Label htmlFor="responsavel" className="mb-1.5">Responsável *</Label>
                        <Input id="responsavel" value={company.responsibleName}
                          onChange={(e) => setField('responsibleName', e.target.value)} />
                      </div>
                      <div>
                        <Label htmlFor="celular" className="mb-1.5">Celular *</Label>
                        <Input id="celular" placeholder="(85) 99999-9999" inputMode="numeric"
                          value={company.mobile} onChange={(e) => setField('mobile', maskPhone(e.target.value))} />
                      </div>
                      <div>
                        <Label htmlFor="telefone" className="mb-1.5">Telefone</Label>
                        <Input id="telefone" placeholder="(85) 3333-3333" inputMode="numeric"
                          value={company.phone} onChange={(e) => setField('phone', maskPhone(e.target.value))} />
                      </div>
                      <div className="sm:col-span-2">
                        <Label htmlFor="email" className="mb-1.5">E-mail *</Label>
                        <Input id="email" type="email" placeholder="contato@revenda.com.br" value={company.email}
                          onChange={(e) => setField('email', e.target.value)} />
                      </div>
                      <div>
                        <Label htmlFor="cidade" className="mb-1.5">Cidade *</Label>
                        <Input id="cidade" value={company.city}
                          onChange={(e) => setField('city', e.target.value)} />
                      </div>
                      <div>
                        <Label htmlFor="uf" className="mb-1.5">UF *</Label>
                        <Input id="uf" placeholder="CE" maxLength={2} value={company.uf}
                          onChange={(e) => setField('uf', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} />
                      </div>
                    </div>
                  </>
                )}

                {error && <div className="mt-5 text-sm font-medium text-destructive">{error}</div>}
                {success && (
                  <div className="mt-5 flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                    {success}
                  </div>
                )}

                <div className="mt-8 flex flex-wrap gap-3">
                  {canFillCompany && status !== 'active' && (
                    <Button onClick={handleRequest} disabled={saving !== null}>
                      {saving === 'request' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                      {status === 'requested' ? 'Reenviar solicitação' : 'Solicitar liberação'}
                    </Button>
                  )}
                  <Button variant="outline" onClick={handleSave} disabled={saving !== null || isExistingClient === null}>
                    {saving === 'save' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar dados
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* Coluna direita: benefícios */}
          <Card className="w-full bg-muted/40 lg:w-80">
            <CardContent className="flex h-full flex-col p-6">
              <div className="text-lg font-bold tracking-tight">Por que integrar?</div>
              <div className="mt-5 flex flex-col gap-4">
                {BENEFITS.map((benefit) => (
                  <div key={benefit} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{benefit}</span>
                  </div>
                ))}
              </div>

              <div className="mt-6 border-t pt-5">
                <div className="text-sm font-semibold">Como funciona</div>
                <ol className="mt-3 flex list-decimal flex-col gap-2 pl-4 text-xs leading-relaxed text-muted-foreground">
                  <li>A revenda cria a conta no Renave Fácil e confirma pelo e-mail.</li>
                  <li>Preenche os dados aqui e clica em Solicitar liberação.</li>
                  <li>O Renave Fácil entra em contato e libera a integração.</li>
                </ol>
              </div>

              <div className="mt-6 flex items-center gap-2 rounded-lg bg-background px-3.5 py-3 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                Conexão segura, dados protegidos ponta a ponta.
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}