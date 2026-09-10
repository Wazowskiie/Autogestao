import { useCallback, useEffect, useState } from "react";
import { Search, Car, Bike, Truck, Phone, MapPin, X, Gauge, Calendar } from "lucide-react";
import * as api from "../../lib/api";

function currency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const TYPE_LABELS: Record<string, string> = { car: "Carros", moto: "Motos", truck: "Utilitários" };

export function PublicStorefront({ slug, onNavigate }: { slug: string; onNavigate?: (page: string) => void }) {
  const [dealership, setDealership] = useState<api.StorefrontDealership | null>(null);
  const [vehicles, setVehicles] = useState<api.StorefrontVehicle[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<api.VehicleType | "all">("all");
  const [selected, setSelected] = useState<api.StorefrontVehicle | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    api.getStorefrontDealership(slug)
      .then(setDealership)
      .catch((e) => setError(e instanceof Error ? e.message : "Loja não encontrada"));
  }, [slug]);

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listStorefrontVehicles(slug, { search: debouncedSearch || undefined, type: typeFilter, pageSize: 48 });
      setVehicles(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar veículos");
    } finally {
      setLoading(false);
    }
  }, [slug, debouncedSearch, typeFilter]);

  useEffect(() => { fetchVehicles(); }, [fetchVehicles]);

  if (error && !dealership) {
    return (
      <div className="size-full flex items-center justify-center" style={{ background: "#F4F6F9" }}>
        <div className="text-center">
          <h2 style={{ marginBottom: 8 }}>Loja não encontrada</h2>
          <p style={{ fontSize: 13, color: "#6B7280" }}>Verifique o endereço e tente novamente.</p>
        </div>
      </div>
    );
  }

  const primaryColor = dealership?.primaryColor || "#185FA5";

  return (
    <div className="size-full overflow-y-auto" style={{ background: "#F4F6F9" }}>
      {/* Cover / Header */}
      <div
        className="relative flex flex-col items-center justify-end"
        style={{
          height: 220,
          background: dealership?.coverUrl ? `url(${dealership.coverUrl}) center/cover` : `linear-gradient(135deg, ${primaryColor}, #0F1923)`,
        }}
      >
        <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.35)" }} />
        <div className="relative flex flex-col items-center pb-6 px-4 text-center">
          {dealership?.logoUrl ? (
            <img src={dealership.logoUrl} alt={dealership.name} style={{ width: 64, height: 64, borderRadius: 12, marginBottom: 10, objectFit: "cover" }} />
          ) : (
            <div className="flex items-center justify-center rounded-xl" style={{ width: 64, height: 64, background: "#fff", marginBottom: 10 }}>
              <Car size={28} style={{ color: primaryColor }} />
            </div>
          )}
          <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 700 }}>{dealership?.name ?? "Carregando..."}</h1>
          {(dealership?.city || dealership?.state) && (
            <div className="flex items-center gap-1.5 mt-1" style={{ color: "rgba(255,255,255,0.85)" }}>
              <MapPin size={13} />
              <span style={{ fontSize: 13 }}>{[dealership?.city, dealership?.state].filter(Boolean).join(" - ")}</span>
            </div>
          )}
        </div>
      </div>

      {/* Filters bar */}
      <div className="sticky top-0 z-10 px-6 py-4" style={{ background: "#fff", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
        <div className="flex items-center gap-3 flex-wrap" style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg flex-1 min-w-48" style={{ background: "#F4F6F9" }}>
            <Search size={16} style={{ color: "#9CA3AF" }} />
            <input placeholder="Buscar marca ou modelo..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent outline-none" style={{ fontSize: 13 }} />
          </div>
          <div className="flex items-center gap-2">
            {(["all", "car", "moto", "truck"] as const).map((t) => (
              <button key={t} onClick={() => setTypeFilter(t)}
                className="px-3 py-2 rounded-lg"
                style={{ fontSize: 13, fontWeight: typeFilter === t ? 600 : 400, background: typeFilter === t ? primaryColor : "#F4F6F9", color: typeFilter === t ? "#fff" : "#6B7280" }}>
                {t === "all" ? "Todos" : TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          {dealership?.phone && (
            <a href={`https://wa.me/55${dealership.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg ml-auto" style={{ background: "#25D366", color: "#fff", fontSize: 13, fontWeight: 500 }}>
              <Phone size={14} /> WhatsApp
            </a>
          )}
        </div>
      </div>

      {/* Vehicle grid */}
      <div className="px-6 py-6" style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div className="flex items-center justify-between mb-4">
          <span style={{ fontSize: 13, color: "#6B7280" }}>{total} {total === 1 ? "veículo disponível" : "veículos disponíveis"}</span>
        </div>

        {!loading && vehicles.length === 0 && (
          <div className="text-center py-16">
            <p style={{ fontSize: 14, color: "#9CA3AF" }}>Nenhum veículo encontrado.</p>
          </div>
        )}

        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {vehicles.map((v) => {
            const Icon = v.type === "moto" ? Bike : v.type === "truck" ? Truck : Car;
            const photo = v.photos?.[0]?.url;
            return (
              <button key={v.id} onClick={() => setSelected(v)} className="rounded-xl overflow-hidden text-left" style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)" }}>
                <div className="flex items-center justify-center" style={{ height: 160, background: "#F4F6F9" }}>
                  {photo ? <img src={photo} alt={v.model} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon size={40} style={{ color: "#CBD5E1" }} />}
                </div>
                <div className="p-4">
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#0F1923" }}>{v.brand} {v.model}</div>
                  <div className="flex items-center gap-3 mt-1" style={{ fontSize: 12, color: "#6B7280" }}>
                    <span className="flex items-center gap-1"><Calendar size={11} />{v.year}</span>
                    <span className="flex items-center gap-1"><Gauge size={11} />{v.km.toLocaleString("pt-BR")} km</span>
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: primaryColor, marginTop: 8 }}>{currency(Number(v.price))}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <VehicleDetailModal vehicle={selected} dealership={dealership} primaryColor={primaryColor} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function VehicleDetailModal({ vehicle, dealership, primaryColor, onClose }: {
  vehicle: api.StorefrontVehicle; dealership: api.StorefrontDealership | null; primaryColor: string; onClose: () => void;
}) {
  const Icon = vehicle.type === "moto" ? Bike : vehicle.type === "truck" ? Truck : Car;
  const photo = vehicle.photos?.[0]?.url;
  const waMessage = encodeURIComponent(`Olá! Tenho interesse no ${vehicle.brand} ${vehicle.model} ${vehicle.year} anunciado em ${dealership?.name ?? "sua loja"}.`);

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full rounded-xl overflow-hidden overflow-y-auto" style={{ background: "#fff", maxWidth: 560, maxHeight: "90vh" }}>
        <div className="relative flex items-center justify-center" style={{ height: 260, background: "#F4F6F9" }}>
          {photo ? <img src={photo} alt={vehicle.model} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon size={56} style={{ color: "#CBD5E1" }} />}
          <button onClick={onClose} className="absolute top-3 right-3 p-2 rounded-full" style={{ background: "#fff" }}><X size={16} /></button>
        </div>
        <div className="p-6">
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>{vehicle.brand} {vehicle.model}</h2>
          <div className="flex items-center gap-4 mt-2" style={{ fontSize: 13, color: "#6B7280" }}>
            <span className="flex items-center gap-1"><Calendar size={13} />{vehicle.year}</span>
            <span className="flex items-center gap-1"><Gauge size={13} />{vehicle.km.toLocaleString("pt-BR")} km</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: primaryColor, marginTop: 12 }}>{currency(Number(vehicle.price))}</div>

          {vehicle.optionals?.length > 0 && (
            <div className="mt-4">
              <p style={{ fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 8 }}>Opcionais</p>
              <div className="flex flex-wrap gap-2">
                {vehicle.optionals.map((o) => (
                  <span key={o} className="px-2.5 py-1 rounded-lg" style={{ fontSize: 12, background: "#F4F6F9", color: "#374151" }}>{o}</span>
                ))}
              </div>
            </div>
          )}

          {vehicle.description && (
            <div className="mt-4">
              <p style={{ fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 6 }}>Descrição</p>
              <p style={{ fontSize: 13, color: "#6B7280" }}>{vehicle.description}</p>
            </div>
          )}

          <div className="flex gap-3 mt-6">
            {dealership?.phone && (
              <a href={`https://wa.me/55${dealership.phone.replace(/\D/g, "")}?text=${waMessage}`} target="_blank" rel="noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg" style={{ background: "#25D366", color: "#fff", fontSize: 14, fontWeight: 500 }}>
                <Phone size={16} /> Falar no WhatsApp
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}