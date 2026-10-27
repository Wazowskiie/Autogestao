/**
 * Situação do veículo (licenciamento, multas, Renajud, recall, devolução).
 * Fica guardada num campo JSON do veículo; aqui só aceitamos o formato certo.
 */
export const DOC_KEYS = ['licensing', 'fines', 'renajud', 'recall', 'returned'] as const;
export type DocKey = (typeof DOC_KEYS)[number];
export type DocItem = { status: 'ok' | 'pending' | 'unknown'; year?: number | null; amount?: number | null; note?: string | null };
export type DocStatus = Partial<Record<DocKey, DocItem>>;

const STATUSES = ['ok', 'pending', 'unknown'];

export function sanitizeDocStatus(input: unknown): DocStatus | null | undefined {
  if (input === undefined) return undefined; // não veio: não mexe
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return null;
  const out: DocStatus = {};
  for (const key of DOC_KEYS) {
    const raw = (input as Record<string, any>)[key];
    if (!raw || typeof raw !== 'object') continue;
    const status = STATUSES.includes(raw.status) ? raw.status : 'unknown';
    const item: DocItem = { status };
    const year = Number(raw.year);
    if (key === 'licensing' && Number.isInteger(year) && year >= 1950 && year <= 2100) item.year = year;
    const amount = Number(raw.amount);
    if (key === 'fines' && Number.isFinite(amount) && amount > 0) item.amount = Math.round(amount * 100) / 100;
    if (typeof raw.note === 'string' && raw.note.trim()) item.note = raw.note.trim().slice(0, 300);
    out[key] = item;
  }
  return Object.keys(out).length ? out : null;
}
