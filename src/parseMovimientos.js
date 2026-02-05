/**
 * parseMovimientos.js
 * Parsea archivos Excel de Movimientos mensuales y extrae el inventario de ganado
 * para La Vega y Bariloche.
 * 
 * Requiere: npm install xlsx (SheetJS)
 * Uso: import { parseMovimientosExcel } from './parseMovimientos';
 *      const resultado = await parseMovimientosExcel(file);
 */
import * as XLSX from 'xlsx';

const MESES_ES = {
  'ENERO': 1, 'FEBRERO': 2, 'MARZO': 3, 'ABRIL': 4,
  'MAYO': 5, 'JUNIO': 6, 'JULIO': 7, 'AGOSTO': 8,
  'SEPTIEMBRE': 9, 'OCTUBRE': 10, 'NOVIEMBRE': 11, 'DICIEMBRE': 12
};

const CATEGORIAS_GANADO = ['VP', 'CM', 'CH', 'VH', 'NAS', 'T', 'HD', 'HL', 'MD', 'ML', 'MC', 'BUEY'];
const FINCAS_INTERES = ['LA VEGA', 'BARILOCHE'];

/**
 * Extrae mes y año del header del archivo de movimientos.
 * Busca patrones como: "MOVIMIENTOS DEL MES DE JULIO DE 2024"
 */
function extraerMesAnio(rows) {
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const cellA = String(rows[i]?.[0] || '').toUpperCase();
    // Buscar patrón "MES DE {MES} DE {AÑO}"
    const match = cellA.match(/MES\s+DE\s+(\w+)\s+DE\s+(\d{4})/);
    if (match) {
      const mesNombre = match[1].trim();
      const año = parseInt(match[2]);
      const mes = MESES_ES[mesNombre];
      if (mes && año) return { mes, año, mesNombre };
    }
  }
  return null;
}

/**
 * Identifica las secciones de ganado por finca en la hoja.
 * Retorna array de { finca, startRow } donde startRow es la fila de CATEGORIA header.
 */
function identificarSecciones(rows) {
  const secciones = [];
  let i = 0;
  
  while (i < rows.length) {
    const cellA = String(rows[i]?.[0] || '').toUpperCase().trim();
    
    // Buscar "INVENTARIO DE GANADO" (pero NO "INVENTARIO DE EQUINOS" ni "INVENTARIO DE GANADO EN PARTICIPACION")
    if (cellA.includes('INVENTARIO DE GANADO') && !cellA.includes('EQUINO') && !cellA.includes('PARTICIPACION')) {
      // La siguiente fila debería tener "HACIENDA X"
      const nextCell = String(rows[i + 1]?.[0] || '').toUpperCase().trim();
      
      for (const finca of FINCAS_INTERES) {
        if (nextCell.includes(finca)) {
          // Buscar la fila de "CATEGORIA" que está 3-4 filas después
          for (let j = i + 2; j < Math.min(i + 8, rows.length); j++) {
            const headerCell = String(rows[j]?.[0] || '').toUpperCase().trim();
            if (headerCell === 'CATEGORIA') {
              secciones.push({ finca, headerRow: j, inventarioRow: i });
              break;
            }
          }
          break;
        }
      }
    }
    i++;
  }
  
  return secciones;
}

/**
 * Extrae las categorías de ganado de una sección.
 * Lee desde headerRow+2 (las categorías empiezan 2 filas después del header CATEGORIA)
 * hasta encontrar TOTAL.
 * Columna M (índice 12) = SALDO FINAL
 */
function extraerCategorias(rows, headerRow) {
  const resultado = {};
  const COL_SALDO_FINAL = 12; // Columna M = índice 12

  // Las categorías empiezan 2 filas después del header (headerRow tiene "CATEGORIA", headerRow+1 tiene sub-headers)
  for (let i = headerRow + 2; i < Math.min(headerRow + 20, rows.length); i++) {
    const cat = String(rows[i]?.[0] || '').toUpperCase().trim();
    
    if (cat === 'TOTAL') {
      // Leer el total de la columna M
      const totalVal = rows[i]?.[COL_SALDO_FINAL];
      resultado.total = typeof totalVal === 'number' ? totalVal : 0;
      break;
    }
    
    if (CATEGORIAS_GANADO.includes(cat)) {
      const val = rows[i]?.[COL_SALDO_FINAL];
      resultado[cat.toLowerCase()] = typeof val === 'number' ? val : 0;
    }
  }
  
  // Asegurar que todas las categorías estén presentes
  for (const cat of CATEGORIAS_GANADO) {
    if (!(cat.toLowerCase() in resultado)) {
      resultado[cat.toLowerCase()] = 0;
    }
  }
  
  // Si el total no vino del archivo (o era #ERROR!), calcularlo
  if (!resultado.total || resultado.total === 0) {
    resultado.total = CATEGORIAS_GANADO.reduce((sum, cat) => sum + (resultado[cat.toLowerCase()] || 0), 0);
  }
  
  return resultado;
}

/**
 * Función principal: parsea un archivo Excel de Movimientos.
 * @param {File} file - Archivo Excel subido por el usuario
 * @returns {Promise<{ success: boolean, data?: Array, error?: string, meta?: object }>}
 */
export async function parseMovimientosExcel(file) {
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    
    // Usar la primera hoja (siempre contiene los movimientos)
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Convertir a array de arrays (cada fila es un array)
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    
    // 1. Extraer mes y año
    const periodo = extraerMesAnio(rows);
    if (!periodo) {
      return { 
        success: false, 
        error: 'No se pudo detectar el mes y año del archivo. Verifica que el encabezado diga "MOVIMIENTOS DEL MES DE..."' 
      };
    }
    
    // 2. Identificar secciones de ganado
    const secciones = identificarSecciones(rows);
    if (secciones.length === 0) {
      return { 
        success: false, 
        error: 'No se encontraron secciones de inventario de ganado en el archivo.' 
      };
    }
    
    // 3. Extraer datos de cada sección
    const registros = [];
    const periodoStr = `${periodo.año}-${String(periodo.mes).padStart(2, '0')}`;
    
    for (const seccion of secciones) {
      const categorias = extraerCategorias(rows, seccion.headerRow);
      const fincaNombre = seccion.finca === 'LA VEGA' ? 'La Vega' : 'Bariloche';
      
      registros.push({
        finca: fincaNombre,
        periodo: periodoStr,
        año: periodo.año,
        mes: periodo.mes,
        vp: categorias.vp || 0,
        vh: categorias.vh || 0,
        nas: categorias.nas || 0,
        cm: categorias.cm || 0,
        ch: categorias.ch || 0,
        t: categorias.t || 0,
        hl: categorias.hl || 0,
        ml: categorias.ml || 0,
        hd: categorias.hd || 0,
        md: categorias.md || 0,
        mc: categorias.mc || 0,
        total: categorias.total || 0
      });
    }
    
    return {
      success: true,
      data: registros,
      meta: {
        archivo: file.name,
        hoja: sheetName,
        periodo: periodoStr,
        mesNombre: periodo.mesNombre,
        año: periodo.año,
        fincasEncontradas: registros.map(r => r.finca)
      }
    };
    
  } catch (err) {
    console.error('Error parseando archivo de movimientos:', err);
    return { 
      success: false, 
      error: `Error al leer el archivo: ${err.message}` 
    };
  }
}

/**
 * Nombres completos de categorías para mostrar en la UI
 */
export const NOMBRES_CATEGORIAS = {
  vp: 'Vacas Paridas',
  vh: 'Vacas Horras',
  nas: 'Novillas',
  cm: 'Crías Macho',
  ch: 'Crías Hembra',
  t: 'Toros',
  hl: 'Hembras Levante',
  ml: 'Machos Levante',
  hd: 'Hembras Desarrollo',
  md: 'Machos Desarrollo',
  mc: 'Machos Ceba',
};
