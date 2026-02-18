import { useState, useMemo, useCallback, useEffect } from 'react';
import { Search, FileText, Upload, Check, X, ChevronLeft, ChevronRight, PlusCircle, Loader2, Paperclip, Trash2, Eye, AlertTriangle, DollarSign, Receipt, CheckCircle2, Clock, Wallet, ArrowDownCircle, ArrowUpCircle, RefreshCw, Edit2 } from 'lucide-react';
import { CATEGORIAS, CENTROS_COSTOS } from './datos';
import * as db from './supabase';

const MESES = { 1: 'Ene', 2: 'Feb', 3: 'Mar', 4: 'Abr', 5: 'May', 6: 'Jun', 7: 'Jul', 8: 'Ago', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dic' };
const formatCurrency = v => `$ ${Math.round(v || 0).toLocaleString()}`;
const formatDate = d => { if (!d) return '—'; const p = d.split('-'); return p.length === 3 ? `${p[2]} de ${MESES[parseInt(p[1])]} de ${p[0]}` : d; };
const centroColor = c => {
  if (c === 'La Vega') return 'bg-green-900/40 text-green-400';
  if (c === 'Bariloche') return 'bg-blue-900/40 text-blue-400';
  return 'bg-purple-900/40 text-purple-400';
};

// ==================== COMPONENTE PRINCIPAL ====================
export default function Contabilidad({ gastos, onGastosChange, userRole, userEmail }) {
  const [tab, setTab] = useState('gastos');
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-100 flex items-center gap-2"><Receipt size={24} className="text-amber-400" /> Contabilidad</h2>
          <p className="text-gray-400 text-sm mt-1">Gestión de facturas, costos y gastos</p>
        </div>
      </div>
      <div className="flex gap-1 bg-gray-900 rounded-xl p-1 border border-gray-800 w-fit">
        <button onClick={() => setTab('gastos')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'gastos' ? 'bg-gray-800 text-gray-100 shadow' : 'text-gray-400 hover:text-gray-300'}`}>💰 Gastos Generales</button>
        <button onClick={() => setTab('caja')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'caja' ? 'bg-gray-800 text-gray-100 shadow' : 'text-gray-400 hover:text-gray-300'}`}>💵 Caja Menor</button>
      </div>
      {tab === 'gastos' && <GastosGenerales gastos={gastos} onGastosChange={onGastosChange} userRole={userRole} />}
      {tab === 'caja' && <CajaMenor userEmail={userEmail} userRole={userRole} />}
    </div>
  );
}

// ==================== GASTOS GENERALES ====================
function GastosGenerales({ gastos, onGastosChange, userRole }) {
  const isAdmin = userRole === 'admin';
  const [filtros, setFiltros] = useState({ año: new Date().getFullYear().toString(), mes: '', centro: '', categoria: '', busqueda: '', sinFactura: false });
  const [page, setPage] = useState(1);
  const [editando, setEditando] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [operando, setOperando] = useState(false);
  const [showNuevo, setShowNuevo] = useState(false);
  const [nuevoForm, setNuevoForm] = useState({ fecha: '', monto: '', proveedor: '', tipo: 'Costo', centro: 'La Vega', categoria: '', comentarios: '' });
  const [sugerencias, setSugerencias] = useState([]);
  const [cargandoSug, setCargandoSug] = useState(false);
  const [subiendo, setSubiendo] = useState(null);
  const [preview, setPreview] = useState(null);
  const pageSize = 25;

  const años = useMemo(() => [...new Set(gastos.map(g => g.fecha?.split('-')[0]))].filter(Boolean).sort().reverse(), [gastos]);
  const filtered = useMemo(() => {
    return gastos.filter(g => {
      if (filtros.año && !g.fecha?.startsWith(filtros.año)) return false;
      if (filtros.mes && g.fecha?.split('-')[1] !== filtros.mes) return false;
      if (filtros.centro && g.centro !== filtros.centro) return false;
      if (filtros.categoria && g.categoria !== filtros.categoria) return false;
      if (filtros.sinFactura && g.factura_url) return false;
      if (filtros.busqueda) { const b = filtros.busqueda.toLowerCase(); return (g.proveedor?.toLowerCase().includes(b) || g.comentarios?.toLowerCase().includes(b) || g.categoria?.toLowerCase().includes(b)); }
      return true;
    });
  }, [gastos, filtros]);
  const totalFiltered = useMemo(() => filtered.reduce((s, g) => s + (g.monto || 0), 0), [filtered]);
  const paginated = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page]);
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const stats = useMemo(() => {
    const añoGastos = filtros.año ? gastos.filter(g => g.fecha?.startsWith(filtros.año)) : gastos;
    return { total: añoGastos.length, conFactura: añoGastos.filter(g => g.factura_url).length, sinFactura: añoGastos.filter(g => !g.factura_url).length, sinComentario: añoGastos.filter(g => !g.comentarios?.trim()).length, montoTotal: añoGastos.reduce((s, g) => s + (g.monto || 0), 0) };
  }, [gastos, filtros.año]);

  const buscarSugerencias = useCallback(async (proveedor) => {
    if (!proveedor || proveedor.length < 3) { setSugerencias([]); return; }
    setCargandoSug(true);
    try { setSugerencias(await db.getComentariosSugeridos(proveedor)); } catch (e) { console.error(e); setSugerencias([]); } finally { setCargandoSug(false); }
  }, []);
  const handleUploadFactura = async (costoId, file) => { setSubiendo(costoId); try { await db.uploadFactura(costoId, file); if (onGastosChange) await onGastosChange(); } catch (e) { alert('Error al subir factura: ' + e.message); } finally { setSubiendo(null); } };
  const handleDeleteFactura = async (costoId, facturaUrl) => { if (!confirm('¿Eliminar esta factura?')) return; setSubiendo(costoId); try { await db.deleteFactura(costoId, facturaUrl); if (onGastosChange) await onGastosChange(); } catch (e) { alert('Error: ' + e.message); } finally { setSubiendo(null); } };
  const handleSaveEdit = async () => {
    setOperando(true);
    try {
      const updates = { centro: editForm.centro, categoria: editForm.categoria, comentarios: editForm.comentarios?.trim() || null };
      if (isAdmin) { if (editForm.monto) updates.monto = parseFloat(editForm.monto); if (editForm.proveedor) updates.proveedor = editForm.proveedor.trim(); }
      await db.updateCosto(editando.id, updates); setEditando(null); if (onGastosChange) await onGastosChange();
    } catch (e) { alert('Error: ' + e.message); } finally { setOperando(false); }
  };
  const handleSaveNuevo = async () => {
    if (!nuevoForm.fecha || !nuevoForm.monto || !nuevoForm.proveedor) { alert('Completa fecha, monto y proveedor'); return; }
    setOperando(true);
    try { await db.insertCosto({ fecha: nuevoForm.fecha, monto: parseFloat(nuevoForm.monto), proveedor: nuevoForm.proveedor.trim(), tipo: nuevoForm.tipo || 'Costo', centro: nuevoForm.centro || 'La Vega', categoria: nuevoForm.categoria || 'General', comentarios: nuevoForm.comentarios?.trim() || '', estado: 'aprobado' }); setShowNuevo(false); if (onGastosChange) await onGastosChange(); } catch (e) { alert('Error: ' + e.message); } finally { setOperando(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => { setShowNuevo(true); setNuevoForm({ fecha: new Date().toISOString().split('T')[0], monto: '', proveedor: '', tipo: 'Costo', centro: 'La Vega', categoria: '', comentarios: '' }); setSugerencias([]); }} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-xl shadow-lg hover:bg-green-700 transition-colors text-sm"><PlusCircle size={18} /> Nuevo Gasto</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800"><div className="flex items-center gap-2 text-gray-500 text-xs mb-1"><DollarSign size={14} /> Total {filtros.año}</div><p className="text-lg font-bold text-gray-100">{formatCurrency(stats.montoTotal)}</p><p className="text-xs text-gray-500">{stats.total} registros</p></div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800"><div className="flex items-center gap-2 text-green-500 text-xs mb-1"><CheckCircle2 size={14} /> Con Factura</div><p className="text-lg font-bold text-green-400">{stats.conFactura}</p><p className="text-xs text-gray-500">{stats.total > 0 ? Math.round(stats.conFactura / stats.total * 100) : 0}% completado</p></div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800"><div className="flex items-center gap-2 text-amber-500 text-xs mb-1"><Clock size={14} /> Sin Factura</div><p className="text-lg font-bold text-amber-400">{stats.sinFactura}</p><p className="text-xs text-gray-500">Pendientes de soporte</p></div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800"><div className="flex items-center gap-2 text-red-500 text-xs mb-1"><AlertTriangle size={14} /> Sin Comentario</div><p className="text-lg font-bold text-red-400">{stats.sinComentario}</p><p className="text-xs text-gray-500">Requieren descripción</p></div>
      </div>
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          <select value={filtros.año} onChange={e => { setFiltros({ ...filtros, año: e.target.value }); setPage(1); }} className="px-3 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl text-sm"><option value="">Todos</option>{años.map(a => <option key={a} value={a}>{a}</option>)}</select>
          <select value={filtros.mes} onChange={e => { setFiltros({ ...filtros, mes: e.target.value }); setPage(1); }} className="px-3 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl text-sm"><option value="">Mes</option>{Object.entries(MESES).map(([k, v]) => <option key={k} value={k.padStart(2, '0')}>{v}</option>)}</select>
          <select value={filtros.centro} onChange={e => { setFiltros({ ...filtros, centro: e.target.value }); setPage(1); }} className="px-3 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl text-sm"><option value="">Finca</option>{CENTROS_COSTOS.map(c => <option key={c} value={c}>{c}</option>)}</select>
          <select value={filtros.categoria} onChange={e => { setFiltros({ ...filtros, categoria: e.target.value }); setPage(1); }} className="px-3 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl text-sm"><option value="">Categoría</option>{CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}</select>
          <label className="flex items-center gap-2 px-3 py-2 border border-gray-700 bg-gray-800 rounded-xl text-sm cursor-pointer"><input type="checkbox" checked={filtros.sinFactura} onChange={e => { setFiltros({ ...filtros, sinFactura: e.target.checked }); setPage(1); }} className="rounded border-gray-600 bg-gray-700 text-amber-500 focus:ring-amber-500" /><span className="text-amber-400 text-xs">Sin factura</span></label>
          <div className="col-span-2 relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} /><input type="text" placeholder="Buscar proveedor, comentario..." value={filtros.busqueda} onChange={e => { setFiltros({ ...filtros, busqueda: e.target.value }); setPage(1); }} className="w-full pl-9 pr-4 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl text-sm" /></div>
        </div>
      </div>
      <div className="text-sm text-gray-400">{filtered.length} registros • {formatCurrency(totalFiltered)}</div>
      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-800/50 border-b border-gray-700"><tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Fecha</th><th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Proveedor</th><th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 hidden lg:table-cell">Comentario</th><th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Finca</th><th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 hidden md:table-cell">Categoría</th><th className="px-4 py-3 text-right text-xs font-semibold text-gray-400">Monto</th><th className="px-4 py-3 text-center text-xs font-semibold text-gray-400">Factura</th><th className="px-4 py-3 text-center text-xs font-semibold text-gray-400">Acc.</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-800">
              {paginated.map(g => (
                <tr key={g.id} className={`hover:bg-gray-800/50 transition-colors ${!g.comentarios?.trim() ? 'border-l-2 border-l-amber-500' : ''}`}>
                  <td className="px-4 py-3 text-sm text-gray-300 whitespace-nowrap">{formatDate(g.fecha)}</td>
                  <td className="px-4 py-3 font-medium text-sm text-gray-200">{g.proveedor}</td>
                  <td className="px-4 py-3 text-sm text-gray-400 hidden lg:table-cell truncate max-w-xs">{g.comentarios?.trim() || <span className="text-amber-500 italic text-xs">Sin comentario</span>}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-full ${centroColor(g.centro)}`}>{g.centro}</span></td>
                  <td className="px-4 py-3 text-sm text-gray-400 hidden md:table-cell">{g.categoria}</td>
                  <td className="px-4 py-3 text-right font-semibold text-sm text-gray-200">{formatCurrency(g.monto)}</td>
                  <td className="px-4 py-3 text-center">
                    {subiendo === g.id ? <Loader2 size={16} className="animate-spin text-amber-400 mx-auto" /> :
                    g.factura_url ? (<div className="flex items-center justify-center gap-1"><button onClick={() => setPreview(g)} className="p-1 text-green-400 hover:bg-green-900/20 rounded"><Eye size={16} /></button><button onClick={() => handleDeleteFactura(g.id, g.factura_url)} className="p-1 text-red-400 hover:bg-red-900/20 rounded"><Trash2 size={14} /></button></div>) :
                    (<label className="cursor-pointer p-1.5 text-amber-500 hover:bg-amber-900/20 rounded-lg inline-block"><Upload size={16} /><input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={e => { if (e.target.files[0]) handleUploadFactura(g.id, e.target.files[0]); }} /></label>)}
                  </td>
                  <td className="px-4 py-3 text-center"><button onClick={() => { setEditando(g); setEditForm({ centro: g.centro || '', categoria: g.categoria || '', comentarios: g.comentarios || '', monto: g.monto || '', proveedor: g.proveedor || '' }); buscarSugerencias(g.proveedor); }} className="p-1.5 text-blue-400 hover:bg-blue-900/20 rounded-lg"><FileText size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (<div className="flex items-center justify-between px-4 py-3 border-t border-gray-800 bg-gray-800/30"><span className="text-sm text-gray-400">Página {page} de {totalPages}</span><div className="flex gap-2"><button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg hover:bg-gray-700 disabled:opacity-30 text-gray-300"><ChevronLeft size={20} /></button><button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg hover:bg-gray-700 disabled:opacity-30 text-gray-300"><ChevronRight size={20} /></button></div></div>)}
      </div>

      {editando && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"><div className="bg-gray-900 rounded-2xl p-6 max-w-lg w-full border border-gray-800 max-h-[90vh] overflow-y-auto">
          <h3 className="text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2"><FileText size={20} className="text-blue-400" /> Completar Registro</h3>
          <div className="bg-gray-800 rounded-xl p-4 mb-4 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-gray-500">Fecha</span><span className="text-gray-200">{formatDate(editando.fecha)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Proveedor</span>{isAdmin ? <input type="text" value={editForm.proveedor} onChange={e => setEditForm(f => ({ ...f, proveedor: e.target.value }))} className="text-right bg-gray-700 border border-gray-600 rounded px-2 py-0.5 text-gray-200 text-sm w-40" /> : <span className="font-medium text-gray-200">{editando.proveedor}</span>}</div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Monto</span>{isAdmin ? <input type="number" value={editForm.monto} onChange={e => setEditForm(f => ({ ...f, monto: e.target.value }))} className="text-right bg-gray-700 border border-gray-600 rounded px-2 py-0.5 text-gray-200 text-sm w-40" /> : <span className="font-semibold text-gray-100">{formatCurrency(editando.monto)}</span>}</div>
            {editando.factura_url && <div className="flex justify-between text-sm items-center"><span className="text-gray-500">Factura</span><a href={editando.factura_url} target="_blank" rel="noopener noreferrer" className="text-green-400 text-xs flex items-center gap-1 hover:underline"><Paperclip size={12} /> {editando.factura_nombre || 'Ver archivo'}</a></div>}
          </div>
          <div className="space-y-3 mb-4">
            <div><label className="block text-xs text-gray-500 mb-1">Finca *</label><select value={editForm.centro} onChange={e => setEditForm(f => ({ ...f, centro: e.target.value }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm focus:border-blue-500 outline-none">{CENTROS_COSTOS.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
            <div><label className="block text-xs text-gray-500 mb-1">Categoría *</label><select value={editForm.categoria} onChange={e => setEditForm(f => ({ ...f, categoria: e.target.value }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm focus:border-blue-500 outline-none"><option value="">Seleccionar...</option>{CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
            <div><label className="block text-xs text-gray-500 mb-1">Comentario</label><textarea value={editForm.comentarios} onChange={e => setEditForm(f => ({ ...f, comentarios: e.target.value }))} rows={2} placeholder="Descripción del gasto..." className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm focus:border-blue-500 outline-none resize-none" /></div>
            {sugerencias.length > 0 && (<div className="bg-blue-900/15 border border-blue-800/40 rounded-xl p-3"><p className="text-xs text-blue-400 mb-2 font-medium">💡 Sugerencias para "{editando.proveedor}":</p><div className="space-y-1">{sugerencias.map((s, i) => (<button key={i} onClick={() => setEditForm(f => ({ ...f, comentarios: s.texto, centro: s.centro || f.centro, categoria: s.categoria || f.categoria }))} className="w-full text-left px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors flex justify-between items-center"><span className="truncate">{s.texto}</span><span className="text-xs text-gray-500 ml-2 shrink-0">({s.count}x)</span></button>))}</div></div>)}
            {cargandoSug && <p className="text-xs text-gray-500 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Buscando sugerencias...</p>}
            {!editando.factura_url && (<div><label className="block text-xs text-gray-500 mb-1">Adjuntar factura</label><label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-700 rounded-xl cursor-pointer hover:border-amber-600 hover:bg-amber-900/10 transition-colors"><Upload size={18} className="text-amber-400" /><span className="text-sm text-gray-400">Seleccionar archivo (PDF o imagen)</span><input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={async e => { if (e.target.files[0]) { setSubiendo(editando.id); try { await db.uploadFactura(editando.id, e.target.files[0]); if (onGastosChange) await onGastosChange(); setEditando(prev => ({ ...prev, factura_url: 'uploaded', factura_nombre: e.target.files[0].name })); } catch (err) { alert('Error: ' + err.message); } finally { setSubiendo(null); } } }} /></label>{subiendo === editando.id && <p className="text-xs text-amber-400 mt-1 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Subiendo...</p>}</div>)}
          </div>
          <div className="flex gap-3"><button onClick={() => { setEditando(null); setSugerencias([]); }} disabled={operando} className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-xl hover:bg-gray-700 transition-colors">Cancelar</button><button onClick={handleSaveEdit} disabled={operando} className="flex-1 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">{operando ? <><Loader2 size={16} className="animate-spin" />Guardando...</> : <><Check size={16} />Guardar</>}</button></div>
        </div></div>
      )}

      {showNuevo && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"><div className="bg-gray-900 rounded-2xl p-6 max-w-lg w-full border border-gray-800 max-h-[90vh] overflow-y-auto">
          <h3 className="text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2"><PlusCircle size={20} className="text-green-400" /> Nuevo Gasto</h3>
          <div className="space-y-3 mb-4">
            <div className="grid grid-cols-2 gap-3"><div><label className="block text-xs text-gray-500 mb-1">Fecha *</label><input type="date" value={nuevoForm.fecha} onChange={e => setNuevoForm(f => ({ ...f, fecha: e.target.value }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm focus:border-green-500 outline-none" /></div><div><label className="block text-xs text-gray-500 mb-1">Monto *</label><input type="number" value={nuevoForm.monto} onChange={e => setNuevoForm(f => ({ ...f, monto: e.target.value }))} placeholder="$ 0" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm focus:border-green-500 outline-none" /></div></div>
            <div><label className="block text-xs text-gray-500 mb-1">Proveedor *</label><input type="text" value={nuevoForm.proveedor} onChange={e => { setNuevoForm(f => ({ ...f, proveedor: e.target.value })); buscarSugerencias(e.target.value); }} placeholder="Nombre del proveedor" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm focus:border-green-500 outline-none" /></div>
            <div className="grid grid-cols-2 gap-3"><div><label className="block text-xs text-gray-500 mb-1">Finca *</label><select value={nuevoForm.centro} onChange={e => setNuevoForm(f => ({ ...f, centro: e.target.value }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm focus:border-green-500 outline-none">{CENTROS_COSTOS.map(c => <option key={c} value={c}>{c}</option>)}</select></div><div><label className="block text-xs text-gray-500 mb-1">Categoría *</label><select value={nuevoForm.categoria} onChange={e => setNuevoForm(f => ({ ...f, categoria: e.target.value }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm focus:border-green-500 outline-none"><option value="">Seleccionar...</option>{CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}</select></div></div>
            <div><label className="block text-xs text-gray-500 mb-1">Comentario</label><textarea value={nuevoForm.comentarios} onChange={e => setNuevoForm(f => ({ ...f, comentarios: e.target.value }))} rows={2} placeholder="Descripción del gasto..." className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm focus:border-green-500 outline-none resize-none" /></div>
            {sugerencias.length > 0 && (<div className="bg-green-900/15 border border-green-800/40 rounded-xl p-3"><p className="text-xs text-green-400 mb-2 font-medium">💡 Sugerencias para "{nuevoForm.proveedor}":</p><div className="space-y-1">{sugerencias.map((s, i) => (<button key={i} onClick={() => setNuevoForm(f => ({ ...f, comentarios: s.texto, centro: s.centro || f.centro, categoria: s.categoria || f.categoria }))} className="w-full text-left px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors flex justify-between items-center"><span className="truncate">{s.texto}</span><span className="text-xs text-gray-500 ml-2 shrink-0">({s.count}x)</span></button>))}</div></div>)}
          </div>
          <div className="flex gap-3"><button onClick={() => { setShowNuevo(false); setSugerencias([]); }} disabled={operando} className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-xl hover:bg-gray-700 transition-colors">Cancelar</button><button onClick={handleSaveNuevo} disabled={operando} className="flex-1 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">{operando ? <><Loader2 size={16} className="animate-spin" />Guardando...</> : <><Check size={16} />Registrar Gasto</>}</button></div>
        </div></div>
      )}

      {preview && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setPreview(null)}><div className="bg-gray-900 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden border border-gray-800" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-4 border-b border-gray-800"><div><p className="font-medium text-gray-200">{preview.proveedor} — {formatDate(preview.fecha)}</p><p className="text-xs text-gray-500">{preview.factura_nombre}</p></div><div className="flex items-center gap-2"><a href={preview.factura_url} target="_blank" rel="noopener noreferrer" className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">Abrir original</a><button onClick={() => setPreview(null)} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400"><X size={20} /></button></div></div>
          <div className="p-4 flex items-center justify-center min-h-[400px] bg-gray-950">{preview.factura_url?.match(/\.(jpg|jpeg|png|webp)$/i) ? <img src={preview.factura_url} alt="Factura" className="max-w-full max-h-[70vh] object-contain rounded-lg" /> : <iframe src={preview.factura_url} className="w-full h-[70vh] rounded-lg" title="Factura PDF" />}</div>
        </div></div>
      )}
    </div>
  );
}

// ==================== CAJA MENOR ====================
function CajaMenor({ userEmail, userRole }) {
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(null);
  const [form, setForm] = useState({});
  const [operando, setOperando] = useState(false);
  const [subiendo, setSubiendo] = useState(null);
  const [editando, setEditando] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [preview, setPreview] = useState(null);
  const [filtroFinca, setFiltroFinca] = useState('');

  const cargar = async () => {
    try { setRegistros(await db.getCajaMenor()); }
    catch (e) { console.error('Error cargando caja menor:', e); }
    finally { setLoading(false); }
  };
  useEffect(() => { cargar(); }, []);

  const stats = useMemo(() => {
    const giros = registros.filter(r => r.tipo === 'giro');
    const gastos = registros.filter(r => r.tipo === 'gasto');
    const totalGirado = giros.reduce((s, r) => s + Number(r.monto), 0);
    const totalGastado = gastos.reduce((s, r) => s + Number(r.monto), 0);
    const ultimoGiro = giros.length > 0 ? giros[0] : null;
    return { totalGirado, totalGastado, saldo: totalGirado - totalGastado, ultimoGiro, totalGiros: giros.length, totalGastos: gastos.length };
  }, [registros]);

  const filtered = useMemo(() => {
    if (!filtroFinca) return registros;
    return registros.filter(r => r.finca === filtroFinca);
  }, [registros, filtroFinca]);

  const initForm = (tipo) => {
    setForm({ fecha: new Date().toISOString().split('T')[0], monto: '', concepto: '', proveedor: '', finca: 'La Vega' });
    setShowModal(tipo);
    setEditando(null);
  };

  const handleSave = async () => {
    if (!form.fecha || !form.monto || !form.concepto) { alert('Completa fecha, monto y concepto'); return; }
    setOperando(true);
    try {
      const registro = { fecha: form.fecha, tipo: editando ? editando.tipo : showModal, monto: parseFloat(form.monto), concepto: form.concepto.trim(), proveedor: form.proveedor?.trim() || null, finca: form.finca || 'La Vega', registrado_por: userEmail };
      if (editando) { await db.updateCajaMenor(editando.id, registro); }
      else { await db.insertCajaMenor(registro); }
      setShowModal(null); setEditando(null); await cargar();
    } catch (e) { alert('Error: ' + e.message); }
    finally { setOperando(false); }
  };

  const handleDelete = async () => {
    setOperando(true);
    try { await db.deleteCajaMenor(confirmDelete.id); setConfirmDelete(null); await cargar(); }
    catch (e) { alert('Error: ' + e.message); }
    finally { setOperando(false); }
  };

  const handleUpload = async (registroId, file) => {
    setSubiendo(registroId);
    try { await db.uploadFacturaCajaMenor(registroId, file); await cargar(); }
    catch (e) { alert('Error al subir: ' + e.message); }
    finally { setSubiendo(null); }
  };

  const startEdit = (r) => {
    setForm({ fecha: r.fecha, monto: r.monto, concepto: r.concepto, proveedor: r.proveedor || '', finca: r.finca || 'La Vega' });
    setEditando(r);
    setShowModal(r.tipo);
  };

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 size={24} className="animate-spin mr-2" /> Cargando caja menor...</div>;

  return (
    <div className="space-y-4">
      {/* Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="flex items-center gap-2 text-green-500 text-xs mb-1"><ArrowDownCircle size={14} /> Total Girado</div>
          <p className="text-lg font-bold text-green-400">{formatCurrency(stats.totalGirado)}</p>
          <p className="text-xs text-gray-500">{stats.totalGiros} giros</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="flex items-center gap-2 text-red-500 text-xs mb-1"><ArrowUpCircle size={14} /> Total Gastado</div>
          <p className="text-lg font-bold text-red-400">{formatCurrency(stats.totalGastado)}</p>
          <p className="text-xs text-gray-500">{stats.totalGastos} gastos</p>
        </div>
        <div className={`bg-gray-900 rounded-xl p-4 border ${stats.saldo > 0 ? 'border-green-800/50' : 'border-red-800/50'}`}>
          <div className="flex items-center gap-2 text-amber-500 text-xs mb-1"><Wallet size={14} /> Saldo Disponible</div>
          <p className={`text-lg font-bold ${stats.saldo > 0 ? 'text-green-400' : stats.saldo < 0 ? 'text-red-400' : 'text-gray-400'}`}>{formatCurrency(stats.saldo)}</p>
          <p className="text-xs text-gray-500">{stats.saldo <= 0 ? 'Requiere reposición' : 'Fondos disponibles'}</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="flex items-center gap-2 text-blue-500 text-xs mb-1"><Clock size={14} /> Último Giro</div>
          <p className="text-sm font-bold text-blue-400">{stats.ultimoGiro ? formatCurrency(stats.ultimoGiro.monto) : '—'}</p>
          <p className="text-xs text-gray-500">{stats.ultimoGiro ? formatDate(stats.ultimoGiro.fecha) : 'Sin giros'}</p>
        </div>
      </div>

      {/* Acciones + filtro */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <select value={filtroFinca} onChange={e => setFiltroFinca(e.target.value)} className="px-3 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl text-sm">
            <option value="">Todas las fincas</option>
            {CENTROS_COSTOS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={() => { setLoading(true); cargar(); }} className="p-2 text-gray-400 hover:bg-gray-800 rounded-lg" title="Refrescar"><RefreshCw size={18} /></button>
        </div>
        <div className="flex gap-2">
          <button onClick={() => initForm('giro')} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-xl shadow-lg hover:bg-green-700 transition-colors text-sm"><ArrowDownCircle size={18} /> Registrar Giro</button>
          <button onClick={() => initForm('gasto')} className="flex items-center gap-2 bg-amber-600 text-white px-4 py-2 rounded-xl shadow-lg hover:bg-amber-700 transition-colors text-sm"><ArrowUpCircle size={18} /> Registrar Gasto</button>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-800/50 border-b border-gray-700"><tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Fecha</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Tipo</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Concepto</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 hidden md:table-cell">Proveedor</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Finca</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400">Monto</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400">Soporte</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400">Acc.</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-800">
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No hay registros de caja menor</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-300 whitespace-nowrap">{formatDate(r.fecha)}</td>
                  <td className="px-4 py-3">
                    {r.tipo === 'giro' ? <span className="text-xs px-2 py-1 rounded-full bg-green-900/40 text-green-400 flex items-center gap-1 w-fit"><ArrowDownCircle size={12} /> Giro</span>
                    : <span className="text-xs px-2 py-1 rounded-full bg-red-900/40 text-red-400 flex items-center gap-1 w-fit"><ArrowUpCircle size={12} /> Gasto</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-200">{r.concepto}</td>
                  <td className="px-4 py-3 text-sm text-gray-400 hidden md:table-cell">{r.proveedor || '—'}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-full ${centroColor(r.finca)}`}>{r.finca}</span></td>
                  <td className={`px-4 py-3 text-right font-semibold text-sm ${r.tipo === 'giro' ? 'text-green-400' : 'text-red-400'}`}>{r.tipo === 'giro' ? '+' : '-'} {formatCurrency(r.monto)}</td>
                  <td className="px-4 py-3 text-center">
                    {r.tipo === 'gasto' ? (
                      subiendo === r.id ? <Loader2 size={16} className="animate-spin text-amber-400 mx-auto" /> :
                      r.factura_url ? <button onClick={() => setPreview(r)} className="p-1 text-green-400 hover:bg-green-900/20 rounded" title="Ver soporte"><Eye size={16} /></button>
                      : <label className="cursor-pointer p-1.5 text-amber-500 hover:bg-amber-900/20 rounded-lg inline-block" title="Subir soporte"><Upload size={16} /><input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={e => { if (e.target.files[0]) handleUpload(r.id, e.target.files[0]); }} /></label>
                    ) : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex justify-center gap-1">
                      <button onClick={() => startEdit(r)} className="p-1.5 text-blue-400 hover:bg-blue-900/20 rounded-lg" title="Editar"><Edit2 size={14} /></button>
                      <button onClick={() => setConfirmDelete(r)} className="p-1.5 text-red-400 hover:bg-red-900/20 rounded-lg" title="Eliminar"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Giro/Gasto */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"><div className="bg-gray-900 rounded-2xl p-6 max-w-lg w-full border border-gray-800">
          <h3 className="text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2">
            {showModal === 'giro' ? <><ArrowDownCircle size={20} className="text-green-400" /> {editando ? 'Editar' : 'Registrar'} Giro</> : <><ArrowUpCircle size={20} className="text-amber-400" /> {editando ? 'Editar' : 'Registrar'} Gasto</>}
          </h3>
          <div className="space-y-3 mb-4">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-gray-500 mb-1">Fecha *</label><input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm outline-none focus:border-green-500" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Monto *</label><input type="number" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} placeholder="$ 0" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm outline-none focus:border-green-500" /></div>
            </div>
            <div><label className="block text-xs text-gray-500 mb-1">Concepto *</label><input type="text" value={form.concepto} onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))} placeholder={showModal === 'giro' ? 'Ej: Reposición caja menor enero' : 'Ej: Compra insumos veterinarios'} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm outline-none focus:border-green-500" /></div>
            {showModal === 'gasto' && (<div><label className="block text-xs text-gray-500 mb-1">Proveedor</label><input type="text" value={form.proveedor} onChange={e => setForm(f => ({ ...f, proveedor: e.target.value }))} placeholder="Nombre del proveedor" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm outline-none focus:border-green-500" /></div>)}
            <div><label className="block text-xs text-gray-500 mb-1">Finca</label><select value={form.finca} onChange={e => setForm(f => ({ ...f, finca: e.target.value }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm outline-none focus:border-green-500">{CENTROS_COSTOS.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setShowModal(null); setEditando(null); }} disabled={operando} className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-xl hover:bg-gray-700 transition-colors">Cancelar</button>
            <button onClick={handleSave} disabled={operando} className={`flex-1 py-2 text-white rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 transition-colors ${showModal === 'giro' ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-600 hover:bg-amber-700'}`}>{operando ? <><Loader2 size={16} className="animate-spin" />Guardando...</> : <><Check size={16} />{editando ? 'Actualizar' : 'Registrar'}</>}</button>
          </div>
        </div></div>
      )}

      {/* Modal Confirmar Eliminación */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"><div className="bg-gray-900 rounded-2xl p-6 max-w-sm w-full border border-gray-800">
          <h3 className="text-lg font-semibold text-gray-100 mb-2">¿Eliminar este registro?</h3>
          <div className="bg-gray-800 rounded-xl p-3 mb-3 text-sm space-y-1">
            <p><span className="text-gray-500">Tipo:</span> <span className={confirmDelete.tipo === 'giro' ? 'text-green-400' : 'text-red-400'}>{confirmDelete.tipo === 'giro' ? 'Giro' : 'Gasto'}</span></p>
            <p><span className="text-gray-500">Concepto:</span> <span className="text-gray-200">{confirmDelete.concepto}</span></p>
            <p><span className="text-gray-500">Monto:</span> <span className="text-gray-200 font-semibold">{formatCurrency(confirmDelete.monto)}</span></p>
          </div>
          <p className="text-sm text-red-400/80 mb-4">Esta acción no se puede deshacer.</p>
          <div className="flex gap-3">
            <button onClick={() => setConfirmDelete(null)} disabled={operando} className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-xl hover:bg-gray-700 transition-colors">Cancelar</button>
            <button onClick={handleDelete} disabled={operando} className="flex-1 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">{operando ? <><Loader2 size={16} className="animate-spin" />Eliminando...</> : <><Trash2 size={16} />Eliminar</>}</button>
          </div>
        </div></div>
      )}

      {/* Modal Preview Soporte */}
      {preview && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setPreview(null)}><div className="bg-gray-900 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden border border-gray-800" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-4 border-b border-gray-800"><div><p className="font-medium text-gray-200">{preview.concepto} — {formatDate(preview.fecha)}</p><p className="text-xs text-gray-500">{preview.factura_nombre}</p></div><div className="flex items-center gap-2"><a href={preview.factura_url} target="_blank" rel="noopener noreferrer" className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">Abrir original</a><button onClick={() => setPreview(null)} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400"><X size={20} /></button></div></div>
          <div className="p-4 flex items-center justify-center min-h-[400px] bg-gray-950">{preview.factura_url?.match(/\.(jpg|jpeg|png|webp)$/i) ? <img src={preview.factura_url} alt="Soporte" className="max-w-full max-h-[70vh] object-contain rounded-lg" /> : <iframe src={preview.factura_url} className="w-full h-[70vh] rounded-lg" title="Soporte PDF" />}</div>
        </div></div>
      )}
    </div>
  );
}
