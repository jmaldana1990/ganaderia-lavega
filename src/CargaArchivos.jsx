import React, { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, X, Info } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase, logCarga } from './supabase';

export default function CargaArchivos({ user, onClose, onSuccess }) {
  const [dragActive, setDragActive] = useState(false);
  const [archivo, setArchivo] = useState(null);
  const [tipoArchivo, setTipoArchivo] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [detalles, setDetalles] = useState(null);

  const detectarTipoArchivo = (filename) => {
    const lower = filename.toLowerCase();
    if (lower.includes('nacimiento') && !lower.includes('movimiento')) return 'nacimientos';
    if (lower.includes('movimiento') || lower.includes('inventario')) return 'movimientos';
    if (lower.includes('costo') || lower.includes('gasto')) return 'costos';
    return '';
  };

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      procesarArchivo(files[0]);
    }
  }, []);

  const handleFileInput = (e) => {
    const files = e.target.files;
    if (files && files[0]) {
      procesarArchivo(files[0]);
    }
  };

  const procesarArchivo = async (file) => {
    setArchivo(file);
    setError(null);
    setResultado(null);
    setDetalles(null);
    
    const tipo = detectarTipoArchivo(file.name);
    setTipoArchivo(tipo);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      
      if (tipo === 'movimientos') {
        setDetalles({
          hojas: workbook.SheetNames,
          mensaje: `Archivo con ${workbook.SheetNames.length} hojas: ${workbook.SheetNames.slice(0,5).join(', ')}${workbook.SheetNames.length > 5 ? '...' : ''}`
        });
      }
      
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      setPreview(jsonData.slice(0, 6));
    } catch (err) {
      setError('Error al leer el archivo: ' + err.message);
    }
  };

  const procesarMovimientos = async (workbook) => {
    const resultados = {
      inventario: null,
      nacimientos: [],
      destetes: [],
      errores: []
    };

    let año = new Date().getFullYear();
    let mes = new Date().getMonth() + 1;
    
    const primeraHoja = workbook.SheetNames[0];
    const meses = {
      'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4,
      'mayo': 5, 'junio': 6, 'julio': 7, 'agosto': 8,
      'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
    };
    
    for (const [nombreMes, numMes] of Object.entries(meses)) {
      if (primeraHoja.toLowerCase().includes(nombreMes)) {
        mes = numMes;
        break;
      }
    }

    const ws = workbook.Sheets[primeraHoja];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    for (const row of data.slice(0, 5)) {
      for (const cell of row) {
        if (cell && typeof cell === 'string') {
          const match = cell.match(/20\d{2}/);
          if (match) {
            año = parseInt(match[0]);
            break;
          }
        }
      }
    }

    // 1. PROCESAR INVENTARIO
    try {
      const inventarioData = extraerInventario(workbook, primeraHoja, año, mes);
      if (inventarioData) {
        const { error } = await supabase
          .from('inventario')
          .upsert(inventarioData, { onConflict: 'año,mes,finca' });
        
        if (error) throw error;
        resultados.inventario = inventarioData;
      }
    } catch (err) {
      resultados.errores.push(`Inventario: ${err.message}`);
    }

    // 2. PROCESAR NACIMIENTOS
    if (workbook.SheetNames.includes('NACIMIENTOS')) {
      try {
        const nacimientos = extraerNacimientos(workbook, año);
        if (nacimientos.length > 0) {
          const { data, error } = await supabase
            .from('nacimientos')
            .upsert(nacimientos, { onConflict: 'cria' })
            .select();
          
          if (error) throw error;
          resultados.nacimientos = nacimientos;
        }
      } catch (err) {
        resultados.errores.push(`Nacimientos: ${err.message}`);
      }
    }

    // 3. PROCESAR DESTETES
    if (workbook.SheetNames.includes('DESTETE')) {
      try {
        const destetes = extraerDestetes(workbook, año);
        if (destetes.length > 0) {
          for (const destete of destetes) {
            await supabase
              .from('nacimientos')
              .update({
                peso_destete: destete.peso_destete,
                fecha_destete: destete.fecha_destete,
                año_destete: destete.año_destete,
                edad_destete: destete.edad_destete,
                gr_dia_vida: destete.gr_dia_vida
              })
              .eq('cria', destete.cria);
          }
          resultados.destetes = destetes;
        }
      } catch (err) {
        resultados.errores.push(`Destetes: ${err.message}`);
      }
    }

    return resultados;
  };

  const extraerInventario = (workbook, sheetName, año, mes) => {
    const ws = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    
    const inventario = {
      año: año,
      mes: mes,
      finca: 'La Vega',
      vp: 0, vh: 0, nas: 0, ch: 0, cm: 0, hl: 0, ml: 0, total: 0, toros: 0, caballos: 0
    };

    for (const row of data) {
      if (!row[0]) continue;
      const cat = String(row[0]).trim().toUpperCase();
      const saldoFinal = row[row.length - 1];
      
      if (typeof saldoFinal !== 'number') continue;
      
      switch(cat) {
        case 'VP': inventario.vp = saldoFinal; break;
        case 'VH': inventario.vh = saldoFinal; break;
        case 'NAS': inventario.nas = saldoFinal; break;
        case 'CH': inventario.ch = saldoFinal; break;
        case 'CM': inventario.cm = saldoFinal; break;
        case 'HL': inventario.hl = saldoFinal; break;
        case 'ML': inventario.ml = saldoFinal; break;
        case 'T': inventario.toros = saldoFinal; break;
        case 'TOTAL': inventario.total = saldoFinal; break;
      }
    }

    return inventario.total > 0 ? inventario : null;
  };

  const extraerNacimientos = (workbook, año) => {
    const ws = workbook.Sheets['NACIMIENTOS'];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const nacimientos = [];

    const parseDate = (val) => {
      if (!val) return null;
      try {
        if (typeof val === 'number') {
          const date = new Date((val - 25569) * 86400 * 1000);
          return date.toISOString().split('T')[0];
        }
        if (val instanceof Date) {
          return val.toISOString().split('T')[0];
        }
        return new Date(val).toISOString().split('T')[0];
      } catch {
        return null;
      }
    };

    for (const row of data) {
      const cria = row[0];
      const sexo = row[1];
      
      if (!cria || !sexo || typeof cria === 'string' && 
          (cria.includes('Software') || cria.includes('Número') || cria.includes('TOTAL'))) {
        continue;
      }
      
      if (sexo !== 'M' && sexo !== 'H') continue;

      const fecha = parseDate(row[2]);
      
      nacimientos.push({
        cria: String(cria).trim(),
        sexo: sexo,
        fecha: fecha,
        año: año,
        mes: fecha ? parseInt(fecha.split('-')[1]) : null,
        madre: row[3] ? String(row[3]).trim() : null,
        padre: row[4] ? String(row[4]).trim() : null,
        peso_nacer: typeof row[5] === 'number' ? row[5] : null,
        estado: 'Activo',
        comentario: ''
      });
    }

    return nacimientos;
  };

  const extraerDestetes = (workbook, año) => {
    const ws = workbook.Sheets['DESTETE'];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const destetes = [];

    const parseDate = (val) => {
      if (!val) return null;
      try {
        if (typeof val === 'number') {
          const date = new Date((val - 25569) * 86400 * 1000);
          return date.toISOString().split('T')[0];
        }
        if (val instanceof Date) {
          return val.toISOString().split('T')[0];
        }
        return new Date(val).toISOString().split('T')[0];
      } catch {
        return null;
      }
    };

    for (const row of data) {
      const cria = row[0];
      const sexo = row[1];
      
      if (!cria || !sexo || typeof cria === 'string' && 
          (cria.includes('Software') || cria.includes('CODANI') || cria.includes('TOTAL'))) {
        continue;
      }
      
      if (sexo !== 'M' && sexo !== 'H') continue;

      const fechaDestete = parseDate(row[3]);
      const dias = typeof row[4] === 'number' ? row[4] : null;
      const pesoDestete = typeof row[9] === 'number' ? row[9] : null;
      const grDia = typeof row[11] === 'number' ? row[11] : null;

      if (pesoDestete) {
        destetes.push({
          cria: String(cria).trim(),
          fecha_destete: fechaDestete,
          año_destete: fechaDestete ? parseInt(fechaDestete.split('-')[0]) : año,
          edad_destete: dias,
          peso_destete: pesoDestete,
          gr_dia_vida: grDia
        });
      }
    }

    return destetes;
  };

  const procesarNacimientos = async (workbook) => {
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null });
    
    const registros = [];
    
    for (const row of jsonData) {
      const cria = row['Cria No.'] || row['cria'] || row['CRIA'];
      if (!cria || String(cria).includes('Total')) continue;
      
      const getEstado = (comentario) => {
        if (!comentario) return 'Activo';
        const c = String(comentario).toLowerCase();
        if (c.includes('murio') || c.includes('murió')) return 'Muerto';
        if (c.includes('vendio') || c.includes('vendió')) return 'Vendido';
        if (c.includes('sociedad')) return 'Sociedad';
        return 'Activo';
      };

      const parseDate = (val) => {
        if (!val) return null;
        try {
          if (typeof val === 'number') {
            const date = new Date((val - 25569) * 86400 * 1000);
            return date.toISOString().split('T')[0];
          }
          return new Date(val).toISOString().split('T')[0];
        } catch {
          return null;
        }
      };

      const parseNum = (val) => {
        if (val === null || val === undefined || val === '' || val === '-') return null;
        const num = parseFloat(val);
        return isNaN(num) ? null : num;
      };

      const parseNumInt = (val) => {
        if (val === null || val === undefined || val === '' || val === '-') return null;
        const num = parseInt(val);
        return isNaN(num) ? null : num;
      };

      const fecha = parseDate(row['Fecha Nacimiento'] || row['fecha']);
      const comentario = row['Comentarios'] || row['comentario'] || '';

      registros.push({
        cria: String(cria).trim(),
        fecha: fecha,
        año: parseNumInt(row['Año'] || row['año']),
        mes: fecha ? parseInt(fecha.split('-')[1]) : null,
        sexo: row['Sexo'] || row['sexo'],
        madre: row['Madre'] || row['madre'] ? String(row['Madre'] || row['madre']).trim() : null,
        padre: row['Padre'] || row['padre'] ? String(row['Padre'] || row['padre']).trim() : null,
        peso_nacer: parseNum(row['Peso al Nacer'] || row['peso_nacer']),
        peso_destete: parseNum(row['Peso Destete'] || row['peso_destete']),
        fecha_destete: parseDate(row['Fecha Destete'] || row['fecha_destete']),
        año_destete: parseNumInt(row['Año Destete'] || row['año_destete']),
        edad_destete: parseNumInt(row['Edad Destete (dias)'] || row['edad_destete']),
        gr_dia_vida: parseNum(row['Gr/día vida'] || row['gr_dia_vida']),
        estado: getEstado(comentario),
        comentario: comentario ? String(comentario).trim() : ''
      });
    }

    const { data, error } = await supabase
      .from('nacimientos')
      .upsert(registros, { onConflict: 'cria', ignoreDuplicates: false })
      .select();

    if (error) throw error;
    
    return { procesados: registros.length, insertados: data?.length || 0 };
  };

  const procesarCostos = async (workbook) => {
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null });
    
    const registros = [];
    
    for (const row of jsonData) {
      const fecha = row['Fecha'] || row['fecha'];
      if (!fecha) continue;
      
      const parseDate = (val) => {
        if (!val) return null;
        try {
          if (typeof val === 'number') {
            const date = new Date((val - 25569) * 86400 * 1000);
            return date.toISOString().split('T')[0];
          }
          return new Date(val).toISOString().split('T')[0];
        } catch {
          return null;
        }
      };

      registros.push({
        fecha: parseDate(fecha),
        monto: parseFloat(row['Monto'] || row['monto'] || row['Valor'] || 0),
        proveedor: row['Proveedor'] || row['proveedor'] || 'Sin especificar',
        tipo: row['Tipo'] || row['tipo'] || 'Costo',
        centro: row['Centro'] || row['centro'] || 'La Vega',
        categoria: row['Categoría'] || row['Categoria'] || row['categoria'] || 'General',
        comentarios: row['Comentarios'] || row['comentarios'] || '',
        estado: 'pendiente'
      });
    }

    const { data, error } = await supabase.from('costos').insert(registros).select();
    if (error) throw error;
    
    return { procesados: registros.length, insertados: data?.length || 0 };
  };

  const handleSubmit = async () => {
    if (!archivo || !tipoArchivo) {
      setError('Selecciona un archivo y su tipo');
      return;
    }

    setProcesando(true);
    setError(null);

    try {
      const data = await archivo.arrayBuffer();
      const workbook = XLSX.read(data);
      
      let result;
      
      switch (tipoArchivo) {
        case 'nacimientos':
          result = await procesarNacimientos(workbook);
          break;
        case 'movimientos':
          const movResult = await procesarMovimientos(workbook);
          result = {
            procesados: (movResult.nacimientos?.length || 0) + (movResult.destetes?.length || 0) + (movResult.inventario ? 1 : 0),
            detalles: {
              inventario: movResult.inventario ? `✅ Inventario ${movResult.inventario.mes}/${movResult.inventario.año}: ${movResult.inventario.total} animales` : '⚠️ Sin datos de inventario',
              nacimientos: `✅ ${movResult.nacimientos?.length || 0} nacimientos procesados`,
              destetes: `✅ ${movResult.destetes?.length || 0} destetes actualizados`,
              errores: movResult.errores
            }
          };
          break;
        case 'costos':
          result = await procesarCostos(workbook);
          break;
        default:
          throw new Error('Tipo de archivo no soportado');
      }

      await logCarga(tipoArchivo, archivo.name, result.procesados || 0, result.insertados || 0, 0, user?.email);
      setResultado(result);
      
      if (onSuccess) setTimeout(() => onSuccess(), 2500);
      
    } catch (err) {
      console.error('Error procesando archivo:', err);
      setError(err.message || 'Error al procesar el archivo');
    } finally {
      setProcesando(false);
    }
  };

  const resetForm = () => {
    setArchivo(null);
    setTipoArchivo('');
    setPreview(null);
    setResultado(null);
    setError(null);
    setDetalles(null);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b flex justify-between items-center">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Upload size={24} className="text-green-600" />
            Cargar Archivo
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-6">
          {!archivo && (
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${dragActive ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-green-400'}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <FileSpreadsheet size={48} className="mx-auto text-gray-400 mb-4" />
              <p className="text-lg font-medium text-gray-700 mb-2">Arrastra tu archivo Excel aquí</p>
              <p className="text-sm text-gray-500 mb-4">o haz clic para seleccionar</p>
              <input type="file" accept=".xlsx,.xls" onChange={handleFileInput} className="hidden" id="file-input" />
              <label htmlFor="file-input" className="inline-block px-6 py-2 bg-green-600 text-white rounded-xl cursor-pointer hover:bg-green-700 transition-colors">
                Seleccionar archivo
              </label>
            </div>
          )}

          {archivo && !resultado && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet size={24} className="text-green-600" />
                  <div>
                    <p className="font-medium">{archivo.name}</p>
                    <p className="text-sm text-gray-500">{(archivo.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <button onClick={resetForm} className="p-2 hover:bg-gray-200 rounded-lg"><X size={18} /></button>
              </div>

              {detalles && (
                <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <Info size={20} className="text-blue-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-blue-700">Archivo de movimientos detectado</p>
                    <p className="text-sm text-blue-600">{detalles.mensaje}</p>
                    <p className="text-xs text-blue-500 mt-1">Se procesarán: Inventario, Nacimientos y Destetes</p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">Tipo de archivo</label>
                <select value={tipoArchivo} onChange={(e) => setTipoArchivo(e.target.value)} className="w-full px-4 py-2 border rounded-xl">
                  <option value="">Seleccionar tipo...</option>
                  <option value="nacimientos">📋 Nacimientos / Crías (archivo dedicado)</option>
                  <option value="movimientos">📊 Movimientos Mensuales</option>
                  <option value="costos">💰 Costos y Gastos</option>
                </select>
              </div>

              {preview && (
                <div>
                  <p className="text-sm font-medium mb-2">Vista previa (primera hoja):</p>
                  <div className="overflow-x-auto border rounded-xl">
                    <table className="w-full text-xs">
                      <tbody>
                        {preview.map((row, i) => (
                          <tr key={i} className={i === 0 ? 'bg-gray-100 font-medium' : ''}>
                            {row.slice(0, 8).map((cell, j) => (
                              <td key={j} className="px-2 py-1 border-b truncate max-w-[100px]">{cell !== null ? String(cell) : ''}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <button onClick={handleSubmit} disabled={!tipoArchivo || procesando} className="w-full py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {procesando ? (<><Loader2 size={20} className="animate-spin" />Procesando...</>) : (<><Upload size={20} />Cargar y Procesar</>)}
              </button>
            </div>
          )}

          {resultado && (
            <div className="text-center py-6">
              <CheckCircle size={64} className="mx-auto text-green-500 mb-4" />
              <h3 className="text-xl font-semibold text-green-700 mb-2">¡Archivo procesado exitosamente!</h3>
              
              {resultado.detalles ? (
                <div className="text-left bg-gray-50 rounded-xl p-4 mt-4 space-y-2">
                  <p className="text-sm">{resultado.detalles.inventario}</p>
                  <p className="text-sm">{resultado.detalles.nacimientos}</p>
                  <p className="text-sm">{resultado.detalles.destetes}</p>
                  {resultado.detalles.errores?.length > 0 && (
                    <div className="mt-2 pt-2 border-t">
                      <p className="text-sm text-red-600 font-medium">Errores:</p>
                      {resultado.detalles.errores.map((err, i) => (<p key={i} className="text-xs text-red-500">{err}</p>))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-600 mb-4">Se procesaron {resultado.procesados} registros{resultado.insertados !== undefined && ` (${resultado.insertados} guardados)`}</p>
              )}
              
              <button onClick={resetForm} className="mt-4 px-6 py-2 bg-gray-100 rounded-xl hover:bg-gray-200">Cargar otro archivo</button>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-700">Error</p>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
