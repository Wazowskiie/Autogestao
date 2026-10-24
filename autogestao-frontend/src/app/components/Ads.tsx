import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Megaphone, Plus, Copy, Check, Download, Sparkles, Pencil, Trash2, X, ImageOff, Loader2, Wand2, Eye, RefreshCw, Archive, CarFront, FileText, Search, ExternalLink, Send, CheckCircle2 } from "lucide-react";
import { request } from "../../lib/api";
import { getVehicle, type VehicleFull } from "../../lib/vehicle-details-api";
import { getSettings } from "../../lib/settings-api";
import { askAssistant } from "../../lib/assistant-api";
import { usePlan } from "../../lib/plan-context";

// ---------- Tipos (mesmos que o backend /ads já devolve) ----------
type Vehicle = { id: string; brand: string; model: string; year: number; price: string | number; photos: { url: string }[] };
type Ad = {
  id: string; channel: string; title: string; description: string; status: string; vehicleId?: string;
  price?: string | number; photos?: string[];
  inventorySync?: { priceChanged: boolean; photosChanged: boolean; unavailable: boolean; needsAttention: boolean };
  vehicle?: { id?: string; brand: string; model: string; year: number; status?: string; price?: string | number; photos?: { url: string }[] } | null;
  vehicleSnapshot?: { brand?: string; model?: string; year?: number } | null;
  archivedAt?: string | null;
  externalUrl?: string | null; publishedAt?: string | null; publishedById?: string | null; removedAt?: string | null; removedById?: string | null;
};
type Store = { name: string; phone: string | null; city: string | null; state: string | null; slug: string };

const CHANNELS: Record<string, { label: string; color: string; bg: string }> = {
  olx: { label: "OLX", color: "#6E0AD6", bg: "#F3E8FF" },
  instagram: { label: "Instagram", color: "#C13584", bg: "#FCE7F3" },
};
const BLUE = "#185FA5";
type Filter = "all" | "draft" | "published" | "sold" | "archived";
const isArchived = (ad: Ad) => ad.status === "archived" || !!ad.archivedAt || !ad.vehicle;
const isSold = (ad: Ad) => !isArchived(ad) && (ad.vehicle?.status === "sold" || !!ad.inventorySync?.unavailable);
const canShare = (ad: Ad) => !isArchived(ad) && !isSold(ad);
const vehicleLabel = (ad: Ad) => {
  const v = ad.vehicle ?? ad.vehicleSnapshot;
  return [v?.brand, v?.model, v?.year].filter((x) => x !== null && x !== undefined && x !== "").join(" ") || ad.title;
};

// Checklist local: valida apenas dados já disponíveis, sem afirmar aprovação da OLX.
function publicationChecklist(ad: Ad) {
  const items = [
    { label: "Título preenchido", ok: !!ad.title?.trim() && ad.title.trim().length >= 10 },
    { label: "Descrição preenchida", ok: !!ad.description?.trim() && ad.description.trim().length >= 30 },
    { label: "Preço válido", ok: Number(ad.price) > 0 },
    { label: "Pelo menos uma foto", ok: (ad.photos?.length ?? 0) > 0 },
    { label: "Veículo disponível", ok: canShare(ad) && ad.vehicle?.status === "available" },
    { label: "Preço e fotos sincronizados", ok: !ad.inventorySync?.priceChanged && !ad.inventorySync?.photosChanged },
  ];
  return { items, ready: items.every((item) => item.ok), count: items.filter((item) => item.ok).length };
}

// ---------- Formatação ----------
const brl = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const phoneBR = (p: string | null) => {
  const d = (p ?? "").replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return p ?? "";
};
const tag = (s: string) => "#" + s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

/** Título curto (OLX aceita títulos curtos) */
function makeTitle(v: VehicleFull) {
  const year = v.manufactureYear && v.manufactureYear !== v.year ? `${v.manufactureYear}/${v.year}` : `${v.year}`;
  const km = v.km ? ` – ${v.km.toLocaleString("pt-BR")} km` : "";
  return `${v.brand} ${v.model}${v.version ? ` ${v.version}` : ""} ${year}${km}`.slice(0, 90);
}

/** Texto do anúncio montado com os dados reais do veículo (nada inventado) */
function makeText(v: VehicleFull, channel: string, store: Store | null) {
  const year = v.manufactureYear && v.manufactureYear !== v.year ? `${v.manufactureYear}/${v.year}` : `${v.year}`;
  const kind = v.type === "moto" ? "moto" : "veículo";
  const facts = [
    `Ano: ${year}`,
    v.km != null ? `KM: ${v.km.toLocaleString("pt-BR")}` : null,
    v.color ? `Cor: ${v.color}` : null,
    v.fuel ? `Combustível: ${v.fuel}` : null,
    v.engineCc ? `Cilindrada: ${v.engineCc} cc` : null,
    v.transmission ? `Câmbio: ${v.transmission}` : null,
    v.doors ? `Portas: ${v.doors}` : null,
    v.ownerCount ? `${v.ownerCount === 1 ? "Único dono" : `${v.ownerCount} donos`}` : null,
  ].filter(Boolean) as string[];
  const extras = [
    v.ipvaPaid ? "IPVA pago" : null,
    v.hasSpareKey ? "Chave reserva" : null,
    v.hasManual ? "Manual" : null,
    v.acceptsTrade ? "Aceita troca" : null,
  ].filter(Boolean) as string[];
  const optionals = v.optionals?.length ? v.optionals : [];
  const where = store ? [store.name, store.city && store.state ? `${store.city}/${store.state}` : store.city].filter(Boolean).join(" – ") : "";
  const phone = store?.phone ? phoneBR(store.phone) : "";

  if (channel === "instagram") {
    const tags = [tag(v.brand), tag(v.model.split(" ")[0]), v.type === "moto" ? "#motos" : "#carros", "#seminovos",
      v.type === "moto" ? "#motoseminova" : "#carroseminovo", store?.city ? tag(store.city) : null].filter(Boolean);
    return [
      `🔥 ${v.brand.toUpperCase()} ${v.model.toUpperCase()}${v.version ? ` ${v.version}` : ""} ${year}`,
      "",
      ...facts.map((f) => `✅ ${f}`),
      ...extras.map((f) => `✅ ${f}`),
      ...(optionals.length ? ["", `⭐ ${optionals.join(" • ")}`] : []),
      ...(v.description ? ["", v.description.trim()] : []),
      "",
      Number(v.price) > 0 ? `💰 ${brl(v.price)}` : null,
      v.acceptsTrade ? "🔄 Aceitamos sua troca" : null,
      "",
      phone ? `📲 Chame no WhatsApp: ${phone}` : "📲 Chame no direct",
      where ? `📍 ${where}` : null,
      "",
      tags.join(" "),
    ].filter((l) => l !== null).join("\n");
  }

  // OLX (texto mais direto, sem hashtags)
  return [
    `${v.brand} ${v.model}${v.version ? ` ${v.version}` : ""} ${year}.`,
    "",
    ...facts.map((f) => `• ${f}`),
    ...(extras.length ? [`• ${extras.join(" • ")}`] : []),
    ...(optionals.length ? ["", `Opcionais: ${optionals.join(", ")}.`] : []),
    ...(v.description ? ["", v.description.trim()] : []),
    "",
    Number(v.price) > 0 ? `Valor: ${brl(v.price)}` : null,
    v.acceptsTrade ? "Aceitamos troca." : null,
    `Entre em contato para conhecer ${kind === "moto" ? "a moto" : "o veículo"} e consultar as condições disponíveis.`,
    "",
    where ? `${where}` : null,
    phone ? `WhatsApp: ${phone}` : null,
  ].filter((l) => l !== null).join("\n");
}

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

async function downloadPhotos(urls: string[], baseName: string) {
  for (let i = 0; i < urls.length; i++) {
    const res = await fetch(urls[i]);
    const blob = await res.blob();
    const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${baseName}-${i + 1}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    await new Promise((r) => setTimeout(r, 300)); // o navegador baixa um de cada vez
  }
}

// =====================================================================
export function Ads() {
  const plan = usePlan();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [store, setStore] = useState<Store | null>(null);
  const [vehicleId, setVehicleId] = useState("");
  const [channel, setChannel] = useState("olx");
  const [editing, setEditing] = useState<Ad | null>(null);
  const [publishing, setPublishing] = useState<Ad | null>(null);
  const [preview, setPreview] = useState<Ad | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const reload = useCallback(async () => {
    const [v, a] = await Promise.all([request<Vehicle[]>("/ads/vehicles"), request<Ad[]>("/ads/listings")]);
    setVehicles(v); setAds(a);
  }, []);

  useEffect(() => {
    reload().catch((e) => setError(e.message));
    getSettings().then((d) => setStore({ name: d.dealership.name, phone: d.dealership.phone, city: d.dealership.city, state: d.dealership.state, slug: d.dealership.slug })).catch(() => {});
  }, [reload]);

  // Liga cada anúncio ao veículo certo (o backend manda a marca/modelo/ano)
  const vehicleOf = useCallback((ad: Ad) => {
    if (isArchived(ad)) return null;
    if (ad.vehicleId || ad.vehicle?.id) return ad.vehicleId ?? ad.vehicle?.id ?? null;
    return vehicles.find((v) => v.brand === ad.vehicle?.brand && v.model === ad.vehicle?.model && v.year === ad.vehicle?.year)?.id ?? null;
  }, [vehicles]);

  // Cria o rascunho e já preenche o texto com os dados do veículo
  async function create() {
    setBusy(true); setError("");
    try {
      const [full, ad] = await Promise.all([
        getVehicle(vehicleId),
        request<Ad>("/ads/listings", { method: "POST", body: { vehicleId, channel } }),
      ]);
      if (ad?.id) {
        await request(`/ads/listings/${ad.id}`, { method: "PATCH", body: { title: makeTitle(full), description: makeText(full, channel, store) } });
      }
      await reload();
      setVehicleId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar o rascunho");
    } finally { setBusy(false); }
  }

  async function syncInventory(ad: Ad) {
    if (!canShare(ad) || ad.status !== "draft") return;
    if (!window.confirm("Atualizar preço e fotos deste rascunho com os dados atuais do estoque? O título e a descrição serão preservados.")) return;
    setBusy(true); setError("");
    try {
      await request(`/ads/listings/${ad.id}/sync-inventory`, { method: "POST" });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível sincronizar o anúncio.");
    } finally { setBusy(false); }
  }

  async function markPublished(ad: Ad, externalUrl: string) {
    setBusy(true); setError("");
    try {
      await request(`/ads/listings/${ad.id}/mark-published`, { method: "POST", body: { externalUrl } });
      setPublishing(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível registrar a publicação.");
      throw e;
    } finally { setBusy(false); }
  }

  async function markRemoved(ad: Ad) {
    if (ad.status !== "published") return;
    if (!window.confirm("Você já retirou este anúncio da plataforma externa? O AutoGestão apenas registrará essa retirada; ele não excluirá a publicação na OLX ou no Instagram.")) return;
    setBusy(true); setError("");
    try {
      await request(`/ads/listings/${ad.id}/mark-removed`, { method: "POST" });
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível registrar a retirada."); }
    finally { setBusy(false); }
  }

  async function remove(ad: Ad) {
    if (!canShare(ad) || ad.status !== "draft") return;
    if (!window.confirm("Excluir este rascunho?")) return;
    setBusy(true); setError("");
    try { await request(`/ads/listings/${ad.id}`, { method: "DELETE" }); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao excluir"); }
    finally { setBusy(false); }
  }

  const counts = useMemo(() => ({
    all: ads.length,
    draft: ads.filter((a) => a.status === "draft" && !isArchived(a) && !isSold(a)).length,
    published: ads.filter((a) => a.status === "published").length,
    sold: ads.filter(isSold).length,
    archived: ads.filter(isArchived).length,
  }), [ads]);
  const visibleAds = useMemo(() => ads.filter((ad) => {
    if (filter === "draft" && (ad.status !== "draft" || isArchived(ad) || isSold(ad))) return false;
    if (filter === "published" && ad.status !== "published") return false;
    if (filter === "sold" && !isSold(ad)) return false;
    if (filter === "archived" && !isArchived(ad)) return false;
    const q = search.trim().toLocaleLowerCase("pt-BR");
    return !q || `${ad.title} ${vehicleLabel(ad)} ${ad.description ?? ""}`.toLocaleLowerCase("pt-BR").includes(q);
  }), [ads, filter, search]);

  const storeLink = store ? `${window.location.origin}/loja/${store.slug}` : "";

  return (
    <div className="size-full flex flex-col overflow-hidden" style={{ background: "var(--background)" }}>
      <div className="px-6 py-4 flex-shrink-0 flex items-center justify-between gap-3 flex-wrap" style={{ background: "#fff", borderBottom: "1px solid var(--border)" }}>
        <div>
          <h2>Central de Anúncios</h2>
          <p style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>Monte o anúncio com os dados do estoque, copie e cole no portal. A publicação automática ainda não está ligada.</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-5">
        <div className="flex flex-col gap-4" style={{ maxWidth: 1100 }}>
          {error && <div role="alert" className="rounded-lg px-4 py-3" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>{error}</div>}

          {/* Novo anúncio */}
          <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 16 }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
              <Megaphone size={16} style={{ color: BLUE }} />
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>Novo anúncio</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="rounded-lg px-3 py-2 flex-1"
                style={{ minWidth: 240, border: "0.5px solid rgba(0,0,0,0.15)", fontSize: 13, background: "#fff" }}>
                <option value="">{vehicles.length ? "Escolha um veículo do estoque" : "Nenhum veículo disponível no estoque"}</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.brand} {v.model} {v.year} — {brl(v.price)}</option>)}
              </select>
              <div className="flex rounded-lg p-0.5" style={{ background: "#F4F6F9" }}>
                {Object.entries(CHANNELS).map(([k, c]) => (
                  <button key={k} onClick={() => setChannel(k)} className="px-3 py-1.5 rounded-md"
                    style={{ fontSize: 13, fontWeight: channel === k ? 600 : 400, background: channel === k ? "#fff" : "transparent", color: channel === k ? c.color : "#6B7280", boxShadow: channel === k ? "0 1px 2px rgba(0,0,0,0.08)" : "none" }}>
                    {c.label}
                  </button>
                ))}
              </div>
              <button disabled={!vehicleId || busy} onClick={create} className="flex items-center gap-2 px-4 py-2 rounded-lg"
                style={{ background: BLUE, color: "#fff", fontSize: 13, fontWeight: 500, opacity: !vehicleId || busy ? 0.5 : 1 }}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Criar anúncio
              </button>
            </div>
            <p style={{ fontSize: 12, color: "#6B7280", marginTop: 8 }}>
              O texto é montado sozinho com os dados do cadastro (ano, km, cor, opcionais, preço, telefone da loja). Depois é só revisar e copiar.
            </p>
          </div>

          {/* Histórico e filtros */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {([
              ["all", "Todos", Megaphone], ["draft", "Rascunhos", FileText], ["published", "Publicados", Send],
              ["sold", "Vendidos", CarFront], ["archived", "Arquivados", Archive],
            ] as const).map(([key, label, Icon]) => (
              <button key={key} type="button" onClick={() => setFilter(key)}
                aria-pressed={filter === key}
                className="flex items-center gap-3 rounded-xl p-3 text-left"
                style={{ background: "#fff", border: `1px solid ${filter === key ? BLUE : "rgba(0,0,0,0.10)"}` }}>
                <Icon size={19} style={{ color: filter === key ? BLUE : "#6B7280" }} />
                <span><span className="block" style={{ fontSize: 20, fontWeight: 700 }}>{counts[key]}</span>
                  <span className="block" style={{ fontSize: 12, color: "#6B7280" }}>{label}</span></span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.12)" }}>
            <Search size={16} style={{ color: "#6B7280" }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar anúncio por título ou veículo"
              aria-label="Buscar anúncios" className="flex-1 outline-none" style={{ fontSize: 13, background: "transparent" }} />
          </div>

          {/* Lista */}
          <div className="flex items-center justify-between">
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Anúncios ({visibleAds.length} de {ads.length})</h3>
            {storeLink && (
              <CopyButton label="Copiar link do site da loja" text={storeLink} />
            )}
          </div>
          {visibleAds.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10" style={{ background: "#fff", borderRadius: 12, border: "1px dashed rgba(0,0,0,0.12)", color: "#9CA3AF", fontSize: 13 }}>
              <Megaphone size={26} /> Nenhum anúncio encontrado para este filtro.
            </div>
          )}

          {visibleAds.map((ad) => {
            const ch = CHANNELS[ad.channel] ?? { label: ad.channel.toUpperCase(), color: "#374151", bg: "#F3F4F6" };
            const photos = (ad.photos ?? []).map((url) => ({ url }));
            const sync = ad.inventorySync;
            const empty = !ad.description?.trim();
            const archived = isArchived(ad);
            const sold = isSold(ad);
            const shareable = canShare(ad);
            const checklist = publicationChecklist(ad);
            const statusLabel = ad.status === "removed" ? "Retirado" : archived ? "Arquivado" : sold ? "Vendido / indisponível" : ad.status === "published" ? "Publicado manualmente" : ad.status === "draft" ? "Rascunho" : ad.status;
            return (
              <div key={ad.id} style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, overflow: "hidden" }}>
                <div className="flex gap-4 flex-wrap" style={{ padding: 14 }}>
                  <div className="flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ width: 132, height: 100, borderRadius: 10, background: "#F4F6F9" }}>
                    {photos[0]?.url ? <img src={photos[0].url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ImageOff size={22} style={{ color: "#9CA3AF" }} />}
                  </div>
                  <div style={{ flex: "1 1 280px", minWidth: 0 }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-full" style={{ fontSize: 11, fontWeight: 700, background: ch.bg, color: ch.color }}>{ch.label}</span>
                      <span className="px-2 py-0.5 rounded-full" style={{ fontSize: 11, fontWeight: 600, background: "#F3F4F6", color: "#4B5563" }}>{statusLabel}</span>
                      <span style={{ fontSize: 12, color: "#9CA3AF" }}>{photos.length} {photos.length === 1 ? "foto" : "fotos"}</span>
                    </div>
                    {ad.status === "published" && (archived || sold) && (
                      <div className="rounded-lg px-3 py-2 mt-2" style={{ background: "#FEF3C7", color: "#92400E", fontSize: 12 }}>
                        <strong>Publicação externa precisa ser retirada</strong>
                        <div>O veículo está indisponível. Retire o anúncio na plataforma e depois clique em Registrar retirada.</div>
                      </div>
                    )}
                    {ad.status === "published" && ad.publishedAt && (
                      <div style={{ fontSize: 12, color: "#6B7280", marginTop: 6 }}>
                        Publicado manualmente em {new Date(ad.publishedAt).toLocaleString("pt-BR")}
                      </div>
                    )}
                    {ad.status === "removed" && ad.removedAt && (
                      <div style={{ fontSize: 12, color: "#6B7280", marginTop: 6 }}>
                        Retirada registrada em {new Date(ad.removedAt).toLocaleString("pt-BR")}
                      </div>
                    )}
                    {(archived || sold) && (
                      <div className="rounded-lg px-3 py-2 mt-2" style={{ background: archived ? "#F3F4F6" : "#FEE2E2", color: archived ? "#374151" : "#991B1B", fontSize: 12 }}>
                        <strong>{archived ? "Histórico preservado — veículo excluído" : "Veículo vendido ou indisponível"}</strong>
                        <div>{archived ? "Anúncio somente para consulta. Não é possível editar, sincronizar ou divulgar." : "Revise a disponibilidade antes de divulgar. Cópia e edição estão bloqueadas."}</div>
                      </div>
                    )}
                    {!archived && !sold && sync?.needsAttention && (
                      <div className="rounded-lg px-3 py-2 mt-2" style={{ background: sync.unavailable ? "#FEE2E2" : "#FFFBEB", color: sync.unavailable ? "#991B1B" : "#92400E", fontSize: 12 }}>
                        <strong>{sync.unavailable ? "Veículo indisponível no estoque" : "Alterações detectadas no estoque"}</strong>
                        <div>{[sync.priceChanged && "Preço alterado", sync.photosChanged && "Fotos alteradas", sync.unavailable && "Não copie nem publique antes de revisar a disponibilidade"].filter(Boolean).join(" · ")}</div>
                        {!sync.unavailable && ad.status === "draft" && (
                          <button disabled={busy} onClick={() => syncInventory(ad)} className="flex items-center gap-1.5 mt-2 rounded-md px-3 py-1.5" style={{ background: "#fff", border: "1px solid #FCD34D", fontWeight: 600 }}>
                            <RefreshCw size={13} /> Atualizar preço e fotos
                          </button>
                        )}
                      </div>
                    )}
                    <details className="rounded-lg mt-2 px-3 py-2" style={{ border: "1px solid #E5E7EB", background: "#FAFBFC", fontSize: 12 }}>
                      <summary style={{ cursor: "pointer", fontWeight: 600, color: checklist.ready ? "#047857" : "#92400E" }}>
                        {checklist.ready ? "✓ Checklist básico completo" : `Checklist de divulgação: ${checklist.count}/${checklist.items.length} itens`}
                      </summary>
                      <div className="flex flex-col gap-1 mt-2">
                        {checklist.items.map((item) => (
                          <div key={item.label} style={{ color: item.ok ? "#047857" : "#B45309" }}>
                            {item.ok ? "✓" : "!"} {item.label}
                          </div>
                        ))}
                        <div style={{ color: "#6B7280", marginTop: 5 }}>
                          Verificação interna. Não garante aprovação ou publicação na plataforma.
                        </div>
                      </div>
                    </details>
                    {ad.price != null && <div style={{ fontSize: 13, fontWeight: 600, color: BLUE, marginTop: 5 }}>Preço salvo: {brl(ad.price)}</div>}
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#0F1923", marginTop: 4 }}>{ad.title}</div>
                    <div style={{ fontSize: 12, color: empty ? "#B45309" : "#6B7280", marginTop: 2, whiteSpace: "pre-line", maxHeight: 54, overflow: "hidden" }}>
                      {empty ? "Sem texto ainda: clique em Editar e use \"Gerar texto\"." : ad.description}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5" style={{ flex: "0 0 auto" }}>
                    <CopyButton label="Copiar título" text={ad.title} disabled={!shareable || !checklist.ready} />
                    <CopyButton label="Copiar texto" text={ad.description} disabled={empty || !shareable || !checklist.ready} />
                    {photos.length > 0 && shareable && checklist.ready && (
                      <ActionButton icon={Download} label={`Baixar fotos (${photos.length})`}
                        onClick={() => downloadPhotos(photos.map((p) => p.url), vehicleLabel(ad).toLowerCase().replace(/\s+/g, "-"))} />
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5" style={{ flex: "0 0 auto" }}>
                    <ActionButton icon={Eye} label="Pré-visualizar" onClick={() => setPreview(ad)} />
                    {ad.status === "draft" && shareable && checklist.ready && (
                      <ActionButton icon={Send} label="Registrar publicação" onClick={() => setPublishing(ad)} />
                    )}
                    {ad.status === "published" && (
                      <>
                        {ad.externalUrl && (
                          <a href={ad.externalUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                            style={{ fontSize: 12, fontWeight: 500, border: "0.5px solid rgba(0,0,0,0.12)", color: BLUE, whiteSpace: "nowrap" }}>
                            <ExternalLink size={13} /> Ver publicação
                          </a>
                        )}
                        <ActionButton icon={CheckCircle2} label="Registrar retirada" onClick={() => markRemoved(ad)} />
                      </>
                    )}
                    {ad.status === "draft" && shareable && (
                      <>
                        <ActionButton icon={Pencil} label="Editar" onClick={() => setEditing(ad)} />
                        <ActionButton icon={Trash2} label="Excluir" danger onClick={() => remove(ad)} />
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {publishing && (
        <PublishModal ad={publishing} busy={busy} onClose={() => setPublishing(null)}
          onPublish={(url) => markPublished(publishing, url)} />
      )}
      {preview && <PreviewModal ad={preview} store={store} onClose={() => setPreview(null)} />}
      {editing && (
        <EditModal ad={editing} vehicleId={vehicleOf(editing)} store={store} canUseAi={plan.has("assistant")}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await reload(); }} />
      )}
    </div>
  );
}

// ---------- Registro de publicação manual ----------
function PublishModal({ ad, busy, onClose, onPublish }: {
  ad: Ad; busy: boolean; onClose: () => void; onPublish: (url: string) => Promise<void>;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const validUrl = (() => { try { const u = new URL(url.trim()); return ["https:", "http:"].includes(u.protocol) && !!u.hostname.includes("."); } catch { return false; } })();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validUrl) return setError("Informe o link completo da publicação (https://...).");
    setError("");
    try { await onPublish(url.trim()); } catch (e) { setError(e instanceof Error ? e.message : "Erro ao registrar publicação."); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }} onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-label="Registrar publicação manual" className="w-full rounded-xl p-5 flex flex-col gap-3" style={{ maxWidth: 520, background: "#fff" }}>
        <div className="flex items-center justify-between"><h3 style={{ fontSize: 17, fontWeight: 600 }}>Registrar publicação · {CHANNELS[ad.channel]?.label ?? ad.channel}</h3><button type="button" disabled={busy} onClick={onClose} aria-label="Fechar"><X size={20}/></button></div>
        <p style={{ fontSize: 13, color: "#4B5563" }}>Publique primeiro o anúncio na plataforma. Depois cole o link aqui para registrar a publicação no AutoGestão. Este botão não publica automaticamente.</p>
        <label style={{ fontSize: 13, fontWeight: 500 }}>Link da publicação externa
          <input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="w-full rounded-lg px-3 py-2 mt-1" style={{ border: "1px solid #D1D5DB" }}/>
        </label>
        {error && <p role="alert" style={{ color: "#B91C1C", fontSize: 12 }}>{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className="rounded-lg px-4 py-2" style={{ border: "1px solid #D1D5DB" }}>Cancelar</button><button type="submit" disabled={busy || !validUrl} className="rounded-lg px-4 py-2" style={{ background: BLUE, color: "#fff", opacity: busy || !validUrl ? .5 : 1 }}>{busy ? "Registrando..." : "Confirmar publicação manual"}</button></div>
      </form>
    </div>
  );
}

// ---------- Editar ----------
function EditModal({ ad, vehicleId, store, canUseAi, onClose, onSaved }: {
  ad: Ad; vehicleId: string | null; store: Store | null; canUseAi: boolean; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(ad.title);
  const [description, setDescription] = useState(ad.description || "");
  const [busy, setBusy] = useState<"save" | "gen" | "ai" | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [error, setError] = useState("");
  const ch = CHANNELS[ad.channel]?.label ?? ad.channel;
  const limits = useMemo(() => ({ title: ad.channel === "olx" ? 90 : 150 }), [ad.channel]);

  const generate = async () => {
    if (description.trim() && !confirmRegenerate) { setConfirmRegenerate(true); return; }
    if (!vehicleId) return setError("Não achei o veículo deste anúncio no estoque.");
    setBusy("gen"); setError("");
    try {
      const v = await getVehicle(vehicleId);
      setTitle(makeTitle(v));
      setDescription(makeText(v, ad.channel, store));
      setConfirmRegenerate(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao gerar o texto"); } finally { setBusy(null); }
  };

  const improveWithAi = async () => {
    setBusy("ai"); setError("");
    try {
      const r = await askAssistant([{
        role: "user",
        content: `Melhore este anúncio para ${ch}, deixando mais vendedor e fácil de ler, sem inventar nenhuma informação nova (use só o que está no texto) e sem mencionar custo, chassi ou Renavam. Responda SOMENTE com o texto final do anúncio, sem comentários antes ou depois.\n\nTítulo: ${title}\n\n${description}`,
      }], "Central de Anúncios");
      if (r.reply?.trim()) setDescription(r.reply.trim());
    } catch (e) { setError(e instanceof Error ? e.message : "A assistente não respondeu"); } finally { setBusy(null); }
  };

  const save = async () => {
    setBusy("save"); setError("");
    try {
      await request(`/ads/listings/${ad.id}`, { method: "PATCH", body: { title: title.trim(), description } });
      await onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao salvar"); setBusy(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full flex flex-col" style={{ background: "#fff", borderRadius: 14, maxWidth: 680, maxHeight: "92vh" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>Editar anúncio · {ch}</h3>
          <button onClick={onClose} style={{ color: "#9CA3AF" }}><X size={20} /></button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3 overflow-auto">
          {error && <div className="rounded-lg px-3 py-2" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>{error}</div>}
          <div className="flex gap-2 flex-wrap">
            <button onClick={generate} disabled={!!busy} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
              style={{ fontSize: 13, fontWeight: 500, background: "#EBF2FA", color: BLUE }}>
              {busy === "gen" ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Gerar texto com os dados do veículo
            </button>
            {canUseAi && (
              <button onClick={improveWithAi} disabled={!!busy || !description.trim()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                style={{ fontSize: 13, fontWeight: 500, background: "#F3E8FF", color: "#6D28D9", opacity: !description.trim() ? 0.5 : 1 }}>
                {busy === "ai" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Melhorar com a IA
              </button>
            )}
          </div>
          <label style={{ fontSize: 12, color: "#4B5563", fontWeight: 500 }}>
            Título <span style={{ color: title.length > limits.title ? "#DC2626" : "#9CA3AF", fontWeight: 400 }}>({title.length}/{limits.title})</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150}
              className="w-full rounded-lg px-3 py-2 mt-1" style={{ border: "0.5px solid rgba(0,0,0,0.15)", fontSize: 14 }} />
          </label>
          <label style={{ fontSize: 12, color: "#4B5563", fontWeight: 500 }}>
            Texto do anúncio
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={14} maxLength={10000}
              className="w-full rounded-lg px-3 py-2 mt-1" style={{ border: "0.5px solid rgba(0,0,0,0.15)", fontSize: 13, lineHeight: 1.5, resize: "vertical" }} />
          </label>
        </div>
        <div className="flex items-center justify-between gap-2 px-5 py-4 flex-wrap" style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
          <CopyButton label="Copiar texto" text={description} disabled={!description.trim()} />
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg" style={{ border: "0.5px solid rgba(0,0,0,0.15)", fontSize: 13 }}>Cancelar</button>
            <button onClick={save} disabled={!!busy || !title.trim()} className="px-4 py-2 rounded-lg"
              style={{ background: BLUE, color: "#fff", fontSize: 13, fontWeight: 500, opacity: busy || !title.trim() ? 0.6 : 1 }}>
              {busy === "save" ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}



// ---------- Pré-visualização (não publica em plataformas externas) ----------
function PreviewModal({ ad, store, onClose }: { ad: Ad; store: Store | null; onClose: () => void }) {
  const photos = (ad.photos ?? []).map((url) => ({ url }));
  const [photoIndex, setPhotoIndex] = useState(0);
  const instagram = ad.channel === "instagram";
  const photo = photos[photoIndex]?.url;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full flex flex-col" role="dialog" aria-modal="true" aria-label="Pré-visualização do anúncio"
        style={{ background: "#fff", borderRadius: 14, maxWidth: instagram ? 560 : 800, maxHeight: "92vh", overflow: "hidden" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #E5E7EB" }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>Pré-visualização · {instagram ? "Instagram" : "OLX"}</h3>
            <p style={{ fontSize: 12, color: "#6B7280" }}>Simulação visual. Nada foi publicado.</p>
          </div>
          <button aria-label="Fechar pré-visualização" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="overflow-auto p-5">
          {instagram && <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{store?.name || "Concessionária"}</div>}
          {(isArchived(ad) || isSold(ad)) && <p style={{ color: "#991B1B", fontSize: 12, marginBottom: 12 }}>Somente consulta — anúncio indisponível para divulgação.</p>}
          <div style={{ background: "#F3F4F6", borderRadius: 10, overflow: "hidden", height: instagram ? 330 : 280, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {photo ? <img src={photo} alt={`Foto ${photoIndex + 1} do veículo`} style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <ImageOff size={32} color="#9CA3AF" />}
          </div>
          {photos.length > 1 && (
            <div className="flex items-center justify-between mt-2" style={{ fontSize: 12 }}>
              <button onClick={() => setPhotoIndex((photoIndex + photos.length - 1) % photos.length)}>← Anterior</button>
              <span>{photoIndex + 1} de {photos.length}</span>
              <button onClick={() => setPhotoIndex((photoIndex + 1) % photos.length)}>Próxima →</button>
            </div>
          )}
          <h3 style={{ fontSize: 18, fontWeight: 650, marginTop: 16 }}>{ad.title}</h3>
          <p style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.6, color: "#374151", marginTop: 10 }}>{ad.description || "Sem descrição cadastrada."}</p>
          <div className="flex gap-2 flex-wrap mt-4">
            <CopyButton label="Copiar título" text={ad.title} disabled={!canShare(ad) || !publicationChecklist(ad).ready} />
            <CopyButton label="Copiar descrição" text={ad.description} disabled={!ad.description?.trim() || !canShare(ad) || !publicationChecklist(ad).ready} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Botões ----------
function CopyButton({ label, text, disabled }: { label: string; text: string; disabled?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button disabled={disabled} onClick={async () => { if (await copyText(text)) { setDone(true); setTimeout(() => setDone(false), 1500); } }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
      style={{ fontSize: 12, fontWeight: 500, border: "0.5px solid rgba(0,0,0,0.12)", background: done ? "#ECFDF5" : "#fff", color: done ? "#047857" : "#374151", opacity: disabled ? 0.45 : 1, whiteSpace: "nowrap" }}>
      {done ? <Check size={13} /> : <Copy size={13} />} {done ? "Copiado!" : label}
    </button>
  );
}

function ActionButton({ icon: Icon, label, onClick, danger }: { icon: typeof Copy; label: string; onClick: () => Promise<void> | void; danger?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <button disabled={busy} onClick={async () => { setBusy(true); try { await onClick(); } finally { setBusy(false); } }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
      style={{ fontSize: 12, fontWeight: 500, border: `0.5px solid ${danger ? "#FECACA" : "rgba(0,0,0,0.12)"}`, background: "#fff", color: danger ? "#B91C1C" : "#374151", whiteSpace: "nowrap" }}>
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />} {label}
    </button>
  );
}