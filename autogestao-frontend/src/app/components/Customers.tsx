import { useCallback, useEffect, useState } from "react";
import { Search, Plus, Phone, Mail, Edit2, Trash2, X, Tag } from "lucide-react";
import * as api from "../../lib/api";

const HOW_MET_OPTIONS = [
  "Indicação", "Instagram", "Facebook", "WhatsApp", "Site",
  "OLX", "Webmotors", "Passando na loja", "Google", "Outro",
];

const GENDER_OPTIONS = ["Masculino", "Feminino", "Outro", "Prefiro não informar"];

const TAG_OPTIONS = [
  "Comprador frequente", "Indicador", "Financiado", "À vista",
  "VIP", "Primeira compra", "Interessado em troca",
];

const TAG_COLORS: Record<string, { bg: string; color: string }> = {
  "Comprador frequente": { bg: "#EAF3DE", color: "#27500A" },
  "VIP": { bg: "#EDE9FE", color: "#7C3AED" },
  "Indicador": { bg: "#EBF2FA", color: "#185FA5" },
  "Financiado": { bg: "#FEF3C7", color: "#D97706" },
  "À vista": { bg: "#EAF3DE", color: "#27500A" },
  "Primeira compra": { bg: "#F4F6F9", color: "#6B7280" },
  "Interessado em troca": { bg: "#FEE2E2", color: "#DC2626" },
};

function age(birthDate: string): number {
  const diff = Date.now() - new Date(birthDate).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

export function Customers() {
  const [customers, setCustomers] = useState<api.Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [modal, setModal] = useState<api.Customer | "new" | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listCustomers({ search: debouncedSearch || undefined, pageSize: 100 });
      setCustomers(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar clientes");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const handleDelete = async (c: api.Customer) => {
    if (!window.confirm(`Remover ${c.name}?`)) return;
    try {
      await api.deleteCustomer(c.id);
      fetchCustomers();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Erro ao remover cliente");
    }
  };

  return (
    <div className="size-full flex flex-col overflow-hidden" style={{ background: "var(--background)" }}>
      <div className="px-6 py-4 flex-shrink-0" style={{ background: "#fff", borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2>Clientes</h2>
            <span className="px-2 py-0.5 rounded-full" style={{ background: "#EBF2FA", color: "#185FA5", fontSize: 12, fontWeight: 500 }}>{total}</span>
          </div>
          <button onClick={() => setModal("new")} className="px-4 py-2 rounded-lg flex items-center gap-2"
            style={{ background: "#185FA5", color: "#fff", fontSize: 13 }}>
            <Plus size={16} /> Novo Cliente
          </button>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "#F4F6F9" }}>
          <Search size={16} style={{ color: "#9CA3AF" }} />
          <input type="text" placeholder="Buscar por nome, CPF, telefone ou e-mail..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent outline-none" style={{ fontSize: 13 }} />
        </div>
      </div>

      {error && (
        <div className="px-6 pt-4">
          <div className="rounded-lg px-4 py-3 flex items-center justify-between" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>
            <span>{error}</span>
            <button onClick={fetchCustomers} style={{ fontWeight: 500 }}>Tentar novamente</button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.08)" }}>
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead style={{ background: "#F9FAFB", borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}>
              <tr>
                {["Nome", "Documento", "Contato", "Origem", "Tags", "Cadastro", "Ações"].map(h => (
                  <th key={h} className="text-left px-4 py-3" style={{ fontSize: 12, color: "#6B7280", fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && customers.length === 0 && (
                <tr><td colSpan={7} style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: "#9CA3AF" }}>Nenhum cliente encontrado.</td></tr>
              )}
              {customers.map((c, i) => (
                <tr key={c.id} style={{ borderBottom: i < customers.length - 1 ? "0.5px solid rgba(0,0,0,0.06)" : "none" }}>
                  <td className="px-4 py-3">
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>{c.name}</div>
                    {c.birthDate && (
                      <div style={{ fontSize: 11, color: "#9CA3AF" }}>{age(c.birthDate)} anos</div>
                    )}
                  </td>
                  <td className="px-4 py-3" style={{ fontSize: 13, color: "#6B7280" }}>{c.document ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {c.phone && <div className="flex items-center gap-1.5"><Phone size={12} style={{ color: "#9CA3AF" }} /><span style={{ fontSize: 12 }}>{c.phone}</span></div>}
                      {c.email && <div className="flex items-center gap-1.5"><Mail size={12} style={{ color: "#9CA3AF" }} /><span style={{ fontSize: 12 }}>{c.email}</span></div>}
                      {!c.phone && !c.email && <span style={{ fontSize: 12, color: "#9CA3AF" }}>—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3" style={{ fontSize: 13, color: "#6B7280" }}>{c.howMet ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.tags?.slice(0, 2).map(tag => {
                        const style = TAG_COLORS[tag] ?? { bg: "#F4F6F9", color: "#6B7280" };
                        return (
                          <span key={tag} className="px-2 py-0.5 rounded-full" style={{ fontSize: 11, fontWeight: 500, background: style.bg, color: style.color }}>
                            {tag}
                          </span>
                        );
                      })}
                      {(c.tags?.length ?? 0) > 2 && (
                        <span style={{ fontSize: 11, color: "#9CA3AF" }}>+{c.tags.length - 2}</span>
                      )}
                      {(!c.tags || c.tags.length === 0) && <span style={{ fontSize: 12, color: "#9CA3AF" }}>—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3" style={{ fontSize: 13, color: "#6B7280" }}>{new Date(c.createdAt).toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setModal(c)} className="p-1.5 rounded" style={{ color: "#6B7280", background: "#F4F6F9" }}><Edit2 size={13} /></button>
                      <button onClick={() => handleDelete(c)} className="p-1.5 rounded" style={{ color: "#DC2626", background: "#FEE2E2" }}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal !== null && (
        <CustomerModal key={modal === "new" ? "new" : modal.id}
          initial={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchCustomers(); }} />
      )}
    </div>
  );
}

const inputStyle = { border: "0.5px solid rgba(0,0,0,0.12)", fontSize: 13, outline: "none" as const, background: "#FAFAFA" };

function CustomerModal({ initial, onClose, onSaved }: { initial: api.Customer | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [document, setDocument] = useState(initial?.document ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [birthDate, setBirthDate] = useState(
    initial?.birthDate ? initial.birthDate.split("T")[0] : ""
  );
  const [gender, setGender] = useState(initial?.gender ?? "");
  const [howMet, setHowMet] = useState(initial?.howMet ?? "");
  const [selectedTags, setSelectedTags] = useState<string[]>(initial?.tags ?? []);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleTag = (tag: string) =>
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Nome é obrigatório"); return; }
    setSaving(true);
    setError(null);
    try {
      const payload: api.CustomerInput = {
        name: name.trim(),
        document: document || undefined,
        phone: phone || undefined,
        email: email || undefined,
        address: address || undefined,
        birthDate: birthDate || undefined,
        gender: gender || undefined,
        howMet: howMet || undefined,
        tags: selectedTags,
        notes: notes || undefined,
      };
      if (initial) await api.updateCustomer(initial.id, payload);
      else await api.createCustomer(payload);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-h-[90vh] overflow-y-auto" style={{ background: "#fff", borderRadius: 16, maxWidth: 540, margin: 16 }}>
        <div className="flex items-center justify-between px-6 py-4 sticky top-0"
          style={{ background: "#fff", borderBottom: "0.5px solid rgba(0,0,0,0.08)", zIndex: 1 }}>
          <h3>{initial ? "Editar cliente" : "Novo cliente"}</h3>
          <button onClick={onClose} style={{ color: "#6B7280" }}><X size={20} /></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {error && <div className="rounded-lg px-3 py-2" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>{error}</div>}

          {/* Dados pessoais */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Dados pessoais</p>
            <div className="flex flex-col gap-3">
              <div>
                <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Nome completo *</label>
                <input placeholder="Nome completo" value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>CPF / CNPJ</label>
                  <input placeholder="000.000.000-00" value={document} onChange={(e) => setDocument(e.target.value)}
                    className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Data de nascimento</label>
                  <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Gênero</label>
                <select value={gender} onChange={(e) => setGender(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5" style={{ ...inputStyle, background: "#fff" }}>
                  <option value="">Selecionar</option>
                  {GENDER_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Contato */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Contato</p>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Telefone</label>
                  <input placeholder="(11) 9 9999-9999" value={phone} onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>E-mail</label>
                  <input type="email" placeholder="nome@email.com" value={email} onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Endereço</label>
                <input placeholder="Rua, número, cidade" value={address} onChange={(e) => setAddress(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
              </div>
            </div>
          </div>

          {/* Como conheceu */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Como conheceu a loja</p>
            <div className="flex flex-wrap gap-2">
              {HOW_MET_OPTIONS.map(opt => (
                <button key={opt} onClick={() => setHowMet(howMet === opt ? "" : opt)}
                  className="px-3 py-1.5 rounded-lg"
                  style={{
                    fontSize: 12,
                    border: howMet === opt ? "1px solid #185FA5" : "0.5px solid rgba(0,0,0,0.1)",
                    background: howMet === opt ? "#EBF2FA" : "#FAFAFA",
                    color: howMet === opt ? "#185FA5" : "#6B7280",
                  }}>
                  {howMet === opt ? "✓ " : ""}{opt}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
              <Tag size={11} style={{ display: "inline", marginRight: 4 }} />Tags
            </p>
            <div className="flex flex-wrap gap-2">
              {TAG_OPTIONS.map(tag => {
                const active = selectedTags.includes(tag);
                const style = TAG_COLORS[tag] ?? { bg: "#F4F6F9", color: "#6B7280" };
                return (
                  <button key={tag} onClick={() => toggleTag(tag)}
                    className="px-3 py-1.5 rounded-lg"
                    style={{
                      fontSize: 12,
                      border: active ? `1px solid ${style.color}` : "0.5px solid rgba(0,0,0,0.1)",
                      background: active ? style.bg : "#FAFAFA",
                      color: active ? style.color : "#6B7280",
                    }}>
                    {active ? "✓ " : ""}{tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Observações */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Observações internas</p>
            <textarea placeholder="Notas sobre o cliente (visíveis apenas para você)" rows={3}
              value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5"
              style={{ ...inputStyle, resize: "vertical" as const }} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4" style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)" }}>
          <button onClick={onClose} className="px-5 py-2 rounded-lg"
            style={{ border: "0.5px solid rgba(0,0,0,0.1)", fontSize: 13, color: "#374151" }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={saving} className="px-6 py-2 rounded-lg"
            style={{ background: "#185FA5", color: "#fff", fontSize: 13, fontWeight: 500, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Salvando..." : initial ? "Salvar" : "Cadastrar"}
          </button>
        </div>
      </div>
    </div>
  );
}