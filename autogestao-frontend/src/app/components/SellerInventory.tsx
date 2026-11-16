// Estoque do vendedor: só consulta (fotos, dados e preço de venda), com atalhos para reservar e vender.
// Sem custo, margem, edição ou exclusão — o servidor também não envia o custo para o vendedor.
import { useCallback, useEffect, useState } from "react";
import { Bike, Bookmark, Car, Package, Search, ShoppingBag, Truck, X } from "lucide-react";
import * as api from "../../lib/api";
import { StatusBadge } from "./StatusBadge";
import { ReservationModal } from "./ReservationModal";
import { NewSaleModal } from "./Sales";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const TYPE_ICON: Record<string, typeof Car> = { car: Car, moto: Bike, truck: Truck, other: Package };

function photosOf(v: api.Vehicle) {
  return [...(v.photos ?? [])].sort((a, b) => a.order - b.order);
}
function yearOf(v: api.Vehicle) {
  return v.manufactureYear && v.manufactureYear !== v.year ? `${v.manufactureYear}/${v.year}` : String(v.year);
}

export function SellerInventory() {
  const [vehicles, setVehicles] = useState<api.Vehicle[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<api.VehicleStatus | "all">("available");
  const [type, setType] = useState<api.VehicleType | "all">("all");
  const [open, setOpen] = useState<api.Vehicle | null>(null);
  const [reserving, setReserving] = useState<api.Vehicle | null>(null);
  const [selling, setSelling] = useState<api.Vehicle | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listVehicles({ search: debounced || undefined, status, type, pageSize: 100 });
      setVehicles(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar o estoque");
    } finally {
      setLoading(false);
    }
  }, [debounced, status, type]);

  useEffect(() => { load(); }, [load]);

  const select = { background: "#F4F6F9", border: "0.5px solid rgba(0,0,0,0.08)", fontSize: 13 } as const;

  return (
    <div className="flex flex-col h-full overflow-auto" style={{ background: "var(--background)" }}>
      <div className="flex items-center gap-3 px-6 py-4 flex-shrink-0" style={{ background: "#fff", borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}>
        <h2>Estoque</h2>
        <span className="px-2 py-0.5 rounded-full" style={{ background: "#EBF2FA", color: "#185FA5", fontSize: 12, fontWeight: 500 }}>
          {total} veículo{total === 1 ? "" : "s"}
        </span>
        <span style={{ fontSize: 12, color: "#9CA3AF" }}>Somente consulta</span>
      </div>

      <div className="flex items-center gap-3 px-6 py-3 flex-wrap" style={{ borderBottom: "0.5px solid rgba(0,0,0,0.08)", background: "#fff" }}>
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 flex-1 min-w-48" style={select}>
          <Search size={15} style={{ color: "#9CA3AF" }} />
          <input placeholder="Buscar por marca, modelo ou placa..." value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ border: "none", outline: "none", fontSize: 13, background: "transparent", width: "100%" }} />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as api.VehicleStatus | "all")} className="rounded-lg px-3 py-2" style={select}>
          <option value="available">Disponíveis</option>
          <option value="reserved">Reservados</option>
          <option value="sold">Vendidos</option>
          <option value="all">Todos</option>
        </select>
        <select value={type} onChange={(e) => setType(e.target.value as api.VehicleType | "all")} className="rounded-lg px-3 py-2" style={select}>
          <option value="all">Todos os tipos</option>
          <option value="car">Carros</option>
          <option value="moto">Motos</option>
          <option value="truck">Utilitários</option>
          <option value="other">Outros</option>
        </select>
      </div>

      <div className="flex-1 px-6 py-4">
        {error && (
          <div className="flex items-center justify-between rounded-lg px-4 py-3 mb-4" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>
            <span>{error}</span>
            <button onClick={load} style={{ fontWeight: 500 }}>Tentar novamente</button>
          </div>
        )}
        {!loading && !error && vehicles.length === 0 && (
          <p style={{ padding: "32px 0", textAlign: "center", fontSize: 13, color: "#9CA3AF" }}>Nenhum veículo encontrado.</p>
        )}
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {vehicles.map((v) => {
            const Icon = TYPE_ICON[v.type] ?? Car;
            const cover = photosOf(v)[0];
            return (
              <div key={v.id} onClick={() => setOpen(v)} className="cursor-pointer overflow-hidden flex flex-col"
                style={{ background: "#fff", borderRadius: 12, border: "0.5px solid rgba(0,0,0,0.08)" }}>
                <div className="flex items-center justify-center relative" style={{ height: 150, background: "#F4F6F9" }}>
                  {cover ? <img src={cover.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon size={36} style={{ color: "#CBD5E1" }} />}
                  <span style={{ position: "absolute", top: 8, left: 8 }}><StatusBadge status={v.status} /></span>
                </div>
                <div className="p-3 flex flex-col gap-1 flex-1">
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#0F1923" }}>{v.brand} {v.model} {v.version ?? ""}</div>
                  <div style={{ fontSize: 12, color: "#6B7280" }}>
                    {[yearOf(v), v.type === "other" ? null : `${v.km.toLocaleString("pt-BR")} km`, v.color, v.plate].filter(Boolean).join(" · ")}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#185FA5", marginTop: 4 }}>{brl(Number(v.price))}</div>
                  {v.status !== "sold" && (
                    <div className="flex items-center gap-2" style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setReserving(v)} className="flex items-center justify-center gap-1.5 rounded-lg py-2 flex-1"
                        style={{ fontSize: 12, fontWeight: 600, color: "#7C3AED", background: "#F3E8FF" }}>
                        <Bookmark size={13} /> {v.status === "reserved" ? "Ver reserva" : "Reservar"}
                      </button>
                      <button onClick={() => setSelling(v)} className="flex items-center justify-center gap-1.5 rounded-lg py-2 flex-1"
                        style={{ fontSize: 12, fontWeight: 600, color: "#fff", background: "#185FA5" }}>
                        <ShoppingBag size={13} /> Vender
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {open && (
        <VehicleSheet vehicle={open} onClose={() => setOpen(null)}
          onReserve={() => { setReserving(open); setOpen(null); }}
          onSell={() => { setSelling(open); setOpen(null); }} />
      )}
      {reserving && (
        <ReservationModal vehicle={reserving} canManage={false} onClose={() => setReserving(null)}
          onChanged={() => { setReserving(null); load(); }} />
      )}
      {selling && (
        <NewSaleModal prefill={{ vehicleId: selling.id }} onClose={() => setSelling(null)}
          onSaved={() => { setSelling(null); load(); }} />
      )}
    </div>
  );
}

// Ficha do veículo (somente leitura)
function VehicleSheet({ vehicle: v, onClose, onReserve, onSell }: { vehicle: api.Vehicle; onClose: () => void; onReserve: () => void; onSell: () => void }) {
  const photos = photosOf(v);
  const [photo, setPhoto] = useState(0);
  const yes = (b: boolean | null) => (b == null ? null : b ? "Sim" : "Não");
  const rows: [string, string | number | null][] = [
    ["Ano", yearOf(v)], ["Km", v.type === "other" ? null : `${v.km.toLocaleString("pt-BR")} km`],
    ["Cor", v.color], ["Placa", v.plate], ["Combustível", v.fuel], ["Câmbio", v.transmission],
    ["Cilindrada", v.engineCc ? `${v.engineCc} cc` : null], ["Portas", v.doors], ["Donos", v.ownerCount],
    ["IPVA pago", yes(v.ipvaPaid)], ["Aceita troca", yes(v.acceptsTrade)], ["Chave reserva", yes(v.hasSpareKey)], ["Manual", yes(v.hasManual)],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(15,25,35,0.5)" }} onClick={onClose}>
      <div className="w-full max-h-[90vh] overflow-y-auto" style={{ background: "#fff", borderRadius: 16, maxWidth: 640, margin: 16 }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-6 py-4" style={{ borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>{v.brand} {v.model} {v.version ?? ""}</h3>
            <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
              <StatusBadge status={v.status} />
              <span style={{ fontSize: 18, fontWeight: 700, color: "#185FA5" }}>{brl(Number(v.price))}</span>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ color: "#6B7280" }}><X size={18} /></button>
        </div>

        <div className="px-6 py-4 flex flex-col gap-4">
          {photos.length > 0 && (
            <div>
              <img src={photos[Math.min(photo, photos.length - 1)].url} alt="" style={{ width: "100%", maxHeight: 320, objectFit: "cover", borderRadius: 12, background: "#F4F6F9" }} />
              {photos.length > 1 && (
                <div className="flex gap-2 overflow-x-auto" style={{ marginTop: 8 }}>
                  {photos.map((p, i) => (
                    <button key={p.id} onClick={() => setPhoto(i)} className="flex-shrink-0 overflow-hidden"
                      style={{ width: 64, height: 48, borderRadius: 8, border: i === photo ? "2px solid #185FA5" : "0.5px solid rgba(0,0,0,0.12)" }}>
                      <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {rows.filter(([, value]) => value !== null && value !== undefined && value !== "").map(([label, value]) => (
              <div key={label} className="rounded-lg px-3 py-2" style={{ background: "#F4F6F9" }}>
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#0F1923" }}>{value}</div>
              </div>
            ))}
          </div>

          {v.optionals?.length > 0 && (
            <div>
              <p style={{ fontSize: 12, color: "#6B7280", marginBottom: 6 }}>Opcionais</p>
              <div className="flex flex-wrap gap-1.5">
                {v.optionals.map((o) => <span key={o} className="px-2 py-1 rounded" style={{ fontSize: 12, background: "#EBF2FA", color: "#185FA5" }}>{o}</span>)}
              </div>
            </div>
          )}
          {v.description && (
            <div>
              <p style={{ fontSize: 12, color: "#6B7280", marginBottom: 6 }}>Descrição</p>
              <p style={{ fontSize: 13, color: "#374151", whiteSpace: "pre-wrap" }}>{v.description}</p>
            </div>
          )}
        </div>

        {v.status !== "sold" && (
          <div className="flex items-center justify-end gap-2 px-6 py-4" style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)" }}>
            <button onClick={onReserve} className="flex items-center gap-2 px-4 py-2 rounded-lg" style={{ fontSize: 13, fontWeight: 600, color: "#7C3AED", background: "#F3E8FF" }}>
              <Bookmark size={15} /> {v.status === "reserved" ? "Ver reserva" : "Reservar"}
            </button>
            <button onClick={onSell} className="flex items-center gap-2 px-4 py-2 rounded-lg" style={{ fontSize: 13, fontWeight: 600, color: "#fff", background: "#185FA5" }}>
              <ShoppingBag size={15} /> Registrar venda
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
