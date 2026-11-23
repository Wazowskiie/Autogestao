import { BadRequestException } from '@nestjs/common';

const RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Período por mês (AAAA-MM). Aceita um mês só (`month`) ou um intervalo (`from` até `to`, inclusive).
 * As datas do sistema guardam o dia em UTC meia-noite, então o intervalo vai do dia 1º do mês
 * inicial até o dia 1º do mês seguinte ao final.
 */
export function periodRange(p: { month?: string; from?: string; to?: string }): { gte: Date; lt: Date } | undefined {
  let from = p.from, to = p.to;
  if (p.month && !from && !to) from = to = p.month;
  if (!from && !to) return undefined;
  from = from ?? to; to = to ?? from;
  if (!RE.test(from!) || !RE.test(to!)) throw new BadRequestException('Período inválido. Use AAAA-MM.');
  if (from! > to!) [from, to] = [to, from];
  const [fy, fm] = from!.split('-').map(Number);
  const [ty, tm] = to!.split('-').map(Number);
  return { gte: new Date(Date.UTC(fy, fm - 1, 1)), lt: new Date(Date.UTC(ty, tm, 1)) };
}

/** Normaliza o período para devolver na resposta ({ from, to } em AAAA-MM) */
export function periodBounds(p: { month?: string; from?: string; to?: string }) {
  const r = periodRange(p);
  if (!r) return null;
  const f = r.gte.toISOString().slice(0, 7);
  const last = new Date(r.lt.getTime() - 86_400_000).toISOString().slice(0, 7);
  return { from: f, to: last };
}
