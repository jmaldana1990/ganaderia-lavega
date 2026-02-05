/**
 * CargaInventario.jsx
 * Componente para cargar archivos Excel de Movimientos mensuales
 * y extraer automáticamente el inventario de ganado.
 */
import React, { useState, useCallback } from 'react';
import { X, Upload, FileSpreadsheet, Check, AlertCircle, Loader2, Eye, ArrowRight } from 'lucide-react';
import { parseMovimientosExcel, NOMBRES_CATEGORIAS } from './parseMovimientos';
import * as db from './supabase';

const CATS_ORDEN = ['vp', 'vh', 'nas', 'cm', 'ch', 't', 'hl', 'ml', 'hd', 'md', 'mc'];

export default function CargaInventario({ user, onClose, onSuccess }) {
  const [paso, setPaso] = useState('upload'); // upload → preview → saving → done
  const [archivo, setArchivo] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setArchivo(file);
    setError(null);
    setPaso('parsing');

    const res = await parseMovimientosExcel(file);

    if (res.success) {
      setResultado(res);
      setPaso('preview');
    } else {
      setError(res.error);
      setPaso('upload');
    }
  }, []);

  const handleGuardar = useCallback(async () => {
    if (!resultado?.data) return;
    setSaving(true);
    setError(null);

    try {
      // Guardar cada registro en Supabase (upsert por finca+periodo)
      for (const registro of resultado.data) {
        await db.upsertInventario(registro);
      }
      setPaso('done');
      // Esperar un momento para mostrar el éxito y luego cerrar
      setTimeout(() => {
        if (onSuccess) onSuccess();
      }, 1500);
    } catch (err) {
      console.error('Error guardando inventario:', err);
      setError(`Error al guardar: ${err.message}`);
      setSaving(false);
    }
  }, [resultado, onSuccess]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      // Simulate file input
      const dt = new DataTransfer();
      dt.items.add(file);
      handleFile({ target: { files: dt.files } });
    }
  }, [handleFile]);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-t-2xl">
          <div className="flex items-center gap-3">
            <FileSpreadsheet size={24} />
            <div>
              <h2 className="font-bold text-lg">Cargar Movimientos</h2>
              <p className="text-sm text-emerald-100">Actualizar inventario desde archivo Excel</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-5">

          {/* PASO 1: Upload */}
          {(paso === 'upload' || paso === 'parsing') && (
            <div>
              <div
                className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-emerald-400 hover:bg-emerald-50/50 transition-all cursor-pointer"
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => document.getElementById('inv-file-input')?.click()}
              >
                {paso === 'parsing' ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 size={40} className="text-emerald-500 animate-spin" />
                    <p className="text-gray-600">Procesando archivo...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Upload size={40} className="text-gray-400" />
                    <div>
                      <p className="font-medium text-gray-700">Arrastra o haz clic para seleccionar</p>
                      <p className="text-sm text-gray-500 mt-1">Archivo Excel de Movimientos mensuales (.xlsx)</p>
                    </div>
                  </div>
                )}
                <input
                  id="inv-file-input"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFile}
                  className="hidden"
                />
              </div>

              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-700">
                  <strong>📋 Formato esperado:</strong> Archivos del tipo <code className="bg-blue-100 px-1 rounded">XX_Movimientos_Mes_Año.xlsx</code> generados por el Software Ganadero SG.
                </p>
              </div>
            </div>
          )}

          {/* PASO 2: Preview */}
          {paso === 'preview' && resultado && (
            <div>
              {/* Meta info */}
              <div className="flex items-center gap-2 mb-4 p-3 bg-emerald-50 rounded-lg">
                <Check size={20} className="text-emerald-600" />
                <div className="text-sm">
                  <p className="font-medium text-emerald-800">
                    {resultado.meta.mesNombre} {resultado.meta.año}
                  </p>
                  <p className="text-emerald-600">
                    {resultado.meta.fincasEncontradas.join(' y ')} • {resultado.data.length} {resultado.data.length === 1 ? 'finca' : 'fincas'}
                  </p>
                </div>
              </div>

              {/* Preview tables */}
              {resultado.data.map((reg, idx) => (
                <div key={idx} className="mb-4">
                  <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${reg.finca === 'La Vega' ? 'bg-emerald-500' : 'bg-orange-500'}`} />
                    {reg.finca}
                    <span className="ml-auto text-lg font-bold">{reg.total} cab.</span>
                  </h3>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-1">
                    {CATS_ORDEN.map(cat => (
                      <div key={cat} className="bg-gray-50 rounded p-2 text-center">
                        <div className="text-xs text-gray-500 uppercase">{cat}</div>
                        <div className="font-bold text-gray-800">{reg[cat]}</div>
                        <div className="text-[10px] text-gray-400">{NOMBRES_CATEGORIAS[cat]}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Existing data warning */}
              <div className="p-3 bg-amber-50 rounded-lg mb-4">
                <p className="text-sm text-amber-700">
                  <strong>⚠️ Nota:</strong> Si ya existe un registro para este periodo, será reemplazado con los nuevos datos.
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => { setPaso('upload'); setResultado(null); setArchivo(null); }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cambiar archivo
                </button>
                <button
                  onClick={handleGuardar}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {saving ? (
                    <><Loader2 size={18} className="animate-spin" /> Guardando...</>
                  ) : (
                    <><Check size={18} /> Guardar inventario</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* PASO 3: Done */}
          {paso === 'done' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check size={32} className="text-emerald-600" />
              </div>
              <h3 className="font-bold text-lg text-gray-800 mb-1">¡Inventario actualizado!</h3>
              <p className="text-gray-500">
                {resultado?.meta?.mesNombre} {resultado?.meta?.año} — {resultado?.meta?.fincasEncontradas?.join(' y ')}
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
