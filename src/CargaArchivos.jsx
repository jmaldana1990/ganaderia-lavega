import React, { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, X } from 'lucide-react';
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

  const detectarTipoArchivo = (filename) => {
    const lower = filename.toLowerCase();
    if (lower.includes('nacimiento') || lower.includes('cria')) return 'nacimientos';
    if (lower.includes('movimiento') || lower.includes('inventario')) return 'inventario';
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
    
    const tipo = detectarTipoArchivo(file.name);
    setTipoArchivo(tipo);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      setPreview(jsonData.slice(0, 6));
    } catch (err) {
      setError('Error al leer el archivo: ' + err.message);
    }
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
      .upsert(registros, { 
        onConflict: 'cria',
        ignoreDuplicates: false 
      })
      .select();

    if (error) throw error;
    
    return {
      procesados: registros.length,
      insertados: data?.length || 0
    };
  };

  const procesarInventario = async (workbook) => {
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    // Por ahora, solo mostrar que se leyó
    // La estructura de inventario es más compleja y necesita análisis específico
    return {
      procesados: jsonData.length,
      mensaje: 'Archivo de movimientos leído. Procesamiento de inventario pendiente de configurar.'
    };
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

    const { data, error } = await supabase
      .from('costos')
      .insert(registros)
      .select();

    if (error) throw error;
    
    return {
      procesados: registros.length,
      insertados: data?.length || 0
    };
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
        case 'inventario':
          result = await procesarInventario(workbook);
          break;
        case 'costos':
          result = await procesarCostos(workbook);
          break;
        default:
          throw new Error('Tipo de archivo no soportado');
      }

      await logCarga(
        tipoArchivo,
        archivo.name,
        result.procesados,
        result.insertados || 0,
        0,
        user?.email
      );

      setResultado(result);
      
      if (onSuccess) {
        setTimeout(() => onSuccess(), 2000);
      }
      
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
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b flex justify-between items-center">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Upload size={24} className="text-green-600" />
            Cargar Archivo
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {!archivo && (
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                dragActive ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-green-400'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <FileSpreadsheet size={48} className="mx-auto text-gray-400 mb-4" />
              <p className="text-lg font-medium text-gray-700 mb-2">
                Arrastra tu archivo Excel aquí
              </p>
              <p className="text-sm text-gray-500 mb-4">
                o haz clic para seleccionar
              </p>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileInput}
                className="hidden"
                id="file-input"
              />
              <label
                htmlFor="file-input"
                className="inline-block px-6 py-2 bg-green-600 text-white rounded-xl cursor-pointer hover:bg-green-700 transition-colors"
              >
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
                    <p className="text-sm text-gray-500">
                      {(archivo.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <button onClick={resetForm} className="p-2 hover:bg-gray-200 rounded-lg">
                  <X size={18} />
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Tipo de archivo
                </label>
                <select
                  value={tipoArchivo}
                  onChange={(e) => setTipoArchivo(e.target.value)}
                  className="w-full px-4 py-2 border rounded-xl"
                >
                  <option value="">Seleccionar tipo...</option>
                  <option value="nacimientos">📋 Nacimientos / Crías</option>
                  <option value="inventario">📊 Movimientos / Inventario</option>
                  <option value="costos">💰 Costos y Gastos</option>
                </select>
              </div>

              {preview && (
                <div>
                  <p className="text-sm font-medium mb-2">Vista previa:</p>
                  <div className="overflow-x-auto border rounded-xl">
                    <table className="w-full text-xs">
                      <tbody>
                        {preview.map((row, i) => (
                          <tr key={i} className={i === 0 ? 'bg-gray-100 font-medium' : ''}>
                            {row.slice(0, 8).map((cell, j) => (
                              <td key={j} className="px-2 py-1 border-b truncate max-w-[100px]">
                                {cell !== null ? String(cell) : ''}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={!tipoArchivo || procesando}
                className="w-full py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {procesando ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <Upload size={20} />
                    Cargar y Procesar
                  </>
                )}
              </button>
            </div>
          )}

          {resultado && (
            <div className="text-center py-8">
              <CheckCircle size={64} className="mx-auto text-green-500 mb-4" />
              <h3 className="text-xl font-semibold text-green-700 mb-2">
                ¡Archivo procesado exitosamente!
              </h3>
              <p className="text-gray-600 mb-4">
                Se procesaron {resultado.procesados} registros
                {resultado.insertados !== undefined && ` (${resultado.insertados} guardados)`}
              </p>
              {resultado.mensaje && (
                <p className="text-sm text-gray-500">{resultado.mensaje}</p>
              )}
              <button
                onClick={resetForm}
                className="mt-4 px-6 py-2 bg-gray-100 rounded-xl hover:bg-gray-200"
              >
                Cargar otro archivo
              </button>
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
