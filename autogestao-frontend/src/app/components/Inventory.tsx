import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Car, Bike, Truck, Edit2, Trash2, Globe, X } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import * as api from "../../lib/api";

const OPTIONALS_LIST = [
  "Ar-condicionado", "Direção elétrica", "Central multimídia", "Câmera de ré",
  "Sensor de estacionamento", "Vidros elétricos", "Trava elétrica", "Bancos em couro",
  "Teto solar", "Rodas de liga", "Piloto automático", "Bluetooth",
  "Alarme", "Farol de neblina", "Retrovisores elétricos", "Controle de tração",
];

const FUELS = ["Flex", "Gasolina", "Diesel", "Elétrico", "Híbrido", "GNV"];
const TRANSMISSIONS = ["Manual", "Automático", "CVT", "DCT", "Automatizado"];
const ORIGINS = ["Nacional", "Importado"];

function daysInStock(createdAt: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000));
}

function margin(cost: number, price: number) {
  if (!cost) return 0;
  return ((price - cost) / cost) * 100;
}

function currency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function Inventory() {
  const [vehicles, setVehicles] = useState<api.Vehicle[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<api.VehicleStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<api.VehicleType | "all">("all");
  const [modalVehicle, setModalVehicle] = useState<api.Vehicle | "new" | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.listVehicles({ search: debouncedSearch || undefined, status: statusFilter, type: typeFilter, pageSize: 100 });
      setVehicles(res.items);
      setTotal(res.total);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Não foi possível carregar os veículos");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter, typeFilter]);

  useEffect(() => { fetchVehicles(); }, [fetchVehicles]);

  const handleDelete = async (vehicle: api.Vehicle) => {
    if (!window.confirm(`Remover ${vehicle.brand} ${vehicle.model} do estoque?`)) return;
    try {
      await api.deleteVehicle(vehicle.id);
      fetchVehicles();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Não foi possível remover o veículo");
    }
  };

  return (
    <div className="flex flex-col h-full overflow-auto" style={{ background: "var(--background)" }}>
      <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
        style={{ background: "#fff", borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}>
        <div className="flex items-center gap-3">
          <h2>Estoque</h2>
          <span className="px-2 py-0.5 rounded-full" style={{ background: "#EBF2FA", color: "#185FA5", fontSize: 12, fontWeight: 500 }}>
            {total} veículos
          </span>
        </div>
        <button onClick={() => setModalVehicle("new")} className="flex items-center gap-2 px-4 py-2 rounded-lg"
          style={{ background: "#185FA5", color: "#fff", fontSize: 13, fontWeight: 500 }}>
          <Plus size={16} /> Adicionar veículo
        </button>
      </div>

      <div className="flex items-center gap-3 px-6 py-3 flex-wrap" style={{ borderBottom: "0.5px solid rgba(0,0,0,0.08)", background: "#fff" }}>
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 flex-1 min-w-48" style={{ background: "#F4F6F9", border: "0.5px solid rgba(0,0,0,0.08)" }}>
          <Search size={15} style={{ color: "#9CA3AF" }} />
          <input placeholder="Buscar veículo..." value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ border: "none", outline: "none", fontSize: 13, background: "transparent", width: "100%" }} />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as api.VehicleStatus | "all")}
          className="rounded-lg px-3 py-2" style={{ background: "#F4F6F9", border: "0.5px solid rgba(0,0,0,0.08)", fontSize: 13 }}>
          <option value="all">Todos os status</option>
          <option value="available">Disponível</option>
          <option value="reserved">Reservado</option>
          <option value="sold">Vendido</option>
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as api.VehicleType | "all")}
          className="rounded-lg px-3 py-2" style={{ background: "#F4F6F9", border: "0.5px solid rgba(0,0,0,0.08)", fontSize: 13 }}>
          <option value="all">Todos os tipos</option>
          <option value="car">Carros</option>
          <option value="moto">Motos</option>
          <option value="truck">Utilitários</option>
        </select>
      </div>

      {loadError && (
        <div className="px-6 pt-4">
          <div className="flex items-center justify-between rounded-lg px-4 py-3" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>
            <span>{loadError}</span>
            <button onClick={fetchVehicles} style={{ fontWeight: 500 }}>Tentar novamente</button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto px-6 py-4">
        <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid rgba(0,0,0,0.08)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#FAFAFA", borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}>
                {["Veículo", "Placa", "Cor", "Câmbio", "Km", "Custo", "Venda", "Margem", "Status", "Dias", "Ações"].map((h) => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 12, color: "#6B7280", fontWeight: 500, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && vehicles.length === 0 && (
                <tr><td colSpan={11} style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: "#9CA3AF" }}>Nenhum veículo encontrado.</td></tr>
              )}
              {vehicles.map((v, i) => {
                const TypeIcon = v.type === "moto" ? Bike : v.type === "truck" ? Truck : Car;
                const m = margin(Number(v.cost), Number(v.price));
                return (
                  <tr key={v.id} style={{ borderBottom: i < vehicles.length - 1 ? "0.5px solid rgba(0,0,0,0.06)" : "none" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 36, height: 36, background: "#F4F6F9" }}>
                          <TypeIcon size={16} style={{ color: "#CBD5E1" }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{v.brand} {v.model} {v.version ?? ""}</div>
                          <div style={{ fontSize: 12, color: "#6B7280" }}>{v.year}{v.fuel ? ` · ${v.fuel}` : ""}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#374151" }}>{v.plate ?? "—"}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#374151" }}>{v.color ?? "—"}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#374151" }}>{v.transmission ?? "—"}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#374151" }}>{v.km.toLocaleString("pt-BR")} km</td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#6B7280" }}>{currency(Number(v.cost))}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 500 }}>{currency(Number(v.price))}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ fontSize: 13, color: m > 30 ? "#27500A" : m > 20 ? "#374151" : "#DC2626", fontWeight: 500 }}>{m.toFixed(1)}%</span>
                    </td>
                    <td style={{ padding: "12px 16px" }}><StatusBadge status={v.status} /></td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ fontSize: 13, color: daysInStock(v.createdAt) > 30 ? "#D97706" : "#374151" }}>{daysInStock(v.createdAt)}d</span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setModalVehicle(v)} className="p-1.5 rounded" style={{ color: "#6B7280", background: "#F4F6F9" }}><Edit2 size={13} /></button>
                        <button className="p-1.5 rounded" style={{ color: "#185FA5", background: "#EBF2FA" }}><Globe size={13} /></button>
                        <button onClick={() => handleDelete(v)} className="p-1.5 rounded" style={{ color: "#DC2626", background: "#FEE2E2" }}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modalVehicle !== null && (
        <VehicleFormModal key={modalVehicle === "new" ? "new" : modalVehicle.id}
          initial={modalVehicle === "new" ? null : modalVehicle}
          onClose={() => setModalVehicle(null)}
          onSaved={() => { setModalVehicle(null); fetchVehicles(); }} />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = { border: "0.5px solid rgba(0,0,0,0.12)", fontSize: 13, outline: "none", background: "#FAFAFA" };

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex items-center gap-2 px-3 py-2 rounded-lg"
      style={{ border: checked ? "1px solid #185FA5" : "0.5px solid rgba(0,0,0,0.1)", background: checked ? "#EBF2FA" : "#FAFAFA", fontSize: 13, color: checked ? "#185FA5" : "#6B7280" }}>
      <span style={{ width: 14, height: 14, borderRadius: 3, background: checked ? "#185FA5" : "#D1D5DB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {checked && <span style={{ color: "#fff", fontSize: 10 }}>✓</span>}
      </span>
      {label}
    </button>
  );
}

function VehicleFormModal({ initial, onClose, onSaved }: { initial: api.Vehicle | null; onClose: () => void; onSaved: () => void }) {
  // Identificação
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [version, setVersion] = useState(initial?.version ?? "");
  const [year, setYear] = useState(initial ? String(initial.year) : "");
  const [plate, setPlate] = useState(initial?.plate ?? "");
  const [type, setType] = useState<api.VehicleType>(initial?.type ?? "car");
  const [status, setStatus] = useState<api.VehicleStatus>(initial?.status ?? "available");

  // Características
  const [km, setKm] = useState(initial ? String(initial.km) : "0");
  const [color, setColor] = useState(initial?.color ?? "");
  const [fuel, setFuel] = useState(initial?.fuel ?? "");
  const [transmission, setTransmission] = useState(initial?.transmission ?? "");
  const [doors, setDoors] = useState(initial?.doors ? String(initial.doors) : "");
  const [origin, setOrigin] = useState(initial?.origin ?? "");
  const [ownerCount, setOwnerCount] = useState(initial?.ownerCount ? String(initial.ownerCount) : "");

  // Booleanos
  const [ipvaPaid, setIpvaPaid] = useState(initial?.ipvaPaid ?? false);
  const [acceptsTrade, setAcceptsTrade] = useState(initial?.acceptsTrade ?? false);
  const [hasSpareKey, setHasSpareKey] = useState(initial?.hasSpareKey ?? false);
  const [hasManual, setHasManual] = useState(initial?.hasManual ?? false);

  // Preços
  const [cost, setCost] = useState(initial ? String(initial.cost) : "");
  const [price, setPrice] = useState(initial ? String(initial.price) : "");

  // Extras
  const [description, setDescription] = useState(initial?.description ?? "");
  const [selectedOptionals, setSelectedOptionals] = useState<string[]>(initial?.optionals ?? []);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Indicador de margem em tempo real
  const costNum = Number(cost);
  const priceNum = Number(price);
  const liveMargin = costNum > 0 && priceNum > 0 ? ((priceNum - costNum) / costNum) * 100 : null;

  const toggleOptional = (o: string) =>
    setSelectedOptionals((prev) => prev.includes(o) ? prev.filter((x) => x !== o) : [...prev, o]);

  const handleSubmit = async () => {
    setError(null);
    if (!brand.trim() || !model.trim() || !year || !cost || !price) {
      setError("Preencha pelo menos marca, modelo, ano, custo e preço de venda.");
      return;
    }
    setSaving(true);
    try {
      const payload: api.VehicleInput = {
        brand: brand.trim(), model: model.trim(),
        version: version.trim() || undefined,
        year: Number(year), km: Number(km) || 0,
        color: color || undefined, plate: plate.toUpperCase().trim() || undefined,
        fuel: fuel || undefined, transmission: transmission || undefined,
        doors: doors ? Number(doors) : undefined,
        origin: origin || undefined,
        ownerCount: ownerCount ? Number(ownerCount) : undefined,
        ipvaPaid, acceptsTrade, hasSpareKey, hasManual,
        cost: costNum, price: priceNum,
        type, status,
        description: description.trim() || undefined,
        optionals: selectedOptionals,
      };
      if (initial) await api.updateVehicle(initial.id, payload);
      else await api.createVehicle(payload);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o veículo");
    } finally {
      setSaving(false);
    }
  };

  const selectStyle = { ...inputStyle, background: "#fff" };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-h-[90vh] overflow-y-auto" style={{ background: "#fff", borderRadius: 16, maxWidth: 720, margin: 16 }}>
        <div className="flex items-center justify-between px-6 py-4 sticky top-0"
          style={{ background: "#fff", borderBottom: "0.5px solid rgba(0,0,0,0.08)", zIndex: 1 }}>
          <h3>{initial ? "Editar veículo" : "Cadastrar novo veículo"}</h3>
          <button onClick={onClose} style={{ color: "#6B7280" }}><X size={20} /></button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {error && <div className="rounded-lg px-3 py-2" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>{error}</div>}

          {/* Tipo */}
          <div>
            <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 8 }}>Tipo de veículo</label>
            <div className="grid grid-cols-3 gap-3">
              {[{ value: "car" as const, label: "Carro", icon: Car }, { value: "moto" as const, label: "Moto", icon: Bike }, { value: "truck" as const, label: "Utilitário", icon: Truck }].map(({ value, label, icon: Icon }) => (
                <button key={value} onClick={() => setType(value)} className="flex flex-col items-center gap-2 py-4 rounded-xl"
                  style={{ border: type === value ? "1.5px solid #185FA5" : "0.5px solid rgba(0,0,0,0.1)", background: type === value ? "#EBF2FA" : "#FAFAFA", color: type === value ? "#185FA5" : "#6B7280" }}>
                  <Icon size={24} /><span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Status (edição) */}
          {initial && (
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value as api.VehicleStatus)}
                className="w-full rounded-lg px-3 py-2.5" style={selectStyle}>
                <option value="available">Disponível</option>
                <option value="reserved">Reservado</option>
                <option value="sold">Vendido</option>
              </select>
            </Field>
          )}

          {/* Identificação */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Identificação</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Marca *">
                <input placeholder="Ex: Honda" value={brand} onChange={(e) => setBrand(e.target.value)} className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
              </Field>
              <Field label="Modelo *">
                <input placeholder="Ex: Civic" value={model} onChange={(e) => setModel(e.target.value)} className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
              </Field>
              <Field label="Versão / Trim">
                <input placeholder="Ex: EXL, LX, Sport" value={version} onChange={(e) => setVersion(e.target.value)} className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
              </Field>
              <Field label="Placa">
                <input placeholder="ABC-1234" value={plate} onChange={(e) => setPlate(e.target.value)} className="w-full rounded-lg px-3 py-2.5" style={{ ...inputStyle, textTransform: "uppercase" }} />
              </Field>
              <Field label="Ano *">
                <input placeholder="2022" value={year} onChange={(e) => setYear(e.target.value)} className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
              </Field>
              <Field label="Quilometragem">
                <input placeholder="0" value={km} onChange={(e) => setKm(e.target.value)} className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
              </Field>
            </div>
          </div>

          {/* Características */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Características</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Cor">
                <input placeholder="Ex: Branco Perolado" value={color} onChange={(e) => setColor(e.target.value)} className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
              </Field>
              <Field label="Combustível">
                <select value={fuel} onChange={(e) => setFuel(e.target.value)} className="w-full rounded-lg px-3 py-2.5" style={selectStyle}>
                  <option value="">Selecionar</option>
                  {FUELS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </Field>
              <Field label="Câmbio">
                <select value={transmission} onChange={(e) => setTransmission(e.target.value)} className="w-full rounded-lg px-3 py-2.5" style={selectStyle}>
                  <option value="">Selecionar</option>
                  {TRANSMISSIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Portas">
                <select value={doors} onChange={(e) => setDoors(e.target.value)} className="w-full rounded-lg px-3 py-2.5" style={selectStyle}>
                  <option value="">Selecionar</option>
                  <option value="2">2 portas</option>
                  <option value="4">4 portas</option>
                </select>
              </Field>
              <Field label="Procedência">
                <select value={origin} onChange={(e) => setOrigin(e.target.value)} className="w-full rounded-lg px-3 py-2.5" style={selectStyle}>
                  <option value="">Selecionar</option>
                  {ORIGINS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Nº de donos">
                <select value={ownerCount} onChange={(e) => setOwnerCount(e.target.value)} className="w-full rounded-lg px-3 py-2.5" style={selectStyle}>
                  <option value="">Selecionar</option>
                  <option value="1">1º dono</option>
                  <option value="2">2º dono</option>
                  <option value="3">3º dono ou mais</option>
                </select>
              </Field>
            </div>
          </div>

          {/* Checkboxes */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Informações adicionais</p>
            <div className="flex flex-wrap gap-2">
              <Toggle label="IPVA pago" checked={ipvaPaid} onChange={setIpvaPaid} />
              <Toggle label="Aceita troca" checked={acceptsTrade} onChange={setAcceptsTrade} />
              <Toggle label="Chave reserva" checked={hasSpareKey} onChange={setHasSpareKey} />
              <Toggle label="Manual do proprietário" checked={hasManual} onChange={setHasManual} />
            </div>
          </div>

          {/* Opcionais */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Opcionais</p>
            <div className="flex flex-wrap gap-2">
              {OPTIONALS_LIST.map((o) => (
                <button key={o} onClick={() => toggleOptional(o)} className="px-3 py-1.5 rounded-lg"
                  style={{ fontSize: 12, border: selectedOptionals.includes(o) ? "1px solid #185FA5" : "0.5px solid rgba(0,0,0,0.1)", background: selectedOptionals.includes(o) ? "#EBF2FA" : "#FAFAFA", color: selectedOptionals.includes(o) ? "#185FA5" : "#6B7280" }}>
                  {selectedOptionals.includes(o) ? "✓ " : ""}{o}
                </button>
              ))}
            </div>
          </div>

          {/* Preços */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Precificação</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Preço de custo (privado) *">
                <input placeholder="0,00" value={cost} onChange={(e) => setCost(e.target.value)} className="w-full rounded-lg px-3 py-2.5" style={{ ...inputStyle, background: "#FEF3C7" }} />
              </Field>
              <Field label="Preço de venda *">
                <input placeholder="0,00" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
              </Field>
            </div>
            {liveMargin !== null && (
              <div className="mt-2 px-3 py-2 rounded-lg" style={{ background: liveMargin > 0 ? "#EAF3DE" : "#FEE2E2", fontSize: 13, color: liveMargin > 0 ? "#27500A" : "#DC2626" }}>
                Margem: <strong>{liveMargin.toFixed(1)}%</strong>{liveMargin > 0 ? ` · Lucro: ${(priceNum - costNum).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : " · Preço abaixo do custo"}
              </div>
            )}
          </div>

          {/* Observações */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Observações internas</p>
            <textarea placeholder="Notas sobre o veículo (visíveis apenas para você)" rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5" style={{ ...inputStyle, resize: "vertical" }} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4" style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)" }}>
          <button onClick={onClose} className="px-5 py-2 rounded-lg" style={{ border: "0.5px solid rgba(0,0,0,0.1)", fontSize: 13, color: "#374151", background: "#fff" }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={saving} className="px-6 py-2 rounded-lg"
            style={{ background: "#185FA5", color: "#fff", fontSize: 13, fontWeight: 500, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Salvando..." : initial ? "Salvar alterações" : "Cadastrar veículo"}
          </button>
        </div>
      </div>
    </div>
  );
}