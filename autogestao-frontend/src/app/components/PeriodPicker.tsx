import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const SHORT = MONTHS.map((m) => m.slice(0, 3));
const BLUE = "#185FA5";

/** Período em meses, AAAA-MM a AAAA-MM (inclusive). null = todo o período (sem filtro). */
export type Period = { from: string; to: string };
type Mode = "month" | "year" | "range";

const pad = (n: number) => String(n).padStart(2, "0");
const ym = (y: number, m: number) => `${y}-${pad(m)}`; // m: 1..12
const parse = (v: string) => { const [y, m] = v.split("-").map(Number); return { y, m }; };
const idx = (v: string) => { const { y, m } = parse(v); return y * 12 + (m - 1); };
const fromIdx = (i: number) => ym(Math.floor(i / 12), (i % 12) + 1);

export function thisMonth() { const d = new Date(); return ym(d.getFullYear(), d.getMonth() + 1); }
export function monthPeriod(month = thisMonth()): Period { return { from: month, to: month }; }

function modeOf(p: Period): Mode {
  if (p.from === p.to) return "month";
  const a = parse(p.from), b = parse(p.to);
  return a.y === b.y && a.m === 1 && b.m === 12 ? "year" : "range";
}

/** Texto do período: "Novembro de 2026", "Ano de 2025" ou "Mar/2025 a Ago/2025" */
export function periodLabel(p: Period | null) {
  if (!p) return "Todo o período";
  const a = parse(p.from), b = parse(p.to);
  const mode = modeOf(p);
  if (mode === "month") return `${MONTHS[a.m - 1]} de ${a.y}`;
  if (mode === "year") return `Ano de ${a.y}`;
  return `${SHORT[a.m - 1]}/${a.y} a ${SHORT[b.m - 1]}/${b.y}`;
}

/** Parâmetros para a API: ?from=AAAA-MM&to=AAAA-MM */
export function periodQuery(p: Period | null) {
  return p ? `from=${p.from}&to=${p.to}` : "";
}

/**
 * Seletor de período do sistema: Mês, Ano ou Período (de um mês até outro).
 * As setas andam pelo mesmo tamanho do período escolhido (mês a mês, ano a ano...).
 * Com `allowAll`, aparece também "Todo o período" (value = null).
 */
export function PeriodPicker({ value, onChange, allowAll }: { value: Period | null; onChange: (p: Period | null) => void; allowAll?: boolean }) {
  const [open, setOpen] = useState(false);
  const current = value ?? monthPeriod();
  const [mode, setMode] = useState<Mode>(modeOf(current));
  const [viewYear, setViewYear] = useState(parse(current.to).y);
  const [rangeStart, setRangeStart] = useState<string | null>(null); // 1º clique do período
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setMode(value ? modeOf(value) : "month");
    setViewYear(parse((value ?? monthPeriod()).to).y);
    setRangeStart(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const pick = (p: Period | null) => { onChange(p); setOpen(false); };

  // Setas: andam o tamanho do período (1 mês, 12 meses, ou o intervalo escolhido)
  const step = (dir: -1 | 1) => {
    if (!value) return;
    const len = idx(value.to) - idx(value.from) + 1;
    onChange({ from: fromIdx(idx(value.from) + dir * len), to: fromIdx(idx(value.to) + dir * len) });
  };

  const arrow: React.CSSProperties = {
    width: 34, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
    color: "#6B7280", background: "transparent", border: 0, cursor: "pointer",
  };
  const now = parse(thisMonth());
  const sel = value ? { a: idx(value.from), b: idx(value.to) } : null;

  const clickMonth = (m: number) => {
    const v = ym(viewYear, m);
    if (mode === "month") return pick({ from: v, to: v });
    // Período: 1º clique marca o início, 2º clique o fim
    if (!rangeStart) { setRangeStart(v); return; }
    const [f, t] = idx(rangeStart) <= idx(v) ? [rangeStart, v] : [v, rangeStart];
    pick({ from: f, to: t });
  };

  const tab = (m: Mode, label: string) => (
    <button key={m} type="button" onClick={() => { setMode(m); setRangeStart(null); }}
      style={{
        flex: 1, height: 30, borderRadius: 7, fontSize: 12.5, cursor: "pointer", border: 0,
        fontWeight: mode === m ? 600 : 500, background: mode === m ? "#fff" : "transparent",
        color: mode === m ? BLUE : "#6B7280", boxShadow: mode === m ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
      }}>{label}</button>
  );

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div className="flex items-center rounded-lg" style={{ border: "1px solid rgba(0,0,0,0.12)", background: "#fff", height: 38 }}>
        <button type="button" aria-label="Período anterior" title="Período anterior" onClick={() => step(-1)} disabled={!value}
          style={{ ...arrow, opacity: value ? 1 : 0.35 }} className="hover:bg-gray-50 rounded-l-lg">
          <ChevronLeft size={16} />
        </button>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open}
          className="flex items-center gap-2 px-2 hover:bg-gray-50"
          style={{ height: 36, border: 0, background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#111827", minWidth: 172, justifyContent: "center", borderLeft: "1px solid #F3F4F6", borderRight: "1px solid #F3F4F6", whiteSpace: "nowrap" }}>
          <CalendarDays size={15} style={{ color: BLUE }} />
          {periodLabel(value)}
          <ChevronDown size={14} style={{ color: "#9CA3AF" }} />
        </button>
        <button type="button" aria-label="Próximo período" title="Próximo período" onClick={() => step(1)} disabled={!value}
          style={{ ...arrow, opacity: value ? 1 : 0.35 }} className="hover:bg-gray-50 rounded-r-lg">
          <ChevronRight size={16} />
        </button>
      </div>

      {open && (
        <div role="dialog" aria-label="Escolher período" className="rounded-xl"
          style={{ position: "absolute", top: 44, right: 0, zIndex: 60, width: 292, background: "#fff", border: "1px solid #E5E7EB", boxShadow: "0 12px 32px rgba(15,23,42,0.16)", padding: 12 }}>
          <div className="flex gap-1 p-1 rounded-lg" style={{ background: "#F3F4F6", marginBottom: 12 }}>
            {tab("month", "Mês")}{tab("year", "Ano")}{tab("range", "Período")}
          </div>

          {mode === "year" ? (
            <div className="grid grid-cols-3 gap-1.5">
              {Array.from({ length: 9 }, (_, i) => now.y - 7 + i).map((y) => {
                const selected = !!value && modeOf(value) === "year" && parse(value.from).y === y;
                return (
                  <button key={y} type="button" onClick={() => pick({ from: ym(y, 1), to: ym(y, 12) })}
                    className={selected ? "" : "hover:bg-blue-50"}
                    style={{ height: 38, borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: selected ? 600 : 500,
                      background: selected ? BLUE : "transparent", color: selected ? "#fff" : y === now.y ? BLUE : "#374151",
                      border: y === now.y && !selected ? `1px solid ${BLUE}` : "1px solid transparent" }}>
                    {y}
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <button type="button" aria-label="Ano anterior" onClick={() => setViewYear((v) => v - 1)} className="rounded-lg hover:bg-gray-100" style={{ ...arrow, width: 30, height: 30 }}><ChevronLeft size={16} /></button>
                <span style={{ fontSize: 15, fontWeight: 600, color: "#111827" }}>{viewYear}</span>
                <button type="button" aria-label="Próximo ano" onClick={() => setViewYear((v) => v + 1)} className="rounded-lg hover:bg-gray-100" style={{ ...arrow, width: 30, height: 30 }}><ChevronRight size={16} /></button>
              </div>
              {mode === "range" && (
                <p style={{ fontSize: 12, color: "#6B7280", marginBottom: 8, textAlign: "center" }}>
                  {rangeStart ? <>De <b>{periodLabel({ from: rangeStart, to: rangeStart })}</b> até… clique no mês final</> : "Clique no mês inicial e depois no mês final"}
                </p>
              )}
              <div className="grid grid-cols-3 gap-1.5">
                {SHORT.map((name, i) => {
                  const v = idx(ym(viewYear, i + 1));
                  const start = rangeStart ? idx(rangeStart) : null;
                  const inSel = !rangeStart && !!sel && v >= sel.a && v <= sel.b;
                  const edge = rangeStart ? v === start : !!sel && (v === sel.a || v === sel.b);
                  const isNow = viewYear === now.y && i + 1 === now.m;
                  return (
                    <button key={name} type="button" onClick={() => clickMonth(i + 1)}
                      className={edge ? "" : "hover:bg-blue-50"}
                      style={{
                        height: 36, borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: edge ? 600 : 500,
                        background: edge ? BLUE : inSel ? "#EBF2FA" : "transparent",
                        color: edge ? "#fff" : isNow || inSel ? BLUE : "#374151",
                        border: isNow && !edge ? `1px solid ${BLUE}` : "1px solid transparent",
                      }}>
                      {name}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div className="flex items-center justify-between" style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #F3F4F6" }}>
            {allowAll ? (
              <button type="button" onClick={() => pick(null)} style={{ fontSize: 13, fontWeight: 500, color: "#6B7280", background: "transparent", border: 0, cursor: "pointer" }}>
                Todo o período
              </button>
            ) : <span />}
            <button type="button" onClick={() => pick(monthPeriod())}
              style={{ fontSize: 13, fontWeight: 500, color: BLUE, background: "transparent", border: 0, cursor: "pointer" }}>
              Este mês
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
