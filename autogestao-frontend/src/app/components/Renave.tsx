import { useEffect, useState } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { getRenaveConfig, saveRenaveConfig } from './renave-api';
import type { RenavePartner } from './renave-api';

const PARTNERS: RenavePartner[] = ['Renave Fácil', 'InfoSimples', 'SERPRO Direto'];

const BENEFITS = [
  'Envio automático dos dados de veículos cadastrados no estoque',
  'Sincronização automática de clientes e vendas',
  'Notas fiscais enviadas direto para o RENAVE',
  'Menos retrabalho e menos erros de digitação',
];

export function Renave() {
  const [partner, setPartner] = useState<RenavePartner>('Renave Fácil');
  const [isExistingClient, setIsExistingClient] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getRenaveConfig()
      .then((config) => {
        if (cancelled || !config) return;
        setPartner(config.partner);
        setIsExistingClient(config.isExistingClient);
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

  async function handleActivate() {
    if (isExistingClient === null) {
      setError('Selecione se já é cliente do parceiro antes de ativar.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await saveRenaveConfig({ partner, isExistingClient });
      setSuccess(true);
    } catch {
      setError('Não foi possível salvar a integração. Tente novamente.');
    } finally {
      setSaving(false);
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
    <div className="flex flex-col gap-8 p-10">
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
          {/* Coluna esquerda: formulário */}
          <div className="flex flex-1 flex-col">
            <Label htmlFor="parceiro" className="mb-2">
              Escolha um parceiro para contratar o Renave
            </Label>
            <Select value={partner} onValueChange={(value) => setPartner(value as RenavePartner)}>
              <SelectTrigger id="parceiro" className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PARTNERS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <h2 className="mt-7 text-xl font-bold tracking-tight">Integração com o RENAVE</h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              Ative a integração entre o AutoGestão e o parceiro{' '}
              <span className="font-semibold text-foreground">{partner}</span> para enviar
              automaticamente os dados de veículos, clientes e notas fiscais, reduzindo retrabalho
              e erros de digitação.
            </p>

            <a
              href="#"
              className="mt-4 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              Saiba mais sobre a integração
              <span aria-hidden>→</span>
            </a>

            <div className="my-7 h-px bg-border" />

            <div className="mb-3.5 text-sm font-semibold">Já é cliente {partner}?</div>
            <RadioGroup
              className="flex items-center gap-7"
              value={isExistingClient === null ? undefined : isExistingClient ? 'sim' : 'nao'}
              onValueChange={(value) => setIsExistingClient(value === 'sim')}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="sim" id="clienteSim" />
                <Label htmlFor="clienteSim" className="cursor-pointer font-normal">
                  Sim
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="nao" id="clienteNao" />
                <Label htmlFor="clienteNao" className="cursor-pointer font-normal">
                  Não
                </Label>
              </div>
            </RadioGroup>

            {error && <div className="mt-4 text-sm font-medium text-destructive">{error}</div>}
            {success && (
              <div className="mt-4 flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                Integração salva com sucesso.
              </div>
            )}

            <div className="mt-8 flex gap-3">
              <Button onClick={handleActivate} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Ativar integração
              </Button>
              <Button variant="outline">Cancelar</Button>
            </div>
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