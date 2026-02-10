import { useState, useCallback } from 'react';
import { Upload, X, FileText, CheckCircle, Loader2, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from './supabase';

// ==================== HELPERS ====================
const limpiarTexto = (v) => (v || '').toString().trim();
const limpiarNumero = (v) => {
  if (v === null || v === undefined || v === '' || v === '-') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
};
const limpiarEntero = (v) => {
  if (v === null || v === undefined || v === '' || v === '-') return null;
  const n = parseInt(v);
  return isNaN(n) ? null : n;
};

const formatearFecha = (v) => {
  if (!v) return null;
  if (v instanceof Date) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, '0'), d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof v === 'number') {
    const d = new Date((v - 25569) * 86400 * 1000);
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  const s = v.toString().trim();
  // dd-mm-yy or dd.mm.yy
  const match = s.match(/(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})/);
  if (match) {
    const dd = match[1].padStart(2, '0'), mm = match[2].padStart(2, '0');
    let yy = match[3];
    if (yy.length === 2) yy = parseInt(yy) > 50 ? '19' + yy : '20' + yy;
    return `${yy}-${mm}-${dd}`;
  }
  return null;
};

// Detect finca from title text like "[F1-001] HACIENDA LA VEGA" or "[F1-005] HACIENDA BARILOCHE"
const detectarFinca = (texto) => {
  const t = (texto || '').toUpperCase();
  if (t.includes('BARILOCHE')) return 'Bariloche';
  if (t.includes('VEGA') && !t.includes('VEGA DEL PITI')) return 'La Vega';
  return null;
};

// Extract date from title like "Resultado de pesaje de 29.10.25" or "palpacion entre 01.02.24 y 29.02.24"
const extraerFechaTitulo = (texto) => {
  const t = (texto || '').toString();
  // Try "de DD.MM.YY" format
  const m1 = t.match(/de\s+(\d{1,2})[.-](\d{1,2})[.-](\d{2,4})\s*$/i);
  if (m1) {
    let y = m1[3]; if (y.length === 2) y = '20' + y;
    return `${y}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`;
  }
  // Try "y DD.MM.YY" (end date of range)
  const m2 = t.match(/y\s+(\d{1,2})[.-](\d{1,2})[.-](\d{2,4})/i);
  if (m2) {
    let y = m2[3]; if (y.length === 2) y = '20' + y;
    return `${y}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`;
  }
  // Try "de 01.MM.YY a DD.MM.YY"
  const m3 = t.match(/(\d{1,2})[.-](\d{1,2})[.-](\d{2,4})\s*a\s*(\d{1,2})[.-](\d{1,2})[.-](\d{2,4})/i);
  if (m3) {
    let y = m3[6]; if (y.length === 2) y = '20' + y;
    return `${y}-${m3[5].padStart(2, '0')}-${m3[4].padStart(2, '0')}`;
  }
  return null;
};

// ==================== SHEET PROCESSORS ====================

// Parse sheet into sections by "Software GANADERO SG" separators
const parsearSecciones = (ws) => {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const secciones = [];
  let current = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cell0 = limpiarTexto(row?.[0]);
    
    if (cell0.includes('Software GANADERO') || cell0.includes('HACIENDA') || cell0.includes('[F1-') || cell0.includes('[F2-')) {
      // Check if this is a title row (next row after "Software GANADERO SG")
      if (cell0.includes('Software GANADERO')) {
        // Next row has the actual title
        const titleRow = rows[i + 1];
        const title = limpiarTexto(titleRow?.[0]);
        const finca = detectarFinca(title);
        const fechaTitulo = extraerFechaTitulo(title);
        if (finca) {
          if (current) secciones.push(current);
          current = { finca, title, fechaTitulo, headerRow: null, dataRows: [], startIdx: i };
        }
        continue;
      }
      
      // Direct title row (e.g. "[F1-001] HACIENDA LA VEGA...")
      const finca = detectarFinca(cell0);
      const fechaTitulo = extraerFechaTitulo(cell0);
      if (finca) {
        if (current) secciones.push(current);
        current = { finca, title: cell0, fechaTitulo, headerRow: null, dataRows: [], startIdx: i };
        continue;
      }
    }

    if (!current) continue;

    // Detect header row (contains known column names)
    const rowText = (row || []).map(c => limpiarTexto(c).toLowerCase()).join('|');
    if (!current.headerRow && (rowText.includes('número') || rowText.includes('cod') || rowText.includes('sexo') || rowText.includes('animal'))) {
      current.headerRow = row;
      continue;
    }

    // Data row (skip empty rows and summary rows)
    if (current.headerRow && row && row[0] !== null && row[0] !== undefined) {
      const val0 = limpiarTexto(row[0]);
      if (val0 && !val0.includes('Software') && !val0.includes('Total') && !val0.includes('Promedio') && val0 !== '') {
        current.dataRows.push(row);
      }
    }
  }
  if (current && current.dataRows.length > 0) secciones.push(current);
  return secciones;
};

// Simple parser for sheets with single section (no "Software GANADERO" separators within)
const parsearHojaSimple = (ws) => {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  let finca = 'La Vega'; // Default
  let fechaTitulo = null;
  let headerRow = null;
  let dataRows = [];
  let title = '';

  for (let i = 0; i < rows.length; i++) {
    const cell0 = limpiarTexto(rows[i]?.[0]);
    
    // Title detection
    if (cell0.includes('[F1-') || cell0.includes('HACIENDA') || cell0.includes('Servicios') || cell0.includes('Destetados')) {
      title = cell0;
      const f = detectarFinca(cell0);
      if (f) finca = f;
      fechaTitulo = extraerFechaTitulo(cell0);
      continue;
    }

    // Header detection
    const rowText = (rows[i] || []).map(c => limpiarTexto(c).toLowerCase()).join('|');
    if (!headerRow && (rowText.includes('número') || rowText.includes('cod') || rowText.includes('sexo') || rowText.includes('animal') || rowText.includes('n. serv') || rowText.includes('n.serv'))) {
      headerRow = rows[i];
      continue;
    }

    // Data
    if (headerRow && rows[i] && rows[i][0] !== null && rows[i][0] !== undefined) {
      const val0 = limpiarTexto(rows[i][0]);
      if (val0 && !val0.includes('Software') && !val0.includes('Total') && !val0.includes('Promedio') && val0 !== '') {
        dataRows.push(rows[i]);
      }
    }
  }

  return [{ finca, title, fechaTitulo, headerRow, dataRows }];
};

// ==================== PROCESS PESAJE ====================
const procesarPesaje = (ws) => {
  const secciones = parsearSecciones(ws);
  const registros = [];

  for (const sec of secciones) {
    const headers = (sec.headerRow || []).map(h => limpiarTexto(h).toLowerCase());
    
    // Detect column positions
    const colAnimal = headers.findIndex(h => h.includes('animal') || h.includes('número'));
    const colEdad = headers.findIndex(h => h.includes('edad'));
    const colPesoAnt = headers.findIndex(h => h.includes('peso anterior'));
    const colFechaAnt = headers.findIndex(h => h.includes('fecha anterior'));
    const colPeso = headers.findIndex(h => h.includes('este pesaje') || (h.includes('pesaje') && h.includes('kg')));
    const colIncKg = headers.findIndex(h => h.includes('incremento peso'));
    const colDifDias = headers.findIndex(h => h.includes('diferencia día') || h.includes('diferencia dias'));
    const colGDPEntre = headers.findIndex(h => h.includes('incremento grs. día') || (h.includes('incremento grs') && !h.includes('vida')));
    const colGDPVida = headers.findIndex(h => h.includes('vida'));
    const colCat = headers.findIndex(h => h.includes('est.') || h.includes('prod'));

    // If "Este pesaje" not found, try the third column (simple format)
    const pesoCol = colPeso >= 0 ? colPeso : 2;

    for (const row of sec.dataRows) {
      const animal = limpiarTexto(row[colAnimal >= 0 ? colAnimal : 0]);
      if (!animal) continue;

      registros.push({
        animal,
        finca: sec.finca,
        fecha_pesaje: sec.fechaTitulo,
        edad_meses: limpiarNumero(row[colEdad >= 0 ? colEdad : 1]),
        peso: limpiarNumero(row[pesoCol]),
        peso_anterior: colPesoAnt >= 0 ? limpiarNumero(row[colPesoAnt]) : null,
        fecha_anterior: colFechaAnt >= 0 ? formatearFecha(row[colFechaAnt]) : null,
        incremento_kg: colIncKg >= 0 ? limpiarNumero(row[colIncKg]) : null,
        diferencia_dias: colDifDias >= 0 ? limpiarEntero(row[colDifDias]) : null,
        gdp_entre_pesajes: colGDPEntre >= 0 ? limpiarNumero(row[colGDPEntre]) : null,
        gdp_vida: limpiarNumero(row[colGDPVida >= 0 ? colGDPVida : 3]),
        categoria: limpiarTexto(row[colCat >= 0 ? colCat : (headers.length - 1)]) || null,
      });
    }
  }
  return registros;
};

// ==================== PROCESS PALPACION ====================
const procesarPalpacion = (ws) => {
  const secciones = parsearSecciones(ws);
  // If no sections found (no "Software GANADERO" separators), use simple parser
  const secs = secciones.length > 0 ? secciones : parsearHojaSimple(ws);
  const registros = [];

  for (const sec of secs) {
    for (const row of sec.dataRows) {
      const hembra = limpiarTexto(row[0]);
      if (!hembra) continue;

      registros.push({
        hembra,
        finca: sec.finca,
        fecha: sec.fechaTitulo,
        estado: limpiarTexto(row[1]) || null,
        detalle: limpiarTexto(row[2]) || null,
        dias_gestacion: limpiarTexto(row[3]) || null,
        dias_lactancia: limpiarEntero(row[4]),
        dias_abiertos: limpiarEntero(row[5]),
        reproductor: limpiarTexto(row[6]) || null,
      });
    }
  }
  return registros;
};

// ==================== PROCESS SERVICIOS ====================
const procesarServicios = (ws) => {
  const secs = parsearHojaSimple(ws);
  const registros = [];

  for (const sec of secs) {
    for (const row of sec.dataRows) {
      const hembra = limpiarTexto(row[0]);
      if (!hembra) continue;

      registros.push({
        hembra,
        finca: sec.finca,
        fecha: formatearFecha(row[2]),
        num_servicio: limpiarEntero(row[1]),
        toro: limpiarTexto(row[3]) || null,
        tipo: limpiarTexto(row[4]) || null,
      });
    }
  }
  return registros.filter(r => r.fecha);
};

// ==================== PROCESS DESTETE ====================
const procesarDestete = (ws) => {
  const secs = parsearHojaSimple(ws);
  const registros = [];

  for (const sec of secs) {
    for (const row of sec.dataRows) {
      const animal = limpiarTexto(row[0]);
      if (!animal) continue;

      registros.push({
        animal,
        sexo: limpiarTexto(row[1]) || null,
        fecha_nacimiento: formatearFecha(row[2]),
        fecha_destete: formatearFecha(row[3]),
        dias: limpiarEntero(row[4]),
        madre: limpiarTexto(row[5]) || null,
        padre: limpiarTexto(row[6]) || null,
        peso_nacer: limpiarNumero(row[7]),
        peso_destete: limpiarNumero(row[8]),
        peso_ajustado: limpiarNumero(row[9]),
        gdp_predestete: limpiarNumero(row[10]),
      });
    }
  }
  return registros.filter(r => r.fecha_destete);
};

// ==================== DEDUPLICATION & INSERT ====================
const insertarConDedup = async (tabla, registros, camposHuella) => {
  if (registros.length === 0) return { nuevos: 0, duplicados: 0 };

  // Fetch all existing records (paginated)
  let existentes = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from(tabla)
      .select(camposHuella.join(', '))
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    existentes = existentes.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const generarHuella = (r) => camposHuella.map(c => {
    const v = r[c];
    return typeof v === 'string' ? v.trim().toLowerCase() : (v ?? '');
  }).join('|');

  const huellaSet = new Set(existentes.map(generarHuella));
  const nuevos = registros.filter(r => !huellaSet.has(generarHuella(r)));
  const duplicados = registros.length - nuevos.length;

  // Insert in batches
  if (nuevos.length > 0) {
    const batchSize = 200;
    for (let i = 0; i < nuevos.length; i += batchSize) {
      const batch = nuevos.slice(i, i + batchSize);
      const { error } = await supabase.from(tabla).insert(batch);
      if (error) throw error;
    }
  }

  return { nuevos: nuevos.length, duplicados };
};

// ==================== MAIN COMPONENT ====================
export default function CargaMovimientos({ user, onClose, onSuccess }) {
  const [archivo, setArchivo] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);
  const [progreso, setProgreso] = useState('');

  const procesarArchivo = useCallback(async (file) => {
    setProcesando(true);
    setError(null);
    setResultado(null);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const hojas = wb.SheetNames;
      console.log('[Movimientos] Hojas encontradas:', hojas);

      const resultados = {};

      // ---- PESAJE ----
      const hojaPesaje = hojas.find(h => h.toUpperCase().includes('PESAJE'));
      if (hojaPesaje) {
        setProgreso('Procesando pesajes...');
        const ws = wb.Sheets[hojaPesaje];
        const registros = procesarPesaje(ws);
        console.log(`[Pesajes] ${registros.length} registros encontrados`);
        if (registros.length > 0) {
          const res = await insertarConDedup('pesajes', registros, ['animal', 'finca', 'fecha_pesaje', 'peso']);
          resultados.pesajes = { total: registros.length, ...res };
        }
      }

      // ---- PALPACION ----
      const hojaPalp = hojas.find(h => h.toUpperCase().includes('PALPACION'));
      if (hojaPalp) {
        setProgreso('Procesando palpaciones...');
        const ws = wb.Sheets[hojaPalp];
        const registros = procesarPalpacion(ws);
        console.log(`[Palpaciones] ${registros.length} registros encontrados`);
        if (registros.length > 0) {
          const res = await insertarConDedup('palpaciones', registros, ['hembra', 'finca', 'fecha', 'estado', 'dias_gestacion']);
          resultados.palpaciones = { total: registros.length, ...res };
        }
      }

      // ---- SERVICIOS ----
      const hojaServ = hojas.find(h => h.toUpperCase().includes('SERVICIO'));
      if (hojaServ) {
        setProgreso('Procesando servicios...');
        const ws = wb.Sheets[hojaServ];
        const registros = procesarServicios(ws);
        console.log(`[Servicios] ${registros.length} registros encontrados`);
        if (registros.length > 0) {
          const res = await insertarConDedup('servicios', registros, ['hembra', 'fecha', 'toro']);
          resultados.servicios = { total: registros.length, ...res };
        }
      }

      // ---- DESTETE ----
      const hojaDest = hojas.find(h => h.toUpperCase().includes('DESTETE') || h.toUpperCase().includes('DESTE'));
      if (hojaDest) {
        setProgreso('Procesando destetes...');
        const ws = wb.Sheets[hojaDest];
        const registros = procesarDestete(ws);
        console.log(`[Destetes] ${registros.length} registros encontrados`);
        if (registros.length > 0) {
          const res = await insertarConDedup('destetes', registros, ['animal', 'fecha_destete', 'peso_destete']);
          resultados.destetes = { total: registros.length, ...res };
        }
      }

      const totalNuevos = Object.values(resultados).reduce((s, r) => s + r.nuevos, 0);
      setResultado({ hojas: resultados, archivo: file.name, totalNuevos });
      console.log('[Movimientos] Resultado:', resultados);

    } catch (err) {
      console.error('[Movimientos] Error:', err);
      setError(err.message || 'Error procesando archivo');
    } finally {
      setProcesando(false);
      setProgreso('');
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (file) { setArchivo(file); procesarArchivo(file); }
  }, [procesarArchivo]);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) { setArchivo(file); procesarArchivo(file); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <FileText size={24} className="text-blue-600" /> Cargar Movimientos
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
          </div>

          {!resultado && !procesando && (
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              className="border-2 border-dashed border-blue-300 rounded-xl p-8 text-center hover:border-blue-500 hover:bg-blue-50/50 transition-colors cursor-pointer"
              onClick={() => document.getElementById('fileInputMov').click()}
            >
              <Upload size={48} className="mx-auto text-blue-400 mb-4" />
              <p className="text-gray-600 font-medium">Arrastra un archivo de Movimientos del Mes</p>
              <p className="text-gray-400 text-sm mt-2">Archivos .xlsx del software ganadero</p>
              <p className="text-gray-400 text-xs mt-1">Procesa: Pesajes, Palpaciones, Servicios, Destetes</p>
              <input id="fileInputMov" type="file" accept=".xlsx,.xls" onChange={handleFileSelect} className="hidden" />
            </div>
          )}

          {procesando && (
            <div className="text-center py-12">
              <Loader2 size={48} className="mx-auto text-blue-500 animate-spin mb-4" />
              <p className="text-gray-600 font-medium">Procesando archivo...</p>
              <p className="text-blue-600 text-sm mt-2">{progreso}</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mt-4">
              <div className="flex items-center gap-2 text-red-600 font-medium mb-1">
                <AlertTriangle size={18} /> Error
              </div>
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {resultado && (
            <div className="text-center">
              <CheckCircle size={64} className="mx-auto text-green-500 mb-4" />
              <h3 className="text-xl font-bold text-green-700 mb-4">¡Archivo procesado exitosamente!</h3>
              <p className="text-sm text-gray-500 mb-4">{resultado.archivo}</p>

              <div className="space-y-3 text-left bg-gray-50 rounded-xl p-4">
                {Object.entries(resultado.hojas).map(([tipo, data]) => (
                  <div key={tipo} className="border-b border-gray-200 pb-2 last:border-0 last:pb-0">
                    <p className="font-semibold text-gray-700 capitalize flex items-center gap-2">
                      {tipo === 'pesajes' && '⚖️'}
                      {tipo === 'palpaciones' && '🔬'}
                      {tipo === 'servicios' && '🐂'}
                      {tipo === 'destetes' && '🍼'}
                      {' '}{tipo}:
                    </p>
                    <p className="text-sm text-gray-600 ml-6">
                      ✅ {data.nuevos} nuevos insertados de {data.total} encontrados
                    </p>
                    {data.duplicados > 0 && (
                      <p className="text-sm text-gray-400 ml-6">
                        ⏭️ {data.duplicados} ya existían y fueron omitidos
                      </p>
                    )}
                  </div>
                ))}

                {Object.keys(resultado.hojas).length === 0 && (
                  <p className="text-sm text-gray-400">No se encontraron hojas de pesajes, palpaciones, servicios o destetes.</p>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => { setResultado(null); setArchivo(null); setError(null); }}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
                >
                  Cargar otro archivo
                </button>
                <button
                  onClick={() => { onSuccess?.(); onClose(); }}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
