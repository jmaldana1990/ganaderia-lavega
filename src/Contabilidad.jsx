import { useState, useMemo, useCallback } from 'react';
import { Search, FileText, Upload, Check, X, ChevronLeft, ChevronRight, PlusCircle, Loader2, Paperclip, Trash2, Eye, AlertTriangle, DollarSign, Receipt, CheckCircle2, Clock } from 'lucide-react';
import { CATEGORIAS, CENTROS_COSTOS } from './datos';
import * as db from './supabase';

const MESES = { 1: 'Ene', 2: 'Feb', 3: 'Mar', 4: 'Abr', 5: 'May', 6: 'Jun', 7: 'Jul', 8: 'Ago', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dic' };
const formatCurrency = v => `$ ${Math.round(v || 0).toLocaleString()}`;
const formatDate = d => { if (!d) return '—'; const p = d.split('-'); return p.length === 3 ? `${p[2]} de ${MESES[parseInt(p[1])]} de ${p[0]}` : d; };

export default function Contabilidad({ gastos, onGastosChange, userRole }) {
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
      if (filtros.busqueda) {
        const b = filtros.busqueda.toLowerCase();
        return (g.proveedor?.toLowerCase().includes(b) || g.comentarios?.toLowerCase().includes(b) || g.categoria?.toLowerCase().includes(b));
      }
      return true;
    });
  }, [gastos, filtros]);

  const totalFiltered = useMemo(() => filtered.reduce((s, g) => s + (g.monto || 0), 0), [filtered]);
  const paginated = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page]);
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;

  // Stats
  const stats = useMemo(() => {
    const añoGastos = filtros.año ? gastos.filter(g => g.fecha?.startsWith(filtros.año)) : gastos;
    return {
      total: añoGastos.length,
      conFactura: añoGastos.filter(g => g.factura_url).length,
      sinFactura: añoGastos.filter(g => !g.factura_url).length,
      sinComentario: añoGastos.filter(g => !g.comentarios?.trim()).length,
      montoTotal: añoGastos.reduce((s, g) => s + (g.monto || 0), 0)
    };
  }, [gastos, filtros.año]);

  // Auto-sugerir comentario al seleccionar proveedor
  const buscarSugerencias = useCallback(async (proveedor) => {
    if (!proveedor || proveedor.length < 3) { setSugerencias([]); return; }
    setCargandoSug(true);
    try {
      const sugs = await db.getComentariosSugeridos(proveedor);
      setSugerencias(sugs);
    } catch (e) {
      console.error(e);
      setSugerencias([]);
    } finally {
      setCargandoSug(false);
    }
  }, []);

  // Subir factura
  const handleUploadFactura = async (costoId, file) => {
    setSubiendo(costoId);
    try {
      await db.uploadFactura(costoId, file);
      if (onGastosChange) await onGastosChange();
    } catch (e) {
      alert('Error al subir factura: ' + e.message);
    } finally {
      setSubiendo(null);
    }
  };

  // Eliminar factura
  const handleDeleteFactura = async (costoId, facturaUrl) => {
    if (!confirm('¿Eliminar esta factura?')) return;
    setSubiendo(costoId);
    try {
      await db.deleteFactura(costoId, facturaUrl);
      if (onGastosChange) await onGastosChange();
    } catch (e) {
      alert('Error al eliminar factura: ' + e.message);
    } finally {
      setSubiendo(null);
    }
  };

  // Guardar edición
  const handleSaveEdit = async () => {
    setOperando(true);
    try {
      const updates = {
        centro: editForm.centro,
        categoria: editForm.categoria,
        comentarios: editForm.comentarios?.trim() || null
      };
      if (isAdmin) {
        if (editForm.monto) updates.monto = parseFloat(editForm.monto);
        if (editForm.proveedor) updates.proveedor = editForm.proveedor.trim();
      }
      await db.updateCosto(editando.id, updates);
      setEditando(null);
      if (onGastosChange) await onGastosChange();
    } catch (e) {
      alert('Error al guardar: ' + e.message);
    } finally {
      setOperando(false);
    }
  };

  // Guardar nuevo
  const handleSaveNuevo = async () => {
    if (!nuevoForm.fecha || !nuevoForm.monto || !nuevoForm.proveedor) {
      alert('Completa fecha, monto y proveedor');
      return;
    }
    setOperando(true);
    try {
      await db.insertCosto({
        fecha: nuevoForm.fecha,
        monto: parseFloat(nuevoForm.monto),
        proveedor: nuevoForm.proveedor.trim(),
        tipo: nuevoForm.tipo || 'Costo',
        centro: nuevoForm.centro || 'La Vega',
        categoria: nuevoForm.categoria || 'General',
        comentarios: nuevoForm.comentarios?.trim() || '',
        estado: 'aprobado'
      });
      setShowNuevo(false);
      if (onGastosChange) await onGastosChange();
    } catch (e) {
      alert('Error al guardar: ' + e.message);
    } finally {
      setOperando(false);
    }
  };

  const centroColor = c => {
    if (c === 'La Vega') return 'bg-green-900/40 text-green-400';
    if (c === 'Bariloche') return 'bg-blue-900/40 text-blue-400';
    return 'bg-purple-900/40 text-purple-400';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
            <Receipt size={24} className="text-amber-400" /> Contabilidad
          </h2>
          <p className="text-gray-400 text-sm mt-1">Gestión de facturas, costos y gastos</p>
        </div>
        <button onClick={() => { setShowNuevo(true); setNuevoForm({ fecha: new Date().toISOString().split('T')[0], monto: '', proveedor: '', tipo: 'Costo', centro: 'La Vega', categoria: '', comentarios: '' }); setSugerencias([]); }}
          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-xl shadow-lg hover:bg-green-700 transition-colors text-sm">
          <PlusCircle size={18} /> Nuevo Gasto
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="flex items-center gap-2 text-gray-500 text-xs mb-1"><DollarSign size={14} /> Total {filtros.año}</div>
          <p className="text-lg font-bold text-gray-100">{formatCurrency(stats.montoTotal)}</p>
          <p className="text-xs text-gray-500">{stats.total} registros</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="flex items-center gap-2 text-green-500 text-xs mb-1"><CheckCircle2 size={14} /> Con Factura</div>
          <p className="text-lg font-bold text-green-400">{stats.conFactura}</p>
          <p className="text-xs text-gray-500">{stats.total > 0 ? Math.round(stats.conFactura / stats.total * 100) : 0}% completado</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="flex items-center gap-2 text-amber-500 text-xs mb-1"><Clock size={14} /> Sin Factura</div>
          <p className="text-lg font-bold text-amber-400">{stats.sinFactura}</p>
          <p className="text-xs text-gray-500">Pendientes de soporte</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="flex items-center gap-2 text-red-500 text-xs mb-1"><AlertTriangle size={14} /> Sin Comentario</div>
          <p className="text-lg font-bold text-red-400">{stats.sinComentario}</p>
          <p className="text-xs text-gray-500">Requieren descripción</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          <select value={filtros.año} onChange={e => { setFiltros({ ...filtros, año: e.target.value }); setPage(1); }} className="px-3 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl text-sm">
            <option value="">Todos</option>
            {años.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={filtros.mes} onChange={e => { setFiltros({ ...filtros, mes: e.target.value }); setPage(1); }} className="px-3 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl text-sm">
            <option value="">Mes</option>
            {Object.entries(MESES).map(([k, v]) => <option key={k} value={k.padStart(2, '0')}>{v}</option>)}
          </select>
          <select value={filtros.centro} onChange={e => { setFiltros({ ...filtros, centro: e.target.value }); setPage(1); }} className="px-3 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl text-sm">
            <option value="">Finca</option>
            {CENTROS_COSTOS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filtros.categoria} onChange={e => { setFiltros({ ...filtros, categoria: e.target.value }); setPage(1); }} className="px-3 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl text-sm">
            <option value="">Categoría</option>
            {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="flex items-center gap-2 px-3 py-2 border border-gray-700 bg-gray-800 rounded-xl text-sm cursor-pointer">
            <input type="checkbox" checked={filtros.sinFactura} onChange={e => { setFiltros({ ...filtros, sinFactura: e.target.checked }); setPage(1); }}
              className="rounded border-gray-600 bg-gray-700 text-amber-500 focus:ring-amber-500" />
            <span className="text-amber-400 text-xs">Sin factura</span>
          </label>
          <div className="col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input type="text" placeholder="Buscar proveedor, comentario..." value={filtros.busqueda}
              onChange={e => { setFiltros({ ...filtros, busqueda: e.target.value }); setPage(1); }}
              className="w-full pl-9 pr-4 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl text-sm" />
          </div>
        </div>
      </div>

      {/* Resumen filtrado */}
      <div className="flex items-center justify-between text-sm text-gray-400">
        <span>{filtered.length} registros • {formatCurrency(totalFiltered)}</span>
      </div>

      {/* Tabla */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-800/50 border-b border-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Fecha</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Proveedor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 hidden lg:table-cell">Comentario</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Finca</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 hidden md:table-cell">Categoría</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400">Monto</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400">Factura</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400">Acc.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {paginated.map(g => (
                <tr key={g.id} className={`hover:bg-gray-800/50 transition-colors ${!g.comentarios?.trim() ? 'border-l-2 border-l-amber-500' : ''}`}>
                  <td className="px-4 py-3 text-sm text-gray-300 whitespace-nowrap">{formatDate(g.fecha)}</td>
                  <td className="px-4 py-3 font-medium text-sm text-gray-200">{g.proveedor}</td>
                  <td className="px-4 py-3 text-sm text-gray-400 hidden lg:table-cell truncate max-w-xs">
                    {g.comentarios?.trim() || <span className="text-amber-500 italic text-xs">Sin comentario</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${centroColor(g.centro)}`}>{g.centro}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400 hidden md:table-cell">{g.categoria}</td>
                  <td className="px-4 py-3 text-right font-semibold text-sm text-gray-200">{formatCurrency(g.monto)}</td>
                  <td className="px-4 py-3 text-center">
                    {subiendo === g.id ? (
                      <Loader2 size={16} className="animate-spin text-amber-400 mx-auto" />
                    ) : g.factura_url ? (
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setPreview(g)} className="p-1 text-green-400 hover:bg-green-900/20 rounded" title="Ver factura">
                          <Eye size={16} />
                        </button>
                        <button onClick={() => handleDeleteFactura(g.id, g.factura_url)} className="p-1 text-red-400 hover:bg-red-900/20 rounded" title="Eliminar factura">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer p-1.5 text-amber-500 hover:bg-amber-900/20 rounded-lg inline-block" title="Subir factura">
                        <Upload size={16} />
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden"
                          onChange={e => { if (e.target.files[0]) handleUploadFactura(g.id, e.target.files[0]); }} />
                      </label>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => {
                      setEditando(g);
                      setEditForm({ centro: g.centro || '', categoria: g.categoria || '', comentarios: g.comentarios || '', monto: g.monto || '', proveedor: g.proveedor || '' });
                      buscarSugerencias(g.proveedor);
                    }} className="p-1.5 text-blue-400 hover:bg-blue-900/20 rounded-lg">
                      <FileText size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800 bg-gray-800/30">
            <span className="text-sm text-gray-400">Página {page} de {totalPages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-2 rounded-lg hover:bg-gray-700 disabled:opacity-30 text-gray-300"><ChevronLeft size={20} /></button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-2 rounded-lg hover:bg-gray-700 disabled:opacity-30 text-gray-300"><ChevronRight size={20} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Editar Gasto */}
      {editando && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl p-6 max-w-lg w-full border border-gray-800 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2">
              <FileText size={20} className="text-blue-400" /> Completar Registro
            </h3>

            {/* Info del gasto (read-only para contadora) */}
            <div className="bg-gray-800 rounded-xl p-4 mb-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Fecha</span>
                <span className="text-gray-200">{formatDate(editando.fecha)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Proveedor</span>
                {isAdmin ? (
                  <input type="text" value={editForm.proveedor} onChange={e => setEditForm(f => ({ ...f, proveedor: e.target.value }))}
                    className="text-right bg-gray-700 border border-gray-600 rounded px-2 py-0.5 text-gray-200 text-sm w-40" />
                ) : (
                  <span className="font-medium text-gray-200">{editando.proveedor}</span>
                )}
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Monto</span>
                {isAdmin ? (
                  <input type="number" value={editForm.monto} onChange={e => setEditForm(f => ({ ...f, monto: e.target.value }))}
                    className="text-right bg-gray-700 border border-gray-600 rounded px-2 py-0.5 text-gray-200 text-sm w-40" />
                ) : (
                  <span className="font-semibold text-gray-100">{formatCurrency(editando.monto)}</span>
                )}
              </div>
              {editando.factura_url && (
                <div className="flex justify-between text-sm items-center">
                  <span className="text-gray-500">Factura</span>
                  <a href={editando.factura_url} target="_blank" rel="noopener noreferrer" className="text-green-400 text-xs flex items-center gap-1 hover:underline">
                    <Paperclip size={12} /> {editando.factura_nombre || 'Ver archivo'}
                  </a>
                </div>
              )}
            </div>

            {/* Campos editables */}
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Finca (Centro de costo) *</label>
                <select value={editForm.centro} onChange={e => setEditForm(f => ({ ...f, centro: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm focus:border-blue-500 outline-none">
                  {CENTROS_COSTOS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Categoría *</label>
                <select value={editForm.categoria} onChange={e => setEditForm(f => ({ ...f, categoria: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm focus:border-blue-500 outline-none">
                  <option value="">Seleccionar...</option>
                  {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Comentario / Descripción</label>
                <textarea value={editForm.comentarios} onChange={e => setEditForm(f => ({ ...f, comentarios: e.target.value }))}
                  rows={2} placeholder="Descripción del gasto..."
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm focus:border-blue-500 outline-none resize-none" />
              </div>

              {/* Sugerencias automáticas */}
              {sugerencias.length > 0 && (
                <div className="bg-blue-900/15 border border-blue-800/40 rounded-xl p-3">
                  <p className="text-xs text-blue-400 mb-2 font-medium">💡 Sugerencias para "{editando.proveedor}":</p>
                  <div className="space-y-1">
                    {sugerencias.map((s, i) => (
                      <button key={i} onClick={() => setEditForm(f => ({ ...f, comentarios: s.texto, centro: s.centro || f.centro, categoria: s.categoria || f.categoria }))}
                        className="w-full text-left px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors flex justify-between items-center">
                        <span className="truncate">{s.texto}</span>
                        <span className="text-xs text-gray-500 ml-2 shrink-0">({s.count}x)</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {cargandoSug && <p className="text-xs text-gray-500 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Buscando sugerencias...</p>}

              {/* Subir factura desde el modal */}
              {!editando.factura_url && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Adjuntar factura</label>
                  <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-700 rounded-xl cursor-pointer hover:border-amber-600 hover:bg-amber-900/10 transition-colors">
                    <Upload size={18} className="text-amber-400" />
                    <span className="text-sm text-gray-400">Seleccionar archivo (PDF o imagen)</span>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden"
                      onChange={async e => {
                        if (e.target.files[0]) {
                          setSubiendo(editando.id);
                          try {
                            await db.uploadFactura(editando.id, e.target.files[0]);
                            if (onGastosChange) await onGastosChange();
                            setEditando(prev => ({ ...prev, factura_url: 'uploaded', factura_nombre: e.target.files[0].name }));
                          } catch (err) {
                            alert('Error al subir: ' + err.message);
                          } finally {
                            setSubiendo(null);
                          }
                        }
                      }} />
                  </label>
                  {subiendo === editando.id && <p className="text-xs text-amber-400 mt-1 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Subiendo...</p>}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => { setEditando(null); setSugerencias([]); }} disabled={operando}
                className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-xl hover:bg-gray-700 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveEdit} disabled={operando}
                className="flex-1 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                {operando ? <><Loader2 size={16} className="animate-spin" />Guardando...</> : <><Check size={16} />Guardar</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nuevo Gasto */}
      {showNuevo && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl p-6 max-w-lg w-full border border-gray-800 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2">
              <PlusCircle size={20} className="text-green-400" /> Nuevo Gasto
            </h3>

            <div className="space-y-3 mb-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Fecha *</label>
                  <input type="date" value={nuevoForm.fecha} onChange={e => setNuevoForm(f => ({ ...f, fecha: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm focus:border-green-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Monto *</label>
                  <input type="number" value={nuevoForm.monto} onChange={e => setNuevoForm(f => ({ ...f, monto: e.target.value }))}
                    placeholder="$ 0" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm focus:border-green-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Proveedor *</label>
                <input type="text" value={nuevoForm.proveedor}
                  onChange={e => {
                    setNuevoForm(f => ({ ...f, proveedor: e.target.value }));
                    buscarSugerencias(e.target.value);
                  }}
                  placeholder="Nombre del proveedor"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm focus:border-green-500 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Finca *</label>
                  <select value={nuevoForm.centro} onChange={e => setNuevoForm(f => ({ ...f, centro: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm focus:border-green-500 outline-none">
                    {CENTROS_COSTOS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Categoría *</label>
                  <select value={nuevoForm.categoria} onChange={e => setNuevoForm(f => ({ ...f, categoria: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm focus:border-green-500 outline-none">
                    <option value="">Seleccionar...</option>
                    {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Comentario</label>
                <textarea value={nuevoForm.comentarios} onChange={e => setNuevoForm(f => ({ ...f, comentarios: e.target.value }))}
                  rows={2} placeholder="Descripción del gasto..."
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm focus:border-green-500 outline-none resize-none" />
              </div>

              {/* Sugerencias */}
              {sugerencias.length > 0 && (
                <div className="bg-green-900/15 border border-green-800/40 rounded-xl p-3">
                  <p className="text-xs text-green-400 mb-2 font-medium">💡 Sugerencias para "{nuevoForm.proveedor}":</p>
                  <div className="space-y-1">
                    {sugerencias.map((s, i) => (
                      <button key={i} onClick={() => setNuevoForm(f => ({ ...f, comentarios: s.texto, centro: s.centro || f.centro, categoria: s.categoria || f.categoria }))}
                        className="w-full text-left px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors flex justify-between items-center">
                        <span className="truncate">{s.texto}</span>
                        <span className="text-xs text-gray-500 ml-2 shrink-0">({s.count}x)</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => { setShowNuevo(false); setSugerencias([]); }} disabled={operando}
                className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-xl hover:bg-gray-700 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveNuevo} disabled={operando}
                className="flex-1 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                {operando ? <><Loader2 size={16} className="animate-spin" />Guardando...</> : <><Check size={16} />Registrar Gasto</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Preview Factura */}
      {preview && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setPreview(null)}>
          <div className="bg-gray-900 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden border border-gray-800" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <div>
                <p className="font-medium text-gray-200">{preview.proveedor} — {formatDate(preview.fecha)}</p>
                <p className="text-xs text-gray-500">{preview.factura_nombre}</p>
              </div>
              <div className="flex items-center gap-2">
                <a href={preview.factura_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">
                  Abrir original
                </a>
                <button onClick={() => setPreview(null)} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400"><X size={20} /></button>
              </div>
            </div>
            <div className="p-4 flex items-center justify-center min-h-[400px] bg-gray-950">
              {preview.factura_url?.match(/\.(jpg|jpeg|png|webp)$/i) ? (
                <img src={preview.factura_url} alt="Factura" className="max-w-full max-h-[70vh] object-contain rounded-lg" />
              ) : (
                <iframe src={preview.factura_url} className="w-full h-[70vh] rounded-lg" title="Factura PDF" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
