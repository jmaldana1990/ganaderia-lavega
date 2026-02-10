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
    
    // Try to get date from header column (e.g. "16-02-24       Este pesaje Kg.")
    let fechaPesaje = sec.fechaTitulo;
    if (!fechaPesaje && sec.headerRow) {
      for (const h of sec.headerRow) {
        const ht = limpiarTexto(h);
        const m = ht.match(/(\d{1,2})-(\d{1,2})-(\d{2,4})/);
        if (m) {
          let y = m[3]; if (y.length === 2) y = '20' + y;
          fechaPesaje = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
          break;
        }
      }
    }

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
      if (!animal || !fechaPesaje) continue;

      registros.push({
        animal,
        finca: sec.finca,
        fecha_pesaje: fechaPesaje,
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
  const [procesando, setProcesando] = useState(false);
  const [resultados, setResultados] = useState([]); // array of results per file
  const [error, setError] = useState(null);
  const [progreso, setProgreso] = useState('');
  const [archivoActual, setArchivoActual] = useState('');
  const [totalArchivos, setTotalArchivos] = useState(0);
  const [archivoIdx, setArchivoIdx] = useState(0);

  const procesarUnArchivo = async (file) => {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    const hojas = wb.SheetNames;
    const resultado = {};

    // ---- PESAJE ----
    const hojaPesaje = hojas.find(h => h.toUpperCase().includes('PESAJE'));
    if (hojaPesaje) {
      const registros = procesarPesaje(wb.Sheets[hojaPesaje]);
      if (registros.length > 0) {
        const res = await insertarConDedup('pesajes', registros, ['animal', 'finca', 'fecha_pesaje', 'peso']);
        resultado.pesajes = { total: registros.length, ...res };
      }
    }

    // ---- PALPACION ----
    const hojaPalp = hojas.find(h => h.toUpperCase().includes('PALPACION'));
    if (hojaPalp) {
      const registros = procesarPalpacion(wb.Sheets[hojaPalp]);
      if (registros.length > 0) {
        const res = await insertarConDedup('palpaciones', registros, ['hembra', 'finca', 'fecha', 'estado', 'dias_gestacion']);
        resultado.palpaciones = { total: registros.length, ...res };
      }
    }

    // ---- SERVICIOS ----
    const hojaServ = hojas.find(h => h.toUpperCase().includes('SERVICIO'));
    if (hojaServ) {
      const registros = procesarServicios(wb.Sheets[hojaServ]);
      if (registros.length > 0) {
        const res = await insertarConDedup('servicios', registros, ['hembra', 'fecha', 'toro']);
        resultado.servicios = { total: registros.length, ...res };
      }
    }

    // ---- DESTETE ----
    const hojaDest = hojas.find(h => h.toUpperCase().includes('DESTETE') || h.toUpperCase().includes('DESTE'));
    if (hojaDest) {
      const registros = procesarDestete(wb.Sheets[hojaDest]);
      if (registros.length > 0) {
        const res = await insertarConDedup('destetes', registros, ['animal', 'fecha_destete', 'peso_destete']);
        resultado.destetes = { total: registros.length, ...res };
      }
    }

    return { archivo: file.name, hojas: resultado };
  };

  const procesarArchivos = useCallback(async (files) => {
    const fileList = Array.from(files).filter(f => f.name.match(/\.xlsx?$/i)).sort((a, b) => a.name.localeCompare(b.name));
    if (fileList.length === 0) return;

    setProcesando(true);
    setError(null);
    setResultados([]);
    setTotalArchivos(fileList.length);

    const results = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      setArchivoIdx(i + 1);
      setArchivoActual(file.name);
      setProgreso(`Archivo ${i + 1} de ${fileList.length}: ${file.name}`);

      try {
        const res = await procesarUnArchivo(file);
        results.push({ ...res, ok: true });
      } catch (err) {
        console.error(`[Movimientos] Error en ${file.name}:`, err);
        results.push({ archivo: file.name, ok: false, error: err.message });
      }
      setResultados([...results]);
    }

    setProcesando(false);
    setProgreso('');
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (files?.length) procesarArchivos(files);
  }, [procesarArchivos]);

  const handleFileSelect = (e) => {
    const files = e.target.files;
    if (files?.length) procesarArchivos(files);
  };

  const totalNuevos = resultados.reduce((s, r) => {
    if (!r.ok || !r.hojas) return s;
    return s + Object.values(r.hojas).reduce((s2, h) => s2 + (h.nuevos || 0), 0);
  }, 0);
  const totalDups = resultados.reduce((s, r) => {
    if (!r.ok || !r.hojas) return s;
    return s + Object.values(r.hojas).reduce((s2, h) => s2 + (h.duplicados || 0), 0);
  }, 0);
  const archivosOk = resultados.filter(r => r.ok).length;
  const archivosError = resultados.filter(r => !r.ok).length;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <FileText size={24} className="text-blue-600" /> Cargar Movimientos
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
          </div>

          {resultados.length === 0 && !procesando && (
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              className="border-2 border-dashed border-blue-300 rounded-xl p-8 text-center hover:border-blue-500 hover:bg-blue-50/50 transition-colors cursor-pointer"
              onClick={() => document.getElementById('fileInputMov').click()}
            >
              <Upload size={48} className="mx-auto text-blue-400 mb-4" />
              <p className="text-gray-600 font-medium">Arrastra archivos de Movimientos del Mes</p>
              <p className="text-gray-400 text-sm mt-2">Puedes seleccionar varios archivos a la vez</p>
              <p className="text-gray-400 text-xs mt-1">Procesa: Pesajes, Palpaciones, Servicios, Destetes</p>
              <input id="fileInputMov" type="file" accept=".xlsx,.xls" multiple onChange={handleFileSelect} className="hidden" />
            </div>
          )}

          {procesando && (
            <div className="py-8">
              <div className="flex items-center justify-center gap-3 mb-4">
                <Loader2 size={32} className="text-blue-500 animate-spin" />
                <div>
                  <p className="text-gray-700 font-medium">Procesando archivo {archivoIdx} de {totalArchivos}</p>
                  <p className="text-blue-600 text-sm">{archivoActual}</p>
                </div>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${(archivoIdx / totalArchivos) * 100}%` }} />
              </div>

              {/* Show partial results while processing */}
              {resultados.length > 0 && (
                <div className="mt-4 max-h-40 overflow-y-auto">
                  {resultados.map((r, i) => (
                    <div key={i} className={`text-xs py-1 flex items-center gap-2 ${r.ok ? 'text-green-600' : 'text-red-500'}`}>
                      {r.ok ? <CheckCircle size={12} /> : <AlertTriangle size={12} />}
                      <span className="truncate">{r.archivo}</span>
                      {r.ok && r.hojas && <span className="text-gray-400 ml-auto">{Object.values(r.hojas).reduce((s, h) => s + h.nuevos, 0)} nuevos</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!procesando && resultados.length > 0 && (
            <div>
              <div className="text-center mb-4">
                <CheckCircle size={48} className="mx-auto text-green-500 mb-3" />
                <h3 className="text-xl font-bold text-green-700">¡{archivosOk} archivo{archivosOk !== 1 ? 's' : ''} procesado{archivosOk !== 1 ? 's' : ''} exitosamente!</h3>
                {archivosError > 0 && <p className="text-red-500 text-sm mt-1">{archivosError} con errores</p>}
              </div>

              {/* Summary totals */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{totalNuevos}</p>
                  <p className="text-xs text-green-600">Registros nuevos</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-gray-500">{totalDups}</p>
                  <p className="text-xs text-gray-400">Duplicados omitidos</p>
                </div>
              </div>

              {/* Per-file results */}
              <div className="max-h-64 overflow-y-auto space-y-2">
                {resultados.map((r, i) => (
                  <div key={i} className={`rounded-lg p-3 text-sm ${r.ok ? 'bg-gray-50' : 'bg-red-50'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      {r.ok ? <CheckCircle size={14} className="text-green-500 shrink-0" /> : <AlertTriangle size={14} className="text-red-500 shrink-0" />}
                      <span className="font-medium text-gray-700 truncate">{r.archivo}</span>
                    </div>
                    {r.ok && r.hojas && Object.keys(r.hojas).length > 0 && (
                      <div className="ml-6 text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-0.5">
                        {Object.entries(r.hojas).map(([tipo, data]) => (
                          <span key={tipo}>
                            {tipo === 'pesajes' && '⚖️'}
                            {tipo === 'palpaciones' && '🔬'}
                            {tipo === 'servicios' && '🐂'}
                            {tipo === 'destetes' && '🍼'}
                            {' '}{tipo}: {data.nuevos} nuevos{data.duplicados > 0 ? `, ${data.duplicados} dup` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                    {r.ok && r.hojas && Object.keys(r.hojas).length === 0 && (
                      <p className="ml-6 text-xs text-gray-400">Sin hojas de pesajes/palpaciones/servicios/destetes</p>
                    )}
                    {!r.ok && <p className="ml-6 text-xs text-red-500">{r.error}</p>}
                  </div>
                ))}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => { setResultados([]); setError(null); }}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
                >
                  Cargar más archivos
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
