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
    
    // Usar range para obtener todas las celdas incluidas las vacías
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:Z50');
    
    const inventario = {
      año: año,
      mes: mes,
      finca: 'La Vega',
      vp: 0, vh: 0, nas: 0, ch: 0, cm: 0, hl: 0, ml: 0, total: 0, toros: 0, caballos: 0
    };

    // Función helper para obtener valor de celda
    const getCellValue = (r, c) => {
      const cellAddress = XLSX.utils.encode_cell({ r, c });
      const cell = ws[cellAddress];
      return cell ? cell.v : null;
    };

    // Buscar la columna de SALDO FINAL en las primeras 10 filas
    let saldoFinalCol = -1;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c <= 15; c++) {
        const val = getCellValue(r, c);
        if (val && typeof val === 'string' && val.toUpperCase().includes('SALDO FINAL')) {
          saldoFinalCol = c;
          console.log('Encontrada columna SALDO FINAL en:', c);
          break;
        }
      }
      if (saldoFinalCol >= 0) break;
    }

    // Si no encontramos la columna, usar 12 por defecto (columna M)
    if (saldoFinalCol < 0) {
      saldoFinalCol = 12;
      console.log('Usando columna por defecto:', saldoFinalCol);
    }

    // Recorrer filas buscando categorías
    for (let r = 0; r <= Math.min(range.e.r, 25); r++) {
      const categoria = getCellValue(r, 0);
      if (!categoria) continue;
      
      const cat = String(categoria).trim().toUpperCase();
      const saldoFinal = getCellValue(r, saldoFinalCol);
      
      // Solo procesar si el saldo final es un número
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

    // Si no se encontró TOTAL, calcularlo
    if (inventario.total === 0) {
      inventario.total = inventario.vp + inventario.vh + inventario.nas + 
                         inventario.ch + inventario.cm + inventario.hl + 
                         inventario.ml + inventario.toros;
    }

    console.log('Inventario extraído:', inventario);
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
    // 1. Auto-detectar la mejor hoja para leer
    //    Prioridad: hoja "Acumulado" > hoja del año más reciente con datos
    let sheetName = workbook.SheetNames[0];
    const acumulado = workbook.SheetNames.find(s => s.toLowerCase().includes('acumulado'));
    if (acumulado) {
      sheetName = acumulado;
    } else {
      // Buscar hoja del año más reciente
      const yearSheets = workbook.SheetNames
        .map(s => ({ name: s, year: parseInt((s.match(/20\d{2}/) || [])[0]) || 0 }))
        .filter(s => s.year > 0)
        .sort((a, b) => b.year - a.year);
      if (yearSheets.length > 0) sheetName = yearSheets[0].name;
    }

    const worksheet = workbook.Sheets[sheetName];

    // 2. Encontrar la fila de headers (buscar fila que contenga "Fecha" y "Monto")
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(rawData.length, 10); i++) {
      const row = (rawData[i] || []).map(c => c ? String(c).trim() : '');
      if (row.some(c => c === 'Fecha') && row.some(c => c === 'Monto')) {
        headerRowIdx = i;
        break;
      }
    }
    if (headerRowIdx === -1) {
      throw new Error('No se encontró la fila de encabezados (Fecha, Monto) en la hoja "' + sheetName + '"');
    }

    // 3. Parsear usando la fila de headers correcta
    const headers = rawData[headerRowIdx].map(h => h ? String(h).trim() : '');
    const dataRows = rawData.slice(headerRowIdx + 1);

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
        const d = new Date(val);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
        return null;
      } catch {
        return null;
      }
    };

    // Mapear índices de columnas
    const colIdx = {};
    headers.forEach((h, i) => { colIdx[h] = i; });

    const iFecha = colIdx['Fecha'];
    const iMonto = colIdx['Monto'];
    const iProveedor = colIdx['Proveedor'];
    const iTipo = colIdx['Costo/Gasto'] ?? colIdx['Tipo'] ?? colIdx['tipo'];
    const iComentarios = colIdx['Comentarios'];
    const iCentro = colIdx['Centro de costos'] ?? colIdx['Centro'] ?? colIdx['centro'];
    const iCategoria = colIdx['Categoría'] ?? colIdx['Categoria'] ?? colIdx['categoria'];

    if (iFecha === undefined || iMonto === undefined) {
      throw new Error('No se encontraron las columnas "Fecha" y "Monto" en los encabezados');
    }

    // 4. Parsear registros
    const registrosExcel = [];
    for (const row of dataRows) {
      if (!row || !row[iFecha]) continue;
      
      const fechaParsed = parseDate(row[iFecha]);
      if (!fechaParsed) continue;

      const monto = parseFloat(row[iMonto]);
      if (isNaN(monto) || monto === 0) continue;

      const tipo = row[iTipo] ? String(row[iTipo]).trim() : 'Costo';

      registrosExcel.push({
        fecha: fechaParsed,
        monto: monto,
        proveedor: row[iProveedor] ? String(row[iProveedor]).trim() : 'Sin especificar',
        tipo: tipo.charAt(0).toUpperCase() + tipo.slice(1).toLowerCase(),
        centro: row[iCentro] ? String(row[iCentro]).trim() : 'La Vega',
        categoria: row[iCategoria] ? String(row[iCategoria]).trim() : 'General',
        comentarios: row[iComentarios] ? String(row[iComentarios]).trim() : '',
        estado: 'pendiente'
      });
    }

    if (registrosExcel.length === 0) {
      throw new Error(`No se encontraron registros válidos en la hoja "${sheetName}" (${dataRows.length} filas revisadas)`);
    }

    // 5. Determinar rango de fechas
    const fechas = registrosExcel.map(r => r.fecha).sort();
    const fechaMin = fechas[0];
    const fechaMax = fechas[fechas.length - 1];
    const añosEnArchivo = [...new Set(registrosExcel.map(r => r.fecha.split('-')[0]))].sort();

    // 6. Consultar registros existentes en Supabase para ese rango
    const { data: existentes, error: fetchError } = await supabase
      .from('costos')
      .select('fecha, monto, proveedor, centro, categoria')
      .gte('fecha', fechaMin)
      .lte('fecha', fechaMax);

    if (fetchError) throw fetchError;

    // 7. Crear "huella" para deduplicar (fecha + monto redondeado + proveedor + centro + categoría)
    const generarHuella = (r) => 
      `${r.fecha}|${Math.round(r.monto)}|${(r.proveedor || '').toString().trim().toLowerCase()}|${(r.centro || '').trim()}|${(r.categoria || '').trim().toLowerCase()}`;
    
    const huellaExistentes = new Set((existentes || []).map(generarHuella));

    // 8. Filtrar solo registros nuevos
    const registrosNuevos = registrosExcel.filter(r => !huellaExistentes.has(generarHuella(r)));
    const registrosDuplicados = registrosExcel.length - registrosNuevos.length;

    // 9. Insertar solo los nuevos en lotes
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
      procesados: registrosExcel.length,
      insertados: insertados,
      duplicados: registrosDuplicados,
      añosEnArchivo: añosEnArchivo,
      fechaMin,
      fechaMax,
      detalles: {
        inventario: null,
        nacimientos: null,
        destetes: null,
        errores: [],
        costos: `✅ ${insertados} registros nuevos insertados de ${registrosExcel.length} procesados` +
                (registrosDuplicados > 0 ? `\n⏭️ ${registrosDuplicados} registros ya existían y fueron omitidos` : '') +
                `\n📄 Hoja: "${sheetName}"` +
                `\n📅 Período: ${fechaMin} a ${fechaMax} (${añosEnArchivo.join(', ')})`
      }
    };
  };

  // ==================== PROCESAR VENTAS ====================
  const procesarVentas = async (workbook) => {
    const ventasSheet = workbook.SheetNames.find(s => s.toLowerCase().includes('venta'));
    if (!ventasSheet) return null;

    const ws = workbook.Sheets[ventasSheet];
    const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    const parseDate = (val) => {
      if (!val) return null;
      try {
        if (typeof val === 'number') {
          const date = new Date((val - 25569) * 86400 * 1000);
          return date.toISOString().split('T')[0];
        }
        if (val instanceof Date) return val.toISOString().split('T')[0];
        // Handle string dates like "18/4/2025"
        if (typeof val === 'string') {
          const parts = val.split('/');
          if (parts.length === 3) {
            const [d, m, y] = parts;
            return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          }
          const d = new Date(val);
          if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
        }
        return null;
      } catch { return null; }
    };

    // Recorrer todas las filas, detectando secciones por año
    const ventas = [];
    let añoActual = null;

    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row) continue;

      // Detectar fila de sección "Ventas 20XX"
      const cellB = row[1];
      if (cellB && typeof cellB === 'string' && cellB.match(/^Ventas\s+20\d{2}$/i)) {
        añoActual = parseInt(cellB.match(/20\d{2}/)[0]);
        continue;
      }

      // Saltar filas de headers y totales
      if (cellB === 'Fecha' || (row[3] && String(row[3]).toLowerCase() === 'total')) continue;

      // Procesar fila de datos: [_, Fecha, Factura, Cliente, Kg, Precio, Valor, Tipo, Comentarios]
      const fecha = parseDate(row[1]);
      const cliente = row[3] ? String(row[3]).trim() : null;
      const kg = typeof row[4] === 'number' ? row[4] : null;
      const precio = typeof row[5] === 'number' ? row[5] : null;
      const valor = typeof row[6] === 'number' ? row[6] : null;
      const tipo = row[7] ? String(row[7]).trim() : null;

      // Necesitamos al menos cliente, kg y valor para que sea una venta válida
      if (!cliente || !kg || !valor || valor === 0) continue;

      // Si no tiene fecha propia, puede heredar la del row anterior (caso AB & Cia en 2024)
      const fechaFinal = fecha || (ventas.length > 0 ? ventas[ventas.length - 1].fecha : null);
      const añoFinal = fechaFinal ? parseInt(fechaFinal.split('-')[0]) : añoActual;

      ventas.push({
        año: añoFinal || añoActual,
        fecha: fechaFinal,
        factura: row[2] ? String(row[2]).trim() : null,
        cliente: cliente,
        kg: Math.round(kg * 100) / 100,
        precio: Math.round(precio * 100) / 100,
        valor: Math.round(valor),
        tipo: tipo,
        comentarios: row[8] ? String(row[8]).trim() : ''
      });
    }

    if (ventas.length === 0) return null;

    // Consultar ventas existentes en Supabase
    const { data: existentes, error: fetchError } = await supabase
      .from('ventas')
      .select('fecha, cliente, kg, valor, tipo');

    if (fetchError) throw fetchError;

    // Deduplicar por huella: fecha + cliente + kg redondeado + valor + tipo
    const generarHuella = (r) =>
      `${r.fecha}|${(r.cliente || '').toLowerCase()}|${Math.round(r.kg)}|${Math.round(r.valor)}|${r.tipo}`;

    const huellaExistentes = new Set((existentes || []).map(generarHuella));
    const ventasNuevas = ventas.filter(v => !huellaExistentes.has(generarHuella(v)));
    const ventasDuplicadas = ventas.length - ventasNuevas.length;

    let insertados = 0;
    if (ventasNuevas.length > 0) {
      const { data, error: insertError } = await supabase
        .from('ventas')
        .insert(ventasNuevas)
        .select();
      if (insertError) throw insertError;
      insertados = data?.length || 0;
    }

    const añosVentas = [...new Set(ventas.map(v => v.año))].sort();

    return {
      procesados: ventas.length,
      insertados: insertados,
      duplicados: ventasDuplicadas,
      años: añosVentas,
      resumen: `✅ ${insertados} ventas nuevas insertadas de ${ventas.length} encontradas` +
               (ventasDuplicadas > 0 ? `\n⏭️ ${ventasDuplicadas} ventas ya existían y fueron omitidas` : '') +
               `\n📅 Años: ${añosVentas.join(', ')}`
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
          // También procesar ventas si la hoja existe
          try {
            const ventasResult = await procesarVentas(workbook);
            if (ventasResult) {
              result.detalles.ventas = ventasResult.resumen;
            }
          } catch (ventasErr) {
            console.error('Error procesando ventas:', ventasErr);
            result.detalles.errores = result.detalles.errores || [];
            result.detalles.errores.push(`Ventas: ${ventasErr.message}`);
          }
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
                  {resultado.detalles.inventario && <p className="text-sm">{resultado.detalles.inventario}</p>}
                  {resultado.detalles.nacimientos && <p className="text-sm">{resultado.detalles.nacimientos}</p>}
                  {resultado.detalles.destetes && <p className="text-sm">{resultado.detalles.destetes}</p>}
                  {resultado.detalles.costos && (
                    <div className="space-y-1">
                      {resultado.detalles.costos.split('\n').map((line, i) => (
                        <p key={i} className="text-sm">{line}</p>
                      ))}
                    </div>
                  )}
                  {resultado.detalles.ventas && (
                    <div className="space-y-1 mt-2 pt-2 border-t">
                      <p className="text-sm font-medium text-gray-700">🛒 Ventas de Ganado:</p>
                      {resultado.detalles.ventas.split('\n').map((line, i) => (
                        <p key={i} className="text-sm">{line}</p>
                      ))}
                    </div>
                  )}
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
