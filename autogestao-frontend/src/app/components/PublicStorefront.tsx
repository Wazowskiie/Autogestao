// Site público da loja (catálogo). Visual baseado no "Modo Vitrine" do modelo
// "Catalogo de Motos e Carros" (Figma Make): fundo escuro, cartões com foto grande,
// quilometragem/cor/ano em destaque e botões "Ver detalhes" e "WhatsApp".
// A cor de destaque é a cor da loja (Configurações), clareada para ler bem no fundo escuro.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search, Car, Bike, Truck, MapPin, X, Gauge, Calendar, Palette, MessageCircle, ChevronLeft, ChevronRight,
  Fuel, Settings2, DoorOpen, Instagram, Facebook, Youtube, Music2, Globe, Sparkles,
} from "lucide-react";
import * as api from "../../lib/api";
import { CustomerChat } from "./CustomerChat";

function currency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

const TYPES = [
  { id: "all", label: "Todos", icon: null },
  { id: "moto", label: "Motos", icon: Bike },
  { id: "car", label: "Carros", icon: Car },
  { id: "truck", label: "Utilitários", icon: Truck },
] as const;

const typeIcon = (t: string) => (t === "moto" ? Bike : t === "truck" ? Truck : Car);
const typeLabel = (t: string) => (t === "moto" ? "Moto" : t === "truck" ? "Utilitário" : t === "car" ? "Carro" : "Veículo");

/** Versão clara e viva da cor da loja, para preço e destaques lerem bem no fundo escuro */
function lighten(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const sat = d ? d / (1 - Math.abs(max + min - 1)) : 0;
  // mesmo tom, saturação alta e claridade de ~68% (tons de cinza continuam cinza)
  return `hsl(${Math.round(h * 60 + 360) % 360} ${Math.round(Math.max(sat, d ? 0.75 : 0) * 100)}% 68%)`;
}

// Número que atende no WhatsApp: o cadastrado em "WhatsApp e redes sociais" ou o telefone da loja
const storeWhatsapp = (d: api.StorefrontDealership | null) => {
  const n = (d?.whatsapp || d?.phone || "").replace(/\D/g, "");
  return n ? `55${n.replace(/^55(?=\d{10,11}$)/, "")}` : null;
};
const whatsappLink = (d: api.StorefrontDealership | null, v?: api.StorefrontVehicle) => {
  const n = storeWhatsapp(d);
  if (!n) return null;
  if (!v) return `https://wa.me/${n}`;
  const link = `${window.location.origin}${window.location.pathname}?v=${v.id}`;
  const text = `Olá! Tenho interesse no ${vehicleName(v)} ${v.year} (${currency(Number(v.price))}) que vi no site da ${d?.name ?? "loja"}: ${link}`;
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
};

const vehicleName = (v: api.StorefrontVehicle) => [v.brand, v.model, v.version].filter(Boolean).join(" ");
const yearLabel = (v: api.StorefrontVehicle) => (v.manufactureYear && v.manufactureYear !== v.year ? `${v.manufactureYear}/${v.year}` : String(v.year));
const kmLabel = (km: number) => (km === 0 ? "0 km" : `${km.toLocaleString("pt-BR")} km`);
const photosOf = (v: api.StorefrontVehicle) => [...(v.photos ?? [])].sort((a, b) => a.order - b.order);
// "Chegou agora": entrou no estoque nos últimos 7 dias
const isNew = (v: api.StorefrontVehicle) => Date.now() - new Date(v.createdAt).getTime() < 7 * 86400000;

function SocialIcons({ dealership }: { dealership: api.StorefrontDealership | null }) {
  const s = dealership?.social;
  if (!s) return null;
  const items = [
    { url: s.instagram, icon: Instagram, label: "Instagram" }, { url: s.facebook, icon: Facebook, label: "Facebook" },
    { url: s.tiktok, icon: Music2, label: "TikTok" }, { url: s.youtube, icon: Youtube, label: "YouTube" }, { url: s.website, icon: Globe, label: "Site" },
  ].filter((i) => i.url);
  if (!items.length) return null;
  return (
    <div className="flex items-center gap-2">
      {items.map(({ url, icon: Icon, label }) => (
        <a key={label} href={url!} target="_blank" rel="noreferrer" title={label} aria-label={label}
          className="flex items-center justify-center rounded-full bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
          style={{ width: 36, height: 36 }}>
          <Icon size={16} />
        </a>
      ))}
    </div>
  );
}

function StoreLogo({ dealership, accent, size }: { dealership: api.StorefrontDealership | null; accent: string; size: number }) {
  if (dealership?.logoUrl) {
    return <img src={dealership.logoUrl} alt={dealership.name} className="object-cover rounded-xl flex-shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <div className="flex items-center justify-center rounded-xl flex-shrink-0" style={{ width: size, height: size, background: accent }}>
      <Car size={size * 0.45} color="#fff" />
    </div>
  );
}

export function PublicStorefront({ slug }: { slug: string; onNavigate?: (page: string) => void }) {
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
      .then((d) => { setDealership(d); document.title = d.name; })
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

  // Link direto de um veículo (?v=id), usado nas mensagens do WhatsApp
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("v");
    if (!id) return;
    api.getStorefrontVehicle(slug, id).then(setSelected).catch(() => {});
  }, [slug]);

  const primary = dealership?.primaryColor || "#DC2626";
  const accentText = useMemo(() => lighten(primary), [primary]);
  const wa = whatsappLink(dealership);
  const place = [dealership?.city, dealership?.state].filter(Boolean).join(" - ");

  if (error && !dealership) {
    return (
      <div className="size-full flex items-center justify-center bg-slate-900 px-6">
        <div className="text-center">
          <h2 className="text-white text-xl font-semibold mb-2">Loja não encontrada</h2>
          <p className="text-slate-400 text-sm">Confira o endereço e tente de novo.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="size-full overflow-y-auto bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="mx-auto px-4 sm:px-6 py-6" style={{ maxWidth: 1200 }}>
        {/* Cabeçalho da loja */}
        <header className="mb-8">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
            <div className="flex items-center gap-4 min-w-0">
              <StoreLogo dealership={dealership} accent={primary} size={56} />
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-white truncate">{dealership?.name ?? "Carregando..."}</h1>
                <div className="flex items-center gap-x-3 gap-y-1 mt-0.5 flex-wrap">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-400 motion-safe:animate-pulse" />
                    <span className="text-green-400 text-sm font-medium">
                      {loading && !vehicles.length ? "Carregando estoque" : `${total} ${total === 1 ? "veículo disponível" : "veículos disponíveis"}`}
                    </span>
                  </span>
                  {place && (
                    <span className="flex items-center gap-1 text-slate-400 text-sm"><MapPin size={13} />{place}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <SocialIcons dealership={dealership} />
              {wa && (
                <a href={wa} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-medium transition-colors">
                  <MessageCircle size={16} /> Falar no WhatsApp
                </a>
              )}
            </div>
          </div>

          {/* Busca */}
          <div className="relative max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="search"
              placeholder="Buscar marca ou modelo..."
              aria-label="Buscar marca ou modelo"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2"
              style={{ ["--tw-ring-color" as string]: primary }}
            />
          </div>

          {/* Tipo */}
          <div className="flex gap-2 mt-3 flex-wrap" role="group" aria-label="Tipo de veículo">
            {TYPES.map(({ id, label, icon: Icon }) => {
              const on = typeFilter === id;
              return (
                <button key={id} type="button" onClick={() => setTypeFilter(id)} aria-pressed={on}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${on ? "text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
                  style={on ? { background: primary } : undefined}>
                  {Icon && <Icon size={15} />} {label}
                </button>
              );
            })}
          </div>
        </header>

        {/* Catálogo */}
        {loading && !vehicles.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" aria-hidden="true">
            {[0, 1, 2].map((i) => <div key={i} className="h-[440px] rounded-2xl bg-slate-800/70 border border-slate-700 motion-safe:animate-pulse" />)}
          </div>
        ) : vehicles.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-slate-300 text-lg">Nenhum veículo encontrado.</p>
            <p className="text-slate-500 text-sm mt-1">
              {search || typeFilter !== "all" ? "Tente outra busca ou mostre todos os tipos." : "Volte em breve: o estoque é atualizado toda semana."}
            </p>
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 mt-5 px-4 py-2.5 bg-green-500 hover:bg-green-600 rounded-xl text-sm font-medium">
                <MessageCircle size={16} /> Perguntar no WhatsApp
              </a>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {vehicles.map((v) => (
              <VehicleCard key={v.id} vehicle={v} accentText={accentText} primary={primary}
                whatsapp={whatsappLink(dealership, v)} onOpen={() => setSelected(v)} />
            ))}
          </div>
        )}
      </div>

      {/* Rodapé */}
      <footer className="border-t border-slate-800 mt-6 px-4 sm:px-6 pt-8" style={{ paddingBottom: 104 }}>
        <div className="mx-auto flex items-center justify-between gap-4 flex-wrap" style={{ maxWidth: 1200 }}>
          <div className="flex items-center gap-3">
            <StoreLogo dealership={dealership} accent={primary} size={40} />
            <div>
              <p className="text-white font-semibold text-sm">{dealership?.name}</p>
              <p className="text-slate-400 text-xs">
                {[place || null, storeWhatsapp(dealership) ? `WhatsApp ${(dealership?.whatsapp || dealership?.phone || "").replace(/\D/g, "").replace(/(\d{2})(\d{4,5})(\d{4})/, "($1) $2-$3")}` : null].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          <SocialIcons dealership={dealership} />
        </div>
      </footer>

      {selected && (
        <VehicleDetailModal vehicle={selected} dealership={dealership} primary={primary} accentText={accentText} slug={slug} onClose={() => setSelected(null)} />
      )}
      {dealership && dealership.chatEnabled !== false && <CustomerChat slug={slug} vehicles={vehicles} />}
    </div>
  );
}

function VehicleCard({ vehicle: v, primary, accentText, whatsapp, onOpen }: {
  vehicle: api.StorefrontVehicle; primary: string; accentText: string; whatsapp: string | null; onOpen: () => void;
}) {
  const Icon = typeIcon(v.type);
  const photo = photosOf(v)[0]?.url;
  return (
    <article className="bg-slate-800 rounded-2xl overflow-hidden border border-slate-700 transition-all duration-300 group shadow-xl hover:shadow-2xl motion-safe:hover:-translate-y-1"
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = `${primary}66`)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "")}>
      <button type="button" onClick={onOpen} className="relative block w-full h-56 overflow-hidden bg-slate-900" aria-label={`Ver detalhes do ${vehicleName(v)}`}>
        {photo ? (
          <img src={photo} alt="" loading="lazy" className="w-full h-full object-cover motion-safe:group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <span className="flex w-full h-full items-center justify-center text-slate-600"><Icon size={56} /></span>
        )}
        <span className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent" />
        <span className="absolute top-3 left-3 flex gap-2">
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-900/80 backdrop-blur-sm text-xs font-semibold border"
            style={{ color: accentText, borderColor: `${primary}55` }}>
            <Icon size={13} /> {typeLabel(v.type)}
          </span>
          {isNew(v) && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-500 text-white text-xs font-bold">
              <Sparkles size={12} /> Chegou agora
            </span>
          )}
        </span>
        <span className="absolute bottom-3 right-3 px-3 py-1 rounded-full bg-slate-900/80 backdrop-blur-sm text-xs text-slate-300 border border-slate-700">
          {v.km === 0 ? "Zero km" : "Seminovo"}
        </span>
      </button>

      <div className="p-5">
        <h3 className="text-lg font-bold text-white mb-0.5 leading-snug">{v.brand} {v.model}</h3>
        <p className="text-slate-400 text-sm mb-4 truncate">{[v.version, yearLabel(v)].filter(Boolean).join(" · ")}</p>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <Spec icon={Gauge} value={kmLabel(v.km)} label="Quilometragem" />
          <Spec icon={Palette} value={v.color || "—"} label="Cor" />
          <Spec icon={Calendar} value={yearLabel(v)} label="Ano" />
        </div>

        <div className="text-2xl font-bold mb-4" style={{ color: accentText }}>{currency(Number(v.price))}</div>

        <div className="flex gap-2">
          <button type="button" onClick={onOpen}
            className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-medium transition-colors">
            Ver detalhes
          </button>
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noreferrer"
              className="flex-1 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-1.5">
              <MessageCircle size={16} /> WhatsApp
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

function Spec({ icon: Icon, value, label }: { icon: typeof Gauge; value: string; label: string }) {
  return (
    <div className="bg-slate-900 rounded-xl p-2.5 text-center" title={label}>
      <Icon className="w-3.5 h-3.5 text-slate-500 mx-auto mb-1" aria-hidden="true" />
      <p className="text-white text-xs font-semibold truncate"><span className="sr-only">{label}: </span>{value}</p>
    </div>
  );
}

function phoneMask(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Formulário "Tenho interesse": o pedido cai no CRM da loja */
function InterestForm({ slug, vehicle, primary }: { slug: string; vehicle: api.StorefrontVehicle; primary: string }) {
  const [kind, setKind] = useState<"interest" | "financing" | "visit">("interest");
  const [name, setName] = useState(""), [phone, setPhone] = useState(""), [tradeIn, setTradeIn] = useState(""), [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle"), [error, setError] = useState("");
  const input = "w-full px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-slate-500";
  if (state === "sent") return (
    <div className="mt-5 rounded-xl p-4 text-center bg-green-500/10 border border-green-500/40">
      <p className="text-green-300 font-semibold">Recebemos seu pedido</p>
      <p className="text-slate-300 text-sm mt-1">Um vendedor vai falar com você pelo WhatsApp em breve.</p>
    </div>
  );
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    if (name.trim().length < 2) { setError("Informe seu nome."); return; }
    if (phone.replace(/\D/g, "").length < 10) { setError("Informe seu WhatsApp com DDD."); return; }
    setState("sending");
    try {
      await api.sendStorefrontLead(slug, { name: name.trim(), phone, vehicleId: vehicle.id, kind, tradeIn: tradeIn.trim() || undefined, message: message.trim() || undefined, website: website || undefined });
      setState("sent");
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível enviar."); setState("idle"); }
  };
  return (
    <form onSubmit={send} className="mt-5 rounded-xl p-4 bg-slate-900/60 border border-slate-700">
      <p className="text-white font-semibold mb-3">Quero ser atendido</p>
      <div className="flex gap-2 flex-wrap mb-3">
        {([["interest", "Mais informações"], ["financing", "Simular financiamento"], ["visit", "Agendar visita"]] as const).map(([k, l]) => (
          <button type="button" key={k} onClick={() => setKind(k)} aria-pressed={kind === k}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${kind === k ? "text-white" : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"}`}
            style={kind === k ? { background: primary, borderColor: primary } : undefined}>{l}</button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input className={input} placeholder="Seu nome" aria-label="Seu nome" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        <input className={input} placeholder="WhatsApp com DDD" aria-label="WhatsApp com DDD" inputMode="tel" value={phone} onChange={(e) => setPhone(phoneMask(e.target.value))} />
      </div>
      <input className={`${input} mt-2`} placeholder="Tem veículo para dar na troca? Qual? (opcional)" aria-label="Veículo na troca" value={tradeIn} onChange={(e) => setTradeIn(e.target.value)} maxLength={200} />
      <textarea className={`${input} mt-2 resize-y`} rows={2} placeholder="Mensagem (opcional)" aria-label="Mensagem" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} />
      {/* Campo escondido contra robôs */}
      <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={(e) => setWebsite(e.target.value)} style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} name="website" />
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      <button disabled={state === "sending"} className="w-full mt-3 py-3 rounded-xl text-white text-sm font-semibold transition-opacity disabled:opacity-70" style={{ background: primary }}>
        {state === "sending" ? "Enviando..." : "Enviar pedido"}
      </button>
      <p className="text-slate-500 text-[11px] mt-2 text-center">Seus dados são usados só para a loja falar com você sobre este veículo.</p>
    </form>
  );
}

function VehicleDetailModal({ vehicle: v, dealership, primary, accentText, slug, onClose }: {
  vehicle: api.StorefrontVehicle; dealership: api.StorefrontDealership | null; primary: string; accentText: string; slug: string; onClose: () => void;
}) {
  const Icon = typeIcon(v.type);
  const photos = photosOf(v);
  const [idx, setIdx] = useState(0);
  const wa = whatsappLink(dealership, v);
  const go = (d: number) => setIdx((i) => (i + d + photos.length) % photos.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (photos.length > 1 && e.key === "ArrowRight") go(1);
      if (photos.length > 1 && e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const facts: [typeof Gauge, string, string | null][] = [
    [Gauge, "Quilometragem", kmLabel(v.km)],
    [Calendar, "Ano", yearLabel(v)],
    [Palette, "Cor", v.color ?? null],
    [Fuel, "Combustível", v.fuel ?? null],
    [Settings2, "Câmbio", v.transmission ?? null],
    [DoorOpen, "Portas", v.doors ? String(v.doors) : null],
  ];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true" aria-label={vehicleName(v)}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-slate-800 rounded-2xl w-full border border-slate-700 overflow-hidden flex flex-col" style={{ maxWidth: 760, maxHeight: "92vh" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 flex-shrink-0">
          <h2 className="text-lg font-semibold text-white truncate pr-4">{vehicleName(v)}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-slate-400 hover:text-white p-1 rounded-lg"><X size={22} /></button>
        </div>

        <div className="overflow-y-auto p-5">
          {/* Galeria */}
          <div className="relative h-64 sm:h-80 rounded-xl overflow-hidden bg-slate-900">
            {photos.length ? (
              <img src={photos[idx]?.url} alt={`${vehicleName(v)}, foto ${idx + 1} de ${photos.length}`} className="w-full h-full object-contain" />
            ) : (
              <span className="flex w-full h-full items-center justify-center text-slate-600"><Icon size={72} /></span>
            )}
            {photos.length > 1 && (
              <>
                <button type="button" onClick={() => go(-1)} aria-label="Foto anterior"
                  className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-900/80 hover:bg-slate-900 text-white"><ChevronLeft size={20} /></button>
                <button type="button" onClick={() => go(1)} aria-label="Próxima foto"
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-900/80 hover:bg-slate-900 text-white"><ChevronRight size={20} /></button>
                <span className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full bg-slate-900/80 text-xs text-slate-200">{idx + 1} / {photos.length}</span>
              </>
            )}
          </div>
          {photos.length > 1 && (
            <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
              {photos.map((p, i) => (
                <button key={p.id} type="button" onClick={() => setIdx(i)} aria-label={`Ver foto ${i + 1}`}
                  className="flex-shrink-0 rounded-lg overflow-hidden border-2 transition-opacity"
                  style={{ width: 72, height: 52, borderColor: i === idx ? primary : "transparent", opacity: i === idx ? 1 : 0.6 }}>
                  <img src={p.url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
            <div>
              <div className="flex flex-wrap gap-2 mb-3">
                <span className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs border" style={{ color: accentText, borderColor: `${primary}66`, background: `${primary}22` }}>
                  <Icon size={13} /> {typeLabel(v.type)}
                </span>
                <span className="px-3 py-1 rounded-lg text-xs border border-slate-600 text-slate-300">{v.km === 0 ? "Zero km" : "Seminovo"}</span>
                {isNew(v) && <span className="px-3 py-1 rounded-lg text-xs bg-green-500/15 text-green-300 border border-green-500/40">Chegou agora</span>}
              </div>
              <div className="text-3xl font-bold" style={{ color: accentText }}>{currency(Number(v.price))}</div>
              {wa && (
                <a href={wa} target="_blank" rel="noreferrer"
                  className="mt-4 flex items-center justify-center gap-2 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-semibold transition-colors">
                  <MessageCircle size={17} /> Falar no WhatsApp
                </a>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 content-start">
              {facts.filter(([, , value]) => value).map(([FIcon, label, value]) => (
                <div key={label} className="bg-slate-900 rounded-lg p-3">
                  <p className="flex items-center gap-1.5 text-slate-400 text-xs mb-1"><FIcon size={12} />{label}</p>
                  <p className="text-white text-sm">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {v.description && (
            <div className="mt-5">
              <h4 className="text-slate-400 mb-1.5 text-sm">Descrição</h4>
              <p className="text-slate-100 text-sm whitespace-pre-line leading-relaxed">{v.description}</p>
            </div>
          )}

          {v.optionals?.length > 0 && (
            <div className="mt-5">
              <h4 className="text-slate-400 mb-2 text-sm">Opcionais</h4>
              <div className="flex flex-wrap gap-2">
                {v.optionals.map((o) => <span key={o} className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs">{o}</span>)}
              </div>
            </div>
          )}

          <InterestForm slug={slug} vehicle={v} primary={primary} />
        </div>
      </div>
    </div>
  );
}
