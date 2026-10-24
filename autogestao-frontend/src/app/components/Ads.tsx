import { useEffect, useState } from 'react';
import { request } from '../../lib/api';

type Vehicle = { id: string; brand: string; model: string; year: number; price: string | number; photos: { url: string }[] };
type Ad = { id: string; channel: string; title: string; description: string; status: string; vehicle: { brand: string; model: string; year: number; photos: { url: string }[] } };
export function Ads() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [channel, setChannel] = useState('olx');
  const [editing, setEditing] = useState<Ad | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function reload() {
    const [v, a] = await Promise.all([request<Vehicle[]>('/ads/vehicles'), request<Ad[]>('/ads/listings')]);
    setVehicles(v); setAds(a);
  }
  useEffect(() => { reload().catch(e => setError(e.message)); }, []);
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await action(); await reload(); setEditing(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erro inesperado'); }
    finally { setBusy(false); }
  }
  return <div className="p-6 space-y-6 overflow-auto h-full" style={{ background: 'var(--background)' }}>
    <div><h1 className="text-2xl font-semibold">Central de Anúncios</h1><p className="text-sm text-gray-500">Crie rascunhos a partir do estoque. Publicação externa ainda não habilitada.</p></div>
    {error && <div role="alert" className="rounded-lg p-3 bg-red-50 text-red-700">{error}</div>}
    <div className="rounded-xl border p-4 bg-white space-y-3"><h2 className="font-semibold">Novo rascunho</h2>
      <div className="flex flex-wrap gap-3"><select className="border rounded-lg p-2 flex-1" value={vehicleId} onChange={e => setVehicleId(e.target.value)}><option value="">Selecione um veículo disponível</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.brand} {v.model} {v.year} — R$ {Number(v.price).toLocaleString('pt-BR')}</option>)}</select>
      <select className="border rounded-lg p-2" value={channel} onChange={e => setChannel(e.target.value)}><option value="olx">OLX</option><option value="instagram">Instagram</option></select>
      <button disabled={!vehicleId || busy} className="rounded-lg bg-blue-700 text-white px-4 py-2 disabled:opacity-50" onClick={() => run(() => request('/ads/listings', { method: 'POST', body: { vehicleId, channel } }))}>Criar rascunho</button></div></div>
    <div className="space-y-3"><h2 className="font-semibold">Rascunhos ({ads.length})</h2>
      {ads.length === 0 && <p className="text-gray-500 text-sm">Nenhum anúncio cadastrado.</p>}
      {ads.map(ad => <div key={ad.id} className="bg-white border rounded-xl p-4 flex flex-wrap gap-4 items-center">
        {ad.vehicle.photos[0]?.url && <img src={ad.vehicle.photos[0].url} alt="Veículo" className="w-24 h-20 object-cover rounded-lg" />}
        <div className="flex-1 min-w-48"><div className="font-semibold">{ad.title}</div><div className="text-sm text-gray-500">{ad.channel.toUpperCase()} · {ad.status === 'draft' ? 'Rascunho' : ad.status}</div></div>
        <button className="border rounded-lg px-3 py-2" onClick={() => { setEditing(ad); setTitle(ad.title); setDescription(ad.description || ''); }}>Editar</button>
        <button disabled={busy} className="border border-red-200 text-red-700 rounded-lg px-3 py-2" onClick={() => { if (window.confirm('Excluir este rascunho?')) run(() => request(`/ads/listings/${ad.id}`, { method: 'DELETE' })); }}>Excluir</button>
      </div>)}</div>
    {editing && <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"><div className="bg-white rounded-xl p-5 w-full max-w-xl space-y-3"><h2 className="font-semibold">Editar rascunho</h2><input className="border rounded-lg p-2 w-full" value={title} onChange={e => setTitle(e.target.value)} maxLength={150}/><textarea className="border rounded-lg p-2 w-full" rows={6} value={description} onChange={e => setDescription(e.target.value)} maxLength={10000}/><div className="flex justify-end gap-2"><button className="border rounded-lg px-4 py-2" onClick={() => setEditing(null)}>Cancelar</button><button disabled={busy || !title.trim()} className="bg-blue-700 text-white rounded-lg px-4 py-2" onClick={() => run(() => request(`/ads/listings/${editing.id}`, { method: 'PATCH', body: { title, description } }))}>Salvar</button></div></div></div>}
  </div>;
}
