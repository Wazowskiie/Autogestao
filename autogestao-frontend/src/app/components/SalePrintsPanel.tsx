// Lista "Impressos de saída" da venda: cada impresso em HTML, PDF, DOC e assinatura eletrônica (Autentique)
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { SALE_PRINTS, getSaleDocuments, openSalePrint, type PrintFormat, type SaleDocuments } from "../../lib/sale-documents";
import { getEsignOverview, listSignatures, type EsignOverview, type SaleSignature } from "../../lib/esign-api";
import { SignatureList, SignModal } from "./SaleSignatures";

const FORMATS: { id: PrintFormat; label: string; hint: string }[] = [
  { id: "html", label: "HTML", hint: "Abrir numa aba nova" },
  { id: "pdf", label: "PDF", hint: "Abre já na tela de imprimir. Escolha \"Salvar como PDF\" no destino." },
  { id: "doc", label: "DOC", hint: "Baixar arquivo para editar no Word" },
];

export function SalePrintsPanel({ saleId }: { saleId: string }) {
  const [doc, setDoc] = useState<SaleDocuments | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [esign, setEsign] = useState<EsignOverview | null>(null);
  const [signatures, setSignatures] = useState<SaleSignature[]>([]);
  const [signing, setSigning] = useState<{ id: string; title: string } | null>(null);

  const loadSignatures = useCallback(() => {
    listSignatures(saleId).then(setSignatures).catch(() => undefined);
  }, [saleId]);

  useEffect(() => {
    setDoc(null); setLoadError(null);
    getSaleDocuments(saleId).then(setDoc).catch((e) => setLoadError(e instanceof Error ? e.message : "Erro ao carregar a venda"));
    getEsignOverview().then(setEsign).catch(() => setEsign(null));
    loadSignatures();
  }, [saleId, loadSignatures]);

  const esignBlock = !esign ? "Carregando..."
    : !esign.configured ? "A assinatura eletrônica ainda não foi ativada no servidor."
    : !esign.planAllows ? `A assinatura eletrônica não faz parte do plano ${esign.planName}. Veja em Planos.`
    : esign.used >= esign.limit ? `A loja já usou os ${esign.limit} envios do mês.`
    : null;

  const run = async (printId: string, format: PrintFormat) => {
    const key = `${printId}:${format}`;
    setError(null); setBusy(key);
    try {
      // Busca de novo para sair com os dados mais recentes (cliente, loja, pagamentos)
      await openSalePrint(saleId, printId, format);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao gerar o impresso");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between" style={{ borderBottom: "1px solid #E5E7EB", paddingBottom: 8, marginBottom: 4 }}>
        <h3 style={{ fontSize: 18, fontWeight: 500, color: "#111827" }}>Impressos de saída</h3>
        {doc && <span style={{ fontSize: 12, color: "#6B7280" }}>Contrato nº {doc.contractNumber}</span>}
      </div>
      {error && <p style={{ fontSize: 13, color: "#DC2626", margin: "8px 0" }}>{error}</p>}
      {loadError && <p style={{ fontSize: 13, color: "#DC2626", margin: "8px 0" }}>{loadError}</p>}
      {!doc && !loadError && <div className="flex items-center gap-2 py-6" style={{ color: "#6B7280", fontSize: 13 }}><Loader2 size={15} className="animate-spin" /> Carregando...</div>}
      {doc && (
        <div>
          {SALE_PRINTS.map((p, i) => {
            const reason = p.unavailable?.(doc) ?? null;
            return (
              <div key={p.id} className="flex items-center gap-3 flex-wrap"
                style={{ padding: "9px 8px", borderBottom: "1px solid #EEF0F3", background: i % 2 === 0 ? "#F8F9FC" : "#fff" }}>
                <div style={{ flex: 1, minWidth: 200, fontSize: 14, fontWeight: 600, color: reason ? "#9CA3AF" : "#374151" }} title={reason ?? undefined}>
                  {p.title}
                  {reason && <span style={{ fontWeight: 400, fontSize: 12, marginLeft: 8 }}>({reason})</span>}
                </div>
                <div className="flex items-center gap-2">
                  {FORMATS.map((f) => {
                    const key = `${p.id}:${f.id}`;
                    return (
                      <button key={f.id} disabled={!!reason || busy === key} title={f.hint} onClick={() => run(p.id, f.id)}
                        style={{ ...btn, opacity: reason ? 0.45 : 1, cursor: reason ? "not-allowed" : "pointer" }}>
                        {busy === key ? <Loader2 size={13} className="animate-spin" /> : f.label}
                      </button>
                    );
                  })}
                  <button disabled={!!reason || !!esignBlock} onClick={() => setSigning({ id: p.id, title: p.title })}
                    title={reason ?? esignBlock ?? "Enviar para o cliente assinar pelo celular (e-mail ou WhatsApp)"}
                    style={{ ...btn, opacity: reason || esignBlock ? 0.45 : 1, cursor: reason || esignBlock ? "not-allowed" : "pointer", color: reason || esignBlock ? "#374151" : "#185FA5", borderColor: reason || esignBlock ? "#E5E7EB" : "#B9D3EE" }}>
                    Ass.Eletrônica
                  </button>
                </div>
              </div>
            );
          })}
          <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8 }}>
            Campos sem informação no cadastro saem como linha em branco para preencher à mão. Confira CNPJ e endereço da loja em Configurações → Loja, e CPF, RG e endereço no cadastro do cliente.
            {esign?.configured && esign.planAllows && ` Assinatura eletrônica: ${esign.used} de ${esign.limit} envios usados neste mês.`}
            {esign?.sandbox && esign.configured && " (modo de teste: os documentos não têm validade jurídica)"}
          </p>
          <SignatureList signatures={signatures} onChanged={loadSignatures} />
        </div>
      )}
      {signing && doc && (
        <SignModal saleId={saleId} doc={doc} printId={signing.id} title={signing.title}
          onClose={() => setSigning(null)}
          onSent={() => { setSigning(null); loadSignatures(); getEsignOverview().then(setEsign).catch(() => undefined); }} />
      )}
    </div>
  );
}

const btn: React.CSSProperties = {
  minWidth: 46, height: 30, padding: "0 9px", borderRadius: 6, border: "1px solid #E5E7EB", background: "#fff",
  fontSize: 13, color: "#374151", display: "inline-flex", alignItems: "center", justifyContent: "center",
};

/** Janela com a lista de impressos (aberta pelo detalhe da venda) */
export function SalePrintsModal({ saleId, onClose }: { saleId: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 960, maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "20px 24px" }}>
          <SalePrintsPanel saleId={saleId} />
        </div>
        <div style={{ borderTop: "1px solid #E5E7EB", padding: "12px 24px", display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 18px", borderRadius: 8, background: "#E5E7EB", color: "#374151", fontSize: 14 }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
