import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Search, Car, Bike, Truck, Package, Edit2, Trash2, Globe, X, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import * as api from "../../lib/api";

// ---------- Configuração por tipo de veículo ----------
const TYPE_OPTIONS = [
  { value: "car" as const, label: "Carro", icon: Car },
  { value: "moto" as const, label: "Moto", icon: Bike },
  { value: "truck" as const, label: "Utilitário", icon: Truck },
  { value: "other" as const, label: "Outros", icon: Package },
];

const TYPE_ICON: Record<api.VehicleType, typeof Car> = { car: Car, moto: Bike, truck: Truck, other: Package };

// Subtipos de "Outros"
const OTHER_CATEGORIES = ["Bicicleta elétrica", "Bicicleta", "Patinete elétrico", "Scooter elétrica", "Triciclo", "Quadriciclo", "Outro"];
const ELECTRIC_CATEGORIES = ["Bicicleta elétrica", "Patinete elétrico", "Scooter elétrica"];

const OPTIONALS_CAR = [
  "Ar-condicionado", "Direção elétrica", "Central multimídia", "Câmera de ré",
  "Sensor de estacionamento", "Vidros elétricos", "Trava elétrica", "Bancos em couro",
  "Teto solar", "Rodas de liga", "Piloto automático", "Bluetooth",
  "Alarme", "Farol de neblina", "Retrovisores elétricos", "Controle de tração",
];

const OPTIONALS_BY_TYPE: Record<api.VehicleType, string[]> = {
  car: OPTIONALS_CAR,
  truck: [...OPTIONALS_CAR, "Tração 4x4", "Engate", "Capota marítima", "Protetor de caçamba"],
  moto: [
    "ABS", "Partida elétrica", "Freio a disco", "Injeção eletrônica", "Painel digital",
    "Farol de LED", "Controle de tração", "Modos de pilotagem", "Baú", "Bagageiro",
    "Protetor de motor", "Protetor de mão", "Tomada USB", "Alarme",
  ],
  other: [
    "Pedal assistido", "Acelerador", "Bateria removível", "Carregador incluso",
    "Suspensão dianteira", "Suspensão traseira", "Marchas", "Freio a disco",
    "Farol LED", "Display digital", "Bagageiro", "Cesto", "Dobrável", "Alarme",
  ],
};

const FUELS_BY_TYPE: Record<api.VehicleType, string[]> = {
  car: ["Flex", "Gasolina", "Diesel", "Elétrico", "Híbrido", "GNV"],
  truck: ["Diesel", "Flex", "Gasolina", "Elétrico", "Híbrido", "GNV"],
  moto: ["Gasolina", "Flex", "Elétrico"],
  other: [],
};

const TRANSMISSIONS_BY_TYPE: Record<api.VehicleType, string[]> = {
  car: ["Manual", "Automático", "CVT", "DCT", "Automatizado"],
  truck: ["Manual", "Automático", "CVT", "Automatizado"],
  moto: ["Manual", "Automático", "CVT"],
  other: [],
};

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

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

// ---------- Placa ----------
function normalizePlate(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function isValidPlate(value: string) {
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(value);
}

function stripAccents(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Traduz o combustível da API ("Alcool / Gasolina") para as opções do formulário ("Flex")
function mapFuel(raw: string | null) {
  if (!raw) return "";
  const t = stripAccents(raw);
  if (/eletric/.test(t) && /gasolin|alcool|diesel|hibrid/.test(t)) return "Híbrido";
  if (/hibrid/.test(t)) return "Híbrido";
  if (/eletric/.test(t)) return "Elétrico";
  if (/alcool|etanol/.test(t) && /gasolin/.test(t)) return "Flex";
  if (/flex/.test(t)) return "Flex";
  if (/gas natural|gnv/.test(t)) return "GNV";
  if (/diesel/.test(t)) return "Diesel";
  if (/gasolin/.test(t)) return "Gasolina";
  return "";
}

function mapOrigin(raw: string | null) {
  if (!raw) return "";
  const t = stripAccents(raw);
  if (/import|estrangeir/.test(t)) return "Importado";
  if (/nacional/.test(t)) return "Nacional";
  return "";
}

// Entende "25000", "25.000", "25.000,50", "25000.50" e "R$ 25.000,00"
function parseBRL(value: string) {
  const s = value.trim().replace(/[R$\s]/g, "");
  if (!s) return NaN;
  if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ""));
  return Number(s);
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
          <input placeholder="Buscar por marca, modelo ou placa..." value={search} onChange={(e) => setSearch(e.target.value)}
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
          <option value="other">Outros</option>
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
                const TypeIcon = TYPE_ICON[v.type] ?? Car;
                const m = margin(Number(v.cost), Number(v.price));
                const subtitle = [
                  v.type === "other" ? v.category : null,
                  v.manufactureYear && v.manufactureYear !== v.year ? `${v.manufactureYear}/${v.year}` : String(v.year),
                  v.engineCc ? `${v.engineCc} cc` : null,
                  v.fuel,
                ].filter(Boolean).join(" · ");
                return (
                  <tr key={v.id} style={{ borderBottom: i < vehicles.length - 1 ? "0.5px solid rgba(0,0,0,0.06)" : "none" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 36, height: 36, background: "#F4F6F9" }}>
                          <TypeIcon size={16} style={{ color: "#CBD5E1" }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{v.brand} {v.model} {v.version ?? ""}</div>
                          <div style={{ fontSize: 12, color: "#6B7280" }}>{subtitle}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#374151" }}>{v.plate ?? "—"}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#374151" }}>{v.color ?? "—"}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#374151" }}>{v.transmission ?? "—"}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#374151" }}>{v.type === "other" ? "—" : `${v.km.toLocaleString("pt-BR")} km`}</td>
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

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : undefined}>
      <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = { border: "0.5px solid rgba(0,0,0,0.12)", fontSize: 13, outline: "none", background: "#FAFAFA" };
const sectionTitleStyle = { fontSize: 12, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 12 };

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-2 px-3 py-2 rounded-lg"
      style={{ border: checked ? "1px solid #185FA5" : "0.5px solid rgba(0,0,0,0.1)", background: checked ? "#EBF2FA" : "#FAFAFA", fontSize: 13, color: checked ? "#185FA5" : "#6B7280" }}>
      <span style={{ width: 14, height: 14, borderRadius: 3, background: checked ? "#185FA5" : "#D1D5DB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {checked && <span style={{ color: "#fff", fontSize: 10 }}>✓</span>}
      </span>
      {label}
    </button>
  );
}

type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: api.PlateLookupResult }
  | { status: "error"; message: string };

function VehicleFormModal({ initial, onClose, onSaved }: { initial: api.Vehicle | null; onClose: () => void; onSaved: () => void }) {
  // Tipo
  const [type, setType] = useState<api.VehicleType>(initial?.type ?? "car");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [status, setStatus] = useState<api.VehicleStatus>(initial?.status ?? "available");

  // Identificação
  const [plate, setPlate] = useState(initial?.plate ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [version, setVersion] = useState(initial?.version ?? "");
  const [manufactureYear, setManufactureYear] = useState(initial?.manufactureYear ? String(initial.manufactureYear) : "");
  const [year, setYear] = useState(initial ? String(initial.year) : "");
  const [chassis, setChassis] = useState(initial?.chassis ?? "");
  const [renavam, setRenavam] = useState(initial?.renavam ?? "");
  const [km, setKm] = useState(initial ? String(initial.km) : "0");
  const [engineCc, setEngineCc] = useState(initial?.engineCc ? String(initial.engineCc) : "");
  const [motorPower, setMotorPower] = useState(initial?.motorPower ? String(initial.motorPower) : "");

  // Características
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

  // ---------- O que aparece em cada tipo ----------
  const isOther = type === "other";
  const isMoto = type === "moto";
  const hasDoors = type === "car" || type === "truck";
  const isElectricOther = isOther && ELECTRIC_CATEGORIES.includes(category);
  const optionalsList = OPTIONALS_BY_TYPE[type];
  const fuelOptions = FUELS_BY_TYPE[type];
  const transmissionOptions = TRANSMISSIONS_BY_TYPE[type];

  // Ao trocar o tipo, tira os opcionais que não fazem sentido no novo tipo
  function changeType(next: api.VehicleType) {
    setType(next);
    setSelectedOptionals((prev) => prev.filter((o) => OPTIONALS_BY_TYPE[next].includes(o)));
    if (!FUELS_BY_TYPE[next].includes(fuel)) setFuel("");
    if (!TRANSMISSIONS_BY_TYPE[next].includes(transmission)) setTransmission("");
  }

  // ---------- Consulta pela placa ----------
  const [lookup, setLookup] = useState<LookupState>({ status: "idle" });
  const lastLookup = useRef<string>(initial?.plate ? normalizePlate(initial.plate) : "");

  const runLookup = useCallback(async (value: string) => {
    const p = normalizePlate(value);
    if (!isValidPlate(p)) {
      setLookup({ status: "error", message: "Placa inválida. Use o formato ABC1234 ou ABC1D23." });
      return;
    }
    lastLookup.current = p;
    setLookup({ status: "loading" });
    try {
      const r = await api.lookupPlate(p);
      if (lastLookup.current !== p) return;

      // Só muda o tipo se a API souber qual é; senão mantém o que a pessoa escolheu
      const foundType = r.type;
      if (foundType) {
        setType(foundType);
        setSelectedOptionals((prev) => prev.filter((o) => OPTIONALS_BY_TYPE[foundType].includes(o)));
      }
      if (r.brand) setBrand(r.brand);
      if (r.model) setModel(r.model);
      if (r.version) setVersion(r.version);
      if (r.manufactureYear) setManufactureYear(String(r.manufactureYear));
      if (r.year) setYear(String(r.year));
      if (r.color) setColor(r.color);
      if (r.engineCc) setEngineCc(String(r.engineCc));
      const mappedFuel = mapFuel(r.fuel);
      if (mappedFuel) setFuel(mappedFuel);
      const mappedOrigin = mapOrigin(r.origin);
      if (mappedOrigin) setOrigin(mappedOrigin);

      setLookup({ status: "done", result: r });
    } catch (err) {
      if (lastLookup.current !== p) return;
      setLookup({ status: "error", message: err instanceof Error ? err.message : "Não foi possível consultar a placa." });
    }
  }, []);

  // No cadastro novo: consulta sozinho quando a placa fica completa (não vale para "Outros")
  useEffect(() => {
    if (initial || type === "other") return;
    const p = normalizePlate(plate);
    if (!isValidPlate(p) || p === lastLookup.current) return;
    const t = setTimeout(() => runLookup(p), 400);
    return () => clearTimeout(t);
  }, [plate, initial, type, runLookup]);

  // Margem em tempo real
  const costNum = parseBRL(cost);
  const priceNum = parseBRL(price);
  const liveMargin = costNum > 0 && priceNum > 0 ? ((priceNum - costNum) / costNum) * 100 : null;

  const toggleOptional = (o: string) =>
    setSelectedOptionals((prev) => prev.includes(o) ? prev.filter((x) => x !== o) : [...prev, o]);

  const handleSubmit = async () => {
    setError(null);
    const yearNum = Number(digitsOnly(year));
    const manufactureNum = manufactureYear ? Number(digitsOnly(manufactureYear)) : null;
    const maxYear = new Date().getFullYear() + 1;
    const renavamDigits = digitsOnly(renavam);

    if (isOther && !category) {
      setError("Escolha o que é o veículo (bicicleta elétrica, patinete...).");
      return;
    }
    if (!brand.trim() || !model.trim() || !year || !cost.trim() || !price.trim()) {
      setError(`Preencha pelo menos marca, modelo, ${isOther ? "ano" : "ano modelo"}, custo e preço de venda.`);
      return;
    }
    if (!yearNum || yearNum < 1950 || yearNum > maxYear) {
      setError(`${isOther ? "Ano" : "Ano modelo"} inválido. Use um ano entre 1950 e ${maxYear}.`);
      return;
    }
    if (!isOther && manufactureNum !== null && (manufactureNum < 1950 || manufactureNum > yearNum)) {
      setError("O ano de fabricação precisa ser igual ou menor que o ano modelo.");
      return;
    }
    if (!isOther && renavamDigits && (renavamDigits.length < 9 || renavamDigits.length > 11)) {
      setError("O Renavam deve ter 11 números (ou 9, nos documentos mais antigos).");
      return;
    }
    if (Number.isNaN(costNum) || costNum < 0) {
      setError("Preço de custo inválido. Use só números, ex: 25000 ou 25.000,00.");
      return;
    }
    if (Number.isNaN(priceNum) || priceNum < 0) {
      setError("Preço de venda inválido. Use só números, ex: 30000 ou 30.000,00.");
      return;
    }

    setSaving(true);
    try {
      // Campos que não fazem sentido para o tipo escolhido vão como null (vazios)
      const payload: api.VehicleInput = {
        type, status,
        category: isOther ? category : null,
        brand: brand.trim(), model: model.trim(),
        version: version.trim() || null,
        year: yearNum,
        manufactureYear: isOther ? null : manufactureNum,
        km: isOther ? 0 : Number(digitsOnly(km)) || 0,
        color: color.trim() || null,
        plate: normalizePlate(plate) || null,
        chassis: chassis.trim() || null,
        renavam: isOther ? null : renavamDigits || null,
        engineCc: isMoto && engineCc ? Number(digitsOnly(engineCc)) : null,
        motorPower: isElectricOther && motorPower ? Number(digitsOnly(motorPower)) : null,
        fuel: isOther ? (isElectricOther ? "Elétrico" : null) : fuel || null,
        transmission: isOther ? null : transmission || null,
        doors: hasDoors && doors ? Number(doors) : null,
        origin: origin || null,
        ownerCount: ownerCount ? Number(ownerCount) : null,
        ipvaPaid: isOther ? false : ipvaPaid,
        acceptsTrade,
        hasSpareKey: isOther ? false : hasSpareKey,
        hasManual,
        cost: costNum, price: priceNum,
        description: description.trim() || null,
        optionals: selectedOptionals.filter((o) => optionalsList.includes(o)),
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
  const lookupResult = lookup.status === "done" ? lookup.result : null;
  const hasRestriction = !!lookupResult?.situation && !/sem restri/.test(stripAccents(lookupResult.situation));

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
            <div className="grid grid-cols-4 gap-3">
              {TYPE_OPTIONS.map(({ value, label, icon: Icon }) => (
                <button key={value} type="button" onClick={() => changeType(value)} className="flex flex-col items-center gap-2 py-4 rounded-xl"
                  style={{ border: type === value ? "1.5px solid #185FA5" : "0.5px solid rgba(0,0,0,0.1)", background: type === value ? "#EBF2FA" : "#FAFAFA", color: type === value ? "#185FA5" : "#6B7280" }}>
                  <Icon size={24} /><span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
                </button>
              ))}
            </div>

            {/* Subtipo de "Outros" */}
            {isOther && (
              <div className="mt-4">
                <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 8 }}>Qual? *</label>
                <div className="flex flex-wrap gap-2">
                  {OTHER_CATEGORIES.map((c) => {
                    const active = c === category;
                    return (
                      <button key={c} type="button" onClick={() => setCategory(c)} className="px-3 py-1.5 rounded-full"
                        style={{ fontSize: 12, fontWeight: active ? 600 : 400, border: active ? "1.5px solid #185FA5" : "0.5px solid rgba(0,0,0,0.12)", background: active ? "#EBF2FA" : "#fff", color: active ? "#185FA5" : "#374151" }}>
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Placa com preenchimento automático (carro, moto, utilitário) */}
          {!isOther && (
            <div className="rounded-xl px-4 py-4" style={{ background: "#F4F8FC", border: "0.5px solid rgba(24,95,165,0.2)" }}>
              <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6, fontWeight: 500 }}>
                Placa {!initial && <span style={{ color: "#6B7280", fontWeight: 400 }}>· digite para preencher os dados automaticamente</span>}
              </label>
              <div className="flex items-center gap-2">
                <input placeholder="ABC1D23" value={plate} maxLength={8}
                  onChange={(e) => setPlate(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === "Enter") runLookup(plate); }}
                  className="flex-1 rounded-lg px-3 py-2.5"
                  style={{ ...inputStyle, background: "#fff", textTransform: "uppercase", fontSize: 16, fontWeight: 600, letterSpacing: 2 }} />
                <button type="button" onClick={() => runLookup(plate)} disabled={lookup.status === "loading"}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg"
                  style={{ background: "#185FA5", color: "#fff", fontSize: 13, fontWeight: 500, opacity: lookup.status === "loading" ? 0.7 : 1 }}>
                  {lookup.status === "loading" ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                  {lookup.status === "loading" ? "Consultando..." : "Buscar"}
                </button>
              </div>

              {lookup.status === "done" && (
                <p className="flex items-center gap-1.5" style={{ fontSize: 12, color: "#27500A", marginTop: 8 }}>
                  <CheckCircle2 size={14} />
                  Dados preenchidos pela placa. Confira antes de salvar.
                  {lookup.result.cached && <span style={{ color: "#6B7280" }}> (já consultada antes, sem custo)</span>}
                </p>
              )}
              {lookup.status === "error" && (
                <p className="flex items-center gap-1.5" style={{ fontSize: 12, color: "#DC2626", marginTop: 8 }}>
                  <AlertTriangle size={14} /> {lookup.message}
                </p>
              )}

              {hasRestriction && (
                <div className="flex items-start gap-2 rounded-lg px-3 py-2 mt-3" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>
                  <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span><strong>Atenção:</strong> este veículo consta como "{lookupResult!.situation}". Verifique antes de comprar ou vender.</span>
                </div>
              )}

              {lookupResult && !lookupResult.fipe?.value && (
                <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 6 }}>Valor FIPE não disponível para esta placa.</p>
              )}

              {lookupResult?.fipe?.value && (
                <div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 mt-3" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.08)" }}>
                  <div>
                    <div style={{ fontSize: 12, color: "#6B7280" }}>
                      Tabela FIPE{lookupResult.fipe.reference ? ` (${lookupResult.fipe.reference})` : ""}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#0F1923" }}>{currency(lookupResult.fipe.value)}</div>
                    <div style={{ fontSize: 11, color: "#9CA3AF" }}>{lookupResult.fipe.label}</div>
                  </div>
                  <button type="button" onClick={() => setPrice(String(lookupResult.fipe!.value))}
                    className="px-3 py-1.5 rounded-lg" style={{ fontSize: 12, fontWeight: 500, color: "#185FA5", background: "#EBF2FA", whiteSpace: "nowrap" }}>
                    Usar no preço de venda
                  </button>
                </div>
              )}
            </div>
          )}

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
            <p style={sectionTitleStyle}>Identificação</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Marca *">
                <input placeholder={isOther ? "Ex: Caloi" : isMoto ? "Ex: Honda" : "Ex: Volkswagen"} value={brand} onChange={(e) => setBrand(e.target.value)} className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
              </Field>
              <Field label="Modelo *">
                <input placeholder={isOther ? "Ex: E-Vibe City" : isMoto ? "Ex: CG 160" : "Ex: Gol"} value={model} onChange={(e) => setModel(e.target.value)} className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
              </Field>
              <Field label="Versão">
                <input placeholder={isMoto ? "Ex: Fan, Titan, Start" : isOther ? "Ex: Aro 29" : "Ex: 1.0 MPI"} value={version} onChange={(e) => setVersion(e.target.value)} className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
              </Field>

              {isOther ? (
                <Field label="Ano *">
                  <input placeholder="2024" value={year} inputMode="numeric" maxLength={4} onChange={(e) => setYear(e.target.value)} className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
                </Field>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Ano fabricação">
                    <input placeholder="2022" value={manufactureYear} inputMode="numeric" maxLength={4} onChange={(e) => setManufactureYear(e.target.value)} className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
                  </Field>
                  <Field label="Ano modelo *">
                    <input placeholder="2023" value={year} inputMode="numeric" maxLength={4} onChange={(e) => setYear(e.target.value)} className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
                  </Field>
                </div>
              )}

              {isOther ? (
                <>
                  <Field label="Nº de série / quadro">
                    <input placeholder="Gravado no quadro ou na nota" value={chassis} onChange={(e) => setChassis(e.target.value)} className="w-full rounded-lg px-3 py-2.5" style={{ ...inputStyle, textTransform: "uppercase" }} />
                  </Field>
                  <Field label="Placa (se tiver)">
                    <input placeholder="ABC1D23" value={plate} maxLength={8} onChange={(e) => setPlate(e.target.value.toUpperCase())} className="w-full rounded-lg px-3 py-2.5" style={{ ...inputStyle, textTransform: "uppercase" }} />
                  </Field>
                  {isElectricOther && (
                    <Field label="Potência do motor (W)">
                      <input placeholder="Ex: 350" value={motorPower} inputMode="numeric" onChange={(e) => setMotorPower(e.target.value)} className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
                    </Field>
                  )}
                </>
              ) : (
                <>
                  <Field label="Chassi">
                    <input placeholder="17 caracteres, como no documento" value={chassis} maxLength={17} onChange={(e) => setChassis(e.target.value.toUpperCase())} className="w-full rounded-lg px-3 py-2.5" style={{ ...inputStyle, textTransform: "uppercase" }} />
                  </Field>
                  <Field label="Renavam">
                    <input placeholder="11 números" value={renavam} inputMode="numeric" maxLength={11} onChange={(e) => setRenavam(digitsOnly(e.target.value))} className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
                  </Field>
                  <Field label="Quilometragem">
                    <input placeholder="0" value={km} inputMode="numeric" onChange={(e) => setKm(e.target.value)} className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
                  </Field>
                  {isMoto && (
                    <Field label="Cilindrada (cc)">
                      <input placeholder="Ex: 160" value={engineCc} inputMode="numeric" onChange={(e) => setEngineCc(e.target.value)} className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
                    </Field>
                  )}
                </>
              )}
            </div>
            {!isOther && lookup.status === "done" && (
              <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8 }}>
                Chassi e Renavam não vêm completos na consulta. Confira no documento do veículo (CRLV).
              </p>
            )}
          </div>

          {/* Características */}
          <div>
            <p style={sectionTitleStyle}>Características</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Cor">
                <input placeholder="Ex: Prata" value={color} onChange={(e) => setColor(e.target.value)} className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
              </Field>
              {fuelOptions.length > 0 && (
                <Field label="Combustível">
                  <select value={fuel} onChange={(e) => setFuel(e.target.value)} className="w-full rounded-lg px-3 py-2.5" style={selectStyle}>
                    <option value="">Selecionar</option>
                    {fuelOptions.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </Field>
              )}
              {transmissionOptions.length > 0 && (
                <Field label="Câmbio">
                  <select value={transmission} onChange={(e) => setTransmission(e.target.value)} className="w-full rounded-lg px-3 py-2.5" style={selectStyle}>
                    <option value="">Selecionar</option>
                    {transmissionOptions.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
              )}
              {hasDoors && (
                <Field label="Portas">
                  <select value={doors} onChange={(e) => setDoors(e.target.value)} className="w-full rounded-lg px-3 py-2.5" style={selectStyle}>
                    <option value="">Selecionar</option>
                    <option value="2">2 portas</option>
                    <option value="4">4 portas</option>
                  </select>
                </Field>
              )}
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

          {/* Informações adicionais */}
          <div>
            <p style={sectionTitleStyle}>Informações adicionais</p>
            <div className="flex flex-wrap gap-2">
              {!isOther && <Toggle label="IPVA pago" checked={ipvaPaid} onChange={setIpvaPaid} />}
              <Toggle label="Aceita troca" checked={acceptsTrade} onChange={setAcceptsTrade} />
              {!isOther && <Toggle label="Chave reserva" checked={hasSpareKey} onChange={setHasSpareKey} />}
              <Toggle label="Manual do proprietário" checked={hasManual} onChange={setHasManual} />
            </div>
          </div>

          {/* Opcionais (mudam conforme o tipo) */}
          <div>
            <p style={sectionTitleStyle}>Opcionais</p>
            <div className="flex flex-wrap gap-2">
              {optionalsList.map((o) => (
                <button key={o} type="button" onClick={() => toggleOptional(o)} className="px-3 py-1.5 rounded-lg"
                  style={{ fontSize: 12, border: selectedOptionals.includes(o) ? "1px solid #185FA5" : "0.5px solid rgba(0,0,0,0.1)", background: selectedOptionals.includes(o) ? "#EBF2FA" : "#FAFAFA", color: selectedOptionals.includes(o) ? "#185FA5" : "#6B7280" }}>
                  {selectedOptionals.includes(o) ? "✓ " : ""}{o}
                </button>
              ))}
            </div>
          </div>

          {/* Preços */}
          <div>
            <p style={sectionTitleStyle}>Precificação</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Preço de custo (privado) *">
                <input placeholder="Ex: 25.000,00" value={cost} inputMode="decimal" onChange={(e) => setCost(e.target.value)} className="w-full rounded-lg px-3 py-2.5" style={{ ...inputStyle, background: "#FEF3C7" }} />
              </Field>
              <Field label="Preço de venda *">
                <input placeholder="Ex: 30.000,00" value={price} inputMode="decimal" onChange={(e) => setPrice(e.target.value)} className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
              </Field>
            </div>
            {liveMargin !== null && (
              <div className="mt-2 px-3 py-2 rounded-lg" style={{ background: liveMargin > 0 ? "#EAF3DE" : "#FEE2E2", fontSize: 13, color: liveMargin > 0 ? "#27500A" : "#DC2626" }}>
                Margem: <strong>{liveMargin.toFixed(1)}%</strong>{liveMargin > 0 ? ` · Lucro: ${currency(priceNum - costNum)}` : " · Preço abaixo do custo"}
              </div>
            )}
          </div>

          {/* Observações */}
          <div>
            <p style={sectionTitleStyle}>Observações internas</p>
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