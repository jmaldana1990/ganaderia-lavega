import React, { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, X, Info } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase, logCarga } from './supabase';
import { parseMovimientosExcel } from './parseMovimientos';

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

const formatearFechaSG = (v) => {
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
  const match = s.match(/(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})/);
  if (match) {
    const dd = match[1].padStart(2, '0'), mm = match[2].padStart(2, '0');
    let yy = match[3];
    if (yy.length === 2) yy = parseInt(yy) > 50 ? '19' + yy : '20' + yy;
    return `${yy}-${mm}-${dd}`;
  }
  return null;
};

const parseDate = (val) => {
  if (!val) return null;
  try {
    if (typeof val === 'number') {
      const date = new Date((val - 25569) * 86400 * 1000);
      return date.toISOString().split('T')[0];
    }
    if (val instanceof Date) return val.toISOString().split('T')[0];
    if (typeof val === 'string') {
      const parts = val.split('/');
      if (parts.length === 3) {
        const [d, m, y] = parts;
        return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      }
      const dt = new Date(val);
      if (!isNaN(dt.getTime())) return dt.toISOString().split('T')[0];
    }
    return null;
  } catch { return null; }
};

const detectarFinca = (texto) => {
  const t = (texto || '').toUpperCase();
  if (t.includes('BARILOCHE')) return 'Bariloche';
  if (t.includes('VEGA') && !t.includes('VEGA DEL PITI')) return 'La Vega';
  return null;
};

const extraerFechaTitulo = (texto) => {
  const t = (texto || '').toString();
  const m1 = t.match(/de\s+(\d{1,2})[.-](\d{1,2})[.-](\d{2,4})\s*$/i);
  if (m1) { let y = m1[3]; if (y.length === 2) y = '20' + y; return `${y}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`; }
  const m2 = t.match(/y\s+(\d{1,2})[.-](\d{1,2})[.-](\d{2,4})/i);
  if (m2) { let y = m2[3]; if (y.length === 2) y = '20' + y; return `${y}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`; }
  const m3 = t.match(/(\d{1,2})[.-](\d{1,2})[.-](\d{2,4})\s*a\s*(\d{1,2})[.-](\d{1,2})[.-](\d{2,4})/i);
  if (m3) { let y = m3[6]; if (y.length === 2) y = '20' + y; return `${y}-${m3[5].padStart(2, '0')}-${m3[4].padStart(2, '0')}`; }
  return null;
};

// ==================== PARSERS SECCIONES SG ====================
const parsearSeccionesSG = (ws) => {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const secciones = [];
  let current = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cell0 = limpiarTexto(row?.[0]);
    
    if (cell0.includes('Software GANADERO') || cell0.includes('HACIENDA') || cell0.includes('[F1-') || cell0.includes('[F2-')) {
      if (cell0.includes('Software GANADERO')) {
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
      const finca = detectarFinca(cell0);
      const fechaTitulo = extraerFechaTitulo(cell0);
      if (finca) {
        if (current) secciones.push(current);
        current = { finca, title: cell0, fechaTitulo, headerRow: null, dataRows: [], startIdx: i };
        continue;
      }
    }

    if (!current) continue;
    const rowText = (row || []).map(c => limpiarTexto(c).toLowerCase()).join('|');
    if (!current.headerRow && (rowText.includes('número') || rowText.includes('cod') || rowText.includes('sexo') || rowText.includes('animal'))) {
      current.headerRow = row;
      continue;
    }
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

const parsearHojaSimpleSG = (ws) => {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  let finca = 'La Vega', fechaTitulo = null, headerRow = null, dataRows = [], title = '';
  for (let i = 0; i < rows.length; i++) {
    const cell0 = limpiarTexto(rows[i]?.[0]);
    if (cell0.includes('[F1-') || cell0.includes('HACIENDA') || cell0.includes('Servicios') || cell0.includes('Destetados')) {
      title = cell0;
      const f = detectarFinca(cell0);
      if (f) finca = f;
      fechaTitulo = extraerFechaTitulo(cell0);
      continue;
    }
    const rowText = (rows[i] || []).map(c => limpiarTexto(c).toLowerCase()).join('|');
    if (!headerRow && (rowText.includes('número') || rowText.includes('cod') || rowText.includes('sexo') || rowText.includes('animal') || rowText.includes('n. serv') || rowText.includes('n.serv'))) {
      headerRow = rows[i];
      continue;
    }
    if (headerRow && rows[i] && rows[i][0] !== null && rows[i][0] !== undefined) {
      const val0 = limpiarTexto(rows[i][0]);
      if (val0 && !val0.includes('Software') && !val0.includes('Total') && !val0.includes('Promedio') && val0 !== '') {
        dataRows.push(rows[i]);
      }
    }
  }
  return [{ finca, title, fechaTitulo, headerRow, dataRows }];
};

// ==================== EXTRACTORS POR TIPO DE HOJA ====================
const extraerPesajesSG = (ws) => {
  const secciones = parsearSeccionesSG(ws);
  const registros = [];

  for (const sec of secciones) {
    const headers = (sec.headerRow || []).map(h => limpiarTexto(h).toLowerCase());
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
    const pesoCol = colPeso >= 0 ? colPeso : 2;

    for (const row of sec.dataRows) {
      const animal = limpiarTexto(row[colAnimal >= 0 ? colAnimal : 0]);
      if (!animal || !fechaPesaje) continue;

      registros.push({
        animal, finca: sec.finca, fecha_pesaje: fechaPesaje,
        edad_meses: limpiarNumero(row[colEdad >= 0 ? colEdad : 1]),
        peso: limpiarNumero(row[pesoCol]),
        peso_anterior: colPesoAnt >= 0 ? limpiarNumero(row[colPesoAnt]) : null,
        fecha_anterior: colFechaAnt >= 0 ? formatearFechaSG(row[colFechaAnt]) : null,
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

const extraerPalpacionesSG = (ws) => {
  const secciones = parsearSeccionesSG(ws);
  const secs = secciones.length > 0 ? secciones : parsearHojaSimpleSG(ws);
  const registros = [];
  for (const sec of secs) {
    for (const row of sec.dataRows) {
      const hembra = limpiarTexto(row[0]);
      if (!hembra) continue;
      registros.push({
        hembra, finca: sec.finca, fecha: sec.fechaTitulo,
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

const extraerServiciosSG = (ws) => {
  const secs = parsearHojaSimpleSG(ws);
  const registros = [];
  for (const sec of secs) {
    for (const row of sec.dataRows) {
      const hembra = limpiarTexto(row[0]);
      if (!hembra) continue;
      registros.push({
        hembra, finca: sec.finca,
        fecha: formatearFechaSG(row[2]),
        num_servicio: limpiarEntero(row[1]),
        toro: limpiarTexto(row[3]) || null,
        tipo: limpiarTexto(row[4]) || null,
      });
    }
  }
  return registros.filter(r => r.fecha);
};

const extraerDestetesSG = (ws) => {
  const secs = parsearHojaSimpleSG(ws);
  const registros = [];
  for (const sec of secs) {
    for (const row of sec.dataRows) {
      const animal = limpiarTexto(row[0]);
      if (!animal) continue;
      registros.push({
        animal, sexo: limpiarTexto(row[1]) || null,
        fecha_nacimiento: formatearFechaSG(row[2]),
        fecha_destete: formatearFechaSG(row[3]),
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

// ==================== COMPONENT ====================
export default function CargaArchivos({ user, onClose, onSuccess }) {
  const [dragActive, setDragActive] = useState(false);
  const [archivo, setArchivo] = useState(null);
  const [tipoArchivo, setTipoArchivo] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [detalles, setDetalles] = useState(null);

  const detectarTipoArchivo = (filename, sheetNames) => {
    const lower = filename.toLowerCase();
    if (lower.includes('movimiento') || lower.includes('inventario')) return 'movimientos';
    if (lower.includes('costo') || lower.includes('gasto')) return 'costos';
    if (lower.includes('nacimiento') && !lower.includes('movimiento')) return 'nacimientos';
    if (lower.includes('pesaje') || lower.includes('palpacion') || lower.includes('servicio')) return 'reporte_sg';
    if (sheetNames) {
      const upper = sheetNames.map(s => s.toUpperCase());
      if (upper.some(s => s.includes('PESAJE') || s.includes('PALPACION') || s.includes('SERVICIO'))) {
        if (upper.some(s => s === 'MOV' || s === 'ESTADO')) return 'movimientos';
        return 'reporte_sg';
      }
    }
    return '';
  };

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = e.dataTransfer.files;
    if (files && files[0]) procesarArchivo(files[0]);
  }, []);

  const handleFileInput = (e) => {
    const files = e.target.files;
    if (files && files[0]) procesarArchivo(files[0]);
  };

  const procesarArchivo = async (file) => {
    setArchivo(file);
    setError(null);
    setResultado(null);
    setDetalles(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const tipo = detectarTipoArchivo(file.name, workbook.SheetNames);
      setTipoArchivo(tipo);

      if (tipo === 'movimientos' || tipo === 'reporte_sg') {
        const hojasRelevantes = workbook.SheetNames.filter(s => {
          const u = s.toUpperCase();
          return ['MOV', 'ESTADO', 'NACIMIENTOS', 'DESTETE', 'PESAJE', 'PALPACION', 'SERVICIO', 'VENTA', 'MUERTE', 'TRASLADOS', 'SUBASTA'].some(k => u.includes(k));
        });
        setDetalles({
          hojas: workbook.SheetNames,
          hojasRelevantes,
          mensaje: `${workbook.SheetNames.length} hojas: ${workbook.SheetNames.join(', ')}`,
          tipo: tipo === 'movimientos' ? 'Movimientos del Mes' : 'Reporte Software Ganadero'
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

  // ==================== PROCESAR MOVIMIENTOS DEL MES ====================
  const procesarMovimientosMes = async (file, workbook) => {
    const resultados = {
      inventario: null, nacimientos: [], destetes: [],
      pesajes: null, palpaciones: null, servicios: null, errores: []
    };

    const hojas = workbook.SheetNames;
    let año = new Date().getFullYear();
    let mes = new Date().getMonth() + 1;
    const primeraHoja = hojas[0];
    const meses = {
      'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4,
      'mayo': 5, 'junio': 6, 'julio': 7, 'agosto': 8,
      'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
    };
    for (const [nombreMes, numMes] of Object.entries(meses)) {
      if (primeraHoja.toLowerCase().includes(nombreMes)) { mes = numMes; break; }
    }
    const wsFirst = workbook.Sheets[primeraHoja];
    const dataFirst = XLSX.utils.sheet_to_json(wsFirst, { header: 1 });
    for (const row of dataFirst.slice(0, 5)) {
      for (const cell of row) {
        if (cell && typeof cell === 'string') {
          const match = cell.match(/20\d{2}/);
          if (match) { año = parseInt(match[0]); break; }
        }
      }
    }

    // 1. INVENTARIO — use parseMovimientosExcel for robust extraction
    try {
      const invResult = await parseMovimientosExcel(file);
      if (invResult.success && invResult.data?.length > 0) {
        const registrosDB = invResult.data.map(r => ({
          año: r.año, mes: r.mes, finca: r.finca,
          vp: r.vp, vh: r.vh, nas: r.nas, cm: r.cm, ch: r.ch,
          hl: r.hl, ml: r.ml, total: r.total, toros: r.t || 0, caballos: 0
        }));
        const { error } = await supabase
          .from('inventario')
          .upsert(registrosDB, { onConflict: 'año,mes,finca' });
        if (error) throw error;
        resultados.inventario = { data: invResult.data, meta: invResult.meta };
      }
    } catch (err) {
      // Fallback: simpler extraction
      try {
        const invData = extraerInventarioSimple(workbook, primeraHoja, año, mes);
        if (invData) {
          const { error } = await supabase
            .from('inventario')
            .upsert(invData, { onConflict: 'año,mes,finca' });
          if (error) throw error;
          resultados.inventario = { data: [invData], meta: { año, mes } };
        } else {
          resultados.errores.push(`Inventario: ${err.message}`);
        }
      } catch (err2) {
        resultados.errores.push(`Inventario: ${err.message} / Fallback: ${err2.message}`);
      }
    }

    // 2. NACIMIENTOS
    if (hojas.includes('NACIMIENTOS')) {
      try {
        const nacimientos = extraerNacimientosMov(workbook, año);
        if (nacimientos.length > 0) {
          const res = await insertarConDedup('nacimientos', nacimientos, ['cria']);
          resultados.nacimientos = nacimientos;
          resultados.nacimientosRes = res;
        }
      } catch (err) { resultados.errores.push(`Nacimientos: ${err.message}`); }
    }

    // 3. DESTETES
    if (hojas.includes('DESTETE')) {
      try {
        const destetes = extraerDestetesMov(workbook, año);
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
      } catch (err) { resultados.errores.push(`Destetes: ${err.message}`); }
    }

    // 4. PESAJES
    const hojaPesaje = hojas.find(h => h.toUpperCase().includes('PESAJE'));
    if (hojaPesaje) {
      try {
        const registros = extraerPesajesSG(workbook.Sheets[hojaPesaje]);
        if (registros.length > 0) {
          const res = await insertarConDedup('pesajes', registros, ['animal', 'finca', 'fecha_pesaje', 'peso']);
          resultados.pesajes = { total: registros.length, ...res };
        }
      } catch (err) { resultados.errores.push(`Pesajes: ${err.message}`); }
    }

    // 5. PALPACIONES
    const hojaPalp = hojas.find(h => h.toUpperCase().includes('PALPACION'));
    if (hojaPalp) {
      try {
        const registros = extraerPalpacionesSG(workbook.Sheets[hojaPalp]);
        if (registros.length > 0) {
          const res = await insertarConDedup('palpaciones', registros, ['hembra', 'finca', 'fecha', 'estado', 'dias_gestacion']);
          resultados.palpaciones = { total: registros.length, ...res };
        }
      } catch (err) { resultados.errores.push(`Palpaciones: ${err.message}`); }
    }

    // 6. SERVICIOS
    const hojaServ = hojas.find(h => h.toUpperCase().includes('SERVICIO'));
    if (hojaServ) {
      try {
        const registros = extraerServiciosSG(workbook.Sheets[hojaServ]);
        if (registros.length > 0) {
          const res = await insertarConDedup('servicios', registros, ['hembra', 'fecha', 'toro']);
          resultados.servicios = { total: registros.length, ...res };
        }
      } catch (err) { resultados.errores.push(`Servicios: ${err.message}`); }
    }

    return resultados;
  };

  // ==================== PROCESAR REPORTE SG (standalone) ====================
  // Detects content type from sheet titles when sheet names are generic (e.g. "Hoja1")
  const detectarTipoHojaSG = (ws) => {
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      const cell = limpiarTexto(rows[i]?.[0]).toLowerCase();
      if (cell.includes('pesaje')) return 'pesaje';
      if (cell.includes('palpacion') || cell.includes('palpación')) return 'palpacion';
      if (cell.includes('servicio')) return 'servicio';
      if (cell.includes('destete') || cell.includes('destetado')) return 'destete';
    }
    return null;
  };

  const procesarReporteSG = async (workbook) => {
    const hojas = workbook.SheetNames;
    const resultado = {};

    // First try by sheet name
    const hojaPesaje = hojas.find(h => h.toUpperCase().includes('PESAJE'));
    if (hojaPesaje) {
      const registros = extraerPesajesSG(workbook.Sheets[hojaPesaje]);
      if (registros.length > 0) {
        resultado.pesajes = { total: registros.length, ...(await insertarConDedup('pesajes', registros, ['animal', 'finca', 'fecha_pesaje', 'peso'])) };
      }
    }

    const hojaPalp = hojas.find(h => h.toUpperCase().includes('PALPACION'));
    if (hojaPalp) {
      const registros = extraerPalpacionesSG(workbook.Sheets[hojaPalp]);
      if (registros.length > 0) {
        resultado.palpaciones = { total: registros.length, ...(await insertarConDedup('palpaciones', registros, ['hembra', 'finca', 'fecha', 'estado', 'dias_gestacion'])) };
      }
    }

    const hojaServ = hojas.find(h => h.toUpperCase().includes('SERVICIO'));
    if (hojaServ) {
      const registros = extraerServiciosSG(workbook.Sheets[hojaServ]);
      if (registros.length > 0) {
        resultado.servicios = { total: registros.length, ...(await insertarConDedup('servicios', registros, ['hembra', 'fecha', 'toro'])) };
      }
    }

    const hojaDest = hojas.find(h => h.toUpperCase().includes('DESTETE') || h.toUpperCase().includes('DESTE'));
    if (hojaDest) {
      const registros = extraerDestetesSG(workbook.Sheets[hojaDest]);
      if (registros.length > 0) {
        resultado.destetes = { total: registros.length, ...(await insertarConDedup('destetes', registros, ['animal', 'fecha_destete', 'peso_destete'])) };
      }
    }

    // Fallback: if no named sheets matched, detect content type from each sheet
    if (Object.keys(resultado).length === 0) {
      for (const hoja of hojas) {
        const ws = workbook.Sheets[hoja];
        const tipo = detectarTipoHojaSG(ws);
        if (tipo === 'pesaje' && !resultado.pesajes) {
          const registros = extraerPesajesSG(ws);
          if (registros.length > 0) {
            resultado.pesajes = { total: registros.length, ...(await insertarConDedup('pesajes', registros, ['animal', 'finca', 'fecha_pesaje', 'peso'])) };
          }
        } else if (tipo === 'palpacion' && !resultado.palpaciones) {
          const registros = extraerPalpacionesSG(ws);
          if (registros.length > 0) {
            resultado.palpaciones = { total: registros.length, ...(await insertarConDedup('palpaciones', registros, ['hembra', 'finca', 'fecha', 'estado', 'dias_gestacion'])) };
          }
        } else if (tipo === 'servicio' && !resultado.servicios) {
          const registros = extraerServiciosSG(ws);
          if (registros.length > 0) {
            resultado.servicios = { total: registros.length, ...(await insertarConDedup('servicios', registros, ['hembra', 'fecha', 'toro'])) };
          }
        } else if (tipo === 'destete' && !resultado.destetes) {
          const registros = extraerDestetesSG(ws);
          if (registros.length > 0) {
            resultado.destetes = { total: registros.length, ...(await insertarConDedup('destetes', registros, ['animal', 'fecha_destete', 'peso_destete'])) };
          }
        }
      }
    }

    return resultado;
  };

  // ==================== HELPERS NACIMIENTOS/DESTETES (monthly file) ====================
  const extraerNacimientosMov = (workbook, año) => {
    const ws = workbook.Sheets['NACIMIENTOS'];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const nacimientos = [];
    for (const row of data) {
      const cria = row[0], sexo = row[1];
      if (!cria || !sexo || typeof cria === 'string' && 
          (cria.includes('Software') || cria.includes('Número') || cria.includes('TOTAL'))) continue;
      if (sexo !== 'M' && sexo !== 'H') continue;
      const fecha = parseDate(row[2]);
      nacimientos.push({
        cria: String(cria).trim(), sexo, fecha, año,
        mes: fecha ? parseInt(fecha.split('-')[1]) : null,
        madre: row[3] ? String(row[3]).trim() : null,
        padre: row[4] ? String(row[4]).trim() : null,
        peso_nacer: typeof row[5] === 'number' ? row[5] : null,
        estado: 'Activo', comentario: ''
      });
    }
    return nacimientos;
  };

  const extraerDestetesMov = (workbook, año) => {
    const ws = workbook.Sheets['DESTETE'];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const destetes = [];
    for (const row of data) {
      const cria = row[0], sexo = row[1];
      if (!cria || !sexo || typeof cria === 'string' && 
          (cria.includes('Software') || cria.includes('CODANI') || cria.includes('TOTAL'))) continue;
      if (sexo !== 'M' && sexo !== 'H') continue;
      const fechaDestete = parseDate(row[3]);
      const pesoDestete = typeof row[9] === 'number' ? row[9] : null;
      if (pesoDestete) {
        destetes.push({
          cria: String(cria).trim(), fecha_destete: fechaDestete,
          año_destete: fechaDestete ? parseInt(fechaDestete.split('-')[0]) : año,
          edad_destete: typeof row[4] === 'number' ? row[4] : null,
          peso_destete: pesoDestete,
          gr_dia_vida: typeof row[11] === 'number' ? row[11] : null
        });
      }
    }
    return destetes;
  };

  // Simple inventory extraction fallback
  const extraerInventarioSimple = (workbook, sheetName, año, mes) => {
    const ws = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:Z50');
    const inventario = {
      año, mes, finca: 'La Vega',
      vp: 0, vh: 0, nas: 0, ch: 0, cm: 0, hl: 0, ml: 0, total: 0, toros: 0, caballos: 0
    };
    const getCellValue = (r, c) => {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      return cell ? cell.v : null;
    };
    let saldoFinalCol = -1;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c <= 15; c++) {
        const val = getCellValue(r, c);
        if (val && typeof val === 'string' && val.toUpperCase().includes('SALDO FINAL')) { saldoFinalCol = c; break; }
      }
      if (saldoFinalCol >= 0) break;
    }
    if (saldoFinalCol < 0) saldoFinalCol = 12;
    for (let r = 0; r <= Math.min(range.e.r, 25); r++) {
      const cat = String(getCellValue(r, 0) || '').trim().toUpperCase();
      const val = getCellValue(r, saldoFinalCol);
      if (typeof val !== 'number') continue;
      switch(cat) {
        case 'VP': inventario.vp = val; break; case 'VH': inventario.vh = val; break;
        case 'NAS': inventario.nas = val; break; case 'CH': inventario.ch = val; break;
        case 'CM': inventario.cm = val; break; case 'HL': inventario.hl = val; break;
        case 'ML': inventario.ml = val; break; case 'T': inventario.toros = val; break;
        case 'TOTAL': inventario.total = val; break;
      }
    }
    if (inventario.total === 0) {
      inventario.total = inventario.vp + inventario.vh + inventario.nas + inventario.ch + inventario.cm + inventario.hl + inventario.ml + inventario.toros;
    }
    return inventario.total > 0 ? inventario : null;
  };

  // ==================== PROCESAR NACIMIENTOS (standalone) ====================
  const procesarNacimientos = async (workbook) => {
    const sheetName = workbook.SheetNames[0];
    const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
    const registros = [];
    for (const row of jsonData) {
      const cria = row['Cria No.'] || row['cria'] || row['CRIA'];
      if (!cria || String(cria).includes('Total')) continue;
      const getEstado = (c) => {
        if (!c) return 'Activo';
        const lc = String(c).toLowerCase();
        if (lc.includes('murio') || lc.includes('murió')) return 'Muerto';
        if (lc.includes('vendio') || lc.includes('vendió')) return 'Vendido';
        if (lc.includes('sociedad')) return 'Sociedad';
        return 'Activo';
      };
      const pn = (v) => { if (v == null || v === '' || v === '-') return null; const n = parseFloat(v); return isNaN(n) ? null : n; };
      const pi = (v) => { if (v == null || v === '' || v === '-') return null; const n = parseInt(v); return isNaN(n) ? null : n; };
      const fecha = parseDate(row['Fecha Nacimiento'] || row['fecha']);
      const comentario = row['Comentarios'] || row['comentario'] || '';
      registros.push({
        cria: String(cria).trim(), fecha, año: pi(row['Año'] || row['año']),
        mes: fecha ? parseInt(fecha.split('-')[1]) : null,
        sexo: row['Sexo'] || row['sexo'],
        madre: row['Madre'] || row['madre'] ? String(row['Madre'] || row['madre']).trim() : null,
        padre: row['Padre'] || row['padre'] ? String(row['Padre'] || row['padre']).trim() : null,
        peso_nacer: pn(row['Peso al Nacer'] || row['peso_nacer']),
        peso_destete: pn(row['Peso Destete'] || row['peso_destete']),
        fecha_destete: parseDate(row['Fecha Destete'] || row['fecha_destete']),
        año_destete: pi(row['Año Destete'] || row['año_destete']),
        edad_destete: pi(row['Edad Destete (dias)'] || row['edad_destete']),
        gr_dia_vida: pn(row['Gr/día vida'] || row['gr_dia_vida']),
        estado: getEstado(comentario),
        comentario: comentario ? String(comentario).trim() : ''
      });
    }
    const res = await insertarConDedup('nacimientos', registros, ['cria']);
    return { procesados: registros.length, insertados: res.nuevos };
  };

  // ==================== PROCESAR COSTOS ====================
  const procesarCostos = async (workbook) => {
    let sheetName = workbook.SheetNames[0];
    const acumulado = workbook.SheetNames.find(s => s.toLowerCase().includes('acumulado'));
    if (acumulado) { sheetName = acumulado; }
    else {
      const yearSheets = workbook.SheetNames.map(s => ({ name: s, year: parseInt((s.match(/20\d{2}/) || [])[0]) || 0 })).filter(s => s.year > 0).sort((a, b) => b.year - a.year);
      if (yearSheets.length > 0) sheetName = yearSheets[0].name;
    }
    const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null });
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(rawData.length, 10); i++) {
      const row = (rawData[i] || []).map(c => c ? String(c).trim() : '');
      if (row.some(c => c === 'Fecha') && row.some(c => c === 'Monto')) { headerRowIdx = i; break; }
    }
    if (headerRowIdx === -1) throw new Error(`No se encontró encabezados (Fecha, Monto) en "${sheetName}"`);
    const headers = rawData[headerRowIdx].map(h => h ? String(h).trim() : '');
    const dataRows = rawData.slice(headerRowIdx + 1);
    const colIdx = {}; headers.forEach((h, i) => { colIdx[h] = i; });
    const iFecha = colIdx['Fecha'], iMonto = colIdx['Monto'], iProveedor = colIdx['Proveedor'];
    const iTipo = colIdx['Costo/Gasto'] ?? colIdx['Tipo'] ?? colIdx['tipo'];
    const iComentarios = colIdx['Comentarios'];
    const iCentro = colIdx['Centro de costos'] ?? colIdx['Centro'] ?? colIdx['centro'];
    const iCategoria = colIdx['Categoría'] ?? colIdx['Categoria'] ?? colIdx['categoria'];
    if (iFecha === undefined || iMonto === undefined) throw new Error('Columnas "Fecha" y "Monto" no encontradas');

    const registrosExcel = [];
    for (const row of dataRows) {
      if (!row || !row[iFecha]) continue;
      const fechaParsed = parseDate(row[iFecha]);
      if (!fechaParsed) continue;
      const monto = parseFloat(row[iMonto]);
      if (isNaN(monto) || monto === 0) continue;
      const tipo = row[iTipo] ? String(row[iTipo]).trim() : 'Costo';
      registrosExcel.push({
        fecha: fechaParsed, monto,
        proveedor: row[iProveedor] ? String(row[iProveedor]).trim() : 'Sin especificar',
        tipo: tipo.charAt(0).toUpperCase() + tipo.slice(1).toLowerCase(),
        centro: row[iCentro] ? String(row[iCentro]).trim() : 'La Vega',
        categoria: row[iCategoria] ? String(row[iCategoria]).trim() : 'General',
        comentarios: row[iComentarios] ? String(row[iComentarios]).trim() : '',
        estado: 'pendiente'
      });
    }
    if (registrosExcel.length === 0) throw new Error(`Sin registros válidos en "${sheetName}"`);

    const fechas = registrosExcel.map(r => r.fecha).sort();
    const fechaMin = fechas[0], fechaMax = fechas[fechas.length - 1];
    const añosEnArchivo = [...new Set(registrosExcel.map(r => r.fecha.split('-')[0]))].sort();

    let existentes = []; let from = 0;
    while (true) {
      const { data: page, error: fetchError } = await supabase.from('costos').select('fecha, monto, proveedor, centro, categoria').gte('fecha', fechaMin).lte('fecha', fechaMax).range(from, from + 999);
      if (fetchError) throw fetchError;
      if (!page || page.length === 0) break;
      existentes = existentes.concat(page);
      if (page.length < 1000) break;
      from += 1000;
    }
    const generarHuella = (r) => `${r.fecha}|${Math.round(r.monto)}|${(r.proveedor||'').toString().trim().toLowerCase()}|${(r.centro||'').trim()}|${(r.categoria||'').trim().toLowerCase()}`;
    const huellaExistentes = new Set(existentes.map(generarHuella));
    const registrosNuevos = registrosExcel.filter(r => !huellaExistentes.has(generarHuella(r)));
    const registrosDuplicados = registrosExcel.length - registrosNuevos.length;

    let insertados = 0;
    if (registrosNuevos.length > 0) {
      for (let i = 0; i < registrosNuevos.length; i += 500) {
        const lote = registrosNuevos.slice(i, i + 500);
        const { data, error: insertError } = await supabase.from('costos').insert(lote).select();
        if (insertError) throw insertError;
        insertados += data?.length || 0;
      }
    }
    return {
      procesados: registrosExcel.length, insertados, duplicados: registrosDuplicados,
      detalles: {
        costos: `✅ ${insertados} registros nuevos de ${registrosExcel.length} procesados` +
                (registrosDuplicados > 0 ? `\n⏭️ ${registrosDuplicados} ya existían` : '') +
                `\n📄 Hoja: "${sheetName}"\n📅 Período: ${fechaMin} a ${fechaMax} (${añosEnArchivo.join(', ')})`
      }
    };
  };

  // ==================== PROCESAR VENTAS ====================
  const procesarVentas = async (workbook) => {
    const ventasSheet = workbook.SheetNames.find(s => s.toLowerCase().includes('venta'));
    if (!ventasSheet) return null;
    const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[ventasSheet], { header: 1, defval: null });
    const ventas = []; let añoActual = null;
    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i]; if (!row) continue;
      const cellA = row[0];
      if (cellA && typeof cellA === 'string' && cellA.match(/^Ventas\s+20\d{2}$/i)) { añoActual = parseInt(cellA.match(/20\d{2}/)[0]); continue; }
      if (cellA === 'Fecha' || (row[2] && String(row[2]).toLowerCase() === 'total')) continue;
      const fecha = parseDate(row[0]);
      const cliente = row[2] ? String(row[2]).trim() : null;
      const kg = typeof row[3] === 'number' ? row[3] : null;
      const valor = typeof row[5] === 'number' ? row[5] : null;
      const tipo = row[6] ? String(row[6]).trim() : null;
      if (!cliente || !kg || !valor || valor === 0) continue;
      const fechaFinal = fecha || (ventas.length > 0 ? ventas[ventas.length - 1].fecha : null);
      ventas.push({
        año: (fechaFinal ? parseInt(fechaFinal.split('-')[0]) : null) || añoActual,
        fecha: fechaFinal, factura: row[1] ? String(row[1]).trim() : null,
        cliente, kg: Math.round(kg * 100) / 100,
        precio: typeof row[4] === 'number' ? Math.round(row[4] * 100) / 100 : null,
        valor: Math.round(valor), tipo, comentarios: row[7] ? String(row[7]).trim() : ''
      });
    }
    if (ventas.length === 0) return null;
    const { data: existentes, error: fetchError } = await supabase.from('ventas').select('fecha, cliente, kg, valor, tipo');
    if (fetchError) throw fetchError;
    const generarHuella = (r) => `${r.fecha}|${(r.cliente||'').toLowerCase()}|${Math.round(r.kg)}|${Math.round(r.valor)}|${r.tipo}`;
    const huellaExistentes = new Set((existentes || []).map(generarHuella));
    const ventasNuevas = ventas.filter(v => !huellaExistentes.has(generarHuella(v)));
    let insertados = 0;
    if (ventasNuevas.length > 0) {
      const { data, error: insertError } = await supabase.from('ventas').insert(ventasNuevas).select();
      if (insertError) throw insertError;
      insertados = data?.length || 0;
    }
    const añosVentas = [...new Set(ventas.map(v => v.año))].sort();
    return {
      resumen: `✅ ${insertados} ventas nuevas de ${ventas.length} encontradas` +
               (ventas.length - ventasNuevas.length > 0 ? `\n⏭️ ${ventas.length - ventasNuevas.length} ya existían` : '') +
               `\n📅 Años: ${añosVentas.join(', ')}`
    };
  };

  // ==================== HANDLE SUBMIT ====================
  const handleSubmit = async () => {
    if (!archivo || !tipoArchivo) { setError('Selecciona un archivo y su tipo'); return; }
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

        case 'movimientos': {
          const movResult = await procesarMovimientosMes(archivo, workbook);
          const invInfo = movResult.inventario;
          result = {
            procesados: (movResult.nacimientos?.length || 0) + (movResult.destetes?.length || 0) + (invInfo ? invInfo.data.length : 0),
            detalles: {
              inventario: invInfo ? `✅ Inventario: ${invInfo.data.map(d => `${d.finca}: ${d.total} cab.`).join(', ')}` : '⚠️ Sin datos de inventario',
              nacimientos: `✅ ${movResult.nacimientos?.length || 0} nacimientos`,
              destetes: `✅ ${movResult.destetes?.length || 0} destetes`,
              pesajes: movResult.pesajes ? `⚖️ Pesajes: ${movResult.pesajes.nuevos} nuevos${movResult.pesajes.duplicados > 0 ? `, ${movResult.pesajes.duplicados} dup` : ''}` : null,
              palpaciones: movResult.palpaciones ? `🔬 Palpaciones: ${movResult.palpaciones.nuevos} nuevas${movResult.palpaciones.duplicados > 0 ? `, ${movResult.palpaciones.duplicados} dup` : ''}` : null,
              servicios: movResult.servicios ? `🐂 Servicios: ${movResult.servicios.nuevos} nuevos${movResult.servicios.duplicados > 0 ? `, ${movResult.servicios.duplicados} dup` : ''}` : null,
              errores: movResult.errores
            }
          };
          break;
        }

        case 'reporte_sg': {
          const sgResult = await procesarReporteSG(workbook);
          const tiposProc = Object.keys(sgResult);
          result = {
            procesados: tiposProc.reduce((s, k) => s + (sgResult[k].nuevos || 0) + (sgResult[k].duplicados || 0), 0),
            detalles: {
              reporte_sg: tiposProc.length > 0
                ? tiposProc.map(tipo => {
                    const d = sgResult[tipo];
                    const emoji = { pesajes: '⚖️', palpaciones: '🔬', servicios: '🐂', destetes: '🍼' }[tipo] || '📋';
                    return `${emoji} ${tipo}: ${d.nuevos} nuevos${d.duplicados > 0 ? `, ${d.duplicados} dup` : ''}`;
                  }).join('\n')
                : '⚠️ No se encontraron hojas de pesaje, palpación, servicios o destetes',
              errores: []
            }
          };
          break;
        }

        case 'costos': {
          result = await procesarCostos(workbook);
          try {
            const ventasResult = await procesarVentas(workbook);
            if (ventasResult) result.detalles.ventas = ventasResult.resumen;
          } catch (ventasErr) {
            result.detalles.ventas = `❌ Ventas: ${ventasErr.message}`;
          }
          break;
        }

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
    setArchivo(null); setTipoArchivo(''); setPreview(null);
    setResultado(null); setError(null); setDetalles(null);
  };

  // ==================== RENDER ====================
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-800">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-800 flex justify-between items-center">
          <h2 className="text-xl font-semibold flex items-center gap-2 text-gray-100">
            <Upload size={24} className="text-green-400" />
            Cargar Archivo
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-gray-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Upload zone */}
          {!archivo && (
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${dragActive ? 'border-green-500 bg-green-500/10' : 'border-gray-700 hover:border-green-500/50'}`}
              onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
            >
              <FileSpreadsheet size={48} className="mx-auto text-gray-500 mb-4" />
              <p className="text-lg font-medium text-gray-300 mb-2">Arrastra tu archivo Excel aquí</p>
              <p className="text-sm text-gray-500 mb-4">o haz clic para seleccionar</p>
              <input type="file" accept=".xlsx,.xls" onChange={handleFileInput} className="hidden" id="file-input-carga" />
              <label htmlFor="file-input-carga" className="inline-block px-6 py-2 bg-green-600 text-white rounded-xl cursor-pointer hover:bg-green-700 transition-colors">
                Seleccionar archivo
              </label>
            </div>
          )}

          {/* File selected */}
          {archivo && !resultado && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-800 rounded-xl">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet size={24} className="text-green-400" />
                  <div>
                    <p className="font-medium text-gray-200">{archivo.name}</p>
                    <p className="text-sm text-gray-500">{(archivo.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <button onClick={resetForm} className="p-2 hover:bg-gray-700 rounded-lg text-gray-400"><X size={18} /></button>
              </div>

              {detalles && (
                <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                  <Info size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-blue-300">{detalles.tipo}</p>
                    <p className="text-sm text-blue-400/80">{detalles.mensaje}</p>
                    {detalles.hojasRelevantes?.length > 0 && (
                      <p className="text-xs text-blue-400/60 mt-1">Se procesarán: {detalles.hojasRelevantes.join(', ')}</p>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-300">Tipo de archivo</label>
                <select value={tipoArchivo} onChange={(e) => setTipoArchivo(e.target.value)} 
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none">
                  <option value="">Seleccionar tipo...</option>
                  <option value="movimientos">📊 Movimientos del Mes (inventario + pesajes + nacimientos + destetes)</option>
                  <option value="costos">💰 Costos y Gastos</option>
                  <option value="reporte_sg">📋 Reporte Software Ganadero (pesajes, palpaciones, servicios)</option>
                  <option value="nacimientos">🐄 Nacimientos (archivo dedicado)</option>
                </select>
              </div>

              {preview && (
                <div>
                  <p className="text-sm font-medium mb-2 text-gray-400">Vista previa (primera hoja):</p>
                  <div className="overflow-x-auto border border-gray-800 rounded-xl">
                    <table className="w-full text-xs">
                      <tbody>
                        {preview.map((row, i) => (
                          <tr key={i} className={i === 0 ? 'bg-gray-800 font-medium text-gray-300' : 'text-gray-400'}>
                            {row.slice(0, 8).map((cell, j) => (
                              <td key={j} className="px-2 py-1 border-b border-gray-800 truncate max-w-[100px]">{cell !== null ? String(cell) : ''}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <button onClick={handleSubmit} disabled={!tipoArchivo || procesando}
                className="w-full py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors">
                {procesando ? (<><Loader2 size={20} className="animate-spin" />Procesando...</>) : (<><Upload size={20} />Cargar y Procesar</>)}
              </button>
            </div>
          )}

          {/* Results */}
          {resultado && (
            <div className="text-center py-6">
              <CheckCircle size={64} className="mx-auto text-green-500 mb-4" />
              <h3 className="text-xl font-semibold text-green-400 mb-2">¡Archivo procesado!</h3>
              
              {resultado.detalles ? (
                <div className="text-left bg-gray-800 rounded-xl p-4 mt-4 space-y-2">
                  {resultado.detalles.inventario && <p className="text-sm text-gray-300">{resultado.detalles.inventario}</p>}
                  {resultado.detalles.nacimientos && <p className="text-sm text-gray-300">{resultado.detalles.nacimientos}</p>}
                  {resultado.detalles.destetes && <p className="text-sm text-gray-300">{resultado.detalles.destetes}</p>}
                  {resultado.detalles.pesajes && <p className="text-sm text-gray-300">{resultado.detalles.pesajes}</p>}
                  {resultado.detalles.palpaciones && <p className="text-sm text-gray-300">{resultado.detalles.palpaciones}</p>}
                  {resultado.detalles.servicios && <p className="text-sm text-gray-300">{resultado.detalles.servicios}</p>}
                  {resultado.detalles.costos && resultado.detalles.costos.split('\n').map((line, i) => <p key={i} className="text-sm text-gray-300">{line}</p>)}
                  {resultado.detalles.ventas && (
                    <div className="mt-2 pt-2 border-t border-gray-700">
                      <p className="text-sm font-medium text-gray-300">🛒 Ventas:</p>
                      {resultado.detalles.ventas.split('\n').map((line, i) => <p key={i} className="text-sm text-gray-400">{line}</p>)}
                    </div>
                  )}
                  {resultado.detalles.reporte_sg && resultado.detalles.reporte_sg.split('\n').map((line, i) => <p key={i} className="text-sm text-gray-300">{line}</p>)}
                  {resultado.detalles.errores?.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-700">
                      <p className="text-sm text-red-400 font-medium">Errores:</p>
                      {resultado.detalles.errores.map((err, i) => <p key={i} className="text-xs text-red-400/80">{err}</p>)}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-400 mb-4">
                  Se procesaron {resultado.procesados} registros{resultado.insertados !== undefined && ` (${resultado.insertados} guardados)`}
                </p>
              )}
              
              <button onClick={resetForm} className="mt-4 px-6 py-2 bg-gray-800 rounded-xl hover:bg-gray-700 text-gray-300 transition-colors">
                Cargar otro archivo
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
              <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-400">Error</p>
                <p className="text-sm text-red-400/80">{error}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
