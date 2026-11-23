import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const BLUE = "#185FA5";

const pad = (n: number) => String(n).padStart(2, "0");
const toValue = (y: number, m: number) => `${y}-${pad(m)}`; // m: 1..12
const parse = (v: string) => {
  const [y, m] = v.split("-").map(Number);
  return { y: y || new Date().getFullYear(), m: m || new Date().getMonth() + 1 };
};
const thisMonth = () => { const d = new Date(); return toValue(d.getFullYear(), d.getMonth() + 1); };

/**
 * Seletor de mês do sistema (troca o <input type="month"> do navegador).
 * Valor no formato AAAA-MM. Setas passam mês a mês; clicando no nome abre a grade de meses.
 */
export function MonthPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { y, m } = parse(value);
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(y);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) setViewYear(y); }, [open, y]);

  // Fecha ao clicar fora ou apertar Esc
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const step = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1);
    onChange(toValue(d.getFullYear(), d.getMonth() + 1));
  };
  const now = parse(thisMonth());

  const arrow: React.CSSProperties = {
    width: 34, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
    color: "#6B7280", background: "transparent", border: 0, cursor: "pointer",
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div className="flex items-center rounded-lg" style={{ border: "1px solid rgba(0,0,0,0.12)", background: "#fff", height: 38 }}>
        <button type="button" aria-label="Mês anterior" title="Mês anterior" onClick={() => step(-1)} style={arrow} className="hover:bg-gray-50 rounded-l-lg">
          <ChevronLeft size={16} />
        </button>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open}
          className="flex items-center gap-2 px-2 hover:bg-gray-50"
          style={{ height: 36, border: 0, background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#111827", minWidth: 156, justifyContent: "center", borderLeft: "1px solid #F3F4F6", borderRight: "1px solid #F3F4F6" }}>
          <CalendarDays size={15} style={{ color: BLUE }} />
          {MONTHS[m - 1]} de {y}
          <ChevronDown size={14} style={{ color: "#9CA3AF" }} />
        </button>
        <button type="button" aria-label="Próximo mês" title="Próximo mês" onClick={() => step(1)} style={arrow} className="hover:bg-gray-50 rounded-r-lg">
          <ChevronRight size={16} />
        </button>
      </div>

      {open && (
        <div role="dialog" aria-label="Escolher mês" className="rounded-xl"
          style={{ position: "absolute", top: 44, right: 0, zIndex: 60, width: 272, background: "#fff", border: "1px solid #E5E7EB", boxShadow: "0 12px 32px rgba(15,23,42,0.16)", padding: 12 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <button type="button" aria-label="Ano anterior" onClick={() => setViewYear((v) => v - 1)} className="rounded-lg hover:bg-gray-100" style={{ ...arrow, width: 30, height: 30 }}><ChevronLeft size={16} /></button>
            <span style={{ fontSize: 15, fontWeight: 600, color: "#111827" }}>{viewYear}</span>
            <button type="button" aria-label="Próximo ano" onClick={() => setViewYear((v) => v + 1)} className="rounded-lg hover:bg-gray-100" style={{ ...arrow, width: 30, height: 30 }}><ChevronRight size={16} /></button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {MONTHS.map((name, i) => {
              const selected = viewYear === y && i + 1 === m;
              const current = viewYear === now.y && i + 1 === now.m;
              return (
                <button key={name} type="button" onClick={() => { onChange(toValue(viewYear, i + 1)); setOpen(false); }}
                  className={selected ? "" : "hover:bg-blue-50"}
                  style={{
                    height: 36, borderRadius: 8, fontSize: 13, cursor: "pointer",
                    fontWeight: selected ? 600 : 500,
                    background: selected ? BLUE : "transparent",
                    color: selected ? "#fff" : current ? BLUE : "#374151",
                    border: current && !selected ? `1px solid ${BLUE}` : "1px solid transparent",
                  }}>
                  {name.slice(0, 3)}
                </button>
              );
            })}
          </div>
          <div className="flex justify-end" style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #F3F4F6" }}>
            <button type="button" onClick={() => { onChange(thisMonth()); setOpen(false); }}
              style={{ fontSize: 13, fontWeight: 500, color: BLUE, background: "transparent", border: 0, cursor: "pointer" }}>
              Este mês
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
