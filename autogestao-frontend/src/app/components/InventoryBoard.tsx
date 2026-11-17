// Aba Estoque (dono/admin), no visual do modelo "Catalogo de Motos e Carros" (versão Premium, Figma Make):
// cabeçalho com ações, painel colorido, estoque por filial, alerta de parados, filtros, grade/lista e cartões.
// Os dados vêm todos do sistema; cadastro, detalhes, reserva e venda usam as janelas que já existiam.
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  AlertCircle, BarChart3, Bike, Bookmark, Calendar, Car, DollarSign, Download, Edit2, Eye, FileText, Grid3x3,
  Heart, List, Loader2, MessageCircle, Package, Plus, Search, SlidersHorizontal, Star, Store, Trash2, TrendingUp,
  Truck, Upload, X,
} from "lucide-react";
import * as api from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { docProblems } from "../../lib/vehicle-doc-status";
import { daysInStock, exportInventoryCsv, exportInventoryPdf, readInventoryCsv, type ImportRow } from "../../lib/inventory-files";
import { ReservationModal } from "./ReservationModal";
import { VehicleDetailsModal, type VehicleDetails } from "./VehicleDetailsModal";
import { NewSaleModal } from "./Sales";

type FormModal = ComponentType<{ initial: api.Vehicle | null; onClose: () => void; onSaved: () => void }>;
type Sort = "newest" | "oldest" | "price-asc" | "price-desc" | "name" | "days";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brlK = (v: number) => (v >= 1_000_000 ? `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi` : `R$ ${Math.round(v / 1000).toLocaleString("pt-BR")}k`);
const name = (v: api.Vehicle) => `${v.brand} ${v.model}`;
const yearLabel = (v: api.Vehicle) => (v.manufactureYear && v.manufactureYear !== v.year ? `${v.manufactureYear}/${v.year}` : String(v.year));
const cover = (v: api.Vehicle) => [...(v.photos ?? [])].sort((a, b) => a.order - b.order)[0]?.url;
const isNew = (v: api.Vehicle) => v.status === "available" && daysInStock(v.createdAt) <= 7;
const isStalled = (v: api.Vehicle) => v.status === "available" && daysInStock(v.createdAt) > 30;
const TYPE_ICON: Record<string, typeof Car> = { car: Car, moto: Bike, truck: Truck, other: Package };
const TYPE_LABEL: Record<string, string> = { car: "Carro", moto: "Moto", truck: "Utilitário", other: "Outro" };
const STATUS = {
  available: { label: "Disponível", chip: "bg-green-500/20 text-green-400 border-green-500/50", bar: "border-l-green-500" },
  reserved: { label: "Reservado", chip: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50", bar: "border-l-yellow-500" },
  sold: { label: "Vendido", chip: "bg-red-500/20 text-red-400 border-red-500/50", bar: "border-l-slate-600" },
} as const;

function useFavorites(userId: string | undefined) {
  const key = `autogestao:favoritos:${userId ?? "anon"}`;
  const [fav, setFav] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(key) ?? "[]")); } catch { return new Set(); }
  });
  const toggle = (id: string) => setFav((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    try { localStorage.setItem(key, JSON.stringify([...next])); } catch { /* navegador sem armazenamento: vale só nesta sessão */ }
    return next;
  });
  return { fav, toggle };
}

export function InventoryBoard({ FormModal }: { FormModal: FormModal }) {
  const auth = useAuth();
  const storeName = auth.dealership?.name ?? "Minha loja";
  const storeSlug = auth.dealership?.slug ?? "";
  const canManage = auth.user?.role === "owner" || auth.user?.role === "admin";

  const [vehicles, setVehicles] = useState<api.Vehicle[]>([]);
  const [total, setTotal] = useState(0);
  const [units, setUnits] = useState<api.StoreUnit[]>([]);
  const [monthSales, setMonthSales] = useState<{ count: number; revenue: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [type, setType] = useState<api.VehicleType | "all">("all");
  const [status, setStatus] = useState<api.VehicleStatus | "all">("all");
  const [unit, setUnit] = useState<string>("all");
  const [onlyFav, setOnlyFav] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<Sort>("newest");
  const [condition, setCondition] = useState<"all" | "zero" | "used">("all");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [view, setView] = useState<"grid" | "list">(() => (localStorage.getItem("autogestao:estoque:visao") === "list" ? "list" : "grid"));
  const [showDashboard, setShowDashboard] = useState(false);

  const [form, setForm] = useState<api.Vehicle | "new" | null>(null);
  const [details, setDetails] = useState<api.Vehicle | null>(null);
  const [reserving, setReserving] = useState<api.Vehicle | null>(null);
  const [selling, setSelling] = useState<api.Vehicle | null>(null);
  const [managingUnits, setManagingUnits] = useState(false);
  const [importing, setImporting] = useState<ImportRow[] | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { fav, toggle: toggleFav } = useFavorites(auth.user?.id);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      // Lista inteira de uma vez: contagens, painel e filtros são feitos aqui na tela
      const [list, unitList, summary] = await Promise.all([
        api.listVehicles({ pageSize: 1000 }),
        api.listUnits(),
        api.getSaleSummary(month).catch(() => null),
      ]);
      setVehicles(list.items);
      setTotal(list.total);
      setUnits(unitList);
      setMonthSales(summary ? { count: summary.count, revenue: summary.totalRevenue } : null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Não foi possível carregar o estoque");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  // Logo da loja (o mesmo do site)
  useEffect(() => {
    if (storeSlug) api.getStorefrontDealership(storeSlug).then((d) => setLogoUrl(d.logoUrl)).catch(() => {});
  }, [storeSlug]);
  useEffect(() => { try { localStorage.setItem("autogestao:estoque:visao", view); } catch { /* sem armazenamento */ } }, [view]);

  // ---------- Números do painel ----------
  const available = vehicles.filter((v) => v.status === "available");
  const stockValue = available.reduce((s, v) => s + Number(v.price), 0);
  const stalled = available.filter(isStalled).sort((a, b) => daysInStock(b.createdAt) - daysInStock(a.createdAt));
  const reserved = vehicles.filter((v) => v.status === "reserved");

  // ---------- Filtros ----------
  const base = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qPlate = q.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const min = Number(minPrice.replace(/\D/g, "")) || 0;
    const max = Number(maxPrice.replace(/\D/g, "")) || Infinity;
    return vehicles.filter((v) =>
      (!q || `${v.brand} ${v.model} ${v.version ?? ""}`.toLowerCase().includes(q) || (!!qPlate && (v.plate ?? "").includes(qPlate)))
      && (unit === "all" || (unit === "none" ? !v.unitId : v.unitId === unit))
      && (condition === "all" || (condition === "zero" ? v.km === 0 : v.km > 0))
      && Number(v.price) >= min && Number(v.price) <= max
      && (!onlyFav || fav.has(v.id)));
  }, [vehicles, search, unit, condition, minPrice, maxPrice, onlyFav, fav]);

  const countType = (t: api.VehicleType | "all") => base.filter((v) => (t === "all" || v.type === t) && (status === "all" || v.status === status)).length;
  const shown = useMemo(() => {
    const list = base.filter((v) => (type === "all" || v.type === type) && (status === "all" || v.status === status));
    const by: Record<Sort, (a: api.Vehicle, b: api.Vehicle) => number> = {
      newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
      oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
      "price-asc": (a, b) => Number(a.price) - Number(b.price),
      "price-desc": (a, b) => Number(b.price) - Number(a.price),
      name: (a, b) => name(a).localeCompare(name(b), "pt-BR"),
      days: (a, b) => daysInStock(b.createdAt) - daysInStock(a.createdAt),
    };
    return [...list].sort(by[sort]);
  }, [base, type, status, sort]);
  const typesPresent = (["car", "moto", "truck", "other"] as const).filter((t) => vehicles.some((v) => v.type === t));
  const advancedOn = sort !== "newest" || condition !== "all" || !!minPrice || !!maxPrice || onlyFav;

  // ---------- Ações ----------
  const handleDelete = async (v: api.Vehicle) => {
    if (!window.confirm(`Excluir ${name(v)} ${v.plate ?? ""} do estoque? Isso não pode ser desfeito.`)) return;
    try { await api.deleteVehicle(v.id); load(); }
    catch (err) { window.alert(err instanceof Error ? err.message : "Não foi possível excluir o veículo"); }
  };

  const shareWhatsApp = (v: api.Vehicle) => {
    const link = storeSlug && v.status === "available" ? `${window.location.origin}/loja/${storeSlug}?v=${v.id}` : "";
    const text = [
      `*${name(v)}${v.version ? ` ${v.version}` : ""}*`,
      `${storeName}${v.unit ? ` · ${v.unit.name}` : ""}`,
      brl(Number(v.price)),
      [yearLabel(v), v.km === 0 ? "Zero km" : `${v.km.toLocaleString("pt-BR")} km`, v.color].filter(Boolean).join(" · "),
      link,
    ].filter(Boolean).join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };

  const filterLabel = [
    type !== "all" ? TYPE_LABEL[type] : null,
    status !== "all" ? STATUS[status].label : null,
    unit !== "all" ? (unit === "none" ? "Sem filial" : units.find((u) => u.id === unit)?.name) : null,
    search ? `busca "${search}"` : null,
  ].filter(Boolean).join(", ");

  const handlePdf = async () => {
    setPdfBusy(true);
    try { await exportInventoryPdf({ storeName, vehicles: shown, units, monthSales, filterLabel }); }
    catch { window.alert("Não foi possível gerar o PDF. Tente de novo."); }
    finally { setPdfBusy(false); }
  };

  const onImportFile = async (file: File) => {
    const text = await file.text();
    const plates = new Set(vehicles.map((v) => v.plate ?? "").filter(Boolean));
    const rows = readInventoryCsv(text, units, plates);
    if (!rows.length) { window.alert("A planilha está vazia ou não tem a linha de títulos (Marca, Modelo, Ano modelo, Preço...)."); return; }
    setImporting(rows);
  };

  return (
    // text-white só no conteúdo: as janelas claras (cadastro, venda, reserva, detalhes) ficam fora dele e mantêm o texto escuro
    <div className="h-full overflow-auto bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="px-4 md:px-6 py-6 mx-auto text-white" style={{ maxWidth: 1500 }}>
        {/* Cabeçalho */}
        <header className="mb-6 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-14 w-14 rounded-xl object-cover flex-shrink-0" />
            ) : (
              <div className="h-14 w-14 rounded-xl bg-red-600 flex items-center justify-center flex-shrink-0"><Car className="w-7 h-7" /></div>
            )}
            <div className="min-w-0">
              <h1 className="text-xl font-bold truncate">{storeName}</h1>
              <p className="text-slate-400 text-sm">Gestão de estoque{units.length ? ` · ${units.length} ${units.length === 1 ? "filial" : "filiais"}` : ""}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {storeSlug && (
              <a href={`/loja/${storeSlug}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 rounded-lg shadow-lg shadow-emerald-500/30 transition-all text-sm font-medium">
                <Eye className="w-4 h-4" /> Modo Vitrine
              </a>
            )}
            <button type="button" onClick={() => setShowDashboard((s) => !s)} aria-pressed={showDashboard}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-sm ${showDashboard ? "bg-gradient-to-r from-red-600 to-red-700 shadow-lg shadow-red-500/30" : "bg-slate-700 hover:bg-slate-600"}`}>
              <BarChart3 className="w-4 h-4" /> Dashboard
            </button>
            <button type="button" onClick={() => setForm("new")}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 rounded-lg shadow-lg shadow-red-500/30 transition-all text-sm">
              <Plus className="w-4 h-4" /> Adicionar
            </button>
            <button type="button" onClick={handlePdf} disabled={pdfBusy || !vehicles.length}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 rounded-lg shadow-lg shadow-purple-500/30 transition-all text-sm disabled:opacity-60">
              {pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} PDF
            </button>
            <button type="button" onClick={() => exportInventoryCsv(shown, storeName)} disabled={!shown.length}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-all text-sm disabled:opacity-60" title="Baixar planilha (abre no Excel)">
              <Download className="w-4 h-4" /> Exportar
            </button>
            <button type="button" onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-all text-sm" title="Cadastrar veículos a partir de uma planilha">
              <Upload className="w-4 h-4" /> Importar
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onImportFile(f); }} />
          </div>
        </header>

        {loadError && (
          <div className="mb-6 flex items-center justify-between gap-4 rounded-lg px-4 py-3 bg-red-500/10 border border-red-500/40 text-red-200 text-sm">
            <span>{loadError}</span>
            <button type="button" onClick={load} className="font-semibold">Tentar novamente</button>
          </div>
        )}

        {/* Resumo rápido */}
        <div className="mb-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MiniStat icon={Package} iconClass="text-red-400" label="Em estoque" value={String(available.length)} />
          <MiniStat icon={DollarSign} iconClass="text-green-400" label="Valor total" value={brlK(stockValue)} />
          <MiniStat icon={TrendingUp} iconClass="text-rose-400" label="Vendas no mês" value={monthSales ? String(monthSales.count) : "—"} />
          <MiniStat icon={AlertCircle} iconClass="text-yellow-400" label="Parados +30d" value={String(stalled.length)}
            className={stalled.length ? "border-yellow-500/50 bg-yellow-500/5" : ""} valueClass={stalled.length ? "text-yellow-400" : ""}
            onClick={stalled.length ? () => { setStatus("available"); setSort("days"); } : undefined} />
        </div>

        {showDashboard && (
          <>
            <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <BigStat gradient="from-red-600 to-red-700" icon={Package} value={String(available.length)} label="Em estoque" sub={`${vehicles.length} cadastrados no total`} />
              <BigStat gradient="from-green-500 to-green-600" icon={DollarSign} value={brlK(stockValue)} label="Valor total" sub="preço de venda dos disponíveis" />
              <BigStat gradient="from-rose-600 to-rose-700" icon={TrendingUp} value={monthSales ? String(monthSales.count) : "—"} label="Vendas no mês" sub={monthSales ? brl(monthSales.revenue) : undefined} />
              <BigStat gradient="from-yellow-500 to-orange-500" icon={AlertCircle} value={String(stalled.length)} label="Parados +30 dias" />
              {reserved.length > 0 && <BigStat gradient="from-orange-600 to-orange-700" icon={Calendar} value={String(reserved.length)} label="Reservados" />}
            </div>
            <section className="mb-6 bg-slate-800 rounded-lg p-4 border border-slate-700">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="text-lg flex items-center gap-2"><Store className="w-4 h-4 text-red-400" /> Estoque por filial</h3>
                {canManage && <button type="button" onClick={() => setManagingUnits(true)} className="text-sm text-slate-300 hover:text-white">Gerenciar filiais</button>}
              </div>
              {units.length === 0 ? (
                <p className="text-slate-400 text-sm">
                  Nenhuma filial cadastrada.{" "}
                  {canManage && <button type="button" onClick={() => setManagingUnits(true)} className="text-red-400 hover:underline">Cadastrar filiais</button>}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {units.map((u) => (
                    <button key={u.id} type="button" onClick={() => setUnit(u.id)}
                      className={`text-left bg-slate-900 rounded-lg p-3 border transition-colors ${unit === u.id ? "border-red-500" : "border-slate-700 hover:border-slate-500"}`}>
                      <span className="block text-slate-300 text-xs mb-1">{u.name}</span>
                      <span className="block text-xl mb-1">{u.available}</span>
                      <span className="block text-xs text-slate-400">{brlK(u.availableValue)} em estoque</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {stalled.length > 0 && (
          <div className="mb-6 bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-4 flex flex-wrap items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-[12rem]">
              <h3 className="text-yellow-400 font-semibold mb-1">Veículos parados</h3>
              <p className="text-yellow-200/80 text-sm">
                {stalled.length} {stalled.length === 1 ? "veículo está" : "veículos estão"} no estoque há mais de 30 dias:{" "}
                {stalled.slice(0, 3).map((v) => `${name(v)} (${daysInStock(v.createdAt)} dias)`).join(", ")}
                {stalled.length > 3 && ` e mais ${stalled.length - 3}`}.
              </p>
            </div>
            <button type="button" onClick={() => { setStatus("available"); setSort("days"); }}
              className="text-sm text-yellow-300 hover:text-yellow-100 whitespace-nowrap">Ver parados</button>
          </div>
        )}

        {/* Busca e filtros */}
        <div className="mb-6 flex flex-col gap-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input type="search" placeholder="Buscar por marca, modelo ou placa..." aria-label="Buscar no estoque"
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500" />
            </div>
            <button type="button" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}
              className={`px-6 py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${showFilters || advancedOn ? "bg-red-600 shadow-lg shadow-red-500/40" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
              <SlidersHorizontal className="w-5 h-5" /> Filtros{advancedOn && !showFilters ? " ativos" : ""}
            </button>
          </div>

          {showFilters && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <label className="block">
                <span className="block text-slate-300 text-sm mb-2">Ordenar por</span>
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="w-full px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-red-500">
                  <option value="newest">Mais recentes</option>
                  <option value="oldest">Mais antigos</option>
                  <option value="days">Mais tempo parado</option>
                  <option value="price-asc">Menor preço</option>
                  <option value="price-desc">Maior preço</option>
                  <option value="name">Nome (A-Z)</option>
                </select>
              </label>
              <label className="block">
                <span className="block text-slate-300 text-sm mb-2">Condição</span>
                <select value={condition} onChange={(e) => setCondition(e.target.value as typeof condition)} className="w-full px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-red-500">
                  <option value="all">Todas</option>
                  <option value="zero">Zero km</option>
                  <option value="used">Seminovos</option>
                </select>
              </label>
              <div>
                <span className="block text-slate-300 text-sm mb-2">Faixa de preço (R$)</span>
                <div className="flex items-center gap-2">
                  <input inputMode="numeric" placeholder="De" aria-label="Preço mínimo" value={minPrice} onChange={(e) => setMinPrice(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500" />
                  <input inputMode="numeric" placeholder="Até" aria-label="Preço máximo" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500" />
                </div>
              </div>
              <div className="flex flex-col justify-end gap-2">
                <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
                  <input type="checkbox" checked={onlyFav} onChange={(e) => setOnlyFav(e.target.checked)} className="accent-red-600 w-4 h-4" />
                  Só favoritos ({fav.size})
                </label>
                {advancedOn && (
                  <button type="button" onClick={() => { setSort("newest"); setCondition("all"); setMinPrice(""); setMaxPrice(""); setOnlyFav(false); }}
                    className="text-left text-sm text-red-400 hover:underline">Limpar filtros</button>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Pill on={type === "all"} onClick={() => setType("all")}>Todos ({countType("all")})</Pill>
              {typesPresent.map((t) => <Pill key={t} on={type === t} onClick={() => setType(t)}>{TYPE_LABEL[t]}s ({countType(t)})</Pill>)}
              <span className="hidden md:block w-px h-8 bg-slate-700 mx-1" />
              <Pill on={status === "all"} onClick={() => setStatus("all")}>Todos status</Pill>
              {(["available", "reserved", "sold"] as const).map((s) => <Pill key={s} on={status === s} onClick={() => setStatus(s)}>{STATUS[s].label}</Pill>)}
              <span className="hidden md:block w-px h-8 bg-slate-700 mx-1" />
              {units.length > 0 ? (
                <>
                  <Pill on={unit === "all"} onClick={() => setUnit("all")}><Store className="w-4 h-4" /> Todas filiais</Pill>
                  {units.map((u) => <Pill key={u.id} on={unit === u.id} onClick={() => setUnit(u.id)}>{u.name.replace(/^loja\s+/i, "")}</Pill>)}
                  {vehicles.some((v) => !v.unitId) && <Pill on={unit === "none"} onClick={() => setUnit("none")}>Sem filial</Pill>}
                  {canManage && (
                    <button type="button" onClick={() => setManagingUnits(true)} className="px-3 py-2 text-sm text-slate-400 hover:text-white" title="Cadastrar, renomear ou excluir filiais">
                      Gerenciar
                    </button>
                  )}
                </>
              ) : canManage ? (
                <button type="button" onClick={() => setManagingUnits(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-slate-800 text-slate-300 hover:bg-slate-700">
                  <Store className="w-4 h-4" /> Cadastrar filiais
                </button>
              ) : null}
            </div>
            <div className="flex gap-2" role="group" aria-label="Forma de exibição">
              <button type="button" onClick={() => setView("grid")} aria-pressed={view === "grid"} title="Grade"
                className={`p-3 rounded-lg transition-all ${view === "grid" ? "bg-red-600 shadow-lg shadow-red-500/40" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}><Grid3x3 className="w-5 h-5" /></button>
              <button type="button" onClick={() => setView("list")} aria-pressed={view === "list"} title="Lista"
                className={`p-3 rounded-lg transition-all ${view === "list" ? "bg-red-600 shadow-lg shadow-red-500/40" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}><List className="w-5 h-5" /></button>
            </div>
          </div>
          <p className="text-slate-400 text-sm">
            {loading && !vehicles.length ? "Carregando estoque..." : `Mostrando ${shown.length} de ${vehicles.length} veículos`}
            {total > vehicles.length && ` (os ${vehicles.length} mais recentes de ${total})`}
          </p>
        </div>

        {/* Veículos */}
        {!loading && shown.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-slate-300 text-lg">{vehicles.length ? "Nenhum veículo com esses filtros." : "Seu estoque está vazio."}</p>
            <button type="button" onClick={() => (vehicles.length ? (setType("all"), setStatus("all"), setUnit("all"), setSearch(""), setOnlyFav(false), setCondition("all"), setMinPrice(""), setMaxPrice("")) : setForm("new"))}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-sm">
              {vehicles.length ? "Mostrar todos" : <><Plus className="w-4 h-4" /> Adicionar o primeiro veículo</>}
            </button>
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
            {shown.map((v) => (
              <VehicleCard key={v.id} v={v} favorite={fav.has(v.id)} onFav={() => toggleFav(v.id)}
                onOpen={() => setDetails(v)} onSell={() => setSelling(v)} onReserve={() => setReserving(v)}
                onShare={() => shareWhatsApp(v)} onEdit={() => setForm(v)} onDelete={() => handleDelete(v)} />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {shown.map((v) => (
              <VehicleRow key={v.id} v={v} favorite={fav.has(v.id)} onFav={() => toggleFav(v.id)}
                onOpen={() => setDetails(v)} onSell={() => setSelling(v)} onReserve={() => setReserving(v)}
                onShare={() => shareWhatsApp(v)} onEdit={() => setForm(v)} onDelete={() => handleDelete(v)} />
            ))}
          </div>
        )}
      </div>

      <VehicleDetailsModal
        vehicle={details as unknown as VehicleDetails | null}
        onClose={() => setDetails(null)}
        onChanged={load}
        onEdit={(v) => { setDetails(null); setForm(v as unknown as api.Vehicle); }} />
      {form !== null && (
        <FormModal key={form === "new" ? "new" : form.id} initial={form === "new" ? null : form}
          onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />
      )}
      {reserving && (
        <ReservationModal vehicle={reserving} canManage={canManage} onClose={() => setReserving(null)}
          onChanged={() => { setReserving(null); load(); }} />
      )}
      {selling && (
        <NewSaleModal prefill={{ vehicleId: selling.id }} onClose={() => setSelling(null)} onSaved={() => { setSelling(null); load(); }} />
      )}
      {managingUnits && <UnitsModal units={units} onClose={() => setManagingUnits(false)} onChanged={load} />}
      {importing && <ImportModal rows={importing} onClose={() => setImporting(null)} onDone={() => { setImporting(null); load(); }} />}
    </div>
  );
}

// ---------------- Peças da tela ----------------
function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${on ? "bg-red-600 text-white shadow-lg shadow-red-500/40" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
      {children}
    </button>
  );
}

function MiniStat({ icon: Icon, iconClass, label, value, className = "", valueClass = "", onClick }: {
  icon: typeof Package; iconClass: string; label: string; value: string; className?: string; valueClass?: string; onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick}
      className={`flex items-center justify-between gap-3 bg-slate-800/80 border border-slate-700 rounded-lg px-4 py-3 text-left ${onClick ? "hover:border-yellow-400/70" : ""} ${className}`}>
      <span className="flex items-center gap-2 text-slate-400 text-sm min-w-0"><Icon className={`w-4 h-4 flex-shrink-0 ${iconClass}`} /><span className="truncate">{label}</span></span>
      <span className={`text-lg font-bold whitespace-nowrap ${valueClass}`}>{value}</span>
    </Tag>
  );
}

function BigStat({ gradient, icon: Icon, value, label, sub }: { gradient: string; icon: typeof Package; value: string; label: string; sub?: string }) {
  return (
    <div className={`bg-gradient-to-br ${gradient} rounded-lg p-4 shadow-xl`}>
      <div className="flex items-center justify-between mb-1">
        <Icon className="w-6 h-6 opacity-80" />
        <span className="text-2xl font-bold">{value}</span>
      </div>
      <p className="text-white/85 text-sm">{label}</p>
      {sub && <p className="text-xs text-white/70 mt-1">{sub}</p>}
    </div>
  );
}

type CardProps = {
  v: api.Vehicle; favorite: boolean; onFav: () => void; onOpen: () => void; onSell: () => void;
  onReserve: () => void; onShare: () => void; onEdit: () => void; onDelete: () => void;
};

function Badges({ v }: { v: api.Vehicle }) {
  if (isStalled(v)) return <span className="px-3 py-1 rounded-full bg-yellow-500 text-slate-900 text-xs font-bold flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Parado {daysInStock(v.createdAt)}d</span>;
  if (isNew(v)) return <span className="px-3 py-1 rounded-full bg-green-500 text-white text-xs font-bold flex items-center gap-1"><Star className="w-3 h-3" /> Novo</span>;
  return null;
}

function Photo({ v, className }: { v: api.Vehicle; className: string }) {
  const Icon = TYPE_ICON[v.type] ?? Car;
  const src = cover(v);
  return src
    ? <img src={src} alt="" loading="lazy" className={`${className} object-cover`} />
    : <span className={`${className} flex items-center justify-center text-slate-600`}><Icon className="w-14 h-14" /></span>;
}

// Mesma conta que a tela antiga do Estoque usava: lucro sobre o custo
function margin(v: api.Vehicle) {
  const p = Number(v.price), c = Number(v.cost);
  return c > 0 ? ((p - c) / c) * 100 : 0;
}
const marginClass = (m: number) => (m > 30 ? "text-green-400" : m > 20 ? "text-slate-300" : "text-red-400");

function DocWarnings({ v }: { v: api.Vehicle }) {
  const problems = docProblems(v.docStatus);
  if (!problems.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mb-3">
      {problems.map((p) => <span key={p} className="px-2 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/40 text-[11px] font-semibold">{p}</span>)}
    </div>
  );
}

function VehicleCard({ v, favorite, onFav, onOpen, onSell, onReserve, onShare, onEdit, onDelete }: CardProps) {
  const st = STATUS[v.status];
  const m = margin(v);
  return (
    <article className={`bg-slate-800 rounded-xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-300 motion-safe:hover:-translate-y-1 border border-slate-700 border-l-4 ${st.bar} relative flex flex-col`}>
      <div className="absolute top-3 left-3 z-10"><Badges v={v} /></div>
      <button type="button" onClick={onFav} aria-pressed={favorite} aria-label={favorite ? "Tirar dos favoritos" : "Marcar como favorito"}
        className="absolute top-3 right-3 p-2 rounded-full bg-slate-900/90 backdrop-blur-sm z-10 hover:scale-110 transition-transform">
        <Heart className={`w-5 h-5 ${favorite ? "fill-red-500 text-red-500" : "text-white"}`} />
      </button>
      <button type="button" onClick={onOpen} className="relative block h-48 overflow-hidden bg-slate-900" aria-label={`Abrir ${name(v)}`}>
        <Photo v={v} className="w-full h-full" />
        <span className="absolute bottom-3 left-3 right-3 flex gap-2">
          <span className={`px-3 py-1 rounded-full backdrop-blur-sm text-xs border ${st.chip}`}>{st.label}</span>
          <span className="px-3 py-1 rounded-full bg-slate-900/90 backdrop-blur-sm text-xs text-red-400">{TYPE_LABEL[v.type] ?? v.type}</span>
          {v.unit && <span className="px-3 py-1 rounded-full bg-slate-900/90 backdrop-blur-sm text-xs text-slate-200 truncate">{v.unit.name}</span>}
        </span>
      </button>

      <div className="p-5 flex flex-col flex-1">
        <h3 className="text-xl mb-1 leading-snug">{name(v)}</h3>
        <p className="text-slate-400 text-sm mb-1">{[v.version, yearLabel(v), v.km === 0 ? "Zero km" : "Seminovo"].filter(Boolean).join(" • ")}</p>
        <p className="text-slate-500 text-xs mb-3">
          {[v.color, v.type === "other" ? null : `${v.km.toLocaleString("pt-BR")} km`, v.plate, `${daysInStock(v.createdAt)} dias no estoque`].filter(Boolean).join(" • ")}
        </p>
        <DocWarnings v={v} />
        <div className="mt-auto">
          <div className="flex items-end justify-between gap-2 mb-4">
            <span className="text-2xl text-red-400 font-semibold">{brl(Number(v.price))}</span>
            <span className="text-xs text-slate-400 text-right" title="Custo e margem: só gestores veem">
              custo {brl(Number(v.cost))}<br />
              <span className={marginClass(m)}>margem {m.toFixed(1)}%</span>
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button type="button" onClick={onOpen} className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors text-sm">Ver mais</button>
              {v.status !== "sold" && <button type="button" onClick={onSell} className="px-4 py-2 bg-green-500 hover:bg-green-600 rounded-lg transition-colors text-sm">Vender</button>}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onShare} className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors text-sm flex items-center justify-center gap-1">
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </button>
              {v.status !== "sold" && (
                <button type="button" onClick={onReserve} title={v.status === "reserved" ? "Ver reserva" : "Reservar (sinal)"} aria-label={v.status === "reserved" ? "Ver reserva" : "Reservar"}
                  className={`p-2 rounded-lg transition-colors ${v.status === "reserved" ? "bg-yellow-500 text-slate-900 hover:bg-yellow-400" : "bg-slate-700 hover:bg-slate-600"}`}><Bookmark className="w-5 h-5" /></button>
              )}
              <button type="button" onClick={onEdit} title="Editar" aria-label="Editar" className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"><Edit2 className="w-5 h-5" /></button>
              <button type="button" onClick={onDelete} title="Excluir" aria-label="Excluir" className="p-2 bg-red-500 hover:bg-red-600 rounded-lg transition-colors"><Trash2 className="w-5 h-5" /></button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function VehicleRow({ v, favorite, onFav, onOpen, onSell, onReserve, onShare, onEdit, onDelete }: CardProps) {
  const st = STATUS[v.status];
  const m = margin(v);
  return (
    <article className={`bg-slate-800 rounded-xl overflow-hidden shadow-xl border border-slate-700 border-l-4 ${st.bar} hover:border-slate-500 transition-colors`}>
      <div className="flex flex-col md:flex-row">
        <button type="button" onClick={onOpen} className="relative md:w-64 h-48 md:h-auto md:min-h-44 overflow-hidden bg-slate-900 flex-shrink-0" aria-label={`Abrir ${name(v)}`}>
          <Photo v={v} className="absolute inset-0 w-full h-full" />
          <span className="absolute top-3 left-3"><Badges v={v} /></span>
        </button>
        <div className="flex-1 p-5 flex flex-col lg:flex-row justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-3 mb-1">
              <h3 className="text-2xl">{name(v)}</h3>
              <button type="button" onClick={onFav} aria-pressed={favorite} aria-label={favorite ? "Tirar dos favoritos" : "Marcar como favorito"} className="p-1 mt-1 hover:scale-110 transition-transform">
                <Heart className={`w-5 h-5 ${favorite ? "fill-red-500 text-red-500" : "text-slate-400"}`} />
              </button>
            </div>
            <p className="text-slate-400 mb-1">{[v.version, yearLabel(v), TYPE_LABEL[v.type], v.km === 0 ? "Zero km" : "Seminovo"].filter(Boolean).join(" • ")}</p>
            <p className="text-slate-500 text-sm mb-3">
              {[v.color, v.type === "other" ? null : `${v.km.toLocaleString("pt-BR")} km`, v.unit?.name, v.plate ? `Placa ${v.plate}` : null, `${daysInStock(v.createdAt)} dias no estoque`].filter(Boolean).join(" • ")}
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              <span className={`px-3 py-1 rounded-full text-xs border ${st.chip}`}>{st.label}</span>
            </div>
            <DocWarnings v={v} />
            <span className="text-3xl text-red-400 font-semibold">{brl(Number(v.price))}</span>
            <span className="ml-3 text-sm text-slate-400">custo {brl(Number(v.cost))} · <span className={marginClass(m)}>margem {m.toFixed(1)}%</span></span>
          </div>
          <div className="flex lg:flex-col gap-2 flex-wrap lg:w-44">
            <button type="button" onClick={onOpen} className="flex-1 lg:flex-none px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm">Ver mais</button>
            {v.status !== "sold" && <button type="button" onClick={onSell} className="flex-1 lg:flex-none px-4 py-2 bg-green-500 hover:bg-green-600 rounded-lg text-sm">Vender</button>}
            <button type="button" onClick={onShare} className="flex-1 lg:flex-none px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm flex items-center justify-center gap-1"><MessageCircle className="w-4 h-4" /> WhatsApp</button>
            <div className="flex gap-2">
              {v.status !== "sold" && (
                <button type="button" onClick={onReserve} title={v.status === "reserved" ? "Ver reserva" : "Reservar (sinal)"} aria-label="Reserva"
                  className={`flex-1 p-2 rounded-lg flex justify-center ${v.status === "reserved" ? "bg-yellow-500 text-slate-900" : "bg-slate-700 hover:bg-slate-600"}`}><Bookmark className="w-5 h-5" /></button>
              )}
              <button type="button" onClick={onEdit} title="Editar" aria-label="Editar" className="flex-1 p-2 bg-slate-700 hover:bg-slate-600 rounded-lg flex justify-center"><Edit2 className="w-5 h-5" /></button>
              <button type="button" onClick={onDelete} title="Excluir" aria-label="Excluir" className="flex-1 p-2 bg-red-500 hover:bg-red-600 rounded-lg flex justify-center"><Trash2 className="w-5 h-5" /></button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

// ---------------- Janelas ----------------
function DarkModal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true" aria-label={title}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-slate-800 text-white rounded-xl w-full max-w-xl border border-slate-700 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h2 className="text-xl">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-slate-400 hover:text-white"><X className="w-6 h-6" /></button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
        {footer && <div className="p-5 border-t border-slate-700 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

function UnitsModal({ units, onClose, onChanged }: { units: api.StoreUnit[]; onClose: () => void; onChanged: () => void }) {
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = "w-full px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-red-500";

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await fn(); onChanged(); return true; }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar"); return false; }
    finally { setBusy(false); }
  };

  return (
    <DarkModal title="Filiais" onClose={onClose}>
      <p className="text-slate-400 text-sm mb-4">Cadastre as unidades da loja. Depois, escolha a filial de cada veículo no cadastro dele.</p>
      {error && <p className="mb-3 text-sm text-red-300 bg-red-500/10 border border-red-500/40 rounded-lg px-3 py-2">{error}</p>}
      <div className="space-y-2 mb-5">
        {units.length === 0 && <p className="text-slate-500 text-sm">Nenhuma filial ainda.</p>}
        {units.map((u) => editing === u.id ? (
          <div key={u.id} className="bg-slate-900 rounded-lg p-3 border border-slate-600 space-y-2">
            <input className={input} value={editName} onChange={(e) => setEditName(e.target.value)} aria-label="Nome da filial" />
            <input className={input} value={editAddress} onChange={(e) => setEditAddress(e.target.value)} placeholder="Endereço (opcional)" aria-label="Endereço" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="px-3 py-2 text-sm text-slate-300">Cancelar</button>
              <button type="button" disabled={busy} onClick={async () => { if (await run(() => api.updateUnit(u.id, { name: editName, address: editAddress }))) setEditing(null); }}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-sm disabled:opacity-60">Salvar</button>
            </div>
          </div>
        ) : (
          <div key={u.id} className="flex items-center justify-between gap-3 bg-slate-900 rounded-lg p-3 border border-slate-700">
            <div className="min-w-0">
              <p className="font-medium truncate">{u.name}</p>
              <p className="text-xs text-slate-400 truncate">{[u.address, `${u.available} disponíveis`].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <button type="button" onClick={() => { setEditing(u.id); setEditName(u.name); setEditAddress(u.address ?? ""); }} title="Renomear" aria-label={`Editar ${u.name}`}
                className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600"><Edit2 className="w-4 h-4" /></button>
              <button type="button" disabled={busy} title="Excluir" aria-label={`Excluir ${u.name}`}
                onClick={() => window.confirm(`Excluir a filial ${u.name}? Os veículos dela continuam no estoque, sem filial.`) && run(() => api.deleteUnit(u.id))}
                className="p-2 rounded-lg bg-red-500 hover:bg-red-600"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={async (e) => { e.preventDefault(); if (newName.trim().length < 2) { setError("Informe o nome da filial."); return; } if (await run(() => api.createUnit({ name: newName, address: newAddress || undefined }))) { setNewName(""); setNewAddress(""); } }}
        className="space-y-2">
        <p className="text-sm text-slate-300">Nova filial</p>
        <input className={input} placeholder="Nome, ex.: Loja Centro" value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="Nome da nova filial" />
        <input className={input} placeholder="Endereço (opcional)" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} aria-label="Endereço da nova filial" />
        <button type="submit" disabled={busy} className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" /> Cadastrar filial
        </button>
      </form>
    </DarkModal>
  );
}

function ImportModal({ rows, onClose, onDone }: { rows: ImportRow[]; onClose: () => void; onDone: () => void }) {
  const ok = rows.filter((r) => r.input);
  const bad = rows.filter((r) => r.error);
  const [progress, setProgress] = useState<{ done: number; failed: { label: string; error: string }[] } | null>(null);
  const finished = progress && progress.done + progress.failed.length === ok.length;

  const start = async () => {
    const failed: { label: string; error: string }[] = [];
    let done = 0;
    setProgress({ done, failed });
    // Um por vez: respeita o limite do plano e mostra o andamento
    for (const r of ok) {
      try { await api.createVehicle(r.input!); done++; }
      catch (e) { failed.push({ label: r.label, error: e instanceof Error ? e.message : "erro" }); }
      setProgress({ done, failed: [...failed] });
    }
  };

  return (
    <DarkModal title="Importar planilha" onClose={progress && !finished ? () => {} : finished ? onDone : onClose}
      footer={finished ? (
        <button type="button" onClick={onDone} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-sm">Concluir</button>
      ) : !progress ? (
        <>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:text-white">Cancelar</button>
          <button type="button" onClick={start} disabled={!ok.length} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-sm disabled:opacity-50">
            Cadastrar {ok.length} {ok.length === 1 ? "veículo" : "veículos"}
          </button>
        </>
      ) : null}>
      {!progress ? (
        <>
          <p className="text-slate-300 text-sm mb-3">
            {ok.length} {ok.length === 1 ? "veículo pronto" : "veículos prontos"} para cadastrar como disponíveis.
            {bad.length > 0 && ` ${bad.length} ${bad.length === 1 ? "linha será ignorada" : "linhas serão ignoradas"}.`}
          </p>
          <p className="text-slate-500 text-xs mb-4">Use a mesma planilha do botão Exportar. Colunas obrigatórias: Marca, Modelo, Ano modelo e Preço. A filial precisa ter o nome igual ao cadastrado.</p>
          {(bad.length > 0 || ok.some((r) => r.warning)) && (
            <ul className="space-y-1 text-sm">
              {bad.map((r) => <li key={r.line} className="text-red-300"><span className="text-slate-400">Linha {r.line} · {r.label}:</span> {r.error}</li>)}
              {ok.filter((r) => r.warning).map((r) => <li key={r.line} className="text-yellow-300"><span className="text-slate-400">Linha {r.line} · {r.label}:</span> {r.warning}</li>)}
            </ul>
          )}
        </>
      ) : (
        <>
          <p className="text-slate-200 mb-2">{finished ? "Importação concluída." : "Cadastrando..."} {progress.done} de {ok.length} cadastrados.</p>
          <div className="h-2 rounded-full bg-slate-900 overflow-hidden mb-4">
            <div className="h-full bg-red-600 transition-all" style={{ width: `${((progress.done + progress.failed.length) / Math.max(ok.length, 1)) * 100}%` }} />
          </div>
          {progress.failed.length > 0 && (
            <ul className="space-y-1 text-sm">
              {progress.failed.map((f, i) => <li key={i} className="text-red-300"><span className="text-slate-400">{f.label}:</span> {f.error}</li>)}
            </ul>
          )}
        </>
      )}
    </DarkModal>
  );
}
