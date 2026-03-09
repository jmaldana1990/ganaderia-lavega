import React, { useState, useMemo, useEffect } from 'react';
import { PlusCircle, Search, TrendingUp, DollarSign, FileText, Check, X, Edit2, Trash2, BarChart3, PieChart, Menu, Home, Receipt, Beef, ChevronLeft, ChevronRight, Baby, Scale, Users, Upload, LogOut, Loader2, Wifi, WifiOff, RefreshCw, MapPin, ShoppingCart, Target, Activity, Clock, AlertTriangle, ArrowRightLeft, Truck, Skull } from 'lucide-react';
import { CATEGORIAS, CENTROS_COSTOS, PROVEEDORES_CONOCIDOS } from './datos';
import { GASTOS_HISTORICOS } from './gastos-historicos';
import { NACIMIENTOS_LA_VEGA } from './nacimientos-lavega';
import { INVENTARIO_FINCAS } from './inventario-fincas';
import * as db from './supabase';
import Login from './Login';
import CargaArchivos from './CargaArchivos';
import KPITrends from './KPITrends';
import Contabilidad from './Contabilidad';
import { VENTAS_GANADO, TIPO_ANIMAL_LABELS } from './ventas-ganado';

// ==================== HELPERS ====================
const formatCurrency = (v) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v);
const formatDate = (d) => {
  if (!d || d === '1900-01-01' || (typeof d === 'string' && d.startsWith('1900'))) return '-';
  return new Date(d + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
};
const ITEMS_PER_PAGE = 50;
const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const centroColor = (c) => ({ 'La Vega': 'bg-green-900/40 text-green-400', 'Bariloche': 'bg-blue-900/40 text-blue-400', 'Global': 'bg-purple-900/40 text-purple-400' }[c] || 'bg-gray-800 text-gray-300');
const centroBarColor = (c) => ({ 'La Vega': 'bg-green-500', 'Bariloche': 'bg-blue-500', 'Global': 'bg-purple-500' }[c] || 'bg-gray-500');

// Filtra filas de resumen/totales que no son animales reales (se colan al cargar archivos de movimientos)
const RESUMEN_KEYWORDS = new Set(['VACIAS', 'VACIA', 'PÑ', 'PREÑADAS', 'TOTAL', 'SECAS', 'LACTANTES', 'NOVILLAS', 'RESUMEN', 'DESCARTE', 'DESCARTES']);
const esAnimalValido = (id) => { if (!id) return false; return !RESUMEN_KEYWORDS.has(String(id).trim().toUpperCase()); };

// Calcula la edad a partir de fecha de nacimiento (YYYY-MM-DD)
// < 24 meses → muestra meses con 1 decimal | >= 24 meses → muestra años con 1 decimal
const calcularEdad = (fechaNac) => {
  if (!fechaNac || fechaNac === '1900-01-01' || fechaNac.startsWith('1900')) return null;
  const nac = new Date(fechaNac + 'T00:00:00');
  const hoy = new Date();
  if (isNaN(nac.getTime())) return null;
  const diffMs = hoy - nac;
  if (diffMs < 0) return null;
  const totalDias = diffMs / (1000 * 60 * 60 * 24);
  const totalMeses = totalDias / 30.4375; // promedio días/mes
  if (totalMeses < 24) {
    return { valor: Math.round(totalMeses * 10) / 10, unidad: 'meses' };
  }
  const totalAños = totalDias / 365.25;
  return { valor: Math.round(totalAños * 10) / 10, unidad: 'años' };
};
const formatEdad = (fechaNac) => {
  const edad = calcularEdad(fechaNac);
  if (!edad) return '-';
  return `${edad.valor} ${edad.unidad}`;
};

// Determina la categoría actual de un animal según su ciclo de vida
// CM/CH → ML/HL (destete) → NV (hembra ≥24m sin partos) → VP (parida lactando) → VS (vaca seca)
const CAT_MAP_STYLES = {
  VP: { cat: 'VP', label: 'VP - Vaca Parida', icon: '🐄', color: 'bg-green-500/20 text-green-400' },
  VS: { cat: 'VS', label: 'VS - Vaca Seca', icon: '🐄', color: 'bg-orange-500/20 text-orange-400' },
  NV: { cat: 'NV', label: 'NV - Novilla Vientre', icon: '♀', color: 'bg-purple-500/20 text-purple-400' },
  HL: { cat: 'HL', label: 'HL - Hembra Levante', icon: '♀', color: 'bg-teal-500/20 text-teal-400' },
  ML: { cat: 'ML', label: 'ML - Macho Levante', icon: '♂', color: 'bg-amber-500/20 text-amber-400' },
  CM: { cat: 'CM', label: 'CM - Cría Macho', icon: '♂', color: 'bg-blue-500/20 text-blue-400' },
  CH: { cat: 'CH', label: 'CH - Cría Hembra', icon: '♀', color: 'bg-pink-500/20 text-pink-400' },
  TR: { cat: 'TR', label: 'TR - Toro', icon: '🐂', color: 'bg-red-500/20 text-red-400' },
};

const getCategoriaAnimal = (animal) => {
  const catDB = animal.data?.categoriaActual || animal.data?.categoria_actual;

  // Cálculo dinámico: madre con partos → VP o VS
  if (animal.tipo === 'madre') {
    if (animal.estaLactando) {
      return CAT_MAP_STYLES['VP'];
    }
    return CAT_MAP_STYLES['VS'];
  }

  // Cría: calcular por destete, sexo, edad
  const n = animal.data;
  if (!n) {
    // Sin datos de cría → usar DB como fallback
    if (catDB && CAT_MAP_STYLES[catDB]) return CAT_MAP_STYLES[catDB];
    return { cat: '?', label: 'Sin datos', icon: '❓', color: 'bg-gray-500/20 text-gray-400' };
  }

  const esMacho = n.sexo === 'M';
  const destetada = !!(n.pesoDestete || n.peso_destete || n.fechaDestete || n.fecha_destete);

  if (!destetada) {
    // Sin destete pero DB dice categoría avanzada → confiar en DB
    if (catDB && CAT_MAP_STYLES[catDB] && !['CM', 'CH'].includes(catDB)) {
      return CAT_MAP_STYLES[catDB];
    }
    return esMacho ? CAT_MAP_STYLES['CM'] : CAT_MAP_STYLES['CH'];
  }

  // Destetada
  if (esMacho) {
    // ML → TR si edad ≥ 3 años o peso ≥ 400 kg
    const edad = calcularEdad(animal.fechaNacimiento);
    const pesoUltimo = n.pesoDestete || n.peso_destete || 0;
    if ((edad && edad.unidad === 'años' && edad.valor >= 3) || pesoUltimo >= 400) {
      return CAT_MAP_STYLES['TR'];
    }
    return CAT_MAP_STYLES['ML'];
  }

  // Hembra destetada → HL o NV según edad
  const edad = calcularEdad(animal.fechaNacimiento);
  if (edad && edad.unidad === 'años' && edad.valor >= 2) {
    return CAT_MAP_STYLES['NV'];
  }
  return CAT_MAP_STYLES['HL'];
};

// Calcula ganancia gramos/día/vida al destete
// Fórmula: (pesoDestete - pesoNacer) / díasEntreNacimientoYDestete * 1000
const calcularGDPDestete = (n) => {
  if (!n) return null;
  const pesoNacer = n.pesoNacer || n.peso_nacer;
  const pesoDestete = n.pesoDestete || n.peso_destete;
  if (!pesoNacer || !pesoDestete) return null;
  // Intentar obtener días de edad al destete
  let diasDestete = n.edadDestete || n.edad_destete;
  if (!diasDestete) {
    // Calcular desde fechas
    const fechaNac = n.fecha;
    const fechaDest = n.fechaDestete || n.fecha_destete;
    if (fechaNac && fechaDest) {
      const d1 = new Date(fechaNac + 'T00:00:00');
      const d2 = new Date(fechaDest + 'T00:00:00');
      diasDestete = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    }
  }
  if (!diasDestete || diasDestete <= 0) return null;
  return Math.round((pesoDestete - pesoNacer) / diasDestete * 1000);
};

const HATO_CATEGORIAS = [
  { key: 'vp', label: 'Vacas Paridas', color: 'bg-green-900/30 text-green-400' },
  { key: 'vh', label: 'Vacas Horras', color: 'bg-blue-900/30 text-blue-400' },
  { key: 'nas', label: 'Novillas', color: 'bg-purple-900/30 text-purple-400' },
  { key: 'cm', label: 'Crías ♂', color: 'bg-orange-900/30 text-orange-400' },
  { key: 'ch', label: 'Crías ♀', color: 'bg-pink-900/30 text-pink-400' },
  { key: 'hl', label: 'Hemb. Levante', color: 'bg-teal-900/30 text-teal-400' },
  { key: 'ml', label: 'Machos Levante', color: 'bg-amber-900/30 text-amber-400' },
  { key: 't', label: 'Toros', color: 'bg-red-900/30 text-red-400' },
];

// ==================== ANIMAL LINK (número clickeable) ====================
function AnimalLink({ id, onAnimalClick, className = '' }) {
  if (!id || !onAnimalClick) return <span className={className}>{id || '-'}</span>;
  return (
    <button onClick={(e) => { e.stopPropagation(); onAnimalClick(String(id).trim()); }}
      className={`cursor-pointer hover:underline decoration-dotted underline-offset-2 ${className || 'text-green-400 font-medium'}`}
      title={`Ver ficha de ${id}`}>
      {id}
    </button>
  );
}

// ==================== ANIMAL MODAL (popup universal) ====================
function AnimalModal({ animalId, onClose, nacimientos, pesajes, palpaciones, servicios, ventas, destetes, onAnimalClick }) {
  if (!animalId) return null;

  const id = String(animalId).trim();

  // Buscar en nacimientos como cría
  const regCria = (nacimientos || []).find(n => n.cria && String(n.cria).trim() === id);

  // Buscar como madre (partos)
  const partos = (nacimientos || []).filter(n => n.madre && String(n.madre).trim() === id)
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  // Pesajes de este animal
  const misPesajes = (pesajes || []).filter(p => p.animal && String(p.animal).trim() === id)
    .sort((a, b) => (b.fecha_pesaje || '').localeCompare(a.fecha_pesaje || ''));

  // Palpaciones
  const misPalps = (palpaciones || []).filter(p => p.hembra && String(p.hembra).trim() === id)
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  // Servicios
  const misServs = (servicios || []).filter(s => s.hembra && String(s.hembra).trim() === id)
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  // Destetes
  const misDestetes = (destetes || []).filter(d => (d.cria && String(d.cria).trim() === id) || (d.animal && String(d.animal).trim() === id));

  // Estado del animal
  const estado = regCria?.estado || (partos.length > 0 ? 'Activo' : null);
  const esMuerto = estado === 'Muerto' || estado === 'muerto';
  const esVendido = estado === 'Vendido' || estado === 'vendido';

  // Info básica
  const sexo = regCria?.sexo;
  const madre = regCria?.madre;
  const padre = regCria?.padre;
  const fechaNac = regCria?.fecha;
  const pesoNacer = regCria?.pesoNacer || regCria?.peso_nacer;
  const pesoDestete = regCria?.pesoDestete || regCria?.peso_destete;
  const fechaDestete = regCria?.fechaDestete || regCria?.fecha_destete;
  const comentario = regCria?.comentario;

  const esMadre = partos.length > 0;

  // GDP al destete
  const gdpDestete = regCria ? calcularGDPDestete(regCria) : null;

  // Categoría - cálculo dinámico siempre
  const catActual = regCria?.categoriaActual || regCria?.categoria_actual;
  const CAT_ICONS = { VP: '🐄', VS: '🐄', NV: '♀', HL: '♀', ML: '♂', CM: '♂', CH: '♀', TR: '🐂' };
  const CAT_LABELS_MODAL = { VP: 'Vaca Parida', VS: 'Vaca Seca', NV: 'Novilla Vientre', HL: 'Hembra Levante', ML: 'Macho Levante', CM: 'Cría Macho', CH: 'Cría Hembra', TR: 'Toro' };
  let categoriaLabel = '—';
  if (esMadre) {
    // VP si última cría NO destetada, VS si ya se destetó
    const ultimoParto = partos.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))[0];
    const ultimaCriaDestetada = ultimoParto && !!(ultimoParto.pesoDestete || ultimoParto.peso_destete || ultimoParto.fechaDestete || ultimoParto.fecha_destete);
    if (ultimoParto && !ultimaCriaDestetada) {
      categoriaLabel = '🐄 Vaca Parida';
    } else {
      const catDB = catActual;
      categoriaLabel = (catDB === 'VP') ? '🐄 Vaca Parida' : '🐄 Vaca Seca';
    }
  } else if (regCria) {
    const destetada = !!(pesoDestete || fechaDestete);
    if (sexo === 'M') {
      if (!destetada && catActual && ['TR', 'ML'].includes(catActual)) {
        categoriaLabel = catActual === 'TR' ? '🐂 Toro' : '♂ Macho Levante';
      } else if (!destetada) {
        categoriaLabel = '♂ Cría Macho';
      } else {
        const edad = calcularEdad(fechaNac);
        const pesoUltimo = misPesajes[0]?.peso || pesoDestete || 0;
        if ((edad && edad.unidad === 'años' && edad.valor >= 3) || pesoUltimo >= 400) {
          categoriaLabel = '🐂 Toro';
        } else {
          categoriaLabel = '♂ Macho Levante';
        }
      }
    } else {
      if (!destetada && catActual && ['NV', 'HL'].includes(catActual)) {
        categoriaLabel = catActual === 'NV' ? '♀ Novilla Vientre' : '♀ Hembra Levante';
      } else if (!destetada) {
        categoriaLabel = '♀ Cría Hembra';
      } else {
        const edad = calcularEdad(fechaNac);
        categoriaLabel = (edad && edad.unidad === 'años' && edad.valor >= 2) ? '♀ Novilla Vientre' : '♀ Hembra Levante';
      }
    }
  } else if (misPesajes.length > 0) {
    categoriaLabel = misPesajes[0].categoria || 'Levante';
  } else if (catActual) {
    // Fallback: usar DB si no se pudo calcular
    categoriaLabel = `${CAT_ICONS[catActual] || ''} ${CAT_LABELS_MODAL[catActual] || catActual}`;
  }

  // Última palpación
  const ultimaPalp = misPalps[0] || null;
  const ultimoServ = misServs[0] || null;

  const fmtDate = (d) => { if (!d || d === '1900-01-01' || (typeof d === 'string' && d.startsWith('1900'))) return '-'; return new Date(d + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }); };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-[60] p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-gray-900 rounded-2xl w-full max-w-2xl border border-gray-700 my-8 shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <span className="text-3xl font-bold text-green-400">{id}</span>
            <span className="text-sm text-gray-400">{categoriaLabel}</span>
            {esMuerto && <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-400">☠️ Muerto</span>}
            {esVendido && <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-400">🏷️ Vendido</span>}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Info básica */}
          {(fechaNac || madre || padre || pesoNacer != null) && (
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">Datos Básicos</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                {fechaNac && <div><span className="text-gray-500">Nacimiento</span><p className="text-gray-200 font-medium">{fmtDate(fechaNac)}</p><p className="text-xs text-gray-500">{formatEdad(fechaNac)}</p></div>}
                {sexo && <div><span className="text-gray-500">Sexo</span><p className="text-gray-200 font-medium">{sexo === 'M' ? '♂ Macho' : '♀ Hembra'}</p></div>}
                {madre && <div><span className="text-gray-500">Madre</span><p><AnimalLink id={madre} onAnimalClick={onAnimalClick} /></p></div>}
                {padre && <div><span className="text-gray-500">Padre</span><p className="text-gray-200 font-medium">{padre}</p></div>}
                {pesoNacer != null && <div><span className="text-gray-500">Peso Nacer</span><p className="text-gray-200 font-medium">{Math.round(pesoNacer)} kg</p></div>}
                {pesoDestete != null && <div><span className="text-gray-500">Peso Destete</span><p className="text-gray-200 font-medium">{Math.round(pesoDestete)} kg</p></div>}
                {fechaDestete && <div><span className="text-gray-500">Fecha Destete</span><p className="text-gray-200">{fmtDate(fechaDestete)}</p></div>}
                {gdpDestete && <div><span className="text-gray-500">GDP Vida</span><p className={`font-medium ${gdpDestete >= 800 ? 'text-green-400' : gdpDestete >= 600 ? 'text-amber-400' : 'text-red-400'}`}>{gdpDestete} g/día</p></div>}
              </div>
              {comentario && <p className="text-xs text-gray-500 mt-3 italic">📝 {comentario}</p>}
            </div>
          )}

          {/* Si no se encontró info */}
          {!regCria && !esMadre && misPesajes.length === 0 && misPalps.length === 0 && misServs.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <p className="text-lg mb-1">No se encontró información</p>
              <p className="text-sm">El animal <strong>{id}</strong> no tiene registros en el sistema.</p>
            </div>
          )}

          {/* Historial de partos (si es madre) */}
          {esMadre && (
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">🍼 Historial de Partos ({partos.length})</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-gray-500 border-b border-gray-700 text-xs">
                    <th className="text-left py-2 px-2">Cría</th><th className="text-left py-2 px-2">Fecha</th><th className="text-center py-2 px-2">Sexo</th><th className="text-right py-2 px-2">Peso Nacer</th><th className="text-right py-2 px-2">Peso Destete</th><th className="text-left py-2 px-2">Estado</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-700/50">
                    {partos.map((p, i) => (
                      <tr key={i} className="hover:bg-gray-700/30">
                        <td className="py-2 px-2"><AnimalLink id={p.cria} onAnimalClick={onAnimalClick} /></td>
                        <td className="py-2 px-2 text-gray-300">{fmtDate(p.fecha)}</td>
                        <td className="py-2 px-2 text-center">{p.sexo === 'M' ? <span className="text-blue-400">♂</span> : <span className="text-pink-400">♀</span>}</td>
                        <td className="py-2 px-2 text-right text-gray-300">{p.pesoNacer || p.peso_nacer ? `${Math.round(p.pesoNacer || p.peso_nacer)} kg` : '-'}</td>
                        <td className="py-2 px-2 text-right text-gray-300">{p.pesoDestete || p.peso_destete ? `${Math.round(p.pesoDestete || p.peso_destete)} kg` : '-'}</td>
                        <td className="py-2 px-2"><span className={`px-2 py-0.5 rounded-full text-xs ${p.estado === 'Activo' ? 'bg-green-500/20 text-green-400' : p.estado === 'Muerto' ? 'bg-red-500/20 text-red-400' : 'bg-gray-600/20 text-gray-400'}`}>{p.estado || '-'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pesajes */}
          {misPesajes.length > 0 && (
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">⚖️ Pesajes ({misPesajes.length})</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-gray-500 border-b border-gray-700 text-xs">
                    <th className="text-left py-2 px-2">Fecha</th><th className="text-right py-2 px-2">Peso</th><th className="text-right py-2 px-2">Edad (meses)</th><th className="text-right py-2 px-2">GDP Vida</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-700/50">
                    {misPesajes.slice(0, 10).map((p, i) => (
                      <tr key={i} className="hover:bg-gray-700/30">
                        <td className="py-2 px-2 text-gray-300">{fmtDate(p.fecha_pesaje)}</td>
                        <td className="py-2 px-2 text-right text-gray-200 font-medium">{p.peso ? `${Math.round(p.peso)} kg` : '-'}</td>
                        <td className="py-2 px-2 text-right text-gray-400">{p.edad_meses ? `${p.edad_meses.toFixed(1)}` : '-'}</td>
                        <td className="py-2 px-2 text-right text-gray-400">{p.gdp_vida ? `${Math.round(p.gdp_vida)} g/d` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {misPesajes.length > 10 && <p className="text-xs text-gray-500 mt-2 text-center">...y {misPesajes.length - 10} más</p>}
              </div>
            </div>
          )}

          {/* Palpaciones */}
          {misPalps.length > 0 && (
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">🔬 Palpaciones ({misPalps.length})</h4>
              <div className="space-y-2">
                {misPalps.slice(0, 5).map((p, i) => (
                  <div key={i} className="flex flex-wrap gap-x-4 gap-y-1 text-sm py-2 border-b border-gray-700/50 last:border-0">
                    <span className="text-gray-400">{fmtDate(p.fecha)}</span>
                    <span className={`font-medium ${p.resultado === 'Preñada' ? 'text-green-400' : p.resultado?.includes('Descarte') ? 'text-red-400' : 'text-gray-200'}`}>{p.resultado || p.detalle || '-'}</span>
                    {p.estado && <span className="text-gray-500">{p.estado}</span>}
                    {p.dias_gestacion && p.dias_gestacion !== 'VACIA' && <span className="text-purple-400">{p.dias_gestacion}d gest.</span>}
                    {p.reproductor && <span className="text-gray-500">♂ {p.reproductor}</span>}
                  </div>
                ))}
                {misPalps.length > 5 && <p className="text-xs text-gray-500 text-center">...y {misPalps.length - 5} más</p>}
              </div>
            </div>
          )}

          {/* Servicios */}
          {misServs.length > 0 && (
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">🧬 Servicios IA/TE ({misServs.length})</h4>
              <div className="space-y-2">
                {misServs.slice(0, 5).map((s, i) => (
                  <div key={i} className="flex flex-wrap gap-x-4 gap-y-1 text-sm py-2 border-b border-gray-700/50 last:border-0">
                    <span className="text-gray-400">{fmtDate(s.fecha)}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${s.tipo === 'TE' ? 'bg-purple-500/20 text-purple-400' : 'bg-cyan-500/20 text-cyan-400'}`}>{s.tipo || 'IA'}</span>
                    {s.toro && <span className="text-gray-200">Pajilla: {s.toro}</span>}
                    {s.embrion && <span className="text-gray-200">Embrión: {s.embrion}</span>}
                    {s.tecnico && <span className="text-gray-500">Téc: {s.tecnico}</span>}
                  </div>
                ))}
                {misServs.length > 5 && <p className="text-xs text-gray-500 text-center">...y {misServs.length - 5} más</p>}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ==================== COMPONENTE PRINCIPAL ====================
export default function GanaderiaApp() {
  // Auth
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [userRole, setUserRole] = useState('admin');
  const [showLogin, setShowLogin] = useState(false);

  // Conexión
  const [isOnline, setIsOnline] = useState(true);
  const [dataSource, setDataSource] = useState('local');
  const [syncing, setSyncing] = useState(false);

  // Datos
  const [nacimientos, setNacimientos] = useState(NACIMIENTOS_LA_VEGA);
  const [gastos, setGastos] = useState(GASTOS_HISTORICOS);
  const [inventario, setInventario] = useState(INVENTARIO_FINCAS);
  const [ventas, setVentas] = useState(VENTAS_GANADO);
  const [pesajes, setPesajes] = useState([]);
  const [palpaciones, setPalpaciones] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [destetes, setDestetes] = useState([]);
  const [traslados, setTraslados] = useState([]);
  const [genealogia, setGenealogia] = useState([]);
  const [lluvias, setLluvias] = useState([]);

  // UI
  const [view, setView] = useState('dashboard');
  const [showForm, setShowForm] = useState(false);
  const [showCarga, setShowCarga] = useState(false);
  const [editGasto, setEditGasto] = useState(null);
  const [filtros, setFiltros] = useState({ mes: '', año: new Date().getFullYear().toString(), centro: '', categoria: '', busqueda: '' });
  const [menuOpen, setMenuOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Animal Modal
  const [animalModalId, setAnimalModalId] = useState(null);

  // ---- Init & Auth ----
  useEffect(() => {
    const init = async () => {
      try {
        const session = await db.getSession();
        if (session) { setSession(session); setUser(session.user); }
        const online = await db.checkConnection();
        setIsOnline(online);
        if (online) await loadCloudData();
        else loadCachedData();
      } catch (err) {
        console.error('Error en inicialización:', err);
        setIsOnline(false);
        loadCachedData();
      } finally {
        setLoading(false);
      }
    };
    init();

    const { data: { subscription } } = db.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') { setUser(null); setSession(null); setUserRole('admin'); }
      else if (session) {
        setSession(session); setUser(session.user);
        const role = await db.getUserRole(session.user.email);
        if (role) {
          setUserRole(role);
          if (role === 'contadora') setView('contabilidad');
        }
      }
    });

    const handleOnline = () => checkConnection();
    const handleOffline = () => { setIsOnline(false); if (dataSource === 'local') loadCachedData(); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const checkConnection = async () => {
    const online = await db.checkConnection();
    setIsOnline(online);
    if (online && dataSource !== 'cloud') await loadCloudData();
    if (!online && dataSource === 'local') loadCachedData();
  };

  const loadCloudData = async () => {
    setSyncing(true);
    try {
      const safeCall = (fn, fallback = []) => { try { const r = fn(); return r && r.catch ? r.catch(() => fallback) : Promise.resolve(fallback); } catch(e) { return Promise.resolve(fallback); } };
      const [nacData, costosData, invData, ventasData, pesData, palpData, servData, destData, lluvData, trasData, genData] = await Promise.all([
        safeCall(() => db.getNacimientos()), safeCall(() => db.getCostos()), safeCall(() => db.getInventario()), safeCall(() => db.getVentas(), null),
        safeCall(() => db.getPesajes()), safeCall(() => db.getPalpaciones()),
        safeCall(() => db.getServicios()), safeCall(() => db.getDestetes()),
        safeCall(() => db.getLluvias()), safeCall(() => db.getTraslados()),
        safeCall(() => db.getGenealogia())
      ]);
      if (nacData?.length > 0) {
        setNacimientos(nacData);
        try { localStorage.setItem('cache_nacimientos', JSON.stringify(nacData)); } catch(e) {}
      }
      if (costosData?.length > 0) {
        setGastos(costosData);
        try { localStorage.setItem('cache_costos', JSON.stringify(costosData)); } catch(e) {}
      }
      if (ventasData?.length > 0) {
        setVentas(ventasData);
        try { localStorage.setItem('cache_ventas', JSON.stringify(ventasData)); } catch(e) {}
      }
      if (pesData?.length > 0) {
        setPesajes(pesData);
        try { localStorage.setItem('cache_pesajes', JSON.stringify(pesData)); } catch(e) {}
      }
      if (palpData?.length > 0) {
        setPalpaciones(palpData);
        try { localStorage.setItem('cache_palpaciones', JSON.stringify(palpData)); } catch(e) {}
      }
      if (servData?.length > 0) {
        setServicios(servData);
        try { localStorage.setItem('cache_servicios', JSON.stringify(servData)); } catch(e) {}
      }
      if (destData?.length > 0) {
        setDestetes(destData);
        try { localStorage.setItem('cache_destetes', JSON.stringify(destData)); } catch(e) {}
      }
      if (lluvData?.length > 0) {
        setLluvias(lluvData);
        try { localStorage.setItem('cache_lluvias', JSON.stringify(lluvData)); } catch(e) {}
      }
      if (trasData?.length > 0) {
        setTraslados(trasData);
        try { localStorage.setItem('cache_traslados', JSON.stringify(trasData)); } catch(e) {}
      }
      if (genData?.length > 0) {
        setGenealogia(genData);
        try { localStorage.setItem('cache_genealogia', JSON.stringify(genData)); } catch(e) {}
      }
      // Inventario: combinar nube + local, deduplicando por finca+periodo
      if (invData?.length > 0) {
        setInventario(() => {
          const merged = new Map();
          INVENTARIO_FINCAS.forEach(r => merged.set(r.finca + '-' + r.periodo, r));
          invData.forEach(r => merged.set(r.finca + '-' + r.periodo, r));
          const result = [...merged.values()];
          try { localStorage.setItem('cache_inventario', JSON.stringify(result)); } catch(e) {}
          return result;
        });
      }
      setDataSource('cloud');
      try { localStorage.setItem('cache_timestamp', new Date().toISOString()); } catch(e) {}
    } catch (err) {
      console.error('Error cargando datos de la nube:', err);
    } finally {
      setSyncing(false);
    }
  };

  // Cargar datos desde caché local (para modo offline)
  const loadCachedData = () => {
    try {
      const cachedNac = localStorage.getItem('cache_nacimientos');
      const cachedCostos = localStorage.getItem('cache_costos');
      const cachedVentas = localStorage.getItem('cache_ventas');
      const cachedInv = localStorage.getItem('cache_inventario');
      const cachedPes = localStorage.getItem('cache_pesajes');
      const cachedPalp = localStorage.getItem('cache_palpaciones');
      const cachedServ = localStorage.getItem('cache_servicios');
      const cachedDest = localStorage.getItem('cache_destetes');
      const cachedLluv = localStorage.getItem('cache_lluvias');
      if (cachedNac) setNacimientos(JSON.parse(cachedNac));
      if (cachedCostos) setGastos(JSON.parse(cachedCostos));
      if (cachedVentas) setVentas(JSON.parse(cachedVentas));
      if (cachedInv) setInventario(JSON.parse(cachedInv));
      if (cachedPes) setPesajes(JSON.parse(cachedPes));
      if (cachedPalp) setPalpaciones(JSON.parse(cachedPalp));
      if (cachedServ) setServicios(JSON.parse(cachedServ));
      if (cachedDest) setDestetes(JSON.parse(cachedDest));
      if (cachedLluv) setLluvias(JSON.parse(cachedLluv));
      const cachedTras = localStorage.getItem('cache_traslados');
      if (cachedTras) setTraslados(JSON.parse(cachedTras));
      const cachedGen = localStorage.getItem('cache_genealogia');
      if (cachedGen) setGenealogia(JSON.parse(cachedGen));
      const ts = localStorage.getItem('cache_timestamp');
      if (ts) setDataSource('cache');
      console.log('[Offline] Datos cargados desde caché local', ts ? `(${ts})` : '');
    } catch (e) {
      console.error('[Offline] Error cargando caché:', e);
    }
  };

  const handleLogin = (user, session) => { setUser(user); setSession(session); setShowLogin(false); loadCloudData(); };
  const handleLogout = async () => {
    try {
      const logoutPromise = db.signOut();
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
      await Promise.race([logoutPromise, timeout]);
    } catch (err) {
      console.warn('signOut error/timeout, limpiando manualmente:', err.message);
      Object.keys(localStorage).forEach(k => { if (k.startsWith('sb-')) localStorage.removeItem(k); });
    } finally {
      setUser(null); setSession(null);
    }
  };

  // ---- Cálculos de costos ----
  const años = useMemo(() => {
    const a1 = gastos.map(g => g.fecha?.split('-')[0]).filter(Boolean);
    const a2 = nacimientos.map(n => n.año?.toString()).filter(Boolean);
    const a3 = inventario.map(i => i.año?.toString()).filter(Boolean);
    return [...new Set([...a1, ...a2, ...a3])].sort().reverse();
  }, [gastos, nacimientos, inventario]);

  const filtered = useMemo(() => gastos.filter(g => {
    if (!g.fecha) return false;
    const [año, mes] = g.fecha.split('-');
    return (!filtros.año || año === filtros.año) &&
      (!filtros.mes || mes === filtros.mes) &&
      (!filtros.centro || g.centro === filtros.centro) &&
      (!filtros.categoria || g.categoria === filtros.categoria) &&
      (!filtros.busqueda || g.proveedor?.toLowerCase().includes(filtros.busqueda.toLowerCase()) || g.comentarios?.toLowerCase().includes(filtros.busqueda.toLowerCase()));
  }).sort((a, b) => new Date(b.fecha) - new Date(a.fecha)), [gastos, filtros]);

  // Categorías y centros excluidos de totales operativos
  const CATEGORIAS_EXCLUIDAS = ['Las Victorias', 'Yegua Mauricio Aldana', 'Apicultura', 'Montaje finca'];
  const CENTROS_EXCLUIDOS = ['Yegua MAG', 'Apicultura', 'Aparco'];

  const esOperativo = (g) => {
    const cat = (g.categoria || '').trim();
    const centro = (g.centro || '').trim();
    return !CATEGORIAS_EXCLUIDAS.some(exc => cat.toLowerCase() === exc.toLowerCase()) &&
           !CENTROS_EXCLUIDOS.some(exc => centro.toLowerCase() === exc.toLowerCase());
  };

  // Datos filtrados solo operativos (para totales de Dashboard y Fincas)
  const filteredOperativo = useMemo(() => filtered.filter(esOperativo), [filtered]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const totales = useMemo(() => ({
    total: filteredOperativo.reduce((s, g) => s + (g.monto || 0), 0),
    costos: filteredOperativo.filter(g => g.tipo === 'Costo').reduce((s, g) => s + (g.monto || 0), 0),
    gastos: filteredOperativo.filter(g => g.tipo === 'Gasto').reduce((s, g) => s + (g.monto || 0), 0),
    pendientes: gastos.filter(g => g.estado === 'pendiente').length,
    registros: filtered.length
  }), [filteredOperativo, filtered, gastos]);

  const promedioMes = useMemo(() => {
    const mesesUnicos = new Set(filteredOperativo.map(g => g.fecha?.substring(0, 7)).filter(Boolean));
    const numMeses = mesesUnicos.size || 1;
    return totales.total / numMeses;
  }, [filteredOperativo, totales.total]);

  const porCategoria = useMemo(() => {
    const cats = {};
    filteredOperativo.forEach(g => { cats[g.categoria] = (cats[g.categoria] || 0) + (g.monto || 0); });
    return Object.entries(cats).map(([c, t]) => ({ categoria: c, total: t })).sort((a, b) => b.total - a.total);
  }, [filteredOperativo]);

  const porCentro = useMemo(() => {
    const c = {};
    filteredOperativo.forEach(g => { c[g.centro] = (c[g.centro] || 0) + (g.monto || 0); });
    return CENTROS_COSTOS.map(centro => ({ centro, total: c[centro] || 0 })).filter(x => x.total > 0).sort((a, b) => b.total - a.total);
  }, [filteredOperativo]);

  const updateFiltros = (f) => { setFiltros(f); setPage(1); };

  // ---- CRUD Gastos ----
  const approve = async (id) => {
    if (isOnline && user) { try { await db.updateCosto(id, { estado: 'aprobado' }); } catch (err) { console.error(err); } }
    setGastos(gastos.map(g => g.id === id ? { ...g, estado: 'aprobado' } : g));
  };

  const del = async (id) => {
    if (confirm('¿Eliminar este registro?')) {
      if (isOnline && user) { try { await db.deleteCosto(id); } catch (err) { console.error(err); } }
      setGastos(gastos.filter(g => g.id !== id));
    }
  };

  const save = async (g) => {
    try {
      if (editGasto) {
        if (isOnline && user) await db.updateCosto(editGasto.id, g);
        setGastos(gastos.map(x => x.id === editGasto.id ? { ...g, id: editGasto.id } : x));
      } else {
        let newGasto = { ...g, id: Date.now(), estado: 'pendiente' };
        if (isOnline && user) { const data = await db.insertCosto(g); if (data) newGasto = data; }
        setGastos([newGasto, ...gastos]);
      }
      setShowForm(false);
      setEditGasto(null);
    } catch (err) {
      console.error(err);
      alert('Error al guardar: ' + err.message);
    }
  };

  // ---- Loading ----
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-200 flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={48} className="animate-spin text-green-500 mx-auto mb-4" />
          <p className="text-gray-400">Cargando sistema...</p>
        </div>
      </div>
    );
  }

  if (showLogin) return <Login onLogin={handleLogin} onSkip={() => setShowLogin(false)} />;

  const allMenuItems = [
    { id: 'dashboard', icon: Home, label: 'Dashboard', roles: ['admin'] },
    { id: 'lavega', icon: MapPin, label: 'Finca La Vega', accent: 'text-green-500', roles: ['admin'] },
    { id: 'bariloche', icon: MapPin, label: 'Finca Bariloche', accent: 'text-blue-500', roles: ['admin'] },
    { id: 'hato-general', icon: Beef, label: 'Hato General', roles: ['admin'] },
    { id: 'venta-traslado', icon: ArrowRightLeft, label: 'Venta / Traslado', accent: 'text-amber-500', roles: ['admin'] },
    { id: 'ventas', icon: ShoppingCart, label: 'Ventas Totales', accent: 'text-amber-500', roles: ['admin'] },
    { id: 'costos', icon: Receipt, label: 'Costos y Gastos', roles: ['admin'] },
    { id: 'contabilidad', icon: FileText, label: 'Contabilidad', accent: 'text-amber-400', roles: ['admin', 'contadora'] },
  ];
  const menuItems = allMenuItems.filter(item => item.roles.includes(userRole));

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200">
      {/* Header */}
      <header className="bg-gray-900 text-white shadow-lg border-b border-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setMenuOpen(!menuOpen)} className="lg:hidden p-2 hover:bg-white/10 rounded-lg"><Menu size={24} /></button>
            <div className="flex items-center gap-3">
              <img src="/logo_lavega.jpg" alt="Hierro La Vega" className="h-12 w-12 object-contain rounded-lg bg-white p-1 shadow-sm" />
              <div>
                <h1 className="text-xl font-bold">Ganadería La Vega</h1>
                <p className="text-xs text-gray-400 hidden sm:block">Sistema de Gestión</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${isOnline ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
              {syncing ? <RefreshCw size={14} className="animate-spin" /> : isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
              <span className="hidden sm:inline">{syncing ? 'Sincronizando...' : isOnline ? 'En línea' : 'Sin conexión'}</span>
            </div>
            {isOnline && !syncing && (
              <button onClick={loadCloudData} className="p-2 hover:bg-white/10 rounded-lg" title="Sincronizar datos"><RefreshCw size={18} /></button>
            )}
            {user && isOnline && (
              <div className="flex items-center gap-1">
                <button onClick={() => setShowCarga(true)} className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-sm transition-colors" title="Cargar archivo">
                  <Upload size={16} /><span className="hidden sm:inline">Cargar</span>
                </button>
              </div>
            )}
            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-sm bg-white/10 px-3 py-1 rounded-full hidden md:block truncate max-w-[150px]">{user.email}</span>
                <button onClick={handleLogout} className="p-2 hover:bg-white/10 rounded-lg" title="Cerrar sesión"><LogOut size={18} /></button>
              </div>
            ) : (
              <button onClick={() => setShowLogin(true)} className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-sm">Iniciar sesión</button>
            )}
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className={`${menuOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-40 w-64 bg-gray-900 shadow-lg border-r border-gray-800 transition-transform pt-16 lg:pt-0`}>
          <nav className="p-4 space-y-1">
            {menuItems.map(item => (
              <button key={item.id} onClick={() => { setView(item.id); setMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${view === item.id ? 'bg-green-900/50 text-green-400 font-medium' : 'text-gray-400 hover:bg-gray-800/50'}`}>
                <item.icon size={20} className={item.accent || ''} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-4 lg:p-6 max-w-7xl">
          {view === 'dashboard' && (
            <Dashboard totales={totales} promedioMes={promedioMes} porCategoria={porCategoria} porCentro={porCentro}
              pendientes={gastos.filter(g => g.estado === 'pendiente').slice(0, 5)} onApprove={approve}
              filtros={filtros} setFiltros={updateFiltros} años={años}
              nacimientos={nacimientos} inventario={inventario} gastos={gastos} ventas={ventas} />
          )}
          {view === 'lavega' && (
            <FincaView finca="La Vega" subtitulo="Finca de Cría" color="green"
              inventario={inventario} nacimientos={nacimientos} setNacimientos={setNacimientos} gastos={gastos} años={años}
              pesajes={pesajes} setPesajes={setPesajes} palpaciones={palpaciones} setPalpaciones={setPalpaciones} servicios={servicios} setServicios={setServicios} destetes={destetes}
              lluvias={lluvias} setLluvias={setLluvias} genealogia={genealogia} setGenealogia={setGenealogia} userEmail={user?.email} isOnline={isOnline} onAnimalClick={setAnimalModalId} />
          )}
          {view === 'bariloche' && (
            <FincaView finca="Bariloche" subtitulo="Finca de Levante" color="blue"
              inventario={inventario} nacimientos={nacimientos} gastos={gastos} años={años}
              pesajes={pesajes} setPesajes={setPesajes} palpaciones={palpaciones} servicios={servicios} destetes={destetes}
              lluvias={lluvias} setLluvias={setLluvias} userEmail={user?.email} isOnline={isOnline} onAnimalClick={setAnimalModalId} />
          )}
          {view === 'hato-general' && <HatoGeneral nacimientos={nacimientos} setNacimientos={setNacimientos} pesajes={pesajes} palpaciones={palpaciones} servicios={servicios} destetes={destetes} onAnimalClick={setAnimalModalId} isOnline={isOnline} />}
          {view === 'venta-traslado' && <VentaTrasladoView nacimientos={nacimientos} setNacimientos={setNacimientos} pesajes={pesajes} ventas={ventas} setVentas={setVentas} traslados={traslados} setTraslados={setTraslados} userEmail={user?.email} isOnline={isOnline} onAnimalClick={setAnimalModalId} />}
          {view === 'ventas' && <VentasTotales ventas={ventas} gastos={gastos} />}
          {view === 'costos' && (
            <Costos gastos={paginated} total={filtered.length} totales={totales}
              filtros={filtros} setFiltros={updateFiltros} onNew={() => setShowForm(true)}
              onEdit={g => { setEditGasto(g); setShowForm(true); }} onDel={del} onApprove={approve}
              page={page} pages={totalPages} setPage={setPage} años={años} canEdit={!!user} />
          )}
          {view === 'contabilidad' && (
            <Contabilidad gastos={gastos} onGastosChange={async () => {
              const g = await db.getCostos();
              setGastos(g);
            }} userRole={userRole} userEmail={user?.email} />
          )}
        </main>
      </div>

      {/* Modales */}
      {showForm && <Form gasto={editGasto} onSave={save} onClose={() => { setShowForm(false); setEditGasto(null); }} />}
      {showCarga && <CargaArchivos user={user} onClose={() => setShowCarga(false)} onSuccess={() => { setShowCarga(false); loadCloudData(); }} />}
      {menuOpen && <div className="fixed inset-0 bg-black/60 z-30 lg:hidden" onClick={() => setMenuOpen(false)} />}
      {animalModalId && (
        <AnimalModal animalId={animalModalId} onClose={() => setAnimalModalId(null)}
          nacimientos={nacimientos} pesajes={pesajes} palpaciones={palpaciones}
          servicios={servicios} ventas={ventas} destetes={destetes}
          onAnimalClick={(id) => setAnimalModalId(id)} />
      )}
    </div>
  );
}

// ==================== COMPONENTE DASHBOARD ====================
function Dashboard({ totales, promedioMes, porCategoria, porCentro, pendientes, onApprove, filtros, setFiltros, años, nacimientos, inventario, gastos, ventas }) {
  const maxCat = Math.max(...porCategoria.map(c => c.total), 1);
  const maxCen = Math.max(...porCentro.map(c => c.total), 1);
  const añoFiltro = filtros.año ? parseInt(filtros.año) : null;

  // Ventas del año filtrado — computado dinámicamente desde datos
  const ventasAñoLabel = useMemo(() => {
    if (añoFiltro) return añoFiltro;
    return 'Totales';
  }, [añoFiltro]);

  const ventasAño = useMemo(() => {
    if (añoFiltro) return (ventas || []).filter(v => v.año === añoFiltro).reduce((s, v) => s + (v.valor || 0), 0);
    return (ventas || []).reduce((s, v) => s + (v.valor || 0), 0);
  }, [ventas, añoFiltro]);

  // Inventario último por finca
  const invLaVega = useMemo(() =>
    inventario.filter(i => i.finca === 'La Vega' && (!añoFiltro || i.año === añoFiltro)).sort((a, b) => (b.año * 12 + b.mes) - (a.año * 12 + a.mes))[0],
    [inventario, añoFiltro]);
  const invBariloche = useMemo(() =>
    inventario.filter(i => i.finca === 'Bariloche' && (!añoFiltro || i.año === añoFiltro)).sort((a, b) => (b.año * 12 + b.mes) - (a.año * 12 + a.mes))[0],
    [inventario, añoFiltro]);

  // Nacimientos por mes
  const nacimientosPorMes = useMemo(() => {
    const meses = {};
    for (let i = 1; i <= 12; i++) meses[i] = 0;
    nacimientos?.forEach(n => {
      if (n.estado === 'Activo' && n.año && n.mes) {
        if (!añoFiltro || n.año === añoFiltro) meses[n.mes] = (meses[n.mes] || 0) + 1;
      }
    });
    return Object.entries(meses).map(([mes, count]) => ({ mes: parseInt(mes), count, label: MESES[parseInt(mes)] }));
  }, [nacimientos, añoFiltro]);

  const maxNac = Math.max(...nacimientosPorMes.map(m => m.count), 1);

  // Stats nacimientos
  const statsNac = useMemo(() => {
    const f = nacimientos?.filter(n => (!añoFiltro || n.año === añoFiltro) && n.estado === 'Activo') || [];
    return { total: f.length, machos: f.filter(n => n.sexo === 'M').length, hembras: f.filter(n => n.sexo === 'H').length };
  }, [nacimientos, añoFiltro]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-100">Dashboard</h2>
        <select value={filtros.año} onChange={e => setFiltros({ ...filtros, año: e.target.value })} className="px-4 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl">
          <option value="">Todos</option>
          {años.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Cards financieros */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card title="Total Egresos" value={formatCurrency(totales.total)} icon={DollarSign} color="from-green-500 to-green-600" />
        <Card title="Egresos Promedio/Mes" value={formatCurrency(promedioMes)} icon={TrendingUp} color="from-blue-500 to-blue-600" />
        <Card title={`Ventas ${ventasAñoLabel}`} value={formatCurrency(ventasAño)} icon={ShoppingCart} color="from-amber-500 to-amber-600" sub="ingresos ganado" />
      </div>

      {/* Inventario por finca */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-900 p-5 rounded-2xl shadow-sm border-l-4 border-green-500">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-900/40 rounded-lg"><Beef size={20} className="text-green-500" /></div>
            <div>
              <h3 className="font-semibold text-gray-100">La Vega <span className="text-xs font-normal text-gray-400">(Cría)</span></h3>
              <p className="text-xs text-gray-400">{MESES[invLaVega?.mes]} {invLaVega?.año}</p>
            </div>
          </div>
          <p className="text-3xl font-bold text-green-500">{invLaVega?.total || 0} <span className="text-sm font-normal text-gray-400">cabezas</span></p>
          <div className="flex gap-3 mt-2 text-xs text-gray-400">
            <span>VP:{invLaVega?.vp || 0}</span><span>VH:{invLaVega?.vh || 0}</span><span>NAS:{invLaVega?.nas || 0}</span><span>Crías:{(invLaVega?.cm || 0) + (invLaVega?.ch || 0)}</span>
          </div>
        </div>
        <div className="bg-gray-900 p-5 rounded-2xl shadow-sm border-l-4 border-blue-500">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-900/40 rounded-lg"><Beef size={20} className="text-blue-500" /></div>
            <div>
              <h3 className="font-semibold text-gray-100">Bariloche <span className="text-xs font-normal text-gray-400">(Levante)</span></h3>
              <p className="text-xs text-gray-400">{MESES[invBariloche?.mes]} {invBariloche?.año}</p>
            </div>
          </div>
          <p className="text-3xl font-bold text-blue-500">{invBariloche?.total || 0} <span className="text-sm font-normal text-gray-400">cabezas</span></p>
          <div className="flex gap-3 mt-2 text-xs text-gray-400">
            <span>NAS:{invBariloche?.nas || 0}</span><span>HL:{invBariloche?.hl || 0}</span><span>ML:{invBariloche?.ml || 0}</span><span>VP:{invBariloche?.vp || 0}</span>
          </div>
        </div>
      </div>

      {/* Nacimientos + Egresos por categoría */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 rounded-2xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold flex items-center gap-2"><Baby size={20} className="text-green-500" />Nacimientos por Mes</h3>
            <span className="text-sm text-gray-400">Total: {statsNac.total} (♂{statsNac.machos} / ♀{statsNac.hembras})</span>
          </div>
          <div className="h-48">
            <div className="flex items-end justify-between h-full gap-1 px-2">
              {nacimientosPorMes.map(({ mes, count, label }) => (
                <div key={mes} className="flex-1 flex flex-col items-center h-full justify-end">
                  {count > 0 && <span className="text-xs font-semibold text-green-400 mb-1">{count}</span>}
                  <div className={`w-full rounded-t transition-all duration-300 ${count > 0 ? 'bg-gradient-to-t from-green-600 to-green-400' : 'bg-gray-800'}`}
                    style={{ height: count > 0 ? `${Math.max((count / maxNac) * 100, 8)}%` : '4px' }} />
                  <span className="text-xs text-gray-400 mt-2 font-medium">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="bg-gray-900 rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><BarChart3 size={20} className="text-green-500" />Egresos por Categoría</h3>
          <div className="space-y-3">
            {porCategoria.slice(0, 8).map(({ categoria, total }) => (
              <div key={categoria}>
                <div className="flex justify-between text-sm mb-1"><span className="truncate">{categoria}</span><span className="font-medium">{formatCurrency(total)}</span></div>
                <div className="h-2 bg-gray-800 rounded-full"><div className="h-full bg-green-500 rounded-full" style={{ width: `${(total / maxCat) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Egresos por Centro */}
      <div className="bg-gray-900 rounded-2xl p-6 shadow-sm">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><PieChart size={20} className="text-green-500" />Egresos por Centro de Costos</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {porCentro.map(({ centro, total }) => (
            <div key={centro}>
              <div className="flex justify-between text-sm mb-1">
                <span className={`px-2 py-0.5 rounded-full text-xs ${centroColor(centro)}`}>{centro}</span>
                <span className="font-medium">{formatCurrency(total)}</span>
              </div>
              <div className="h-3 bg-gray-800 rounded-full"><div className={`h-full rounded-full ${centroBarColor(centro)}`} style={{ width: `${(total / maxCen) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      </div>

      {/* Pendientes */}
      {pendientes.length > 0 && (
        <div className="bg-gray-900 rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold mb-4">Pendientes <span className="bg-orange-900/40 text-orange-500 text-xs px-2 py-1 rounded-full ml-2">{pendientes.length}</span></h3>
          <div className="space-y-2">
            {pendientes.map(g => (
              <div key={g.id} className="flex items-center justify-between p-3 bg-orange-900/20 rounded-xl">
                <div>
                  <span className="font-medium">{g.proveedor}</span>
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${centroColor(g.centro)}`}>{g.centro}</span>
                  <p className="text-sm text-gray-400">{formatDate(g.fecha)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-green-400">{formatCurrency(g.monto)}</span>
                  <button onClick={() => onApprove(g.id)} className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600"><Check size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== COMPONENTE VENTAS TOTALES ====================
function VentasTotales({ ventas: ventasData, gastos: gastosData }) {
  const [añoSel, setAñoSel] = useState('');
  const allVentas = ventasData || VENTAS_GANADO;
  const allGastos = gastosData || [];
  const añosDisponibles = useMemo(() => 
    [...new Set(allVentas.map(v => v.año))].sort((a, b) => b - a).map(String), 
    [allVentas]);

  const COLORES_TIPO = {
    ML: { bg: 'bg-blue-900/40', text: 'text-blue-400', bar: 'bg-blue-500' },
    HL: { bg: 'bg-pink-900/40', text: 'text-pink-400', bar: 'bg-pink-500' },
    VD: { bg: 'bg-amber-900/40', text: 'text-amber-400', bar: 'bg-amber-500' },
    T: { bg: 'bg-red-900/40', text: 'text-red-400', bar: 'bg-red-500' },
    CM: { bg: 'bg-cyan-900/40', text: 'text-cyan-400', bar: 'bg-cyan-500' },
    CH: { bg: 'bg-purple-900/40', text: 'text-purple-400', bar: 'bg-purple-500' },
  };

  // Ventas filtradas
  const ventasFiltradas = useMemo(() => {
    if (!añoSel) return allVentas;
    return allVentas.filter(v => v.año === parseInt(añoSel));
  }, [añoSel, allVentas]);

  // Costos filtrados por el mismo periodo
  const costosFiltrados = useMemo(() => {
    if (!añoSel) return allGastos;
    return allGastos.filter(g => {
      const gAño = g.año || (g.fecha ? parseInt(g.fecha.split('-')[0]) : null);
      return gAño === parseInt(añoSel);
    });
  }, [añoSel, allGastos]);

  const totalCostos = useMemo(() => costosFiltrados.reduce((s, g) => s + (g.monto || 0), 0), [costosFiltrados]);

  // Totales globales
  const totalGlobal = useMemo(() => {
    const total = ventasFiltradas.reduce((s, v) => s + (v.valor || 0), 0);
    const kg = ventasFiltradas.reduce((s, v) => s + (v.kg || 0), 0);
    const costoKg = kg > 0 ? Math.round(totalCostos / kg) : 0;
    return { total, kg, precioPromedio: kg > 0 ? Math.round(total / kg) : 0, costoKg, transacciones: ventasFiltradas.length };
  }, [ventasFiltradas, totalCostos]);

  // Por tipo de animal
  const porTipo = useMemo(() => {
    const tipos = {};
    ventasFiltradas.forEach(v => {
      if (!tipos[v.tipo]) tipos[v.tipo] = { kg: 0, valor: 0, count: 0 };
      tipos[v.tipo].kg += v.kg || 0;
      tipos[v.tipo].valor += v.valor || 0;
      tipos[v.tipo].count += 1;
    });
    return Object.entries(tipos).map(([tipo, d]) => ({
      tipo, label: TIPO_ANIMAL_LABELS[tipo] || tipo,
      kg: d.kg, valor: d.valor, count: d.count,
      precioPromedio: d.kg > 0 ? Math.round(d.valor / d.kg) : 0
    })).sort((a, b) => b.valor - a.valor);
  }, [ventasFiltradas]);

  const maxKg = Math.max(...porTipo.map(t => t.kg), 1);

  // Por año (computado dinámicamente desde los datos)
  const porAño = useMemo(() => {
    return añosDisponibles.map(añoStr => {
      const año = parseInt(añoStr);
      const ventasAño = allVentas.filter(v => v.año === año);
      const totalKg = ventasAño.reduce((s, v) => s + (v.kg || 0), 0);
      const ingresosTotales = ventasAño.reduce((s, v) => s + (v.valor || 0), 0);
      const precioPromedio = totalKg > 0 ? Math.round(ingresosTotales / totalKg) : 0;
      // Costos del año
      const costosAño = allGastos.filter(g => {
        const gAño = g.año || (g.fecha ? parseInt(g.fecha.split('-')[0]) : null);
        return gAño === año;
      }).reduce((s, g) => s + (g.monto || 0), 0);
      const costoKg = totalKg > 0 ? Math.round(costosAño / totalKg) : 0;
      // Tipos por año
      const tipos = {};
      ventasAño.forEach(v => {
        if (!tipos[v.tipo]) tipos[v.tipo] = { kg: 0, precio: 0, valor: 0 };
        tipos[v.tipo].kg += v.kg || 0;
        tipos[v.tipo].valor += v.valor || 0;
      });
      Object.values(tipos).forEach(t => { t.precio = t.kg > 0 ? Math.round(t.valor / t.kg) : 0; });
      return { año, totalKg, precioPromedio, ingresosTotales, costosAño, costoKg, tipos };
    });
  }, [allVentas, allGastos, añosDisponibles]);

  // Transacciones del periodo
  const transacciones = useMemo(() => {
    return [...ventasFiltradas].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }, [ventasFiltradas]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <h2 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
          <ShoppingCart size={28} className="text-amber-500" /> Ventas Totales
        </h2>
        <select value={añoSel} onChange={e => setAñoSel(e.target.value)} className="px-4 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl">
          <option value="">Todos los años</option>
          {añosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Cards resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card title="Ingresos Totales" value={formatCurrency(totalGlobal.total)} icon={DollarSign} color="from-amber-500 to-amber-600" />
        <Card title="Total Kg" value={totalGlobal.kg.toLocaleString('es-CO')} icon={Scale} color="from-blue-500 to-blue-600" sub="kg vendidos" />
        <Card title="Precio Prom/kg" value={formatCurrency(totalGlobal.precioPromedio)} icon={TrendingUp} color="from-green-500 to-green-600" sub="$/kg venta" />
        <Card title="Costo Prom/kg" value={totalGlobal.costoKg > 0 ? formatCurrency(totalGlobal.costoKg) : '—'} icon={Receipt} color="from-red-500 to-red-600" sub="$/kg costo" />
        <Card title="Utilidad/kg" value={totalGlobal.costoKg > 0 && totalGlobal.precioPromedio > 0 ? formatCurrency(totalGlobal.precioPromedio - totalGlobal.costoKg) : '—'} icon={TrendingUp} color="from-emerald-500 to-emerald-600" sub={totalGlobal.costoKg > 0 && totalGlobal.precioPromedio > 0 ? `${Math.round(((totalGlobal.precioPromedio - totalGlobal.costoKg) / totalGlobal.costoKg) * 100)}% margen` : ''} />
      </div>

      {/* Desglose por tipo de animal */}
      <div className="bg-gray-900 rounded-2xl p-6 shadow-sm">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><Beef size={20} className="text-amber-500" />Ventas por Tipo de Animal</h3>
        <div className="space-y-4">
          {porTipo.map(({ tipo, label, kg, valor, precioPromedio }) => (
            <div key={tipo}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${COLORES_TIPO[tipo]?.bg || 'bg-gray-800'} ${COLORES_TIPO[tipo]?.text || 'text-gray-300'}`}>{tipo}</span>
                  <span className="text-sm font-medium text-gray-300">{label}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-400">{kg.toLocaleString('es-CO')} kg</span>
                  <span className="text-gray-400">{formatCurrency(precioPromedio)}/kg</span>
                  <span className="font-semibold text-gray-100">{formatCurrency(valor)}</span>
                </div>
              </div>
              <div className="h-3 bg-gray-800 rounded-full">
                <div className={`h-full rounded-full transition-all duration-300 ${COLORES_TIPO[tipo]?.bar || 'bg-gray-500'}`} style={{ width: `${(kg / maxKg) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabla comparativa por año */}
      <div className="bg-gray-900 rounded-2xl p-6 shadow-sm">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><BarChart3 size={20} className="text-amber-500" />Comparativo Anual</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-3 px-2 font-semibold text-gray-400">Año</th>
                <th className="text-right py-3 px-2 font-semibold text-gray-400">Kg Totales</th>
                <th className="text-right py-3 px-2 font-semibold text-gray-400">Precio/kg</th>
                <th className="text-right py-3 px-2 font-semibold text-gray-400">Costo/kg</th>
                <th className="text-right py-3 px-2 font-semibold text-gray-400">Utilidad/kg</th>
                <th className="text-right py-3 px-2 font-semibold text-gray-400">Ingresos</th>
                <th className="text-right py-3 px-2 font-semibold text-gray-400">Costos</th>
              </tr>
            </thead>
            <tbody>
              {porAño.map(({ año, totalKg, precioPromedio, ingresosTotales, costosAño, costoKg }) => (
                <tr key={año} className={`border-b border-gray-800 hover:bg-amber-900/20 ${añoSel && parseInt(añoSel) === año ? 'bg-amber-900/20 font-semibold' : ''}`}>
                  <td className="py-3 px-2 font-medium">{año}</td>
                  <td className="py-3 px-2 text-right">{totalKg.toLocaleString('es-CO')}</td>
                  <td className="py-3 px-2 text-right text-green-400">{formatCurrency(precioPromedio)}</td>
                  <td className="py-3 px-2 text-right text-red-400">{costoKg > 0 ? formatCurrency(costoKg) : '—'}</td>
                  <td className="py-3 px-2 text-right font-medium">{costoKg > 0 ? <span className={precioPromedio - costoKg >= 0 ? 'text-emerald-400' : 'text-red-400'}>{formatCurrency(precioPromedio - costoKg)}</span> : '—'}</td>
                  <td className="py-3 px-2 text-right font-medium text-amber-400">{formatCurrency(ingresosTotales)}</td>
                  <td className="py-3 px-2 text-right text-red-400/70">{costosAño > 0 ? formatCurrency(costosAño) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-bold">
                <td className="py-3 px-2">Total</td>
                <td className="py-3 px-2 text-right">{porAño.reduce((s, r) => s + r.totalKg, 0).toLocaleString('es-CO')}</td>
                <td className="py-3 px-2 text-right text-green-400">{formatCurrency(Math.round(porAño.reduce((s, r) => s + r.ingresosTotales, 0) / Math.max(porAño.reduce((s, r) => s + r.totalKg, 0), 1)))}</td>
                <td className="py-3 px-2 text-right text-red-400">{(() => { const tKg = porAño.reduce((s, r) => s + r.totalKg, 0); const tC = porAño.reduce((s, r) => s + r.costosAño, 0); return tKg > 0 ? formatCurrency(Math.round(tC / tKg)) : '—'; })()}</td>
                <td className="py-3 px-2 text-right">{(() => { const tKg = porAño.reduce((s, r) => s + r.totalKg, 0); const tI = porAño.reduce((s, r) => s + r.ingresosTotales, 0); const tC = porAño.reduce((s, r) => s + r.costosAño, 0); if (tKg <= 0) return '—'; const u = Math.round(tI / tKg) - Math.round(tC / tKg); return <span className={u >= 0 ? 'text-emerald-400' : 'text-red-400'}>{formatCurrency(u)}</span>; })()}</td>
                <td className="py-3 px-2 text-right text-amber-400">{formatCurrency(porAño.reduce((s, r) => s + r.ingresosTotales, 0))}</td>
                <td className="py-3 px-2 text-right text-red-400/70">{formatCurrency(porAño.reduce((s, r) => s + r.costosAño, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Detalle por tipo por año */}
      <div className="bg-gray-900 rounded-2xl p-6 shadow-sm">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><PieChart size={20} className="text-amber-500" />Detalle por Tipo de Animal y Año</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-3 px-2 font-semibold text-gray-400">Año</th>
                <th className="text-left py-3 px-2 font-semibold text-gray-400">Tipo</th>
                <th className="text-right py-3 px-2 font-semibold text-gray-400">Kg</th>
                <th className="text-right py-3 px-2 font-semibold text-gray-400">Precio/kg</th>
                <th className="text-right py-3 px-2 font-semibold text-gray-400">Valor</th>
              </tr>
            </thead>
            <tbody>
              {porAño.map(({ año, tipos }) => {
                const tipoKeys = Object.keys(tipos).sort();
                return tipoKeys.map((tipo, idx) => {
                  const t = tipos[tipo];
                  return (
                    <tr key={`${año}-${tipo}`} className={`border-b hover:bg-gray-800/50 ${idx === 0 ? 'border-t-2 border-t-gray-700' : ''}`}>
                      {idx === 0 && <td className="py-2 px-2 font-bold text-gray-100" rowSpan={tipoKeys.length}>{año}</td>}
                      <td className="py-2 px-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${COLORES_TIPO[tipo]?.bg || 'bg-gray-800'} ${COLORES_TIPO[tipo]?.text || 'text-gray-300'}`}>{tipo}</span>
                        <span className="ml-2 text-gray-400">{TIPO_ANIMAL_LABELS[tipo] || tipo}</span>
                      </td>
                      <td className="py-2 px-2 text-right">{t.kg.toLocaleString('es-CO')}</td>
                      <td className="py-2 px-2 text-right">{formatCurrency(Math.round(t.precio))}</td>
                      <td className="py-2 px-2 text-right font-medium">{formatCurrency(t.valor)}</td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Historial de transacciones */}
      <div className="bg-gray-900 rounded-2xl p-6 shadow-sm">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><FileText size={20} className="text-amber-500" />Historial de Ventas ({transacciones.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-3 px-2 font-semibold text-gray-400">Fecha</th>
                <th className="text-left py-3 px-2 font-semibold text-gray-400">Factura</th>
                <th className="text-left py-3 px-2 font-semibold text-gray-400">Cliente</th>
                <th className="text-left py-3 px-2 font-semibold text-gray-400">Tipo</th>
                <th className="text-right py-3 px-2 font-semibold text-gray-400">Kg</th>
                <th className="text-right py-3 px-2 font-semibold text-gray-400">$/kg</th>
                <th className="text-right py-3 px-2 font-semibold text-gray-400">Valor</th>
              </tr>
            </thead>
            <tbody>
              {transacciones.map((v, i) => (
                <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/50">
                  <td className="py-2 px-2 whitespace-nowrap">{v.fecha}</td>
                  <td className="py-2 px-2 text-gray-400">{v.factura || '—'}</td>
                  <td className="py-2 px-2 truncate max-w-[150px]">{v.cliente}</td>
                  <td className="py-2 px-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${COLORES_TIPO[v.tipo]?.bg || 'bg-gray-800'} ${COLORES_TIPO[v.tipo]?.text || 'text-gray-300'}`}>{v.tipo}</span>
                  </td>
                  <td className="py-2 px-2 text-right">{v.kg.toLocaleString('es-CO')}</td>
                  <td className="py-2 px-2 text-right">{formatCurrency(v.precio)}</td>
                  <td className="py-2 px-2 text-right font-medium text-amber-400">{formatCurrency(v.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==================== COMPONENTE VENTA / TRASLADO ====================
function VentaTrasladoView({ nacimientos, setNacimientos, pesajes, ventas, setVentas, traslados, setTraslados, userEmail, isOnline, onAnimalClick }) {
  const [modo, setModo] = useState('venta'); // 'venta' | 'traslado' | 'muerte'
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [showAnimalList, setShowAnimalList] = useState(false);
  const [selectedAnimals, setSelectedAnimals] = useState([]); // [{id, finca, categoria, peso, sexo}]

  // Venta fields
  const [ventaForm, setVentaForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    precio: '',
    comprador: '',
    tipo: '',
    observaciones: ''
  });

  // Traslado fields
  const [trasladoForm, setTrasladoForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    fincaDestino: '',
    observaciones: ''
  });

  // Muerte fields
  const [muerteForm, setMuerteForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    causa: '',
    observaciones: ''
  });


  // Per-animal weight overrides for batch sales
  const [pesosPorAnimal, setPesosPorAnimal] = useState({}); // {animalId: peso}

  // Build animal list (only active)
  const animalesActivos = useMemo(() => {
    const mapa = {};
    (nacimientos || []).forEach(n => {
      if (!n.cria || n.estado !== 'Activo') return;
      const id = String(n.cria).trim();
      if (!esAnimalValido(id)) return;
      const finca = n.fincaDB || 'La Vega';
      mapa[id] = { id, finca, sexo: n.sexo, fechaNac: n.fecha, madre: n.madre, padre: n.padre };
    });
    // Add Bariloche animals from pesajes
    (pesajes || []).filter(p => p.finca === 'Bariloche' && p.animal && esAnimalValido(p.animal)).forEach(p => {
      const id = String(p.animal).trim();
      const nacReg = (nacimientos || []).find(n => String(n.cria).trim() === id);
      if (nacReg && nacReg.estado !== 'Activo') return;
      if (!mapa[id]) mapa[id] = { id, finca: 'Bariloche', sexo: nacReg?.sexo };
      const a = mapa[id];
      if (!a.ultimoPeso || (p.fecha_pesaje || '') > (a.ultimoPesoFecha || '')) {
        a.ultimoPeso = p.peso;
        a.ultimoPesoFecha = p.fecha_pesaje;
        a.categoriaBar = p.categoria;
      }
    });
    // Add La Vega pesajes for peso data
    (pesajes || []).filter(p => p.finca === 'La Vega' && p.animal && esAnimalValido(p.animal)).forEach(p => {
      const id = String(p.animal).trim();
      if (!mapa[id]) return;
      const a = mapa[id];
      if (!a.ultimoPeso || (p.fecha_pesaje || '') > (a.ultimoPesoFecha || '')) {
        a.ultimoPeso = p.peso;
        a.ultimoPesoFecha = p.fecha_pesaje;
      }
    });
    // Calculate category
    Object.values(mapa).forEach(a => {
      const nacReg = (nacimientos || []).find(n => String(n.cria).trim() === a.id);
      const catDB = nacReg?.categoriaActual || nacReg?.categoria_actual;
      if (a.categoriaBar) {
        a.categoria = a.categoriaBar;
      } else if (catDB) {
        a.categoria = catDB;
      } else if (a.sexo === 'M') {
        a.categoria = 'CM';
      } else if (a.sexo === 'H') {
        a.categoria = 'CH';
      } else {
        a.categoria = '?';
      }
    });
    return Object.values(mapa).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }, [nacimientos, pesajes]);

  // Filtered animal list for search
  const animalesFiltrados = useMemo(() => {
    if (!busqueda) return animalesActivos.slice(0, 30);
    const q = busqueda.toLowerCase();
    return animalesActivos.filter(a => a.id.toLowerCase().includes(q) || (a.categoria || '').toLowerCase().includes(q) || (a.finca || '').toLowerCase().includes(q)).slice(0, 30);
  }, [animalesActivos, busqueda]);

  const addAnimal = (animal) => {
    if (selectedAnimals.find(a => a.id === animal.id)) return;
    setSelectedAnimals(prev => [...prev, animal]);
    // Pre-fill weight if available
    if (animal.ultimoPeso) {
      setPesosPorAnimal(prev => ({ ...prev, [animal.id]: Math.round(animal.ultimoPeso) }));
    }
    setBusqueda('');
    setShowAnimalList(false);
  };

  const removeAnimal = (id) => {
    setSelectedAnimals(prev => prev.filter(a => a.id !== id));
    setPesosPorAnimal(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const totalKg = useMemo(() => {
    return selectedAnimals.reduce((s, a) => s + (parseFloat(pesosPorAnimal[a.id]) || 0), 0);
  }, [selectedAnimals, pesosPorAnimal]);

  const precioKg = parseFloat(ventaForm.precio) || 0;
  const valorTotal = totalKg * precioKg;

  // Auto-detect tipo from selected animals
  const tipoAutoDetect = useMemo(() => {
    if (selectedAnimals.length === 0) return '';
    const cats = [...new Set(selectedAnimals.map(a => a.categoria))];
    if (cats.length === 1) return cats[0];
    return 'MIXTO';
  }, [selectedAnimals]);

  // Auto-detect finca from selected animals (for traslado)
  const fincaOrigen = useMemo(() => {
    if (selectedAnimals.length === 0) return '';
    const fincas = [...new Set(selectedAnimals.map(a => a.finca))];
    if (fincas.length === 1) return fincas[0];
    return 'Mixta';
  }, [selectedAnimals]);

  const handleSaveVenta = async () => {
    if (selectedAnimals.length === 0) return alert('Selecciona al menos un animal');
    if (!ventaForm.fecha) return alert('Selecciona la fecha de venta');
    if (totalKg <= 0) return alert('Ingresa el peso de cada animal');
    if (precioKg <= 0) return alert('Ingresa el precio por kg');

    setSaving(true);
    try {
      const tipo = ventaForm.tipo || tipoAutoDetect;
      // Insert venta record for each animal
      for (const animal of selectedAnimals) {
        const pesoAnimal = parseFloat(pesosPorAnimal[animal.id]) || 0;
        const valorAnimal = pesoAnimal * precioKg;
        const ventaRecord = {
          fecha: ventaForm.fecha,
          año: parseInt(ventaForm.fecha.split('-')[0]),
          mes: parseInt(ventaForm.fecha.split('-')[1]),
          animal: animal.id,
          tipo: tipo,
          kg: pesoAnimal,
          precio: precioKg,
          valor: valorAnimal,
          cliente: ventaForm.comprador || null,
          finca: animal.finca,
          observaciones: ventaForm.observaciones || null,
          registrado_por: userEmail || null
        };
        await db.insertVentaAnimal(ventaRecord);

        // Update animal estado to "Vendido" in nacimientos
        const nacReg = (nacimientos || []).find(n => String(n.cria).trim() === animal.id);
        if (nacReg) {
          await db.updateNacimiento(nacReg.id, { estado: 'Vendido', comentario: `Vendido ${ventaForm.fecha} - ${ventaForm.comprador || 'N/A'} - ${pesoAnimal}kg @ ${formatCurrency(precioKg)}/kg` });
          // Update local state
          setNacimientos(prev => prev.map(n => n.id === nacReg.id ? { ...n, estado: 'Vendido' } : n));
        }
      }

      // Add to local ventas state
      const newVentas = selectedAnimals.map(a => ({
        fecha: ventaForm.fecha,
        año: parseInt(ventaForm.fecha.split('-')[0]),
        mes: parseInt(ventaForm.fecha.split('-')[1]),
        animal: a.id,
        tipo: tipo,
        kg: parseFloat(pesosPorAnimal[a.id]) || 0,
        precio: precioKg,
        valor: (parseFloat(pesosPorAnimal[a.id]) || 0) * precioKg,
        cliente: ventaForm.comprador,
        finca: a.finca
      }));
      setVentas(prev => [...newVentas, ...prev]);

      setSuccessMsg(`✅ ${selectedAnimals.length} animal(es) vendido(s) exitosamente — ${totalKg} kg × ${formatCurrency(precioKg)}/kg = ${formatCurrency(valorTotal)}`);
      setSelectedAnimals([]);
      setPesosPorAnimal({});
      setVentaForm({ fecha: new Date().toISOString().split('T')[0], precio: '', comprador: '', tipo: '', observaciones: '' });
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (e) {
      console.error('Error registrando venta:', e);
      alert('Error al registrar la venta: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTraslado = async () => {
    if (selectedAnimals.length === 0) return alert('Selecciona al menos un animal');
    if (!trasladoForm.fecha) return alert('Selecciona la fecha del traslado');
    if (!trasladoForm.fincaDestino) return alert('Selecciona la finca destino');
    // Validate: no animal should already be in the destination
    const yaSonDestino = selectedAnimals.filter(a => a.finca === trasladoForm.fincaDestino);
    if (yaSonDestino.length > 0) {
      const ids = yaSonDestino.map(a => a.id).join(', ');
      return alert(`Los siguientes animales ya están en ${trasladoForm.fincaDestino}: ${ids}`);
    }

    setSaving(true);
    try {
      for (const animal of selectedAnimals) {
        // Insert traslado record
        await db.insertTraslado({
          animal: animal.id,
          fecha: trasladoForm.fecha,
          finca_origen: animal.finca,
          finca_destino: trasladoForm.fincaDestino,
          observaciones: trasladoForm.observaciones || null,
          registrado_por: userEmail || null
        });

        // Update finca in nacimientos
        const nacReg = (nacimientos || []).find(n => String(n.cria).trim() === animal.id);
        if (nacReg) {
          await db.updateNacimiento(nacReg.id, { finca: trasladoForm.fincaDestino });
          setNacimientos(prev => prev.map(n => n.id === nacReg.id ? { ...n, fincaDB: trasladoForm.fincaDestino } : n));
        }
      }

      // Add to local traslados state
      const newTraslados = selectedAnimals.map(a => ({
        animal: a.id,
        fecha: trasladoForm.fecha,
        finca_origen: a.finca,
        finca_destino: trasladoForm.fincaDestino,
        observaciones: trasladoForm.observaciones,
        registrado_por: userEmail
      }));
      setTraslados(prev => [...newTraslados, ...prev]);

      setSuccessMsg(`✅ ${selectedAnimals.length} animal(es) trasladado(s) de ${fincaOrigen} → ${trasladoForm.fincaDestino}`);
      setSelectedAnimals([]);
      setPesosPorAnimal({});
      setTrasladoForm({ fecha: new Date().toISOString().split('T')[0], fincaDestino: '', observaciones: '' });
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (e) {
      console.error('Error registrando traslado:', e);
      alert('Error al registrar el traslado: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMuerte = async () => {
    if (selectedAnimals.length === 0) return alert('Selecciona al menos un animal');
    if (!muerteForm.fecha) return alert('Selecciona la fecha');
    if (!muerteForm.causa) return alert('Selecciona la causa de muerte');

    setSaving(true);
    try {
      for (const animal of selectedAnimals) {
        const nacReg = (nacimientos || []).find(n => String(n.cria).trim() === animal.id);
        if (nacReg) {
          await db.updateNacimiento(nacReg.id, {
            estado: 'Muerto',
            comentario: `Muerte ${muerteForm.fecha} - Causa: ${muerteForm.causa}${muerteForm.observaciones ? ' - ' + muerteForm.observaciones : ''}`
          });
          setNacimientos(prev => prev.map(n => n.id === nacReg.id ? { ...n, estado: 'Muerto', comentario: `Muerte ${muerteForm.fecha} - Causa: ${muerteForm.causa}` } : n));
        }
      }
      setSuccessMsg(`✅ ${selectedAnimals.length} animal(es) registrado(s) como muerto(s) — Causa: ${muerteForm.causa}`);
      setSelectedAnimals([]);
      setPesosPorAnimal({});
      setMuerteForm({ fecha: new Date().toISOString().split('T')[0], causa: '', observaciones: '' });
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (e) {
      console.error('Error registrando muerte:', e);
      alert('Error al registrar la muerte: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const CAT_COLORS = { VP: 'bg-green-500/20 text-green-400', VS: 'bg-orange-500/20 text-orange-400', NV: 'bg-purple-500/20 text-purple-400', HL: 'bg-teal-500/20 text-teal-400', ML: 'bg-amber-500/20 text-amber-400', CM: 'bg-blue-500/20 text-blue-400', CH: 'bg-pink-500/20 text-pink-400', TR: 'bg-red-500/20 text-red-400', LEV: 'bg-amber-500/20 text-amber-400' };

  // Recent history
  const historialReciente = useMemo(() => {
    if (modo === 'venta') {
      return (ventas || []).filter(v => v.animal).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).slice(0, 20);
    }
    if (modo === 'traslado') {
      return (traslados || []).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).slice(0, 20);
    }
    // muerte: show dead animals from nacimientos
    return (nacimientos || []).filter(n => n.estado === 'Muerto').sort((a, b) => (b.comentario || '').localeCompare(a.comentario || '')).slice(0, 20);
  }, [modo, ventas, traslados, nacimientos]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
            <ArrowRightLeft size={28} className="text-amber-500" /> Venta / Traslado
          </h2>
          <p className="text-gray-400 text-sm">Registrar venta o traslado de animales</p>
        </div>
      </div>

      {/* Success message */}
      {successMsg && (
        <div className="bg-green-900/30 border border-green-700 rounded-xl p-4 text-green-400 text-sm font-medium">
          {successMsg}
        </div>
      )}

      {/* Mode Toggle */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => { setModo('venta'); setSelectedAnimals([]); setPesosPorAnimal({}); }}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-sm transition-all ${modo === 'venta' ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
          <ShoppingCart size={18} /> Venta
        </button>
        <button onClick={() => { setModo('traslado'); setSelectedAnimals([]); setPesosPorAnimal({}); }}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-sm transition-all ${modo === 'traslado' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
          <Truck size={18} /> Traslado
        </button>
        <button onClick={() => { setModo('muerte'); setSelectedAnimals([]); setPesosPorAnimal({}); }}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-sm transition-all ${modo === 'muerte' ? 'bg-red-600 text-white shadow-lg shadow-red-600/30' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
          <Skull size={18} /> Muerte
        </button>
      </div>

      {/* Formulario */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-5">
        <h3 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
          {modo === 'venta' ? '🏷️ Registrar Venta' : modo === 'traslado' ? '🚚 Registrar Traslado' : modo === 'muerte' ? '☠️ Registrar Muerte' : '⚖️ Registrar Pesaje'}
        </h3>

        {/* Animal Search */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-2">Seleccionar Animal(es)</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input type="text" value={busqueda}
              onChange={e => { setBusqueda(e.target.value); setShowAnimalList(true); }}
              onFocus={() => setShowAnimalList(true)}
              placeholder="Buscar por número, categoría o finca..."
              className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm placeholder-gray-500 focus:border-green-500 focus:ring-1 focus:ring-green-500/30" />
            {showAnimalList && (
              <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-xl max-h-60 overflow-y-auto shadow-2xl">
                {animalesFiltrados.length === 0 && <p className="px-4 py-3 text-sm text-gray-500">No se encontraron animales activos</p>}
                {animalesFiltrados.map(a => {
                  const isSelected = selectedAnimals.find(s => s.id === a.id);
                  return (
                    <button key={a.id} type="button" disabled={!!isSelected}
                      onClick={() => addAnimal(a)}
                      className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between gap-2 transition-colors ${isSelected ? 'bg-green-900/20 text-green-400 cursor-not-allowed' : 'text-gray-200 hover:bg-gray-700'}`}>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-green-400">{a.id}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${CAT_COLORS[a.categoria] || 'bg-gray-600 text-gray-300'}`}>{a.categoria}</span>
                        <span className={`text-xs ${a.finca === 'La Vega' ? 'text-green-500' : 'text-blue-500'}`}>{a.finca}</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {a.ultimoPeso ? `${Math.round(a.ultimoPeso)} kg` : '—'}
                        {isSelected && <span className="ml-2 text-green-400">✓</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {/* Click outside to close */}
          {showAnimalList && <div className="fixed inset-0 z-40" onClick={() => setShowAnimalList(false)} />}
        </div>

        {/* Selected Animals */}
        {selectedAnimals.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">Animales seleccionados ({selectedAnimals.length})</label>
            <div className="space-y-2">
              {selectedAnimals.map(a => (
                <div key={a.id} className="flex items-center gap-3 bg-gray-800 rounded-xl p-3 border border-gray-700">
                  <button onClick={() => removeAnimal(a.id)} className="p-1 text-red-400 hover:bg-red-900/30 rounded-lg"><X size={16} /></button>
                  <span className="font-bold text-green-400 text-sm w-20">{a.id}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${CAT_COLORS[a.categoria] || 'bg-gray-600 text-gray-300'}`}>{a.categoria}</span>
                  <span className={`text-xs ${a.finca === 'La Vega' ? 'text-green-500' : 'text-blue-500'}`}>{a.finca}</span>
                  {modo === 'venta' && (
                    <div className="flex items-center gap-2 ml-auto">
                      <label className="text-xs text-gray-500">Peso:</label>
                      <input type="number" step="1"
                        value={pesosPorAnimal[a.id] || ''}
                        onChange={e => setPesosPorAnimal(prev => ({ ...prev, [a.id]: e.target.value }))}
                        placeholder="kg"
                        className="w-24 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-gray-200 text-sm text-right" />
                      <span className="text-xs text-gray-500">kg</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Venta-specific fields */}
        {modo === 'venta' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Fecha de Venta</label>
              <input type="date" value={ventaForm.fecha} onChange={e => setVentaForm({ ...ventaForm, fecha: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Precio por kg (COP)</label>
              <input type="number" step="100" value={ventaForm.precio} onChange={e => setVentaForm({ ...ventaForm, precio: e.target.value })}
                placeholder="Ej: 8500" className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Comprador</label>
              <input type="text" value={ventaForm.comprador} onChange={e => setVentaForm({ ...ventaForm, comprador: e.target.value })}
                placeholder="Nombre del comprador" className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Tipo de Animal</label>
              <select value={ventaForm.tipo || tipoAutoDetect} onChange={e => setVentaForm({ ...ventaForm, tipo: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm">
                <option value="">Auto-detectar ({tipoAutoDetect || '—'})</option>
                <option value="ML">ML - Macho Levante</option>
                <option value="HL">HL - Hembra Levante</option>
                <option value="VP">VP - Vaca Parida</option>
                <option value="VS">VS - Vaca Seca</option>
                <option value="NV">NV - Novilla Vientre</option>
                <option value="TR">TR - Toro</option>
                <option value="VD">VD - Vaca Descarte</option>
                <option value="CM">CM - Cría Macho</option>
                <option value="CH">CH - Cría Hembra</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-400 mb-1">Observaciones</label>
              <input type="text" value={ventaForm.observaciones} onChange={e => setVentaForm({ ...ventaForm, observaciones: e.target.value })}
                placeholder="Notas adicionales..." className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm" />
            </div>
          </div>
        )}

        {/* Traslado-specific fields */}
        {modo === 'traslado' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Fecha del Traslado</label>
              <input type="date" value={trasladoForm.fecha} onChange={e => setTrasladoForm({ ...trasladoForm, fecha: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Finca Origen</label>
              <div className="w-full px-3 py-2.5 bg-gray-800/50 border border-gray-700 rounded-xl text-gray-400 text-sm">
                {fincaOrigen || 'Selecciona animales'}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Finca Destino</label>
              <select value={trasladoForm.fincaDestino} onChange={e => setTrasladoForm({ ...trasladoForm, fincaDestino: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm">
                <option value="">Seleccionar finca destino...</option>
                <option value="La Vega">La Vega</option>
                <option value="Bariloche">Bariloche</option>
              </select>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-medium text-gray-400 mb-1">Observaciones</label>
              <input type="text" value={trasladoForm.observaciones} onChange={e => setTrasladoForm({ ...trasladoForm, observaciones: e.target.value })}
                placeholder="Notas adicionales..." className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm" />
            </div>
          </div>
        )}

        {/* Muerte-specific fields */}
        {modo === 'muerte' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Fecha de Muerte</label>
              <input type="date" value={muerteForm.fecha} onChange={e => setMuerteForm({ ...muerteForm, fecha: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Causa de Muerte</label>
              <select value={muerteForm.causa} onChange={e => setMuerteForm({ ...muerteForm, causa: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm">
                <option value="">Seleccionar causa...</option>
                <option value="Enfermedad">Enfermedad</option>
                <option value="Accidente">Accidente</option>
                <option value="Parto">Complicación de Parto</option>
                <option value="Depredador">Depredador</option>
                <option value="Desnutrición">Desnutrición</option>
                <option value="Rayo">Rayo</option>
                <option value="Mordedura serpiente">Mordedura de serpiente</option>
                <option value="Desconocida">Desconocida</option>
                <option value="Otra">Otra</option>
              </select>
            </div>
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="block text-xs font-medium text-gray-400 mb-1">Observaciones</label>
              <input type="text" value={muerteForm.observaciones} onChange={e => setMuerteForm({ ...muerteForm, observaciones: e.target.value })}
                placeholder="Detalles adicionales..." className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm" />
            </div>
          </div>
        )}

        {/* Summary & Save */}
        {selectedAnimals.length > 0 && (
          <div className={`rounded-xl p-4 border ${modo === 'venta' ? 'bg-amber-900/20 border-amber-800' : modo === 'muerte' ? 'bg-red-900/20 border-red-800' : 'bg-blue-900/20 border-blue-800'}`}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Animales:</span>
                  <span className="ml-1 font-bold text-gray-100">{selectedAnimals.length}</span>
                </div>
                {modo === 'venta' && (
                  <>
                    <div>
                      <span className="text-gray-400">Total Kg:</span>
                      <span className="ml-1 font-bold text-gray-100">{totalKg.toLocaleString('es-CO')}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Precio/kg:</span>
                      <span className="ml-1 font-bold text-gray-100">{precioKg > 0 ? formatCurrency(precioKg) : '—'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Valor Total:</span>
                      <span className="ml-1 font-bold text-amber-400 text-lg">{valorTotal > 0 ? formatCurrency(valorTotal) : '—'}</span>
                    </div>
                  </>
                )}
                {modo === 'traslado' && trasladoForm.fincaDestino && (
                  <div>
                    <span className="text-gray-400">Destino:</span>
                    <span className={`ml-1 font-bold ${trasladoForm.fincaDestino === 'La Vega' ? 'text-green-400' : 'text-blue-400'}`}>{trasladoForm.fincaDestino}</span>
                  </div>
                )}
                {modo === 'muerte' && muerteForm.causa && (
                  <div>
                    <span className="text-gray-400">Causa:</span>
                    <span className="ml-1 font-bold text-red-400">{muerteForm.causa}</span>
                  </div>
                )}
              </div>
              <button
                onClick={modo === 'venta' ? handleSaveVenta : modo === 'traslado' ? handleSaveTraslado : handleSaveMuerte}
                disabled={saving || !isOnline}
                className={`px-6 py-3 rounded-xl font-medium text-sm text-white flex items-center gap-2 transition-all ${
                  modo === 'venta' ? 'bg-amber-600 hover:bg-amber-700 shadow-lg shadow-amber-600/20' :
                  modo === 'muerte' ? 'bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/20' :
                  'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20'
                } disabled:opacity-40 disabled:cursor-not-allowed`}>
                {saving ? <><Loader2 size={16} className="animate-spin" /> Guardando...</> :
                  modo === 'venta' ? <><Check size={16} /> Registrar Venta</> :
                  modo === 'traslado' ? <><Truck size={16} /> Registrar Traslado</> :
                  <><Skull size={16} /> Registrar Muerte</>}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Historial Reciente */}
      {historialReciente.length > 0 && (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
          <h3 className="text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2">
            <Clock size={18} className="text-gray-400" />
            {modo === 'venta' ? 'Últimas Ventas Individuales' : modo === 'traslado' ? 'Últimos Traslados' : 'Animales Muertos'} ({historialReciente.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500 text-xs">
                  <th className="text-left py-2 px-2">Fecha</th>
                  <th className="text-left py-2 px-2">Animal</th>
                  {modo === 'venta' && (
                    <>
                      <th className="text-left py-2 px-2">Tipo</th>
                      <th className="text-right py-2 px-2">Kg</th>
                      <th className="text-right py-2 px-2">$/kg</th>
                      <th className="text-right py-2 px-2">Valor</th>
                      <th className="text-left py-2 px-2">Comprador</th>
                    </>
                  )}
                  {modo === 'traslado' && (
                    <>
                      <th className="text-left py-2 px-2">Origen</th>
                      <th className="text-left py-2 px-2">Destino</th>
                      <th className="text-left py-2 px-2">Observaciones</th>
                    </>
                  )}
                  {modo === 'muerte' && (
                    <>
                      <th className="text-left py-2 px-2">Detalle</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {historialReciente.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-800/50">
                    <td className="py-2 px-2 text-gray-300">{formatDate(r.fecha)}</td>
                    <td className="py-2 px-2">
                      <AnimalLink id={modo === 'muerte' ? r.cria : r.animal} onAnimalClick={onAnimalClick} className="text-green-400 font-bold text-sm" />
                    </td>
                    {modo === 'venta' && (
                      <>
                        <td className="py-2 px-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${CAT_COLORS[r.tipo] || 'bg-gray-600 text-gray-300'}`}>{r.tipo}</span></td>
                        <td className="py-2 px-2 text-right text-gray-300">{r.kg ? Math.round(r.kg).toLocaleString('es-CO') : '—'}</td>
                        <td className="py-2 px-2 text-right text-gray-300">{r.precio ? formatCurrency(r.precio) : '—'}</td>
                        <td className="py-2 px-2 text-right font-medium text-amber-400">{r.valor ? formatCurrency(r.valor) : '—'}</td>
                        <td className="py-2 px-2 text-gray-400 truncate max-w-[120px]">{r.cliente || '—'}</td>
                      </>
                    )}
                    {modo === 'traslado' && (
                      <>
                        <td className="py-2 px-2"><span className={`text-xs ${r.finca_origen === 'La Vega' ? 'text-green-500' : 'text-blue-500'}`}>{r.finca_origen}</span></td>
                        <td className="py-2 px-2"><span className={`text-xs font-medium ${r.finca_destino === 'La Vega' ? 'text-green-400' : 'text-blue-400'}`}>→ {r.finca_destino}</span></td>
                        <td className="py-2 px-2 text-gray-500 truncate max-w-[200px]">{r.observaciones || '—'}</td>
                      </>
                    )}
                    {modo === 'muerte' && (
                      <td className="py-2 px-2 text-gray-400 text-xs">{r.comentario || '—'}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== COMPONENTE FINCA (reutilizable) ====================
function FincaView({ finca, subtitulo, color, inventario, nacimientos, setNacimientos, gastos, años, pesajes, setPesajes, palpaciones, setPalpaciones, servicios, setServicios, destetes, lluvias, setLluvias, genealogia, setGenealogia, userEmail, isOnline, onAnimalClick }) {
  const [añoSel, setAñoSel] = useState(new Date().getFullYear().toString());
  const [subView, setSubView] = useState('resumen');
  const esTodos = añoSel === 'todos';
  const añoNum = esTodos ? new Date().getFullYear() : parseInt(añoSel);

  // ---- RPC: Fertilidad e IEP desde servidor ----
  const [rpcFert, setRpcFert] = useState(null);
  const [rpcIep, setRpcIep] = useState(null);

  useEffect(() => {
    if (!isOnline || finca !== 'La Vega') return;
    let cancelled = false;
    const loadRpc = async () => {
      try {
        const [fert, iep] = await Promise.all([
          db.getRpcFertilidad(finca, añoNum),
          db.getRpcIep(finca)
        ]);
        if (!cancelled) {
          setRpcFert(fert);
          setRpcIep(iep);
        }
      } catch (err) {
        console.warn('[RPC] Fallback a cálculo frontend:', err.message);
        if (!cancelled) { setRpcFert(null); setRpcIep(null); }
      }
    };
    loadRpc();
    return () => { cancelled = true; };
  }, [isOnline, finca, añoNum]);

  // Categorías y centros excluidos de totales operativos
  const CATEGORIAS_EXCLUIDAS = ['Las Victorias', 'Yegua Mauricio Aldana', 'Apicultura', 'Montaje finca'];
  const CENTROS_EXCLUIDOS = ['Yegua MAG', 'Apicultura', 'Aparco'];

  const añosDisponibles = useMemo(() => {
    const aInv = inventario.filter(i => i.finca === finca).map(i => i.año);
    const aGastos = gastos
      .filter(g => g.fecha && (g.centro === finca || g.centro === 'Global'))
      .map(g => parseInt(g.fecha.split('-')[0]))
      .filter(a => !isNaN(a));
    const a = [...new Set([...aInv, ...aGastos])].sort((a, b) => b - a);
    return a.length ? a : [new Date().getFullYear()];
  }, [inventario, gastos, finca]);

  const invFinca = useMemo(() =>
    inventario.filter(i => i.finca === finca).sort((a, b) => (b.año * 12 + b.mes) - (a.año * 12 + a.mes)),
    [inventario, finca]);

  const ultimo = useMemo(() =>
    invFinca.find(i => i.año === añoNum) || invFinca[0],
    [invFinca, añoNum]);

  const invAño = useMemo(() =>
    invFinca.filter(i => i.año === añoNum).sort((a, b) => a.mes - b.mes),
    [invFinca, añoNum]);

  const maxInv = Math.max(...invAño.map(i => i.total), 1);

  // Nacimientos del año (solo para La Vega)
  const nacAño = useMemo(() => {
    if (finca !== 'La Vega') return [];
    return nacimientos.filter(n => n.año === añoNum && n.estado === 'Activo');
  }, [nacimientos, añoNum, finca]);

  // Peso destete promedio (solo activos del año)
  const pesoDestete = useMemo(() => {
    if (finca !== 'La Vega') return { m: '-', h: '-' };
    const dest = nacimientos.filter(n => {
      const ad = n.añoDestete || n.año_destete;
      return n.estado === 'Activo' && (n.pesoDestete || n.peso_destete) && (!añoNum || ad === añoNum);
    });
    const getPeso = n => n.pesoDestete || n.peso_destete || 0;
    const m = dest.filter(n => n.sexo === 'M');
    const h = dest.filter(n => n.sexo === 'H');
    return {
      m: m.length ? (m.reduce((s, n) => s + getPeso(n), 0) / m.length).toFixed(1) : '-',
      h: h.length ? (h.reduce((s, n) => s + getPeso(n), 0) / h.length).toFixed(1) : '-'
    };
  }, [nacimientos, añoNum, finca]);

  // Costos del año (finca + 50% Global, excluyendo categorías no operativas)
  const costosAño = useMemo(() => {
    return gastos
      .filter(g => {
        if (!g.fecha) return false;
        const año = g.fecha.split('-')[0];
        const cat = (g.categoria || '').trim();
        const centro = (g.centro || '').trim();
        const esExcluido = CATEGORIAS_EXCLUIDAS.some(exc => cat.toLowerCase() === exc.toLowerCase()) ||
                           CENTROS_EXCLUIDOS.some(exc => centro.toLowerCase() === exc.toLowerCase());
        return !esExcluido && año === añoSel && (g.centro === finca || g.centro === 'Global');
      })
      .reduce((sum, g) => sum + ((g.centro === 'Global' ? (g.monto || 0) * 0.5 : (g.monto || 0))), 0);
  }, [gastos, añoSel, finca]);

  // ---- KPIs La Vega ----
  const kpisLaVega = useMemo(() => {
    if (finca !== 'La Vega') return null;
    const nacTodos = nacimientos.filter(n => n.año === añoNum);
    const nacActivos = nacTodos.filter(n => n.estado === 'Activo');
    const nacMuertos = nacTodos.filter(n => n.estado === 'Muerto');

    // Peso al nacer promedio
    const conPesoNacer = nacActivos.filter(n => n.pesoNacer && n.pesoNacer > 0);
    const pesoNacerProm = conPesoNacer.length
      ? conPesoNacer.reduce((s, n) => s + n.pesoNacer, 0) / conPesoNacer.length : null;

    // Peso destete por sexo (from nacimientos or destetes table)
    const destetadosNac = nacimientos.filter(n => {
      const ad = n.añoDestete || n.año_destete;
      return n.estado === 'Activo' && (n.pesoDestete || n.peso_destete) && ad === añoNum;
    });
    const destetadosTab = (destetes || []).filter(d => {
      if (!d.fecha_destete) return false;
      return parseInt(d.fecha_destete.split('-')[0]) === añoNum;
    });
    // Use destetes table if it has more data for this year
    const usarTablaDestetes = destetadosTab.length > destetadosNac.length;
    const getPesoNac = n => n.pesoDestete || n.peso_destete || 0;

    let pesoDestM, pesoDestH, destM, destH, destetadosTotal, gdpProm;
    if (usarTablaDestetes && destetadosTab.length > 0) {
      const dm = destetadosTab.filter(d => d.sexo === 'M');
      const dh = destetadosTab.filter(d => d.sexo === 'H');
      pesoDestM = dm.length ? dm.reduce((s, d) => s + (d.peso_destete || 0), 0) / dm.length : null;
      pesoDestH = dh.length ? dh.reduce((s, d) => s + (d.peso_destete || 0), 0) / dh.length : null;
      destM = dm.length;
      destH = dh.length;
      destetadosTotal = destetadosTab.length;
      // GDP: calcular automáticamente, fallback a gdp_predestete
      const gdps = destetadosTab.map(d => calcularGDPDestete(d) || (d.gdp_predestete > 0 ? d.gdp_predestete : null)).filter(Boolean);
      gdpProm = gdps.length ? gdps.reduce((s, v) => s + v, 0) / gdps.length : null;
    } else {
      const dm = destetadosNac.filter(n => n.sexo === 'M');
      const dh = destetadosNac.filter(n => n.sexo === 'H');
      pesoDestM = dm.length ? dm.reduce((s, n) => s + getPesoNac(n), 0) / dm.length : null;
      pesoDestH = dh.length ? dh.reduce((s, n) => s + getPesoNac(n), 0) / dh.length : null;
      destM = dm.length;
      destH = dh.length;
      destetadosTotal = destetadosNac.length;
      // GDP: calcular automáticamente, fallback a grDiaVida
      const gdps = destetadosNac.map(n => calcularGDPDestete(n) || (n.grDiaVida > 0 ? n.grDiaVida : null)).filter(Boolean);
      gdpProm = gdps.length ? gdps.reduce((s, v) => s + v, 0) / gdps.length : null;
    }

    // Tasa de mortalidad
    const mortalidad = nacTodos.length > 0
      ? (nacMuertos.length / nacTodos.length) * 100 : null;

    // Intervalo entre partos — usar RPC si disponible, sino calcular en frontend
    let iepProm;
    if (rpcIep && rpcIep.iep_dias) {
      iepProm = rpcIep.iep_dias;
    } else {
      const porMadre = {};
      nacimientos.filter(n => n.madre && n.fecha).forEach(n => {
        if (!porMadre[n.madre]) porMadre[n.madre] = [];
        porMadre[n.madre].push(new Date(n.fecha));
      });
      const intervalos = [];
      Object.values(porMadre).forEach(fechas => {
        if (fechas.length < 2) return;
        fechas.sort((a, b) => a - b);
        for (let i = 1; i < fechas.length; i++) {
          const dias = (fechas[i] - fechas[i - 1]) / (1000 * 60 * 60 * 24);
          if (dias > 200 && dias < 800) intervalos.push(dias);
        }
      });
      iepProm = intervalos.length
        ? intervalos.reduce((s, d) => s + d, 0) / intervalos.length : null;
    }

    // Costo por animal destetado
    const costoAnimal = destetadosTotal > 0 ? costosAño / destetadosTotal : null;

    // Proporción sexos
    const machos = nacActivos.filter(n => n.sexo === 'M').length;
    const hembras = nacActivos.filter(n => n.sexo === 'H').length;

    // ---- FERTILIDAD — usar RPC si disponible, sino calcular en frontend ----
    let fertilidad, totalPalpadas, preñadas;
    if (rpcFert && rpcFert.total_palpadas > 0) {
      totalPalpadas = rpcFert.total_palpadas;
      preñadas = rpcFert.preñadas;
      fertilidad = rpcFert.fertilidad_pct;
    } else {
      const palpAño = (palpaciones || []).filter(p => p.finca === 'La Vega' && p.fecha && parseInt(p.fecha.split('-')[0]) === añoNum);
      const ultimaPalp = {};
      palpAño.forEach(p => {
        const key = p.hembra;
        if (!ultimaPalp[key] || p.fecha > ultimaPalp[key].fecha) ultimaPalp[key] = p;
      });
      const palpUnicas = Object.values(ultimaPalp);
      totalPalpadas = palpUnicas.length;
      preñadas = palpUnicas.filter(p => {
        const gest = (p.dias_gestacion || '').toString().trim().toUpperCase();
        return gest !== 'VACIA' && gest !== '' && !isNaN(parseInt(gest));
      }).length;
      fertilidad = totalPalpadas > 0 ? (preñadas / totalPalpadas) * 100 : null;
    }

    // ---- SERVICIOS del año ----
    const servAño = (servicios || []).filter(s => s.finca === 'La Vega' && s.fecha && parseInt(s.fecha.split('-')[0]) === añoNum);

    return {
      nacidos: nacTodos.length,
      nacActivos: nacActivos.length,
      muertos: nacMuertos.length,
      pesoNacerProm,
      pesoDestM,
      pesoDestH,
      destM,
      destH,
      destetados: destetadosTotal,
      gdpProm,
      mortalidad,
      iepProm,
      costoAnimal,
      machos,
      hembras,
      fertilidad,
      totalPalpadas,
      preñadas,
      totalServicios: servAño.length,
    };
  }, [nacimientos, añoNum, finca, costosAño, palpaciones, servicios, destetes, rpcFert, rpcIep]);

  // ---- KPIs Bariloche ----
  const kpisBariloche = useMemo(() => {
    if (finca !== 'Bariloche') return null;
    const totalCabezas = ultimo?.total || 0;
    const costoAnimal = totalCabezas > 0 ? costosAño / totalCabezas : null;

    // Desglose costos por categoría
    const costosCat = {};
    gastos.filter(g => {
      if (!g.fecha) return false;
      const año = g.fecha.split('-')[0];
      const cat = (g.categoria || '').trim();
      const centro = (g.centro || '').trim();
      const esExcluido = CATEGORIAS_EXCLUIDAS.some(exc => cat.toLowerCase() === exc.toLowerCase()) ||
                         CENTROS_EXCLUIDOS.some(exc => centro.toLowerCase() === exc.toLowerCase());
      return !esExcluido && año === añoSel && (g.centro === 'Bariloche' || g.centro === 'Global');
    }).forEach(g => {
      const cat = g.categoria || 'Sin categoría';
      const monto = g.centro === 'Global' ? (g.monto || 0) * 0.5 : (g.monto || 0);
      costosCat[cat] = (costosCat[cat] || 0) + monto;
    });
    const topCostos = Object.entries(costosCat).sort((a, b) => b[1] - a[1]).slice(0, 6);

    // ---- PESAJES Bariloche ----
    const pesAño = (pesajes || []).filter(p => p.finca === 'Bariloche' && p.fecha_pesaje && parseInt(p.fecha_pesaje.split('-')[0]) === añoNum);
    
    // GDP entre pesajes (meta: 500 g/día)
    const conGDPEntre = pesAño.filter(p => p.gdp_entre_pesajes && p.gdp_entre_pesajes > 0);
    const gdpEntreProm = conGDPEntre.length
      ? conGDPEntre.reduce((s, p) => s + p.gdp_entre_pesajes, 0) / conGDPEntre.length : null;

    // GDP vida promedio
    const conGDPVida = pesAño.filter(p => p.gdp_vida && p.gdp_vida > 0);
    const gdpVidaProm = conGDPVida.length
      ? conGDPVida.reduce((s, p) => s + p.gdp_vida, 0) / conGDPVida.length : null;

    // Peso promedio actual (último pesaje por animal)
    const ultimoPesaje = {};
    pesAño.forEach(p => {
      if (!ultimoPesaje[p.animal] || p.fecha_pesaje > ultimoPesaje[p.animal].fecha_pesaje) {
        ultimoPesaje[p.animal] = p;
      }
    });
    const ultimos = Object.values(ultimoPesaje);
    const pesoProm = ultimos.length
      ? ultimos.reduce((s, p) => s + (p.peso || 0), 0) / ultimos.length : null;

    // GDP por categoría
    const gdpPorCat = {};
    conGDPEntre.forEach(p => {
      const cat = p.categoria || 'Otro';
      if (!gdpPorCat[cat]) gdpPorCat[cat] = { sum: 0, count: 0 };
      gdpPorCat[cat].sum += p.gdp_entre_pesajes;
      gdpPorCat[cat].count++;
    });
    const gdpCategorias = Object.entries(gdpPorCat).map(([cat, d]) => ({
      cat,
      gdp: d.sum / d.count,
      n: d.count,
    })).sort((a, b) => b.gdp - a.gdp);

    return {
      totalCabezas,
      costoAnimal,
      topCostos,
      pesajesTotal: pesAño.length,
      gdpEntreProm,
      gdpVidaProm,
      pesoProm,
      gdpCategorias,
      animalesPesados: ultimos.length,
    };
  }, [gastos, añoSel, finca, costosAño, ultimo, pesajes, añoNum]);

  const colorClasses = {
    green: { bg: 'bg-green-900/40', text: 'text-green-500', bar: 'bg-green-500', gradient: 'from-green-500 to-green-600', border: 'border-green-500' },
    blue: { bg: 'bg-blue-900/40', text: 'text-blue-500', bar: 'bg-blue-500', gradient: 'from-blue-500 to-blue-600', border: 'border-blue-500' }
  }[color];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Finca {finca}</h2>
          <p className="text-gray-400">{subtitulo}</p>
        </div>
        <select value={añoSel} onChange={e => setAñoSel(e.target.value)} className="px-4 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl">
          <option value="todos">📈 Todos</option>
          {añosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800 p-1 rounded-xl w-fit">
        {[
          { key: 'resumen', label: '📊 Resumen', icon: BarChart3, hide: esTodos },
          { key: 'kpis', label: esTodos ? '📈 Tendencias' : '🎯 KPIs', icon: Target },
          { key: 'hato', label: '🐄 Hato', icon: Search, hide: esTodos },
          { key: 'lluvias', label: '🌧️ Lluvias', icon: Activity, hide: esTodos },
          { key: 'pesajes', label: '⚖️ Pesajes', icon: Scale, hide: esTodos },
          { key: 'palpaciones', label: '🔬 Palpaciones', icon: Activity, hide: esTodos || finca !== 'La Vega' },
          { key: 'servicios', label: '🧬 IA/TE', icon: Activity, hide: esTodos || finca !== 'La Vega' },
          { key: 'registros', label: '📋 Registros', icon: FileText, hide: esTodos || finca !== 'La Vega' },
        ].filter(t => !t.hide).map(tab => (
          <button key={tab.key} onClick={() => setSubView(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${subView === tab.key || (esTodos && tab.key === 'kpis') ? 'bg-gray-900 shadow text-gray-100' : 'text-gray-400 hover:text-gray-300'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* KPI Trends - when "Todos" is selected */}
      {esTodos && (
        <KPITrends
          finca={finca}
          nacimientos={nacimientos}
          gastos={gastos}
          inventario={inventario}
          pesajes={pesajes}
          palpaciones={palpaciones}
          servicios={servicios}
          destetes={destetes}
        />
      )}

      {!esTodos && subView === 'resumen' && (<>
      {/* Cards resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`bg-gradient-to-br ${colorClasses.gradient} rounded-2xl p-4 text-white shadow-lg`}>
          <div className="flex justify-between">
            <div>
              <p className="text-white/80 text-sm">Inventario Actual</p>
              <p className="text-3xl font-bold mt-1">{ultimo?.total || 0}</p>
              <p className="text-white/60 text-xs">{MESES[ultimo?.mes]} {ultimo?.año}</p>
            </div>
            <Beef size={32} className="opacity-50" />
          </div>
        </div>
        {finca === 'La Vega' ? (
          <>
            <Card title={`Nacimientos ${añoSel}`} value={nacAño.length} icon={Baby} color="from-amber-500 to-amber-600" />
            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-4 text-white shadow-lg">
              <div className="flex justify-between">
                <div>
                  <p className="text-white/80 text-sm">Peso Destete</p>
                  <p className="text-lg font-bold">♂ {pesoDestete.m} kg</p>
                  <p className="text-lg font-bold">♀ {pesoDestete.h} kg</p>
                </div>
                <Scale size={32} className="opacity-50" />
              </div>
            </div>
          </>
        ) : (
          <>
            <Card title="Novillas (NAS)" value={ultimo?.nas || 0} icon={TrendingUp} color="from-purple-500 to-purple-600" />
            <Card title="Levante (HL+ML)" value={(ultimo?.hl || 0) + (ultimo?.ml || 0)} icon={Scale} color="from-amber-500 to-amber-600" />
          </>
        )}
        <Card title={`Costos ${añoSel}`} value={formatCurrency(costosAño)} icon={DollarSign} color="from-red-500 to-red-600" />
      </div>

      {/* Composición del hato */}
      <div className="bg-gray-900 rounded-2xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Composición del Hato — {MESES[ultimo?.mes]} {ultimo?.año}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {HATO_CATEGORIAS.map(cat => (
            <div key={cat.key} className={`p-3 rounded-xl text-center ${cat.color}`}>
              <p className="text-2xl font-bold">{ultimo?.[cat.key] || 0}</p>
              <p className="text-xs mt-1">{cat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Evolución inventario */}
      {invAño.length > 0 && (
        <div className="bg-gray-900 rounded-2xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">Evolución del Inventario {añoSel}</h3>
          <div className="h-56 flex items-end gap-2 px-2">
            {invAño.map((inv, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end">
                <span className="text-xs font-semibold mb-1" style={{ color: color === 'green' ? '#16a34a' : '#2563eb' }}>{inv.total}</span>
                <div className={`w-full rounded-t transition-all duration-300 ${colorClasses.bar}`}
                  style={{ height: `${Math.max((inv.total / maxInv) * 100, 8)}%` }} />
                <span className="text-xs text-gray-400 mt-2 font-medium">{MESES[inv.mes]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabla detalle mensual */}
      {invAño.length > 0 && (
        <div className="bg-gray-900 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-800">
            <h3 className="font-semibold">Detalle Mensual {añoSel}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-800/50 border-b border-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Mes</th>
                  {HATO_CATEGORIAS.map(c => (
                    <th key={c.key} className="px-3 py-3 text-right text-xs font-semibold text-gray-400">{c.key.toUpperCase()}</th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-100">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {invAño.map((inv, idx) => (
                  <tr key={idx} className="hover:bg-gray-800/50">
                    <td className="px-4 py-2 text-sm font-medium">{MESES[inv.mes]}</td>
                    {HATO_CATEGORIAS.map(c => (
                      <td key={c.key} className="px-3 py-2 text-sm text-right">{inv[c.key] || 0}</td>
                    ))}
                    <td className="px-4 py-2 text-sm text-right font-bold">{inv.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>)}

      {/* ===== KPI PANEL ===== */}
      {!esTodos && subView === 'kpis' && finca === 'La Vega' && kpisLaVega && (
        <div className="space-y-6">
          {/* KPI Cards principales */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-900 rounded-2xl p-5 shadow-sm border-l-4 border-green-500">
              <div className="flex items-center gap-2 text-green-500 mb-1"><Baby size={18} /><span className="text-xs font-semibold uppercase">Nacimientos</span></div>
              <p className="text-3xl font-bold text-gray-100">{kpisLaVega.nacidos}</p>
              <p className="text-xs text-gray-400 mt-1">♂ {kpisLaVega.machos} • ♀ {kpisLaVega.hembras}</p>
            </div>
            <div className="bg-gray-900 rounded-2xl p-5 shadow-sm border-l-4 border-blue-500">
              <div className="flex items-center gap-2 text-blue-500 mb-1"><Scale size={18} /><span className="text-xs font-semibold uppercase">Destetados</span></div>
              <p className="text-3xl font-bold text-gray-100">{kpisLaVega.destetados}</p>
              <p className="text-xs text-gray-400 mt-1">♂ {kpisLaVega.destM} • ♀ {kpisLaVega.destH}</p>
            </div>
            <div className="bg-gray-900 rounded-2xl p-5 shadow-sm border-l-4 border-red-500">
              <div className="flex items-center gap-2 text-red-500 mb-1"><AlertTriangle size={18} /><span className="text-xs font-semibold uppercase">Mortalidad</span></div>
              <p className="text-3xl font-bold text-gray-100">{kpisLaVega.mortalidad !== null ? kpisLaVega.mortalidad.toFixed(1) + '%' : '—'}</p>
              <p className="text-xs text-gray-400 mt-1">{kpisLaVega.muertos} muertos de {kpisLaVega.nacidos}</p>
            </div>
            <div className="bg-gray-900 rounded-2xl p-5 shadow-sm border-l-4 border-purple-500">
              <div className="flex items-center gap-2 text-purple-500 mb-1"><DollarSign size={18} /><span className="text-xs font-semibold uppercase">Costo/Destetado</span></div>
              <p className="text-3xl font-bold text-gray-100">{kpisLaVega.costoAnimal ? formatCurrency(kpisLaVega.costoAnimal) : '—'}</p>
              <p className="text-xs text-gray-400 mt-1">{kpisLaVega.destetados} animales</p>
            </div>
          </div>

          {/* KPIs con metas */}
          <div className="bg-gray-900 rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-5 flex items-center gap-2"><Target size={20} className="text-green-500" /> Indicadores vs Metas — {añoSel}</h3>
            <div className="space-y-5">
              {[
                { label: 'Peso al Nacer', valor: kpisLaVega.pesoNacerProm, meta: 28, unidad: 'kg', color: 'green', invertido: false },
                { label: 'Peso Destete ♂', valor: kpisLaVega.pesoDestM, meta: 220, unidad: 'kg', color: 'blue', invertido: false },
                { label: 'Peso Destete ♀', valor: kpisLaVega.pesoDestH, meta: 210, unidad: 'kg', color: 'purple', invertido: false },
                { label: 'Ganancia Diaria (GDP)', valor: kpisLaVega.gdpProm, meta: 800, unidad: 'g/día', color: 'amber', invertido: false },
                { label: 'Intervalo Entre Partos', valor: kpisLaVega.iepProm, meta: 400, unidad: 'días', color: 'red', invertido: true },
              ].map((kpi, idx) => {
                const actual = kpi.valor;
                if (actual === null) return (
                  <div key={idx} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                    <span className="text-sm font-medium text-gray-400 w-44">{kpi.label}</span>
                    <span className="text-sm text-gray-400">Sin datos para {añoSel}</span>
                    <span className="text-xs text-gray-400 w-24 text-right">Meta: {kpi.meta} {kpi.unidad}</span>
                  </div>
                );
                const pct = kpi.invertido
                  ? Math.min((kpi.meta / actual) * 100, 150)
                  : Math.min((actual / kpi.meta) * 100, 150);
                const cumple = kpi.invertido ? actual <= kpi.meta : actual >= kpi.meta;
                const barColor = cumple ? `bg-${kpi.color}-500` : 'bg-red-400';
                const colors = { green: 'bg-green-500', blue: 'bg-blue-500', purple: 'bg-purple-500', amber: 'bg-amber-500', red: 'bg-red-500' };

                return (
                  <div key={idx} className="py-2 border-b border-gray-800 last:border-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-gray-300 w-44">{kpi.label}</span>
                      <div className="flex items-center gap-3">
                        <span className={`text-lg font-bold ${cumple ? 'text-green-500' : 'text-red-500'}`}>
                          {actual.toFixed(1)} {kpi.unidad}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cumple ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                          {cumple ? '✓ Meta' : `Meta: ${kpi.meta}`}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${cumple ? colors[kpi.color] : 'bg-red-400'}`}
                          style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      <span className="text-xs text-gray-400 w-12 text-right">{pct.toFixed(0)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Intervalo entre partos detalle */}
          {kpisLaVega.iepProm && (
            <div className="bg-gray-900 rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2"><Clock size={20} className="text-blue-500" /> Intervalo Entre Partos (Histórico)</h3>
              <p className="text-sm text-gray-400 mb-2">Calculado con base en todas las madres con más de 1 parto registrado.</p>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <p className="text-4xl font-bold text-gray-100">{kpisLaVega.iepProm.toFixed(0)}</p>
                  <p className="text-sm text-gray-400">días promedio</p>
                </div>
                <div className="text-center">
                  <p className="text-4xl font-bold text-gray-100">{(kpisLaVega.iepProm / 30.4).toFixed(1)}</p>
                  <p className="text-sm text-gray-400">meses promedio</p>
                </div>
                <div className="text-center px-4 py-2 bg-amber-900/20 rounded-xl">
                  <p className="text-sm font-semibold text-amber-400">Meta: ≤ 400 días</p>
                  <p className="text-xs text-amber-500">(13.2 meses)</p>
                </div>
              </div>
            </div>
          )}

          {/* Fertilidad from palpaciones */}
          {kpisLaVega.fertilidad !== null ? (
            <div className="bg-gray-900 rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Activity size={20} className="text-emerald-500" /> Índice de Fertilidad — {añoSel}</h3>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <p className={`text-4xl font-bold ${kpisLaVega.fertilidad >= 80 ? 'text-green-500' : 'text-red-500'}`}>{kpisLaVega.fertilidad.toFixed(1)}%</p>
                  <p className="text-sm text-gray-400">fertilidad</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-300">{kpisLaVega.preñadas}</p>
                  <p className="text-sm text-gray-400">preñadas</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-300">{kpisLaVega.totalPalpadas}</p>
                  <p className="text-sm text-gray-400">palpadas</p>
                </div>
                <div className="text-center px-4 py-2 bg-emerald-900/20 rounded-xl">
                  <p className="text-sm font-semibold text-emerald-400">Meta: ≥ 80%</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${kpisLaVega.fertilidad >= 80 ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                    {kpisLaVega.fertilidad >= 80 ? '✓ Cumple' : '✗ Por debajo'}
                  </span>
                </div>
              </div>
              {kpisLaVega.totalServicios > 0 && (
                <p className="text-xs text-gray-400 mt-3">🐂 {kpisLaVega.totalServicios} servicios realizados en {añoSel}</p>
              )}
            </div>
          ) : (
            <div className="bg-gray-800/50 border border-dashed border-gray-700 rounded-2xl p-6">
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2 text-gray-400"><Activity size={20} /> Índice de Fertilidad</h3>
              <p className="text-sm text-gray-400">No hay datos de palpaciones para {añoSel}. Meta: &gt;80%</p>
            </div>
          )}
        </div>
      )}

      {!esTodos && subView === 'kpis' && finca === 'Bariloche' && kpisBariloche && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-900 rounded-2xl p-5 shadow-sm border-l-4 border-blue-500">
              <div className="flex items-center gap-2 text-blue-500 mb-1"><Beef size={18} /><span className="text-xs font-semibold uppercase">Cabezas</span></div>
              <p className="text-3xl font-bold text-gray-100">{kpisBariloche.totalCabezas}</p>
              <p className="text-xs text-gray-400 mt-1">Inventario actual</p>
            </div>
            <div className="bg-gray-900 rounded-2xl p-5 shadow-sm border-l-4 border-amber-500">
              <div className="flex items-center gap-2 text-amber-500 mb-1"><Scale size={18} /><span className="text-xs font-semibold uppercase">Peso Promedio</span></div>
              <p className="text-3xl font-bold text-gray-100">{kpisBariloche.pesoProm ? kpisBariloche.pesoProm.toFixed(0) + ' kg' : '—'}</p>
              <p className="text-xs text-gray-400 mt-1">{kpisBariloche.animalesPesados} animales pesados</p>
            </div>
            <div className="bg-gray-900 rounded-2xl p-5 shadow-sm border-l-4 border-purple-500">
              <div className="flex items-center gap-2 text-purple-500 mb-1"><DollarSign size={18} /><span className="text-xs font-semibold uppercase">Costo/Animal</span></div>
              <p className="text-3xl font-bold text-gray-100">{kpisBariloche.costoAnimal ? formatCurrency(kpisBariloche.costoAnimal) : '—'}</p>
              <p className="text-xs text-gray-400 mt-1">Costos {añoSel} / cabezas</p>
            </div>
            <div className="bg-gray-900 rounded-2xl p-5 shadow-sm border-l-4 border-green-500">
              <div className="flex items-center gap-2 text-green-500 mb-1"><DollarSign size={18} /><span className="text-xs font-semibold uppercase">Costos Total</span></div>
              <p className="text-3xl font-bold text-gray-100">{formatCurrency(costosAño)}</p>
              <p className="text-xs text-gray-400 mt-1">{añoSel}</p>
            </div>
          </div>

          {/* GDP entre pesajes vs meta */}
          {kpisBariloche.gdpEntreProm !== null ? (
            <div className="bg-gray-900 rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Target size={20} className="text-blue-500" /> Ganancia Diaria de Peso — {añoSel}</h3>
              <div className="space-y-4">
                <div className="py-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-gray-300">GDP Entre Pesajes</span>
                    <div className="flex items-center gap-3">
                      <span className={`text-lg font-bold ${kpisBariloche.gdpEntreProm >= 500 ? 'text-green-500' : 'text-red-500'}`}>
                        {kpisBariloche.gdpEntreProm.toFixed(0)} g/día
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${kpisBariloche.gdpEntreProm >= 500 ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                        {kpisBariloche.gdpEntreProm >= 500 ? '✓ Meta 500' : 'Meta: 500'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${kpisBariloche.gdpEntreProm >= 500 ? 'bg-blue-500' : 'bg-red-400'}`}
                        style={{ width: `${Math.min((kpisBariloche.gdpEntreProm / 500) * 100, 150)}%` }} />
                    </div>
                    <span className="text-xs text-gray-400 w-12 text-right">{((kpisBariloche.gdpEntreProm / 500) * 100).toFixed(0)}%</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{kpisBariloche.pesajesTotal} pesajes registrados</p>
                </div>

                {kpisBariloche.gdpVidaProm && (
                  <div className="py-2 border-t border-gray-800">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-gray-300">GDP Promedio Vida</span>
                      <span className="text-lg font-bold text-gray-300">{kpisBariloche.gdpVidaProm.toFixed(0)} g/día</span>
                    </div>
                  </div>
                )}
              </div>

              {/* GDP por categoría */}
              {kpisBariloche.gdpCategorias.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-800">
                  <h4 className="text-sm font-semibold text-gray-400 mb-3">GDP por Categoría</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {kpisBariloche.gdpCategorias.map((c, i) => {
                      const catNames = { NV: 'Novillas', HL: 'Hembras Lev.', ML: 'Machos Lev.', CM: 'Cría Macho', CH: 'Cría Hembra', TR: 'Toro' };
                      return (
                        <div key={i} className="bg-gray-800/50 rounded-xl p-3 text-center">
                          <p className={`text-xl font-bold ${c.gdp >= 500 ? 'text-green-500' : 'text-amber-500'}`}>{c.gdp.toFixed(0)}</p>
                          <p className="text-xs text-gray-400">g/día</p>
                          <p className="text-xs font-medium text-gray-300 mt-1">{catNames[c.cat] || c.cat} ({c.n})</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-800/50 border border-dashed border-gray-700 rounded-2xl p-6">
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2 text-gray-400"><Activity size={20} /> GDP Levante</h3>
              <p className="text-sm text-gray-400">No hay datos de pesajes para Bariloche en {añoSel}. Meta: 500 g/día entre pesajes.</p>
            </div>
          )}

          {/* Top costos por categoría */}
          {kpisBariloche.topCostos.length > 0 && (
            <div className="bg-gray-900 rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><PieChart size={20} className="text-blue-500" /> Distribución de Costos — {añoSel}</h3>
              <div className="space-y-3">
                {kpisBariloche.topCostos.map(([cat, total], idx) => {
                  const pct = (total / costosAño) * 100;
                  return (
                    <div key={idx}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-gray-300">{cat}</span>
                        <span className="text-gray-400">{formatCurrency(total)} ({pct.toFixed(1)}%)</span>
                      </div>
                      <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== HATO ==================== */}
      {!esTodos && subView === 'hato' && (
        <HatoView finca={finca} nacimientos={nacimientos} setNacimientos={setNacimientos} pesajes={pesajes} palpaciones={palpaciones} servicios={servicios} isOnline={isOnline} userEmail={userEmail} onAnimalClick={onAnimalClick} />
      )}

      {!esTodos && subView === 'lluvias' && (
        <LluviasView finca={finca} lluvias={lluvias} setLluvias={setLluvias} userEmail={userEmail} añoSel={añoSel} />
      )}

      {!esTodos && subView === 'pesajes' && (
        <PesajesManualView finca={finca} pesajes={pesajes} setPesajes={setPesajes} nacimientos={nacimientos} userEmail={userEmail} isOnline={isOnline} onAnimalClick={onAnimalClick} />
      )}

      {!esTodos && subView === 'palpaciones' && finca === 'La Vega' && (
        <PalpacionesView palpaciones={palpaciones} setPalpaciones={setPalpaciones} userEmail={userEmail} nacimientos={nacimientos} onAnimalClick={onAnimalClick} />
      )}

      {!esTodos && subView === 'servicios' && finca === 'La Vega' && (
        <ServiciosView servicios={servicios} setServicios={setServicios} userEmail={userEmail} nacimientos={nacimientos} isOnline={isOnline} onAnimalClick={onAnimalClick} />
      )}

      {!esTodos && subView === 'registros' && finca === 'La Vega' && (
        <RegistrosGenealogiaView genealogia={genealogia} setGenealogia={setGenealogia} nacimientos={nacimientos} userEmail={userEmail} isOnline={isOnline} onAnimalClick={onAnimalClick} />
      )}

    </div>
  );
}

// ==================== COMPONENTE REGISTROS GENEALÓGICOS ====================
function RegistrosGenealogiaView({ genealogia, setGenealogia, nacimientos, userEmail, isOnline, onAnimalClick }) {
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filtroRaza, setFiltroRaza] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [fichaId, setFichaId] = useState(null); // para ver ficha completa
  const [successMsg, setSuccessMsg] = useState('');

  const RAZAS = ['BON', 'Angus', 'Red Angus', 'Brangus'];
  const RAZA_COLORS = {
    'BON': 'bg-amber-900/40 text-amber-400',
    'Angus': 'bg-gray-700 text-gray-200',
    'Red Angus': 'bg-red-900/40 text-red-400',
    'Brangus': 'bg-purple-900/40 text-purple-400'
  };

  const initForm = {
    numero: '', nombre: '', raza: 'BON', sexo: 'M', color: '', fecha_nacimiento: '',
    registro_num: '', registro_fecha: '', asociacion: '',
    padre_nombre: '', padre_registro: '', madre_nombre: '', madre_registro: '',
    criador: '', propietario: 'Inversiones Empresariales A&C', marca: '',
    animal_hato_id: '',
    // Pedigree extendido
    abuelo_p: '', abuela_p: '', abuelo_m: '', abuela_m: '',
    // EPDs (Angus)
    epd_ced: '', epd_bw: '', epd_ww: '', epd_yw: '', epd_milk: '', epd_marb: '', epd_rea: '', epd_cw: '',
    // Performance
    peso_nacimiento: '', peso_205: '', peso_365: ''
  };
  const [form, setForm] = useState(initForm);

  // Auto-set asociacion
  const handleRazaChange = (raza) => {
    const asoc = { 'BON': 'ASOCRIOLLO', 'Brangus': 'Angus & Brangus Colombia', 'Angus': 'RAAA', 'Red Angus': 'RAAA' }[raza] || '';
    setForm(prev => ({ ...prev, raza, asociacion: asoc }));
  };

  const filtrados = useMemo(() => {
    let list = genealogia || [];
    if (filtroRaza) list = list.filter(g => g.raza === filtroRaza);
    if (busqueda) {
      const q = busqueda.toLowerCase();
      list = list.filter(g => (g.nombre || '').toLowerCase().includes(q) || (g.numero || '').toLowerCase().includes(q) || (g.padre_nombre || '').toLowerCase().includes(q) || (g.madre_nombre || '').toLowerCase().includes(q));
    }
    return list;
  }, [genealogia, filtroRaza, busqueda]);

  // Stats
  const stats = useMemo(() => {
    const all = genealogia || [];
    return {
      total: all.length,
      bon: all.filter(g => g.raza === 'BON').length,
      angus: all.filter(g => g.raza === 'Angus' || g.raza === 'Red Angus').length,
      brangus: all.filter(g => g.raza === 'Brangus').length,
      machos: all.filter(g => g.sexo === 'M').length,
      hembras: all.filter(g => g.sexo === 'H').length,
      conPdf: all.filter(g => g.pdf_url).length
    };
  }, [genealogia]);

  const openEdit = (reg) => {
    const extras = reg.datos_extras || {};
    setForm({
      numero: reg.numero || '', nombre: reg.nombre || '', raza: reg.raza || 'BON',
      sexo: reg.sexo || 'M', color: reg.color || '', fecha_nacimiento: reg.fecha_nacimiento || '',
      registro_num: reg.registro_num || '', registro_fecha: reg.registro_fecha || '', asociacion: reg.asociacion || '',
      padre_nombre: reg.padre_nombre || '', padre_registro: reg.padre_registro || '',
      madre_nombre: reg.madre_nombre || '', madre_registro: reg.madre_registro || '',
      criador: reg.criador || '', propietario: reg.propietario || '', marca: reg.marca || '',
      animal_hato_id: reg.animal_hato_id || '',
      abuelo_p: extras.abuelo_p || '', abuela_p: extras.abuela_p || '',
      abuelo_m: extras.abuelo_m || '', abuela_m: extras.abuela_m || '',
      epd_ced: extras.epds?.CED || '', epd_bw: extras.epds?.BW || '', epd_ww: extras.epds?.WW || '',
      epd_yw: extras.epds?.YW || '', epd_milk: extras.epds?.MILK || '', epd_marb: extras.epds?.MARB || '',
      epd_rea: extras.epds?.REA || '', epd_cw: extras.epds?.CW || '',
      peso_nacimiento: extras.performance?.bw || '', peso_205: extras.performance?.ww || '', peso_365: extras.performance?.yw || ''
    });
    setEditando(reg);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.numero) return alert('El número del animal es obligatorio');
    if (!form.raza) return alert('Selecciona la raza');
    setSaving(true);
    try {
      const datos_extras = {};
      // Pedigree extendido
      if (form.abuelo_p || form.abuela_p || form.abuelo_m || form.abuela_m) {
        datos_extras.abuelo_p = form.abuelo_p; datos_extras.abuela_p = form.abuela_p;
        datos_extras.abuelo_m = form.abuelo_m; datos_extras.abuela_m = form.abuela_m;
      }
      // EPDs (Angus/Red Angus)
      if (form.raza === 'Angus' || form.raza === 'Red Angus') {
        const epds = {};
        if (form.epd_ced) epds.CED = parseFloat(form.epd_ced);
        if (form.epd_bw) epds.BW = parseFloat(form.epd_bw);
        if (form.epd_ww) epds.WW = parseFloat(form.epd_ww);
        if (form.epd_yw) epds.YW = parseFloat(form.epd_yw);
        if (form.epd_milk) epds.MILK = parseFloat(form.epd_milk);
        if (form.epd_marb) epds.MARB = parseFloat(form.epd_marb);
        if (form.epd_rea) epds.REA = parseFloat(form.epd_rea);
        if (form.epd_cw) epds.CW = parseFloat(form.epd_cw);
        if (Object.keys(epds).length > 0) datos_extras.epds = epds;
      }
      // Performance
      if (form.peso_nacimiento || form.peso_205 || form.peso_365) {
        datos_extras.performance = {};
        if (form.peso_nacimiento) datos_extras.performance.bw = form.peso_nacimiento;
        if (form.peso_205) datos_extras.performance.ww = form.peso_205;
        if (form.peso_365) datos_extras.performance.yw = form.peso_365;
      }

      const record = {
        numero: form.numero.trim(), nombre: form.nombre.trim() || null,
        raza: form.raza, sexo: form.sexo, color: form.color || null,
        fecha_nacimiento: form.fecha_nacimiento || null, finca: 'La Vega',
        registro_num: form.registro_num || null, registro_fecha: form.registro_fecha || null,
        asociacion: form.asociacion || null,
        padre_nombre: form.padre_nombre || null, padre_registro: form.padre_registro || null,
        madre_nombre: form.madre_nombre || null, madre_registro: form.madre_registro || null,
        criador: form.criador || null, propietario: form.propietario || null, marca: form.marca || null,
        animal_hato_id: form.animal_hato_id || null,
        datos_extras, registrado_por: userEmail || null
      };

      if (editando) {
        const updated = await db.updateGenealogia(editando.id, record);
        setGenealogia(prev => prev.map(g => g.id === editando.id ? { ...g, ...record, id: editando.id } : g));
        setSuccessMsg('✅ Registro actualizado');
      } else {
        const newRec = await db.insertGenealogia(record);
        setGenealogia(prev => [newRec, ...prev]);
        setSuccessMsg('✅ Registro genealógico creado');
      }
      setShowForm(false); setEditando(null); setForm(initForm);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (e) {
      console.error('Error:', e);
      alert('Error: ' + e.message);
    } finally { setSaving(false); }
  };

  const handleUploadPdf = async (regId, file) => {
    try {
      const url = await db.uploadRegistroPDF(regId, file);
      setGenealogia(prev => prev.map(g => g.id === regId ? { ...g, pdf_url: url, pdf_nombre: file.name } : g));
      setSuccessMsg('✅ PDF subido correctamente');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (e) {
      alert('Error subiendo PDF: ' + e.message);
    }
  };

  // Ficha detallada
  const fichaReg = fichaId ? (genealogia || []).find(g => g.id === fichaId) : null;

  return (
    <div className="space-y-6">
      {successMsg && <div className="bg-green-900/30 border border-green-700 rounded-xl p-4 text-green-400 text-sm font-medium">{successMsg}</div>}

      {/* Header + Stats */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-gray-100 flex items-center gap-2">📋 Registros Genealógicos</h3>
          <p className="text-gray-400 text-sm">{stats.total} animales registrados • {stats.machos} machos • {stats.hembras} hembras • {stats.conPdf} con PDF</p>
        </div>
        <button onClick={() => { setForm(initForm); setEditando(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-medium shadow-lg">
          <PlusCircle size={18} /> Nuevo Registro
        </button>
      </div>

      {/* Stats por raza */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[{ label: 'BON', count: stats.bon, color: 'border-amber-800' }, { label: 'Angus', count: stats.angus, color: 'border-gray-600' }, { label: 'Brangus', count: stats.brangus, color: 'border-purple-800' }, { label: 'Total', count: stats.total, color: 'border-green-800' }].map(s => (
          <div key={s.label} className={`bg-gray-800 rounded-xl p-3 border ${s.color}`}>
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className="text-2xl font-bold text-gray-100">{s.count}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <select value={filtroRaza} onChange={e => setFiltroRaza(e.target.value)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm">
          <option value="">Todas las razas</option>
          {RAZAS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, número, padre o madre..."
            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm placeholder-gray-500" />
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/50 border-b border-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Número</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Raza</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400">Sexo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Padre</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Madre</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Registro</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400">PDF</th>
                <th className="px-2 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {filtrados.map(g => (
                <tr key={g.id} className="hover:bg-gray-800/50 cursor-pointer" onClick={() => setFichaId(g.id)}>
                  <td className="px-4 py-3 font-bold text-green-400">{g.numero}</td>
                  <td className="px-4 py-3 text-gray-200 truncate max-w-[200px]">{g.nombre || '—'}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${RAZA_COLORS[g.raza] || 'bg-gray-700 text-gray-300'}`}>{g.raza}</span></td>
                  <td className="px-4 py-3 text-center">{g.sexo === 'M' ? <span className="text-blue-400">♂</span> : <span className="text-pink-400">♀</span>}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs truncate max-w-[150px]">{g.padre_nombre || '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs truncate max-w-[150px]">{g.madre_nombre || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{g.registro_num || '—'}</td>
                  <td className="px-4 py-3 text-center">{g.pdf_url ? <a href={g.pdf_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-blue-400 hover:text-blue-300">📄</a> : <span className="text-gray-600">—</span>}</td>
                  <td className="px-2 py-3 text-center">
                    <button onClick={(e) => { e.stopPropagation(); openEdit(g); }} className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-gray-700 rounded-lg"><Edit2 size={14} /></button>
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-500">No se encontraron registros genealógicos</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ficha modal */}
      {fichaReg && (
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-[60] p-4 overflow-y-auto" onClick={() => setFichaId(null)}>
          <div className="bg-gray-900 rounded-2xl w-full max-w-2xl border border-gray-700 my-8 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <div>
                <h3 className="text-xl font-bold text-gray-100">{fichaReg.nombre || fichaReg.numero}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${RAZA_COLORS[fichaReg.raza]}`}>{fichaReg.raza}</span>
                  <span className="text-xs text-gray-500">{fichaReg.sexo === 'M' ? '♂ Macho' : '♀ Hembra'}</span>
                  {fichaReg.color && <span className="text-xs text-gray-500">• {fichaReg.color}</span>}
                  {fichaReg.registro_num && <span className="text-xs text-gray-400">• Reg: {fichaReg.registro_num}</span>}
                </div>
              </div>
              <button onClick={() => setFichaId(null)} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Datos básicos */}
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">Datos del Animal</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <div><span className="text-gray-500">Número</span><p className="text-gray-200 font-medium">{fichaReg.numero}</p></div>
                  {fichaReg.fecha_nacimiento && <div><span className="text-gray-500">Nacimiento</span><p className="text-gray-200">{formatDate(fichaReg.fecha_nacimiento)}</p></div>}
                  {fichaReg.asociacion && <div><span className="text-gray-500">Asociación</span><p className="text-gray-200">{fichaReg.asociacion}</p></div>}
                  {fichaReg.criador && <div><span className="text-gray-500">Criador</span><p className="text-gray-200">{fichaReg.criador}</p></div>}
                  {fichaReg.propietario && <div><span className="text-gray-500">Propietario</span><p className="text-gray-200">{fichaReg.propietario}</p></div>}
                  {fichaReg.animal_hato_id && <div><span className="text-gray-500">Animal Hato</span><p><AnimalLink id={fichaReg.animal_hato_id} onAnimalClick={onAnimalClick} /></p></div>}
                </div>
              </div>

              {/* Árbol de pedigree */}
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">🌳 Pedigree</h4>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-20 text-right text-gray-500 text-xs font-medium">Padre</div>
                    <div className="flex-1 bg-blue-900/20 border border-blue-800/50 rounded-lg px-3 py-2">
                      <p className="text-blue-300 font-medium">{fichaReg.padre_nombre || '—'}</p>
                      {fichaReg.padre_registro && <p className="text-blue-400/60 text-xs">Reg: {fichaReg.padre_registro}</p>}
                    </div>
                  </div>
                  {(fichaReg.datos_extras?.abuelo_p || fichaReg.datos_extras?.abuela_p) && (
                    <div className="flex items-center gap-3 pl-12">
                      <div className="w-8 text-right text-gray-600 text-[10px]">AP</div>
                      <div className="flex-1 bg-gray-700/50 rounded px-2 py-1 text-xs text-gray-400">{fichaReg.datos_extras.abuelo_p || '—'}</div>
                      <div className="w-8 text-right text-gray-600 text-[10px]">AM-P</div>
                      <div className="flex-1 bg-gray-700/50 rounded px-2 py-1 text-xs text-gray-400">{fichaReg.datos_extras.abuela_p || '—'}</div>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <div className="w-20 text-right text-gray-500 text-xs font-medium">Madre</div>
                    <div className="flex-1 bg-pink-900/20 border border-pink-800/50 rounded-lg px-3 py-2">
                      <p className="text-pink-300 font-medium">{fichaReg.madre_nombre || '—'}</p>
                      {fichaReg.madre_registro && <p className="text-pink-400/60 text-xs">Reg: {fichaReg.madre_registro}</p>}
                    </div>
                  </div>
                  {(fichaReg.datos_extras?.abuelo_m || fichaReg.datos_extras?.abuela_m) && (
                    <div className="flex items-center gap-3 pl-12">
                      <div className="w-8 text-right text-gray-600 text-[10px]">AP-M</div>
                      <div className="flex-1 bg-gray-700/50 rounded px-2 py-1 text-xs text-gray-400">{fichaReg.datos_extras.abuelo_m || '—'}</div>
                      <div className="w-8 text-right text-gray-600 text-[10px]">AM</div>
                      <div className="flex-1 bg-gray-700/50 rounded px-2 py-1 text-xs text-gray-400">{fichaReg.datos_extras.abuela_m || '—'}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* EPDs (solo Angus) */}
              {fichaReg.datos_extras?.epds && Object.keys(fichaReg.datos_extras.epds).length > 0 && (
                <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">📊 EPDs</h4>
                  <div className="grid grid-cols-4 gap-2">
                    {Object.entries(fichaReg.datos_extras.epds).map(([k, v]) => (
                      <div key={k} className="bg-gray-700/50 rounded-lg p-2 text-center">
                        <p className="text-[10px] text-gray-500 uppercase">{k}</p>
                        <p className="text-sm font-bold text-gray-200">{typeof v === 'number' ? (v >= 0 ? '+' : '') + v : v}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Performance */}
              {fichaReg.datos_extras?.performance && (
                <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">⚖️ Performance</h4>
                  <div className="flex gap-4 text-sm">
                    {fichaReg.datos_extras.performance.bw && <div><span className="text-gray-500">Peso Nacer</span><p className="text-gray-200 font-medium">{fichaReg.datos_extras.performance.bw}</p></div>}
                    {fichaReg.datos_extras.performance.ww && <div><span className="text-gray-500">Peso 205d</span><p className="text-gray-200 font-medium">{fichaReg.datos_extras.performance.ww}</p></div>}
                    {fichaReg.datos_extras.performance.yw && <div><span className="text-gray-500">Peso 365d</span><p className="text-gray-200 font-medium">{fichaReg.datos_extras.performance.yw}</p></div>}
                  </div>
                </div>
              )}

              {/* PDF */}
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">📄 Registro PDF</h4>
                {fichaReg.pdf_url ? (
                  <a href={fichaReg.pdf_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 text-sm underline">{fichaReg.pdf_nombre || 'Ver PDF'}</a>
                ) : (
                  <div>
                    <p className="text-gray-500 text-sm mb-2">Sin PDF adjunto</p>
                    <label className="inline-flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 cursor-pointer transition-colors">
                      <Upload size={14} /> Subir PDF
                      <input type="file" accept=".pdf" className="hidden" onChange={e => { if (e.target.files[0]) handleUploadPdf(fichaReg.id, e.target.files[0]); }} />
                    </label>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-gray-800 flex justify-between">
              <button onClick={() => { openEdit(fichaReg); setFichaId(null); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"><Edit2 size={14} className="inline mr-1" />Editar</button>
              <button onClick={() => setFichaId(null)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-[60] p-4 overflow-y-auto" onClick={() => setShowForm(false)}>
          <div className="bg-gray-900 rounded-2xl w-full max-w-2xl border border-gray-700 my-8 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-800">
              <h3 className="text-lg font-bold text-gray-100">{editando ? '✏️ Editar Registro' : '📋 Nuevo Registro Genealógico'}</h3>
            </div>
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Datos básicos */}
              <p className="text-xs text-gray-500 font-semibold uppercase">Datos del Animal</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Número *</label>
                  <input type="text" value={form.numero} onChange={e => setForm({ ...form, numero: e.target.value })}
                    placeholder="Ej: M477-18" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Nombre Completo</label>
                  <input type="text" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })}
                    placeholder="Ej: HATOVIEJO SANTERO M477-18 T.E" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Raza *</label>
                  <select value={form.raza} onChange={e => handleRazaChange(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm">
                    {RAZAS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Sexo</label>
                  <select value={form.sexo} onChange={e => setForm({ ...form, sexo: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm">
                    <option value="M">♂ Macho</option><option value="H">♀ Hembra</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Color</label>
                  <input type="text" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })}
                    placeholder="Negro, Rojo..." className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Fecha Nacimiento</label>
                  <input type="date" value={form.fecha_nacimiento} onChange={e => setForm({ ...form, fecha_nacimiento: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1"># Registro</label>
                  <input type="text" value={form.registro_num} onChange={e => setForm({ ...form, registro_num: e.target.value })}
                    placeholder="BON-018065" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Asociación</label>
                  <input type="text" value={form.asociacion} onChange={e => setForm({ ...form, asociacion: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" />
                </div>
              </div>

              {/* Genealogía */}
              <p className="text-xs text-gray-500 font-semibold uppercase mt-4">Genealogía</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-400 mb-1">Padre — Nombre</label>
                  <input type="text" value={form.padre_nombre} onChange={e => setForm({ ...form, padre_nombre: e.target.value })} placeholder="Nombre del padre" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" /></div>
                <div><label className="block text-xs text-gray-400 mb-1">Padre — Registro</label>
                  <input type="text" value={form.padre_registro} onChange={e => setForm({ ...form, padre_registro: e.target.value })} placeholder="# registro" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" /></div>
                <div><label className="block text-xs text-gray-400 mb-1">Madre — Nombre</label>
                  <input type="text" value={form.madre_nombre} onChange={e => setForm({ ...form, madre_nombre: e.target.value })} placeholder="Nombre de la madre" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" /></div>
                <div><label className="block text-xs text-gray-400 mb-1">Madre — Registro</label>
                  <input type="text" value={form.madre_registro} onChange={e => setForm({ ...form, madre_registro: e.target.value })} placeholder="# registro" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" /></div>
              </div>

              {/* Abuelos */}
              <p className="text-xs text-gray-500 font-semibold uppercase mt-2">Abuelos (opcional)</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-400 mb-1">Abuelo Paterno</label>
                  <input type="text" value={form.abuelo_p} onChange={e => setForm({ ...form, abuelo_p: e.target.value })} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" /></div>
                <div><label className="block text-xs text-gray-400 mb-1">Abuela Paterna</label>
                  <input type="text" value={form.abuela_p} onChange={e => setForm({ ...form, abuela_p: e.target.value })} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" /></div>
                <div><label className="block text-xs text-gray-400 mb-1">Abuelo Materno</label>
                  <input type="text" value={form.abuelo_m} onChange={e => setForm({ ...form, abuelo_m: e.target.value })} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" /></div>
                <div><label className="block text-xs text-gray-400 mb-1">Abuela Materna</label>
                  <input type="text" value={form.abuela_m} onChange={e => setForm({ ...form, abuela_m: e.target.value })} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" /></div>
              </div>

              {/* EPDs — solo Angus/Red Angus */}
              {(form.raza === 'Angus' || form.raza === 'Red Angus') && (<>
                <p className="text-xs text-gray-500 font-semibold uppercase mt-4">EPDs (Angus)</p>
                <div className="grid grid-cols-4 gap-3">
                  {[['CED','epd_ced'], ['BW','epd_bw'], ['WW','epd_ww'], ['YW','epd_yw'], ['MILK','epd_milk'], ['MARB','epd_marb'], ['REA','epd_rea'], ['CW','epd_cw']].map(([label, key]) => (
                    <div key={key}><label className="block text-[10px] text-gray-400 mb-1">{label}</label>
                      <input type="text" value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm text-center" /></div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 font-semibold uppercase mt-2">Performance</p>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="block text-xs text-gray-400 mb-1">Peso Nacer</label>
                    <input type="text" value={form.peso_nacimiento} onChange={e => setForm({ ...form, peso_nacimiento: e.target.value })} placeholder="85 Lbs" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" /></div>
                  <div><label className="block text-xs text-gray-400 mb-1">Peso 205d</label>
                    <input type="text" value={form.peso_205} onChange={e => setForm({ ...form, peso_205: e.target.value })} placeholder="825 Lbs" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" /></div>
                  <div><label className="block text-xs text-gray-400 mb-1">Peso 365d</label>
                    <input type="text" value={form.peso_365} onChange={e => setForm({ ...form, peso_365: e.target.value })} placeholder="1265 Lbs" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" /></div>
                </div>
              </>)}

              {/* Criador / Propietario */}
              <p className="text-xs text-gray-500 font-semibold uppercase mt-4">Propiedad</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-400 mb-1">Criador</label>
                  <input type="text" value={form.criador} onChange={e => setForm({ ...form, criador: e.target.value })} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" /></div>
                <div><label className="block text-xs text-gray-400 mb-1">Propietario</label>
                  <input type="text" value={form.propietario} onChange={e => setForm({ ...form, propietario: e.target.value })} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" /></div>
              </div>

              {/* Vincular con hato */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Vincular con Animal del Hato (número)</label>
                <input type="text" value={form.animal_hato_id} onChange={e => setForm({ ...form, animal_hato_id: e.target.value })}
                  placeholder="Ej: 09-4 (si el animal existe en nacimientos)" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" />
              </div>
            </div>

            <div className="p-5 border-t border-gray-800 flex justify-end gap-3">
              <button onClick={() => { setShowForm(false); setEditando(null); }} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm">Cancelar</button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-40">
                {saving ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : <><Check size={14} /> {editando ? 'Actualizar' : 'Guardar'}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== COMPONENTE PESAJES MANUAL ====================
function PesajesManualView({ finca, pesajes, setPesajes, nacimientos, userEmail, isOnline, onAnimalClick }) {
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [busqueda, setBusqueda] = useState('');
  const [showList, setShowList] = useState(false);
  const [selectedAnimals, setSelectedAnimals] = useState([]); // [{id, ...}]
  const [pesos, setPesos] = useState({}); // {animalId: peso}

  // Animales activos de esta finca
  const animalesFinca = useMemo(() => {
    const mapa = {};
    (nacimientos || []).forEach(n => {
      if (!n.cria || n.estado !== 'Activo') return;
      const id = String(n.cria).trim();
      if (!esAnimalValido(id)) return;
      const f = n.fincaDB || 'La Vega';
      if (f !== finca) return;
      mapa[id] = { id, finca: f, sexo: n.sexo, fechaNac: n.fecha, pesoNacer: n.pesoNacer || n.peso_nacer };
    });
    // Bariloche animals from pesajes
    if (finca === 'Bariloche') {
      (pesajes || []).filter(p => p.finca === 'Bariloche' && p.animal && esAnimalValido(p.animal)).forEach(p => {
        const id = String(p.animal).trim();
        const nacReg = (nacimientos || []).find(n => String(n.cria).trim() === id);
        if (nacReg && nacReg.estado !== 'Activo') return;
        if (!mapa[id]) mapa[id] = { id, finca: 'Bariloche', sexo: nacReg?.sexo, fechaNac: nacReg?.fecha, pesoNacer: nacReg?.pesoNacer || nacReg?.peso_nacer };
      });
    }
    return Object.values(mapa).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }, [nacimientos, pesajes, finca]);

  const filtrados = useMemo(() => {
    if (!busqueda) return animalesFinca.slice(0, 30);
    const q = busqueda.toLowerCase();
    return animalesFinca.filter(a => a.id.toLowerCase().includes(q)).slice(0, 30);
  }, [animalesFinca, busqueda]);

  const addAnimal = (animal) => {
    if (selectedAnimals.find(a => a.id === animal.id)) return;
    setSelectedAnimals(prev => [...prev, animal]);
    // Pre-fill with last known weight
    const lastPesaje = (pesajes || []).filter(p => String(p.animal).trim() === animal.id).sort((a, b) => (b.fecha_pesaje || '').localeCompare(a.fecha_pesaje || ''))[0];
    if (lastPesaje?.peso) setPesos(prev => ({ ...prev, [animal.id]: '' })); // leave empty for manual input
    setBusqueda('');
    setShowList(false);
  };

  const removeAnimal = (id) => {
    setSelectedAnimals(prev => prev.filter(a => a.id !== id));
    setPesos(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  // Get last pesaje info for each selected animal
  const getLastPesaje = (animalId) => {
    return (pesajes || []).filter(p => String(p.animal).trim() === animalId && p.finca === finca)
      .sort((a, b) => (b.fecha_pesaje || '').localeCompare(a.fecha_pesaje || ''))[0] || null;
  };

  const handleSave = async () => {
    if (selectedAnimals.length === 0) return alert('Selecciona al menos un animal');
    if (!fecha) return alert('Selecciona la fecha');
    const sinPeso = selectedAnimals.filter(a => !pesos[a.id] || parseFloat(pesos[a.id]) <= 0);
    if (sinPeso.length > 0) return alert(`Falta el peso de: ${sinPeso.map(a => a.id).join(', ')}`);

    setSaving(true);
    try {
      const registros = selectedAnimals.map(a => {
        const pesoActual = parseFloat(pesos[a.id]);
        const fechaNac = a.fechaNac;
        let edadMeses = null;
        let gdpVida = null;

        if (fechaNac && fechaNac !== '1900-01-01') {
          const nacDate = new Date(fechaNac + 'T00:00:00');
          const pesDate = new Date(fecha + 'T00:00:00');
          const diffDias = Math.round((pesDate - nacDate) / (1000 * 60 * 60 * 24));
          edadMeses = diffDias > 0 ? Math.round((diffDias / 30.44) * 10) / 10 : null;
          const pesoNacer = a.pesoNacer || 0;
          if (diffDias > 0 && pesoActual > pesoNacer) {
            gdpVida = Math.round(((pesoActual - pesoNacer) / diffDias) * 1000);
          }
        }

        return {
          animal: a.id,
          fecha_pesaje: fecha,
          peso: pesoActual,
          finca: finca,
          edad_meses: edadMeses,
          gdp_vida: gdpVida
        };
      });

      await db.insertPesajesBatch(registros);
      setPesajes(prev => [...registros, ...prev]);

      setSuccessMsg(`✅ ${selectedAnimals.length} pesaje(s) registrado(s) — ${fecha}`);
      setSelectedAnimals([]);
      setPesos({});
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (e) {
      console.error('Error registrando pesajes:', e);
      alert('Error al registrar pesajes: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // Pesajes recientes de esta finca
  const pesajesRecientes = useMemo(() => {
    return (pesajes || []).filter(p => p.finca === finca).sort((a, b) => (b.fecha_pesaje || '').localeCompare(a.fecha_pesaje || '')).slice(0, 30);
  }, [pesajes, finca]);

  return (
    <div className="space-y-6">
      {successMsg && (
        <div className="bg-green-900/30 border border-green-700 rounded-xl p-4 text-green-400 text-sm font-medium">{successMsg}</div>
      )}

      {/* Formulario */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-5">
        <h3 className="text-lg font-semibold text-gray-100 flex items-center gap-2">⚖️ Registrar Pesaje — {finca}</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Fecha del Pesaje</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Buscar Animal</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input type="text" value={busqueda}
                onChange={e => { setBusqueda(e.target.value); setShowList(true); }}
                onFocus={() => setShowList(true)}
                placeholder="Número del animal..."
                className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm placeholder-gray-500" />
              {showList && (
                <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-xl max-h-60 overflow-y-auto shadow-2xl">
                  {filtrados.length === 0 && <p className="px-4 py-3 text-sm text-gray-500">No se encontró</p>}
                  {filtrados.map(a => {
                    const isSel = selectedAnimals.find(s => s.id === a.id);
                    const lastP = getLastPesaje(a.id);
                    return (
                      <button key={a.id} type="button" disabled={!!isSel}
                        onClick={() => addAnimal(a)}
                        className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between transition-colors ${isSel ? 'bg-green-900/20 text-green-400' : 'text-gray-200 hover:bg-gray-700'}`}>
                        <span className="font-bold text-green-400">{a.id}</span>
                        <span className="text-xs text-gray-500">{lastP ? `Últ: ${Math.round(lastP.peso)} kg (${formatDate(lastP.fecha_pesaje)})` : 'Sin pesajes'}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {showList && <div className="fixed inset-0 z-40" onClick={() => setShowList(false)} />}
          </div>
        </div>

        {/* Animales seleccionados con peso y ganancia */}
        {selectedAnimals.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">Animales a pesar ({selectedAnimals.length})</label>
            <div className="space-y-2">
              {selectedAnimals.map(a => {
                const lastP = getLastPesaje(a.id);
                const pesoActual = parseFloat(pesos[a.id]) || 0;
                const pesoAnterior = lastP?.peso || 0;
                const gananciaKg = pesoActual > 0 && pesoAnterior > 0 ? pesoActual - pesoAnterior : null;
                // Días entre pesajes
                let gananciaGDia = null;
                if (gananciaKg !== null && lastP?.fecha_pesaje && fecha) {
                  const dias = Math.round((new Date(fecha + 'T00:00:00') - new Date(lastP.fecha_pesaje + 'T00:00:00')) / (1000 * 60 * 60 * 24));
                  if (dias > 0) gananciaGDia = Math.round((gananciaKg / dias) * 1000);
                }
                // GDP vida
                let gdpVida = null;
                if (a.fechaNac && a.fechaNac !== '1900-01-01' && pesoActual > 0) {
                  const diasVida = Math.round((new Date(fecha + 'T00:00:00') - new Date(a.fechaNac + 'T00:00:00')) / (1000 * 60 * 60 * 24));
                  const pesoNacer = a.pesoNacer || 0;
                  if (diasVida > 0 && pesoActual > pesoNacer) gdpVida = Math.round(((pesoActual - pesoNacer) / diasVida) * 1000);
                }

                return (
                  <div key={a.id} className="bg-gray-800 rounded-xl p-3 border border-gray-700">
                    <div className="flex items-center gap-3 flex-wrap">
                      <button onClick={() => removeAnimal(a.id)} className="p-1 text-red-400 hover:bg-red-900/30 rounded-lg"><X size={16} /></button>
                      <span className="font-bold text-green-400 text-sm w-16">{a.id}</span>
                      {lastP && <span className="text-xs text-gray-500">Anterior: {Math.round(pesoAnterior)} kg ({formatDate(lastP.fecha_pesaje)})</span>}
                      <div className="flex items-center gap-2 ml-auto">
                        <input type="number" step="1"
                          value={pesos[a.id] || ''}
                          onChange={e => setPesos(prev => ({ ...prev, [a.id]: e.target.value }))}
                          placeholder="Peso kg"
                          className="w-28 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-gray-200 text-sm text-right" />
                        <span className="text-xs text-gray-500">kg</span>
                      </div>
                    </div>
                    {/* Indicadores automáticos */}
                    {pesoActual > 0 && (
                      <div className="flex flex-wrap gap-4 mt-2 pl-8 text-xs">
                        {gananciaKg !== null && (
                          <span className={gananciaKg >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {gananciaKg >= 0 ? '+' : ''}{Math.round(gananciaKg)} kg vs anterior
                          </span>
                        )}
                        {gananciaGDia !== null && (
                          <span className={gananciaGDia >= 500 ? 'text-green-400' : gananciaGDia >= 300 ? 'text-amber-400' : 'text-red-400'}>
                            📈 {gananciaGDia} g/día entre pesajes
                          </span>
                        )}
                        {gdpVida !== null && (
                          <span className={gdpVida >= 600 ? 'text-green-400' : gdpVida >= 400 ? 'text-amber-400' : 'text-red-400'}>
                            🐂 GDP vida: {gdpVida} g/día
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Save button */}
            <div className="flex justify-end mt-4">
              <button onClick={handleSave} disabled={saving || !isOnline}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium text-sm flex items-center gap-2 shadow-lg shadow-green-600/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                {saving ? <><Loader2 size={16} className="animate-spin" /> Guardando...</> : <><Check size={16} /> Registrar Pesaje(s)</>}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Historial reciente */}
      {pesajesRecientes.length > 0 && (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
          <h3 className="text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2">
            <Clock size={18} className="text-gray-400" /> Pesajes Recientes — {finca} ({pesajesRecientes.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500 text-xs">
                  <th className="text-left py-2 px-2">Fecha</th>
                  <th className="text-left py-2 px-2">Animal</th>
                  <th className="text-right py-2 px-2">Peso</th>
                  <th className="text-right py-2 px-2">Edad (m)</th>
                  <th className="text-right py-2 px-2">GDP Vida</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {pesajesRecientes.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-800/50">
                    <td className="py-2 px-2 text-gray-300">{formatDate(r.fecha_pesaje)}</td>
                    <td className="py-2 px-2"><AnimalLink id={r.animal} onAnimalClick={onAnimalClick} className="text-green-400 font-bold text-sm" /></td>
                    <td className="py-2 px-2 text-right text-gray-200 font-medium">{r.peso ? `${Math.round(r.peso)} kg` : '—'}</td>
                    <td className="py-2 px-2 text-right text-gray-400">{r.edad_meses ? r.edad_meses.toFixed(1) : '—'}</td>
                    <td className="py-2 px-2 text-right"><span className={r.gdp_vida ? (r.gdp_vida >= 600 ? 'text-green-400' : r.gdp_vida >= 400 ? 'text-amber-400' : 'text-red-400') : 'text-gray-500'}>{r.gdp_vida ? `${Math.round(r.gdp_vida)} g/d` : '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== COMPONENTE SERVICIOS IA/TE ====================
function ServiciosView({ servicios, setServicios, userEmail, nacimientos, isOnline, onAnimalClick }) {
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');

  const emptyForm = {
    fecha: new Date().toISOString().split('T')[0],
    hembra: '', tipo: 'IA', toro: '', tecnico: '',
    donadora: '', embrion: '', num_servicio: '',
    observaciones: '', finca: 'La Vega'
  };
  const [form, setForm] = useState(emptyForm);

  const hembrasConocidas = useMemo(() => {
    const hembras = new Set();
    (nacimientos || []).forEach(n => {
      if (n.madre) hembras.add(n.madre.trim());
      if (n.cria && (n.sexo === 'H' || n.sexo === 'h')) hembras.add(String(n.cria).trim());
    });
    return [...hembras].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [nacimientos]);

  const servLaVega = useMemo(() =>
    (servicios || []).filter(s => s.finca === 'La Vega').sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')),
    [servicios]);

  const filtrados = useMemo(() => {
    let list = servLaVega;
    if (filtroTipo !== 'todos') list = list.filter(s => s.tipo === filtroTipo);
    if (!busqueda.trim()) return list;
    const q = busqueda.toLowerCase();
    return list.filter(s =>
      (s.hembra || '').toLowerCase().includes(q) ||
      (s.toro || '').toLowerCase().includes(q) ||
      (s.tecnico || '').toLowerCase().includes(q) ||
      (s.donadora || '').toLowerCase().includes(q)
    );
  }, [servLaVega, busqueda, filtroTipo]);

  const stats = useMemo(() => {
    const ia = servLaVega.filter(s => s.tipo === 'IA').length;
    const te = servLaVega.filter(s => s.tipo === 'TE').length;
    return { ia, te, total: ia + te };
  }, [servLaVega]);

  const openNew = () => { setForm(emptyForm); setEditando(null); setShowForm(true); };
  const openEdit = (s) => {
    setForm({
      fecha: s.fecha || '', hembra: s.hembra || '', tipo: s.tipo || 'IA',
      toro: s.toro || '', tecnico: s.tecnico || '',
      donadora: s.donadora || '', embrion: s.embrion || '',
      num_servicio: s.num_servicio || '', observaciones: s.observaciones || '',
      finca: 'La Vega'
    });
    setEditando(s); setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.fecha || !form.hembra) return alert('Fecha y Hembra son obligatorios');
    if (form.tipo === 'IA' && !form.toro) return alert('Debe indicar la pajilla (toro)');
    if (form.tipo === 'TE' && !form.embrion) return alert('Debe indicar el embrión');
    setSaving(true);
    try {
      const registro = {
        ...form,
        num_servicio: form.num_servicio ? parseInt(form.num_servicio) : null,
        registrado_por: userEmail || 'manual',
      };
      // Remove TE-only fields if IA
      if (form.tipo === 'IA') { registro.donadora = null; registro.embrion = null; }
      if (editando) {
        const updated = await db.updateServicio(editando.id, registro);
        setServicios(prev => prev.map(s => s.id === editando.id ? updated : s));
      } else {
        const nuevo = await db.insertServicio(registro);
        setServicios(prev => [nuevo, ...prev]);
      }
      setShowForm(false); setEditando(null);
    } catch (err) {
      alert('Error al guardar: ' + err.message);
    }
    setSaving(false);
  };

  const handleDelete = async (s) => {
    try {
      await db.deleteServicio(s.id);
      setServicios(prev => prev.filter(x => x.id !== s.id));
      setConfirmDel(null);
    } catch (err) { alert('Error: ' + err.message); }
  };

  const F = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-center">
          <p className="text-2xl font-bold text-blue-400">{stats.total}</p>
          <p className="text-xs text-gray-400">Total Servicios</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-center">
          <p className="text-2xl font-bold text-cyan-400">{stats.ia}</p>
          <p className="text-xs text-gray-400">Inseminaciones</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-center">
          <p className="text-2xl font-bold text-purple-400">{stats.te}</p>
          <p className="text-xs text-gray-400">Transf. Embriones</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar hembra, toro, técnico..." className="flex-1 min-w-[200px] px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200" />
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200">
          <option value="todos">Todos</option>
          <option value="IA">IA - Inseminación</option>
          <option value="TE">TE - Transf. Embrión</option>
        </select>
        {isOnline && (
          <button onClick={openNew} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium text-white flex items-center gap-2">
            + Registrar Servicio
          </button>
        )}
      </div>

      {/* Modal Form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto border border-gray-600" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-100 mb-4">{editando ? '✏️ Editar Servicio' : '🧬 Nuevo Servicio IA/TE'}</h3>
            <div className="space-y-3">
              {/* Tipo */}
              <div>
                <label className="text-xs text-gray-400">Tipo de Servicio *</label>
                <div className="flex gap-2 mt-1">
                  {['IA', 'TE'].map(t => (
                    <button key={t} onClick={() => F('tipo', t)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${form.tipo === t ? (t === 'IA' ? 'bg-cyan-600 text-white' : 'bg-purple-600 text-white') : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>
                      {t === 'IA' ? '💉 Inseminación Artificial' : '🧬 Transf. Embriones'}
                    </button>
                  ))}
                </div>
              </div>
              {/* Fecha */}
              <div>
                <label className="text-xs text-gray-400">Fecha *</label>
                <input type="date" value={form.fecha} onChange={e => F('fecha', e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-200" />
              </div>
              {/* Hembra */}
              <div>
                <label className="text-xs text-gray-400">Hembra *</label>
                <input list="hembras-serv" value={form.hembra} onChange={e => F('hembra', e.target.value)}
                  placeholder="Número de la hembra" className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-200" />
                <datalist id="hembras-serv">{hembrasConocidas.map(h => <option key={h} value={h} />)}</datalist>
              </div>
              {/* Técnico */}
              <div>
                <label className="text-xs text-gray-400">Técnico / Responsable</label>
                <input value={form.tecnico} onChange={e => F('tecnico', e.target.value)}
                  placeholder="Nombre del técnico" className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-200" />
              </div>
              {/* IA: Pajilla / Toro */}
              {form.tipo === 'IA' && (
                <div>
                  <label className="text-xs text-gray-400">Pajilla (Toro) *</label>
                  <input value={form.toro} onChange={e => F('toro', e.target.value)}
                    placeholder="Nombre del toro / pajilla" className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-200" />
                </div>
              )}
              {/* TE fields */}
              {form.tipo === 'TE' && (<>
                <div>
                  <label className="text-xs text-gray-400">Embrión *</label>
                  <input value={form.embrion} onChange={e => F('embrion', e.target.value)}
                    placeholder="Identificación del embrión" className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-200" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Madre Donadora</label>
                  <input value={form.donadora} onChange={e => F('donadora', e.target.value)}
                    placeholder="Nombre/número de la donadora" className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-200" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Padre (Toro)</label>
                  <input value={form.toro} onChange={e => F('toro', e.target.value)}
                    placeholder="Nombre del padre" className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-200" />
                </div>
              </>)}
              {/* # Servicio */}
              <div>
                <label className="text-xs text-gray-400"># Servicio</label>
                <input type="number" value={form.num_servicio} onChange={e => F('num_servicio', e.target.value)}
                  placeholder="Número de servicio" className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-200" />
              </div>
              {/* Observaciones */}
              <div>
                <label className="text-xs text-gray-400">Observaciones</label>
                <textarea value={form.observaciones} onChange={e => F('observaciones', e.target.value)}
                  rows={2} placeholder="Notas adicionales..." className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-200 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300">Cancelar</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium text-white disabled:opacity-50">
                {saving ? 'Guardando...' : editando ? 'Actualizar' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmDel && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setConfirmDel(null)}>
          <div className="bg-gray-800 rounded-xl p-6 max-w-sm border border-gray-600" onClick={e => e.stopPropagation()}>
            <p className="text-gray-200 mb-4">¿Eliminar servicio de <strong>{confirmDel.hembra}</strong> del {formatDate(confirmDel.fecha)}?</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDel(null)} className="flex-1 py-2 bg-gray-700 rounded-lg text-sm text-gray-300">Cancelar</button>
              <button onClick={() => handleDelete(confirmDel)} className="flex-1 py-2 bg-red-600 rounded-lg text-sm text-white">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-2">
        {filtrados.length === 0 ? (
          <div className="text-center text-gray-500 py-8">No hay servicios registrados{busqueda ? ' con ese filtro' : ''}</div>
        ) : filtrados.map(s => (
          <div key={s.id} className="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-gray-500 transition-all">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${s.tipo === 'TE' ? 'bg-purple-500/20 text-purple-400' : 'bg-cyan-500/20 text-cyan-400'}`}>
                  {s.tipo || 'IA'}
                </span>
                <AnimalLink id={s.hembra} onAnimalClick={onAnimalClick} className="text-lg font-bold" />
                <span className="text-sm text-gray-400">{formatDate(s.fecha)}</span>
              </div>
              {isOnline && (
                <div className="flex gap-1">
                  <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-gray-700 text-blue-400 text-xs">✏️</button>
                  <button onClick={() => setConfirmDel(s)} className="p-1.5 rounded-lg hover:bg-gray-700 text-red-400 text-xs">🗑️</button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              {s.tipo === 'IA' && s.toro && (
                <div><span className="text-gray-500">Pajilla:</span> <span className="text-gray-200 font-medium">{s.toro}</span></div>
              )}
              {s.tipo === 'TE' && (<>
                {s.embrion && <div><span className="text-gray-500">Embrión:</span> <span className="text-gray-200 font-medium">{s.embrion}</span></div>}
                {s.donadora && <div><span className="text-gray-500">Donadora:</span> <AnimalLink id={s.donadora} onAnimalClick={onAnimalClick} /></div>}
                {s.toro && <div><span className="text-gray-500">Padre:</span> <span className="text-gray-200">{s.toro}</span></div>}
              </>)}
              {s.tecnico && <div><span className="text-gray-500">Técnico:</span> <span className="text-gray-200">{s.tecnico}</span></div>}
              {s.num_servicio && <div><span className="text-gray-500"># Servicio:</span> <span className="text-gray-200">{s.num_servicio}</span></div>}
            </div>
            {s.observaciones && <p className="text-xs text-gray-500 mt-2 italic">{s.observaciones}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== COMPONENTE LLUVIAS ====================
const PLUVIOMETROS = {
  'La Vega': ['Casa', 'Sector 1', 'Sector 2.1', 'Sector 3'],
  'Bariloche': ['Casa', 'Sector 2', 'Sector 4']
};

function LluviasView({ finca, lluvias, setLluvias, userEmail, añoSel }) {
  const [showForm, setShowForm] = useState(false);
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [valores, setValores] = useState({});
  const [saving, setSaving] = useState(false);
  const [editando, setEditando] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [mesSel, setMesSel] = useState('todos');

  const pluvs = PLUVIOMETROS[finca] || [];

  const lluviasFinca = useMemo(() =>
    (lluvias || []).filter(l => l.finca === finca),
    [lluvias, finca]);

  const añoNum = añoSel === 'todos' ? null : parseInt(añoSel);

  const lluviasAño = useMemo(() => {
    if (!añoNum) return lluviasFinca;
    return lluviasFinca.filter(l => l.fecha && l.fecha.startsWith(String(añoNum)));
  }, [lluviasFinca, añoNum]);

  const lluviasMes = useMemo(() => {
    if (mesSel === 'todos') return lluviasAño;
    return lluviasAño.filter(l => {
      const m = l.fecha ? parseInt(l.fecha.split('-')[1]) : 0;
      return m === parseInt(mesSel);
    });
  }, [lluviasAño, mesSel]);

  const porFecha = useMemo(() => {
    const map = new Map();
    lluviasMes.forEach(l => {
      if (!map.has(l.fecha)) map.set(l.fecha, []);
      map.get(l.fecha).push(l);
    });
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [lluviasMes]);

  // Resumen mensual - PROMEDIOS de pluviómetros por mes
  const resumenMensual = useMemo(() => {
    const meses = {};
    lluviasAño.forEach(l => {
      if (!l.fecha) return;
      const m = parseInt(l.fecha.split('-')[1]);
      if (!meses[m]) meses[m] = { porPluv: {}, dias: new Set() };
      meses[m].dias.add(l.fecha);
      if (!meses[m].porPluv[l.pluviometro]) meses[m].porPluv[l.pluviometro] = 0;
      meses[m].porPluv[l.pluviometro] += parseFloat(l.mm) || 0;
    });
    const nombresMes = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return Array.from({ length: 12 }, (_, i) => {
      const data = meses[i + 1];
      if (!data) return { mes: i + 1, nombre: nombresMes[i + 1], total: 0, dias: 0, porPluv: {} };
      const pluvVals = Object.values(data.porPluv);
      const promedio = pluvVals.length > 0 ? pluvVals.reduce((s, v) => s + v, 0) / pluvVals.length : 0;
      return { mes: i + 1, nombre: nombresMes[i + 1], total: Math.round(promedio), dias: data.dias.size, porPluv: data.porPluv };
    });
  }, [lluviasAño]);

  const maxMensual = Math.max(...resumenMensual.map(m => m.total), 1);
  const totalAnual = resumenMensual.reduce((s, m) => s + m.total, 0);

  const mesesDisponibles = useMemo(() => {
    const ms = new Set();
    lluviasAño.forEach(l => { if (l.fecha) ms.add(parseInt(l.fecha.split('-')[1])); });
    return [...ms].sort((a, b) => a - b);
  }, [lluviasAño]);

  const nombresMesFull = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  // Comparativo anual
  const comparativoAnual = useMemo(() => {
    const porAño = {};
    lluviasFinca.forEach(l => {
      if (!l.fecha) return;
      const a = parseInt(l.fecha.split('-')[0]);
      const m = parseInt(l.fecha.split('-')[1]);
      if (!porAño[a]) porAño[a] = {};
      if (!porAño[a][m]) porAño[a][m] = { porPluv: {} };
      if (!porAño[a][m].porPluv[l.pluviometro]) porAño[a][m].porPluv[l.pluviometro] = 0;
      porAño[a][m].porPluv[l.pluviometro] += parseFloat(l.mm) || 0;
    });
    const años = Object.keys(porAño).map(Number).sort().slice(-5);
    return años.map(a => {
      const meses = Array.from({ length: 12 }, (_, i) => {
        const data = porAño[a]?.[i + 1];
        if (!data) return 0;
        const vals = Object.values(data.porPluv);
        return vals.length > 0 ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
      });
      return { año: a, meses, total: meses.reduce((s, v) => s + v, 0) };
    });
  }, [lluviasFinca]);

  const maxAnual = Math.max(...comparativoAnual.map(a => a.total), 1);

  const colorPluv = (nombre) => {
    const colores = { 'Casa': 'bg-blue-500', 'Sector 1': 'bg-green-500', 'Sector 2': 'bg-purple-500', 'Sector 2.1': 'bg-purple-500', 'Sector 3': 'bg-amber-500', 'Sector 4': 'bg-amber-500', 'General': 'bg-gray-500' };
    return colores[nombre] || 'bg-gray-500';
  };

  const abrirForm = (fechaEdit = null) => {
    const f = fechaEdit || new Date().toISOString().split('T')[0];
    setFecha(f);
    const existentes = lluviasFinca.filter(l => l.fecha === f);
    const vals = {};
    pluvs.forEach(p => {
      const ex = existentes.find(l => l.pluviometro === p);
      vals[p] = ex ? String(ex.mm) : '';
    });
    setValores(vals);
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const registros = pluvs
        .filter(p => valores[p] !== '' && valores[p] !== undefined)
        .map(p => ({
          fecha, finca,
          pluviometro: p,
          mm: parseFloat(valores[p]) || 0,
          registrado_por: userEmail || 'sistema'
        }));
      if (registros.length === 0) { setSaving(false); return; }
      const saved = await db.insertLluviasBatch(registros);
      setLluvias(prev => {
        const updated = [...prev];
        saved.forEach(s => {
          const idx = updated.findIndex(l => l.fecha === s.fecha && l.finca === s.finca && l.pluviometro === s.pluviometro);
          if (idx >= 0) updated[idx] = s;
          else updated.push(s);
        });
        return updated;
      });
      setShowForm(false);
      setValores({});
    } catch (err) {
      alert('Error guardando: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await db.deleteLluvia(id);
      setLluvias(prev => prev.filter(l => l.id !== id));
      setConfirmDel(null);
    } catch (err) {
      alert('Error eliminando: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h3 className="text-xl font-bold text-gray-100 flex items-center gap-2">🌧️ Precipitación</h3>
          <p className="text-sm text-gray-400">{lluviasFinca.length} registros | {finca}</p>
        </div>
        <div className="flex gap-2">
          <select value={mesSel} onChange={e => setMesSel(e.target.value)} className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200">
            <option value="todos">Todos los meses</option>
            {mesesDisponibles.map(m => <option key={m} value={m}>{nombresMesFull[m]}</option>)}
          </select>
          <button onClick={() => abrirForm()} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium">
            <PlusCircle size={16} /> Registrar
          </button>
        </div>
      </div>

      {/* Gráfico mensual */}
      {añoNum && (
        <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-semibold text-gray-200">Precipitación Mensual {añoNum} (mm)</h4>
            <span className="text-sm text-blue-400 font-medium">Total: {totalAnual} mm</span>
          </div>
          <div className="h-48">
            <div className="flex items-end justify-between h-full gap-1 px-2">
              {resumenMensual.map(m => (
                <div key={m.mes} className="flex-1 flex flex-col items-center h-full justify-end">
                  {m.total > 0 && <span className="text-xs font-semibold text-blue-400 mb-1">{m.total}</span>}
                  <div className={`w-full rounded-t transition-all duration-300 ${m.total > 0 ? 'bg-gradient-to-t from-blue-600 to-blue-400' : 'bg-gray-800'}`}
                    style={{ height: m.total > 0 ? `${Math.max((m.total / maxMensual) * 100, 8)}%` : '4px' }} />
                  <span className="text-xs text-gray-400 mt-2">{m.nombre}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Comparativo anual */}
      {comparativoAnual.length > 1 && (
        <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
          <h4 className="font-semibold text-gray-200 mb-4">Comparativo Anual (mm promedio pluviómetros)</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 border-b border-gray-800">
                  <th className="px-2 py-2 text-left">Año</th>
                  {['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].map(m => (
                    <th key={m} className="px-1 py-2 text-center">{m}</th>
                  ))}
                  <th className="px-2 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {comparativoAnual.map(row => (
                  <tr key={row.año} className="border-b border-gray-800/50">
                    <td className="px-2 py-2 font-medium text-gray-200">{row.año}</td>
                    {row.meses.map((v, i) => {
                      const maxVal = Math.max(...comparativoAnual.flatMap(r => r.meses));
                      const intensity = maxVal > 0 ? v / maxVal : 0;
                      return (
                        <td key={i} className="px-1 py-2 text-center">
                          <div className="rounded px-1 py-0.5" style={{ backgroundColor: v > 0 ? `rgba(59, 130, 246, ${0.15 + intensity * 0.6})` : 'transparent' }}>
                            <span className={v > 0 ? 'text-blue-200' : 'text-gray-600'}>{v || '-'}</span>
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 text-right font-bold text-blue-400">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Barras horizontales */}
          <div className="mt-4 space-y-2">
            {comparativoAnual.map(row => (
              <div key={row.año} className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-10">{row.año}</span>
                <div className="flex-1 bg-gray-800 rounded-full h-5 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all flex items-center justify-end pr-2"
                    style={{ width: `${(row.total / maxAnual) * 100}%` }}>
                    <span className="text-xs text-white font-medium">{row.total} mm</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detalle por pluviómetro */}
      {añoNum && resumenMensual.some(m => Object.keys(m.porPluv).length > 1) && (
        <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
          <h4 className="font-semibold text-gray-200 mb-3">Detalle por Pluviómetro {añoNum}</h4>
          <div className="space-y-3">
            {resumenMensual.filter(m => m.total > 0).map(m => (
              <div key={m.mes}>
                <p className="text-xs text-gray-400 mb-1">{nombresMesFull[m.mes]}: <span className="text-blue-400 font-medium">{m.total} mm (promedio)</span></p>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(m.porPluv).map(([p, v]) => (
                    <span key={p} className="flex items-center gap-1 text-xs bg-gray-800 px-2 py-1 rounded-lg">
                      <span className={`w-2 h-2 rounded-full ${colorPluv(p)}`}></span>
                      {p}: {Math.round(v)} mm
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabla de registros */}
      <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
        <h4 className="font-semibold text-gray-200 mb-3">Registros Diarios ({porFecha.length} fechas)</h4>
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-900">
              <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase">
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Pluviómetro</th>
                <th className="px-3 py-2 text-right">mm</th>
                <th className="px-3 py-2 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {porFecha.slice(0, 50).map(([fecha, regs]) =>
                regs.map((r, ri) => (
                  <tr key={r.id} className="border-b border-gray-800/30 hover:bg-gray-800/30">
                    {ri === 0 && <td className="px-3 py-1.5 text-gray-300" rowSpan={regs.length}>{formatDate(fecha)}</td>}
                    <td className="px-3 py-1.5">
                      <span className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${colorPluv(r.pluviometro)}`}></span>
                        <span className="text-gray-300">{r.pluviometro}</span>
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right text-blue-400 font-medium">{Math.round(parseFloat(r.mm))}</td>
                    <td className="px-3 py-1.5 text-center">
                      <button onClick={() => { setConfirmDel(r); }} className="p-1 hover:bg-gray-700 rounded text-gray-500 hover:text-red-400"><Trash2 size={12} /></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-700" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-100 mb-4">Registrar Lluvia - {finca}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Fecha</label>
                <input type="date" value={fecha} onChange={e => { setFecha(e.target.value); }} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" />
              </div>
              {pluvs.map(p => (
                <div key={p}>
                  <label className="block text-xs font-medium text-gray-400 mb-1 flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${colorPluv(p)}`}></span> {p} (mm)
                  </label>
                  <input type="number" step="0.1" min="0" value={valores[p] || ''} onChange={e => setValores({ ...valores, [p]: e.target.value })}
                    placeholder="0" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2">
                {saving ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : <><Check size={14} /> Guardar</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmDel && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setConfirmDel(null)}>
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-sm border border-gray-700" onClick={e => e.stopPropagation()}>
            <p className="text-gray-200 mb-4">¿Eliminar registro de <strong>{confirmDel.pluviometro}</strong> ({confirmDel.fecha})?</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDel(null)} className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm">Cancelar</button>
              <button onClick={() => handleDelete(confirmDel.id)} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== COMPONENTE PALPACIONES ====================
function PalpacionesView({ palpaciones, setPalpaciones, userEmail, nacimientos, onAnimalClick }) {
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  const RESULTADOS = [
    'Preñada', 'OICL', 'ODCL', 'OICL - PP', 'ODCL - PP',
    'ODF', 'OIF', 'Anestro', 'Quiste OD', 'Quiste OI',
    'Aborto / Reabsorción', 'Descarte'
  ];
  const ESTADOS = ['LACT', 'NVIE', 'SECA', 'NLEV'];
  const CALIFICACIONES = ['R', 'R+', 'B', 'B+', 'MB', 'MB+', 'E'];
  const TIPOS_SERVICIO = ['MN', 'IA', 'TE'];

  const emptyForm = {
    fecha: new Date().toISOString().split('T')[0],
    hembra: '', estado: '', resultado: '', dias_gestacion: '',
    dias_lactancia: '', dias_abiertos: '', reproductor: '',
    condicion_corporal: '', calificacion: '', tipo_servicio: '',
    observaciones: '', finca: 'La Vega'
  };
  const [form, setForm] = useState(emptyForm);

  const hembrasConocidas = useMemo(() => {
    const hembras = new Set();
    (nacimientos || []).forEach(n => {
      if (n.madre) hembras.add(n.madre.trim());
      if (n.cria && (n.sexo === 'H' || n.sexo === 'h')) hembras.add(String(n.cria).trim());
    });
    return [...hembras].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [nacimientos]);

  const palpLaVega = useMemo(() =>
    (palpaciones || []).filter(p => p.finca === 'La Vega' && esAnimalValido(p.hembra)).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')),
    [palpaciones]);

  const filtradas = useMemo(() => {
    if (!busqueda.trim()) return palpLaVega;
    const q = busqueda.toLowerCase();
    return palpLaVega.filter(p =>
      (p.hembra || '').toLowerCase().includes(q) ||
      (p.resultado || '').toLowerCase().includes(q) ||
      (p.reproductor || '').toLowerCase().includes(q)
    );
  }, [palpLaVega, busqueda]);

  const openNew = () => { setForm(emptyForm); setEditando(null); setShowForm(true); };
  const openEdit = (p) => {
    setForm({
      fecha: p.fecha || '', hembra: p.hembra || '', estado: p.estado || '',
      resultado: p.resultado || p.detalle || '', dias_gestacion: p.dias_gestacion || '',
      dias_lactancia: p.dias_lactancia || '', dias_abiertos: p.dias_abiertos || '',
      reproductor: p.reproductor || '', condicion_corporal: p.condicion_corporal || '',
      calificacion: p.calificacion || '', tipo_servicio: p.tipo_servicio || '',
      observaciones: p.observaciones || '', finca: 'La Vega'
    });
    setEditando(p); setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.fecha || !form.hembra) return alert('Fecha y Hembra son obligatorios');
    setSaving(true);
    try {
      const registro = {
        ...form,
        dias_gestacion: form.resultado === 'Preñada' ? form.dias_gestacion : 'VACIA',
        dias_lactancia: form.dias_lactancia ? parseInt(form.dias_lactancia) : null,
        dias_abiertos: form.dias_abiertos ? parseInt(form.dias_abiertos) : null,
        condicion_corporal: form.condicion_corporal ? parseFloat(form.condicion_corporal) : null,
        registrado_por: userEmail || 'manual',
      };
      if (editando) {
        const updated = await db.updatePalpacion(editando.id, registro);
        setPalpaciones(prev => prev.map(p => p.id === editando.id ? { ...p, ...updated } : p));
      } else {
        const nuevo = await db.insertPalpacion(registro);
        setPalpaciones(prev => [nuevo, ...prev]);
      }
      setShowForm(false); setEditando(null);
    } catch (e) { alert('Error guardando: ' + e.message); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    try {
      await db.deletePalpacion(id);
      setPalpaciones(prev => prev.filter(p => p.id !== id));
      setConfirmDel(null);
    } catch (e) { alert('Error eliminando: ' + e.message); }
  };

  const esPreñada = form.resultado === 'Preñada';

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h3 className="text-xl font-bold text-gray-100 flex items-center gap-2">🔬 Registro de Palpaciones</h3>
          <p className="text-sm text-gray-400">{palpLaVega.length} registros en La Vega</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium transition-colors">
          <PlusCircle size={16} /> Nueva Palpación
        </button>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por hembra, resultado, reproductor..."
          className="w-full pl-9 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm" />
      </div>

      <div className="overflow-x-auto bg-gray-900 rounded-2xl border border-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase">
              <th className="px-3 py-3 text-left">Fecha</th>
              <th className="px-3 py-3 text-left">Hembra</th>
              <th className="px-3 py-3 text-left">Estado</th>
              <th className="px-3 py-3 text-left">Resultado</th>
              <th className="px-3 py-3 text-left">Días Gest.</th>
              <th className="px-3 py-3 text-left">Días Lact.</th>
              <th className="px-3 py-3 text-left">Reproductor</th>
              <th className="px-3 py-3 text-left">CC</th>
              <th className="px-3 py-3 text-left">Calif.</th>
              <th className="px-3 py-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.slice(0, 100).map(p => (
              <tr key={p.id} className="border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors">
                <td className="px-3 py-2 text-gray-300">{p.fecha ? formatDate(p.fecha) : '-'}</td>
                <td className="px-3 py-2 font-medium"><AnimalLink id={p.hembra} onAnimalClick={onAnimalClick} /></td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    p.estado === 'LACT' ? 'bg-green-900/50 text-green-400' :
                    p.estado === 'SECA' ? 'bg-amber-900/50 text-amber-400' :
                    p.estado === 'NVIE' ? 'bg-blue-900/50 text-blue-400' :
                    p.estado === 'NLEV' ? 'bg-purple-900/50 text-purple-400' :
                    'bg-gray-800 text-gray-400'
                  }`}>{p.estado || '-'}</span>
                </td>
                <td className="px-3 py-2">
                  {(() => {
                    const res = p.resultado || '';
                    const det = p.detalle || '';
                    const display = res || (det && !det.match(/^0\.\d+$/) ? det : '');
                    return (
                      <span className={`text-xs font-medium ${
                        display.includes('Preñada') ? 'text-green-400' :
                        display.includes('Descarte') ? 'text-red-400' :
                        'text-gray-300'
                      }`}>{display || '-'}</span>
                    );
                  })()}
                </td>
                <td className="px-3 py-2 text-gray-300">{p.dias_gestacion ? (isNaN(p.dias_gestacion) ? p.dias_gestacion : Math.round(Number(p.dias_gestacion))) : '-'}</td>
                <td className="px-3 py-2 text-gray-300">{p.dias_lactancia ? Math.round(Number(p.dias_lactancia)) : '-'}</td>
                <td className="px-3 py-2 text-gray-300">{p.reproductor || '-'}</td>
                <td className="px-3 py-2 text-gray-300">{p.condicion_corporal ? Number(p.condicion_corporal).toFixed(1) : '-'}</td>
                <td className="px-3 py-2">
                  <span className={`text-xs font-medium ${
                    (p.calificacion || '').startsWith('E') ? 'text-green-400' :
                    (p.calificacion || '').startsWith('MB') ? 'text-blue-400' :
                    (p.calificacion || '').startsWith('B') ? 'text-yellow-400' :
                    'text-gray-400'
                  }`}>{p.calificacion || '-'}</span>
                </td>
                <td className="px-3 py-2 text-center">
                  <div className="flex justify-center gap-1">
                    <button onClick={() => openEdit(p)} className="p-1.5 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-blue-400"><Edit2 size={14} /></button>
                    <button onClick={() => setConfirmDel(p)} className="p-1.5 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-red-400"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-500">No hay palpaciones registradas</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-700" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-100 mb-4">{editando ? 'Editar Palpación' : 'Nueva Palpación'}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Fecha *</label>
                <input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Hembra *</label>
                <input list="hembras-list" value={form.hembra} onChange={e => setForm({ ...form, hembra: e.target.value })}
                  placeholder="Ej: 002-80" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" />
                <datalist id="hembras-list">
                  {hembrasConocidas.map(h => <option key={h} value={h} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Estado</label>
                <select value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm">
                  <option value="">Seleccionar...</option>
                  {ESTADOS.map(e => <option key={e} value={e}>{e === 'LACT' ? 'LACT - Lactando' : e === 'NVIE' ? 'NVIE - Novilla Vientre' : e === 'SECA' ? 'SECA - Sin cría' : 'NLEV - Novilla Levante'}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Resultado</label>
                <select value={form.resultado} onChange={e => setForm({ ...form, resultado: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm">
                  <option value="">Seleccionar...</option>
                  {RESULTADOS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Días Gestación {esPreñada && '*'}</label>
                <input type="number" value={form.dias_gestacion} onChange={e => setForm({ ...form, dias_gestacion: e.target.value })}
                  placeholder={esPreñada ? 'Ej: 65' : 'N/A si vacía'} disabled={!esPreñada}
                  className={`w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm ${esPreñada ? 'text-gray-200' : 'text-gray-600'}`} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Días Lactancia</label>
                <input type="number" value={form.dias_lactancia} onChange={e => setForm({ ...form, dias_lactancia: e.target.value })}
                  placeholder="Ej: 95" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Días Abiertos</label>
                <input type="number" value={form.dias_abiertos} onChange={e => setForm({ ...form, dias_abiertos: e.target.value })}
                  placeholder="Ej: 120" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Reproductor</label>
                <input value={form.reproductor} onChange={e => setForm({ ...form, reproductor: e.target.value })}
                  placeholder="Ej: 509-0" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Tipo Servicio</label>
                <select value={form.tipo_servicio} onChange={e => setForm({ ...form, tipo_servicio: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm">
                  <option value="">Seleccionar...</option>
                  {TIPOS_SERVICIO.map(t => <option key={t} value={t}>{t === 'MN' ? 'MN - Monta Natural' : t === 'IA' ? 'IA - Inseminación' : 'TE - Transferencia Embrión'}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Condición Corporal (1.0 - 5.0)</label>
                <input type="number" step="0.1" min="1" max="5" value={form.condicion_corporal}
                  onChange={e => setForm({ ...form, condicion_corporal: e.target.value })}
                  placeholder="Ej: 3.5" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Calificación</label>
                <select value={form.calificacion} onChange={e => setForm({ ...form, calificacion: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm">
                  <option value="">Seleccionar...</option>
                  {CALIFICACIONES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-400 mb-1">Observaciones</label>
                <textarea value={form.observaciones} onChange={e => setForm({ ...form, observaciones: e.target.value })}
                  rows={2} placeholder="Notas adicionales..."
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium flex items-center gap-2">
                {saving ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : <><Check size={14} /> {editando ? 'Actualizar' : 'Guardar'}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setConfirmDel(null)}>
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-sm border border-gray-700" onClick={e => e.stopPropagation()}>
            <p className="text-gray-200 mb-4">¿Eliminar palpación de <strong>{confirmDel.hembra}</strong> del {confirmDel.fecha ? formatDate(confirmDel.fecha) : ''}?</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDel(null)} className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm">Cancelar</button>
              <button onClick={() => handleDelete(confirmDel.id)} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== COMPONENTE HATO ====================
function HatoView({ finca, nacimientos, setNacimientos, pesajes, palpaciones, servicios, isOnline, userEmail, onAnimalClick }) {
  const [busqueda, setBusqueda] = useState('');
  const [animalSel, setAnimalSel] = useState(null);

  const esLaVega = finca === 'La Vega';

  // Build animal list depending on finca type
  const animales = useMemo(() => {
    if (esLaVega) {
      // Filtrar nacimientos por finca (usar fincaDB del registro)
      const nacFinca = nacimientos.filter(n => {
        const f = n.fincaDB || n.finca;
        return !f || f === 'La Vega'; // si no tiene finca asignada, asumir La Vega (legacy)
      });
      // Get all unique animals: mothers from nacimientos + all crías
      const madresSet = new Set();
      const crias = {};
      nacFinca.forEach(n => {
        if (n.madre) madresSet.add(n.madre.trim());
        if (n.cria) crias[n.cria.trim()] = n;
      });
      
      const lista = [];
      // Add mothers
      madresSet.forEach(m => {
        const partos = nacFinca.filter(n => n.madre && n.madre.trim() === m);
        const ultimaPalp = (palpaciones || []).filter(p => p.hembra === m && p.finca === finca).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))[0];
        const ultimoServ = (servicios || []).filter(s => s.hembra === m && s.finca === finca).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))[0];
        // Buscar fecha nacimiento de la madre (si nació en la finca)
        const nacMadre = crias[m];
        const fechaNacimiento = nacMadre?.fecha || null;

        // === INDICADORES REPRODUCTIVOS AUTOMÁTICOS ===
        const hoy = new Date();
        const partosOrd = [...partos].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
        const ultParto = partosOrd[0];

        // Días abiertos: días desde último parto
        let diasAbiertos = null;
        if (ultParto?.fecha) {
          const fp = new Date(ultParto.fecha + 'T00:00:00');
          diasAbiertos = Math.round((hoy - fp) / (1000 * 60 * 60 * 24));
        }

        // Días lactancia: igual a días abiertos PERO se pone en 0 si la cría ya fue destetada
        let diasLactancia = null;
        let estaLactando = false;
        if (ultParto?.fecha) {
          const criaUltParto = ultParto.cria?.trim();
          const regCria = criaUltParto ? crias[criaUltParto] : null;
          const fueDestetada = regCria && (regCria.fechaDestete || regCria.fecha_destete);
          if (fueDestetada) {
            diasLactancia = 0; // vaca seca
            estaLactando = false;
          } else {
            diasLactancia = diasAbiertos; // sigue lactando
            estaLactando = true;
          }
        }

        // Días gestación: si la última palpación dice "Preñada" con X días en fecha Y
        let diasGestacion = null;
        let fechaEstimadaParto = null;
        if (ultimaPalp?.resultado === 'Preñada' && ultimaPalp.dias_gestacion && ultimaPalp.fecha) {
          const diasPalpacion = parseInt(ultimaPalp.dias_gestacion);
          if (!isNaN(diasPalpacion)) {
            const fechaPalp = new Date(ultimaPalp.fecha + 'T00:00:00');
            const diasTranscurridos = Math.round((hoy - fechaPalp) / (1000 * 60 * 60 * 24));
            diasGestacion = diasPalpacion + diasTranscurridos;
            // Fecha estimada de parto: 270 días desde el inicio de gestación
            const inicioGest = new Date(fechaPalp);
            inicioGest.setDate(inicioGest.getDate() - diasPalpacion);
            const estParto = new Date(inicioGest);
            estParto.setDate(estParto.getDate() + 270);
            fechaEstimadaParto = estParto.toISOString().split('T')[0];
          }
        }

        lista.push({
          id: m, tipo: 'madre', numPartos: partos.length,
          ultimoParto: ultParto,
          estadoRepro: ultimaPalp?.estado || null,
          ultimaPalp, ultimoServ, partos, fechaNacimiento,
          // Indicadores reproductivos
          diasAbiertos, diasLactancia, estaLactando,
          diasGestacion, fechaEstimadaParto,
        });
      });
      // Add crías that are not mothers
      Object.entries(crias).forEach(([cria, data]) => {
        if (!madresSet.has(cria)) {
          lista.push({ id: cria, tipo: 'cria', data, fechaNacimiento: data.fecha || null });
        }
      });
      return lista.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    } else {
      // Bariloche: group pesajes by animal
      const animMap = {};
      (pesajes || []).filter(p => p.finca === 'Bariloche').forEach(p => {
        if (!animMap[p.animal]) animMap[p.animal] = [];
        animMap[p.animal].push(p);
      });
      // Build nacimientos lookup for Bariloche animals (might have been born at La Vega)
      const nacLookup = {};
      (nacimientos || []).forEach(n => { if (n.cria) nacLookup[n.cria.trim()] = n; });
      return Object.entries(animMap).map(([animal, pesos]) => {
        const sorted = pesos.sort((a, b) => (b.fecha_pesaje || '').localeCompare(a.fecha_pesaje || ''));
        const ultimo = sorted[0];
        // Fecha nacimiento: 1) del registro de nacimientos, 2) estimada desde pesaje
        let fechaNacimiento = nacLookup[animal]?.fecha || null;
        if (!fechaNacimiento && ultimo?.fecha_pesaje && ultimo?.edad_meses) {
          const fp = new Date(ultimo.fecha_pesaje + 'T00:00:00');
          fp.setDate(fp.getDate() - Math.round(ultimo.edad_meses * 30.4375));
          fechaNacimiento = fp.toISOString().split('T')[0];
        }
        return {
          id: animal, tipo: 'levante', pesajes: sorted, ultimo,
          categoria: ultimo?.categoria || '-',
          pesoActual: ultimo?.peso,
          gdpVida: ultimo?.gdp_vida,
          fechaNacimiento,
        };
      }).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    }
  }, [nacimientos, pesajes, palpaciones, servicios, finca, esLaVega]);

  // Filter by search
  const filtrados = useMemo(() => {
    if (!busqueda.trim()) return animales.slice(0, 50);
    const q = busqueda.trim().toLowerCase();
    return animales.filter(a => a.id.toLowerCase().includes(q));
  }, [animales, busqueda]);

  // Select animal details
  const detalle = useMemo(() => {
    if (!animalSel) return null;
    return animales.find(a => a.id === animalSel) || null;
  }, [animalSel, animales]);

  // Handler para registrar destete de una cría
  const handleRegistrarDestete = async (criaId, fechaDestete, pesoDestete) => {
    // Buscar la cría en nacimientos
    const cria = nacimientos.find(n => n.cria?.trim() === criaId);
    if (!cria) return alert('Cría no encontrada');
    const pesoNacer = cria.pesoNacer || cria.peso_nacer || 0;
    const fechaNac = cria.fecha;
    // Calcular días y GDP
    let diasDestete = null;
    if (fechaNac && fechaDestete) {
      diasDestete = Math.round((new Date(fechaDestete + 'T00:00:00') - new Date(fechaNac + 'T00:00:00')) / (1000 * 60 * 60 * 24));
    }
    const gdp = diasDestete && diasDestete > 0 && pesoNacer ? Math.round((pesoDestete - pesoNacer) / diasDestete * 1000) : null;
    const añoDestete = fechaDestete ? parseInt(fechaDestete.split('-')[0]) : null;

    const updates = {
      pesoDestete: pesoDestete, peso_destete: pesoDestete,
      fechaDestete: fechaDestete, fecha_destete: fechaDestete,
      edadDestete: diasDestete, edad_destete: diasDestete,
      grDiaVida: gdp, gr_dia_vida: gdp,
      añoDestete: añoDestete, año_destete: añoDestete,
    };
    // Update in Supabase if online
    if (isOnline && cria.id) {
      try {
        await db.updateNacimiento(cria.id, {
          peso_destete: pesoDestete,
          fecha_destete: fechaDestete,
          edad_destete: diasDestete,
          gr_dia_vida: gdp,
          año_destete: añoDestete,
        });
      } catch (e) { console.error('Error actualizando destete en Supabase:', e); }
    }
    // Update local state
    if (setNacimientos) {
      setNacimientos(prev => prev.map(n =>
        n.cria?.trim() === criaId ? { ...n, ...updates } : n
      ));
    }
    return { diasDestete, gdp };
  };

  // Handler para editar datos de una cría
  const handleEditAnimal = async (criaId, updates) => {
    const cria = nacimientos.find(n => n.cria?.trim() === criaId);
    if (!cria) return;
    // Recalcular GDP si cambiaron pesos o fechas de destete
    const pesoNacer = updates.peso_nacer ?? cria.pesoNacer ?? cria.peso_nacer;
    const pesoDestete = updates.peso_destete ?? cria.pesoDestete ?? cria.peso_destete;
    const fechaNac = cria.fecha;
    const fechaDest = updates.fecha_destete ?? cria.fechaDestete ?? cria.fecha_destete;
    let diasDestete = null;
    let gdp = null;
    if (fechaNac && fechaDest && pesoNacer && pesoDestete) {
      diasDestete = Math.round((new Date(fechaDest + 'T00:00:00') - new Date(fechaNac + 'T00:00:00')) / (1000 * 60 * 60 * 24));
      if (diasDestete > 0) gdp = Math.round((pesoDestete - pesoNacer) / diasDestete * 1000);
    }
    const añoDestete = fechaDest ? parseInt(fechaDest.split('-')[0]) : null;
    const dbUpdates = { ...updates };
    if (diasDestete != null) dbUpdates.edad_destete = diasDestete;
    if (gdp != null) dbUpdates.gr_dia_vida = gdp;
    if (añoDestete != null) dbUpdates.año_destete = añoDestete;
    // Save to Supabase
    if (isOnline && cria.id) {
      try { await db.updateNacimiento(cria.id, dbUpdates); }
      catch (e) { console.error('Error editando animal:', e); throw e; }
    }
    // Update local state
    const localUpdates = { ...dbUpdates };
    if (dbUpdates.peso_nacer != null) localUpdates.pesoNacer = dbUpdates.peso_nacer;
    if (dbUpdates.peso_destete != null) localUpdates.pesoDestete = dbUpdates.peso_destete;
    if (dbUpdates.fecha_destete != null) localUpdates.fechaDestete = dbUpdates.fecha_destete;
    if (dbUpdates.edad_destete != null) localUpdates.edadDestete = dbUpdates.edad_destete;
    if (dbUpdates.gr_dia_vida != null) localUpdates.grDiaVida = dbUpdates.gr_dia_vida;
    if (dbUpdates.año_destete != null) localUpdates.añoDestete = dbUpdates.año_destete;
    if (setNacimientos) {
      setNacimientos(prev => prev.map(n => n.cria?.trim() === criaId ? { ...n, ...localUpdates } : n));
    }
  };

  const formatDate = (d) => {
    if (!d || d === '1900-01-01' || (typeof d === 'string' && d.startsWith('1900'))) return '-';
    const parts = d.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return d;
  };

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={busqueda}
          onChange={e => { setBusqueda(e.target.value); setAnimalSel(null); }}
          placeholder={esLaVega ? "Buscar por número de animal (ej: 120, VP-03)..." : "Buscar por número de animal (ej: 209, 19-5)..."}
          className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 placeholder-gray-500 focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none"
        />
        {busqueda && (
          <button onClick={() => { setBusqueda(''); setAnimalSel(null); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Results list */}
      {!animalSel && (
        <div className="space-y-1">
          <p className="text-xs text-gray-500 mb-2">{filtrados.length} de {animales.length} animales{busqueda ? ` • buscando "${busqueda}"` : ''}</p>
          <div className="grid gap-2 max-h-[60vh] overflow-y-auto">
            {filtrados.map(a => (
              <button key={a.id} onClick={() => setAnimalSel(a.id)}
                className="flex items-center justify-between p-3 bg-gray-800 hover:bg-gray-700/50 border border-gray-700 hover:border-green-500/50 rounded-xl text-left transition-all group">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-green-400 group-hover:text-green-300 min-w-[60px]">{a.id}</span>
                  {esLaVega ? (
                    <div className="flex items-center gap-2 text-sm flex-wrap">
                      {(() => {
                        const cat = getCategoriaAnimal(a);
                        return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cat.color}`}>
                          {cat.icon} {cat.label}{a.tipo === 'madre' ? ` • ${a.numPartos} partos` : ''}
                        </span>;
                      })()}
                      {a.fechaNacimiento && <span className="text-xs text-gray-500">📅 {formatEdad(a.fechaNacimiento)}</span>}
                      {a.tipo === 'madre' && a.estaLactando && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">🍼 Lact. {a.diasLactancia}d</span>}
                      {a.tipo === 'madre' && a.diasLactancia === 0 && a.diasAbiertos != null && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-500/20 text-orange-400">Seca</span>}
                      {a.tipo === 'madre' && a.diasGestacion != null && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-pink-500/20 text-pink-400">🤰 {a.diasGestacion}d gest.</span>}
                      {a.tipo === 'madre' && !a.estaLactando && !a.diasGestacion && a.diasAbiertos != null && <span className="text-xs text-gray-500">DA: {a.diasAbiertos}d</span>}
                      {a.estadoRepro && !a.estaLactando && !a.diasGestacion && <span className="text-xs text-gray-400">{a.estadoRepro}</span>}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm flex-wrap">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400">{a.categoria}</span>
                      <span className="text-gray-400">{a.pesoActual ? `${a.pesoActual} kg` : '-'}</span>
                      {a.fechaNacimiento && <span className="text-xs text-gray-500">📅 {formatEdad(a.fechaNacimiento)}</span>}
                      {a.gdpVida && <span className="text-gray-500 text-xs">GDP: {Math.round(a.gdpVida)} g/d</span>}
                    </div>
                  )}
                </div>
                <ChevronRight size={16} className="text-gray-600 group-hover:text-green-400" />
              </button>
            ))}
            {filtrados.length === 0 && (
              <p className="text-center text-gray-500 py-8">No se encontraron animales{busqueda ? ` con "${busqueda}"` : ''}</p>
            )}
          </div>
        </div>
      )}

      {/* Animal detail card */}
      {animalSel && detalle && (
        <div className="space-y-4">
          <button onClick={() => setAnimalSel(null)} className="flex items-center gap-2 text-sm text-gray-400 hover:text-green-400 transition-colors">
            <ChevronLeft size={16} /> Volver a la lista
          </button>

          {esLaVega ? (
            <FichaLaVega animal={detalle} nacimientos={nacimientos} formatDate={formatDate} onRegistrarDestete={handleRegistrarDestete} onEditAnimal={handleEditAnimal} onAnimalClick={onAnimalClick} />
          ) : (
            <FichaBariloche animal={detalle} formatDate={formatDate} />
          )}
        </div>
      )}

      {animalSel && !detalle && (
        <p className="text-center text-gray-500 py-8">Animal "{animalSel}" no encontrado</p>
      )}
    </div>
  );
}

// ==================== FICHA LA VEGA (CRÍA) ====================
function FichaLaVega({ animal, nacimientos, formatDate, onRegistrarDestete, onEditAnimal, onAnimalClick }) {
  // Destete form state (must be before any conditional returns)
  const [showDesteteForm, setShowDesteteForm] = useState(false);
  const [desteteData, setDesteteData] = useState({ fecha: new Date().toISOString().split('T')[0], peso: '' });
  const [savingDestete, setSavingDestete] = useState(false);
  // Edit form state
  const [showEditForm, setShowEditForm] = useState(false);
  const [editData, setEditData] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);

  if (animal.tipo === 'madre') {
    const { partos, ultimaPalp, ultimoServ } = animal;
    const partosOrden = [...partos].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    const pesosDestete = partos.filter(p => p.pesoDestete || p.peso_destete).map(p => p.pesoDestete || p.peso_destete);
    const promDestete = pesosDestete.length ? (pesosDestete.reduce((s, v) => s + v, 0) / pesosDestete.length).toFixed(1) : null;
    
    // Calculate inter-calving interval
    const fechasPartos = partos.map(p => p.fecha).filter(Boolean).sort();
    let iep = null;
    if (fechasPartos.length >= 2) {
      const intervalos = [];
      for (let i = 1; i < fechasPartos.length; i++) {
        const d1 = new Date(fechasPartos[i - 1]);
        const d2 = new Date(fechasPartos[i]);
        const dias = Math.abs((d2 - d1) / (1000 * 60 * 60 * 24));
        if (dias > 200) intervalos.push(dias);
      }
      if (intervalos.length > 0) iep = Math.round(intervalos.reduce((s, v) => s + v, 0) / intervalos.length);
    }

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl font-bold text-green-400">{animal.id}</span>
            {(() => { const cat = getCategoriaAnimal(animal); return <span className={`px-3 py-1 rounded-full text-sm font-medium ${cat.color}`}>{cat.icon} {cat.label}</span>; })()}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Edad" value={formatEdad(animal.fechaNacimiento)} sub={animal.fechaNacimiento ? formatDate(animal.fechaNacimiento) : 'Sin fecha nac.'} />
            <Stat label="Total Partos" value={animal.numPartos} />
            <Stat label="Prom. Peso Destete" value={promDestete ? `${promDestete} kg` : '-'} />
            <Stat label="IEP Promedio" value={iep ? `${iep} días` : '-'} sub={iep ? (iep <= 400 ? '✅ Bueno' : '⚠️ Alto') : ''} />
          </div>
        </div>

        {/* Indicadores Reproductivos Dinámicos */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <h4 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">📊 Indicadores Reproductivos <span className="text-[10px] text-gray-600 font-normal">(se actualizan automáticamente)</span></h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Días Abiertos</p>
              <p className={`text-lg font-semibold ${animal.diasAbiertos != null ? (animal.diasAbiertos <= 120 ? 'text-green-400' : animal.diasAbiertos <= 200 ? 'text-yellow-400' : 'text-red-400') : 'text-gray-200'}`}>
                {animal.diasAbiertos != null ? `${animal.diasAbiertos} días` : '-'}
              </p>
              {animal.diasAbiertos != null && <p className="text-xs text-gray-500">{animal.diasAbiertos <= 120 ? '✅ Óptimo' : animal.diasAbiertos <= 200 ? '⚠️ Vigilar' : '🔴 Crítico'}</p>}
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Estado Lactancia</p>
              {animal.estaLactando ? (
                <>
                  <p className="text-lg font-semibold text-green-400">🍼 {animal.diasLactancia} días</p>
                  <p className="text-xs text-gray-500">Lactando</p>
                </>
              ) : animal.diasLactancia === 0 ? (
                <>
                  <p className="text-lg font-semibold text-orange-400">Seca</p>
                  <p className="text-xs text-gray-500">Cría destetada</p>
                </>
              ) : (
                <p className="text-lg font-semibold text-gray-200">-</p>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Días Gestación</p>
              {animal.diasGestacion != null ? (
                <>
                  <p className={`text-lg font-semibold ${animal.diasGestacion >= 255 ? 'text-pink-400' : 'text-purple-400'}`}>
                    🤰 {animal.diasGestacion} días
                  </p>
                  <p className="text-xs text-gray-500">{animal.diasGestacion >= 255 ? '⏰ Parto inminente' : `Faltan ~${270 - animal.diasGestacion} días`}</p>
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold text-gray-500">Vacía</p>
                  <p className="text-xs text-gray-500">No preñada</p>
                </>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Parto Estimado</p>
              <p className="text-lg font-semibold text-gray-200">
                {animal.fechaEstimadaParto ? formatDate(animal.fechaEstimadaParto) : '-'}
              </p>
              {animal.fechaEstimadaParto && <p className="text-xs text-gray-500">±15 días</p>}
            </div>
          </div>
        </div>

        {/* Reproductive info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Last palpación */}
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h4 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">🔬 Última Palpación</h4>
            {ultimaPalp ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Fecha</span><span className="text-gray-200">{formatDate(ultimaPalp.fecha)}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Estado</span><span className="text-gray-200 font-medium">{ultimaPalp.estado || '-'}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Resultado</span><span className="text-gray-200">{ultimaPalp.resultado || ultimaPalp.detalle || '-'}</span></div>
                {animal.diasGestacion != null && (
                  <div className="flex justify-between"><span className="text-gray-400">Gestación actual</span><span className="text-purple-400 font-medium">{animal.diasGestacion} días</span></div>
                )}
                {!animal.diasGestacion && ultimaPalp.dias_gestacion && (
                  <div className="flex justify-between"><span className="text-gray-400">Días gestación (palp.)</span><span className="text-gray-200">{isNaN(ultimaPalp.dias_gestacion) ? ultimaPalp.dias_gestacion : Math.round(Number(ultimaPalp.dias_gestacion))}</span></div>
                )}
                {ultimaPalp.dias_abiertos && <div className="flex justify-between"><span className="text-gray-400">Días abiertos (palp.)</span><span className="text-gray-200">{Math.round(Number(ultimaPalp.dias_abiertos))}</span></div>}
                {ultimaPalp.reproductor && <div className="flex justify-between"><span className="text-gray-400">Reproductor</span><span className="text-gray-200">{ultimaPalp.reproductor}</span></div>}
              </div>
            ) : <p className="text-sm text-gray-500">Sin datos de palpación</p>}
          </div>

          {/* Last service */}
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h4 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">🐂 Último Servicio</h4>
            {ultimoServ ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Fecha</span><span className="text-gray-200">{formatDate(ultimoServ.fecha)}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Toro</span><span className="text-gray-200 font-medium">{ultimoServ.toro || '-'}</span></div>
                {ultimoServ.tipo && <div className="flex justify-between"><span className="text-gray-400">Tipo</span><span className="text-gray-200">{ultimoServ.tipo}</span></div>}
                {ultimoServ.num_servicio && <div className="flex justify-between"><span className="text-gray-400"># Servicio</span><span className="text-gray-200">{ultimoServ.num_servicio}</span></div>}
              </div>
            ) : <p className="text-sm text-gray-500">Sin datos de servicio</p>}
          </div>
        </div>

        {/* Birth history */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <h4 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">🍼 Historial de Partos ({partos.length})</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700">
                  <th className="text-left py-2 px-2">Cría</th>
                  <th className="text-left py-2 px-2">Fecha</th>
                  <th className="text-center py-2 px-2">Sexo</th>
                  <th className="text-right py-2 px-2">Peso Nacer</th>
                  <th className="text-right py-2 px-2">Peso Destete</th>
                  <th className="text-right py-2 px-2">GDP Vida</th>
                  <th className="text-left py-2 px-2">Padre</th>
                  <th className="text-left py-2 px-2">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {partosOrden.map((p, i) => {
                  const gdpCalc = calcularGDPDestete(p);
                  const gdpVal = gdpCalc || (p.grDiaVida || p.gr_dia_vida ? Math.round(p.grDiaVida || p.gr_dia_vida) : null);
                  return (
                  <tr key={i} className="hover:bg-gray-700/50">
                    <td className="py-2 px-2 font-medium"><AnimalLink id={p.cria} onAnimalClick={onAnimalClick} /></td>
                    <td className="py-2 px-2 text-gray-300">{formatDate(p.fecha)}</td>
                    <td className="py-2 px-2 text-center">{p.sexo === 'M' ? <span className="text-blue-400">♂</span> : <span className="text-pink-400">♀</span>}</td>
                    <td className="py-2 px-2 text-right text-gray-300">{p.pesoNacer || p.peso_nacer ? `${Math.round(p.pesoNacer || p.peso_nacer)} kg` : '-'}</td>
                    <td className="py-2 px-2 text-right text-gray-300">{(p.pesoDestete || p.peso_destete) ? `${Math.round(p.pesoDestete || p.peso_destete)} kg` : '-'}</td>
                    <td className={`py-2 px-2 text-right font-medium ${gdpVal ? (gdpVal >= 800 ? 'text-green-400' : gdpVal >= 600 ? 'text-amber-400' : 'text-red-400') : 'text-gray-300'}`}>{gdpVal ? `${gdpVal} g` : '-'}</td>
                    <td className="py-2 px-2 text-gray-400">{p.padre || '-'}</td>
                    <td className="py-2 px-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${p.estado === 'Activo' ? 'bg-green-500/20 text-green-400' : p.estado === 'Muerto' ? 'bg-red-500/20 text-red-400' : 'bg-gray-600/20 text-gray-400'}`}>
                        {p.estado || '-'}
                      </span>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // Cría card
  const n = animal.data;
  const gdpCalc = calcularGDPDestete(n);
  const gdpFinal = gdpCalc || (n.grDiaVida || n.gr_dia_vida ? Math.round(n.grDiaVida || n.gr_dia_vida) : null);
  // Calcular edad al destete si no viene precalculada
  let edadDestFinal = n.edadDestete || n.edad_destete;
  if (!edadDestFinal && n.fecha && (n.fechaDestete || n.fecha_destete)) {
    const d1 = new Date(n.fecha + 'T00:00:00');
    const d2 = new Date((n.fechaDestete || n.fecha_destete) + 'T00:00:00');
    edadDestFinal = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
  }
  const yaDestetada = !!(n.pesoDestete || n.peso_destete || n.fechaDestete || n.fecha_destete);

  const handleDesteteSubmit = async () => {
    if (!desteteData.fecha || !desteteData.peso) return alert('Fecha y peso son obligatorios');
    const peso = parseFloat(desteteData.peso);
    if (isNaN(peso) || peso <= 0) return alert('Peso inválido');
    setSavingDestete(true);
    try {
      const result = await onRegistrarDestete(animal.id, desteteData.fecha, peso);
      if (result) {
        alert(`✅ Destete registrado\nDías de edad: ${result.diasDestete}\nGDP: ${result.gdp ? result.gdp + ' g/día' : 'No calculado'}`);
      }
      setShowDesteteForm(false);
      setDesteteData({ fecha: new Date().toISOString().split('T')[0], peso: '' });
    } catch (e) { alert('Error: ' + e.message); }
    setSavingDestete(false);
  };

  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="text-3xl font-bold text-green-400">{animal.id}</span>
          {(() => { const cat = getCategoriaAnimal(animal); return <span className={`px-3 py-1 rounded-full text-sm font-medium ${cat.color}`}>{cat.icon} {cat.label}</span>; })()}
          {n.estado && (
            <span className={`px-2 py-0.5 rounded-full text-xs ${n.estado === 'Activo' ? 'bg-green-500/20 text-green-400' : n.estado === 'Muerto' ? 'bg-red-500/20 text-red-400' : 'bg-gray-600/20 text-gray-400'}`}>
              {n.estado}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onEditAnimal && (
            <button onClick={() => { setEditData({
              peso_nacer: n.pesoNacer || n.peso_nacer || '',
              peso_destete: n.pesoDestete || n.peso_destete || '',
              fecha_destete: n.fechaDestete || n.fecha_destete || '',
              estado: n.estado || 'Activo',
              comentario: n.comentario || '',
            }); setShowEditForm(true); }}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors">
              <Edit2 size={14} /> Editar
            </button>
          )}
          {!yaDestetada && n.estado === 'Activo' && onRegistrarDestete && (
            <button onClick={() => setShowDesteteForm(true)}
              className="flex items-center gap-2 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-medium transition-colors">
              <Scale size={16} /> Registrar Destete
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Edad" value={formatEdad(n.fecha)} />
        <Stat label="Fecha Nacimiento" value={formatDate(n.fecha)} />
        <div><p className="text-xs text-gray-500 mb-0.5">Madre</p><AnimalLink id={n.madre} onAnimalClick={onAnimalClick} className="text-lg font-semibold" /></div>
        <Stat label="Padre" value={n.padre || '-'} />
        <Stat label="Peso Nacer" value={n.pesoNacer || n.peso_nacer ? `${Math.round(n.pesoNacer || n.peso_nacer)} kg` : '-'} />
        <Stat label="Peso Destete" value={(n.pesoDestete || n.peso_destete) ? `${Math.round(n.pesoDestete || n.peso_destete)} kg` : '-'} />
        <Stat label="Fecha Destete" value={formatDate(n.fechaDestete || n.fecha_destete)} />
        <Stat label="Edad Destete" value={edadDestFinal ? `${edadDestFinal} días` : '-'} />
        <Stat label="GDP Vida" value={gdpFinal ? `${gdpFinal} g/día` : '-'} sub={gdpFinal ? (gdpFinal >= 800 ? '✅ Excelente' : gdpFinal >= 600 ? '👍 Bueno' : '⚠️ Bajo') : ''} />
      </div>
      {n.comentario && <p className="text-sm text-gray-400 mt-2">📝 {n.comentario}</p>}

      {/* Modal Destete */}
      {showDesteteForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowDesteteForm(false)}>
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-700" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-100 mb-1">🐄 Registrar Destete</h3>
            <p className="text-sm text-gray-400 mb-4">Cría: <strong className="text-green-400">{animal.id}</strong> • Peso nacer: {Math.round(n.pesoNacer || n.peso_nacer) || '?'} kg • Nacida: {formatDate(n.fecha)}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Fecha de Destete *</label>
                <input type="date" value={desteteData.fecha} onChange={e => setDesteteData({ ...desteteData, fecha: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Peso al Destete (kg) *</label>
                <input type="number" step="0.1" value={desteteData.peso} onChange={e => setDesteteData({ ...desteteData, peso: e.target.value })}
                  placeholder="Ej: 228" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" />
              </div>
              {/* Preview cálculos */}
              {desteteData.fecha && desteteData.peso && n.fecha && (
                <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                  <p className="text-xs text-gray-500 mb-2">Vista previa del cálculo:</p>
                  {(() => {
                    const dias = Math.round((new Date(desteteData.fecha + 'T00:00:00') - new Date(n.fecha + 'T00:00:00')) / (1000 * 60 * 60 * 24));
                    const pesoN = n.pesoNacer || n.peso_nacer || 0;
                    const pesoD = parseFloat(desteteData.peso) || 0;
                    const gdp = dias > 0 && pesoN ? Math.round((pesoD - pesoN) / dias * 1000) : null;
                    return (
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div><p className="text-xs text-gray-500">Edad destete</p><p className="text-lg font-bold text-gray-200">{dias > 0 ? dias : '-'} <span className="text-xs">días</span></p></div>
                        <div><p className="text-xs text-gray-500">Ganancia</p><p className="text-lg font-bold text-gray-200">{pesoD && pesoN ? (pesoD - pesoN).toFixed(1) : '-'} <span className="text-xs">kg</span></p></div>
                        <div><p className="text-xs text-gray-500">GDP</p><p className={`text-lg font-bold ${gdp ? (gdp >= 800 ? 'text-green-400' : gdp >= 600 ? 'text-amber-400' : 'text-red-400') : 'text-gray-200'}`}>{gdp || '-'} <span className="text-xs">g/d</span></p></div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowDesteteForm(false)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm">Cancelar</button>
              <button onClick={handleDesteteSubmit} disabled={savingDestete}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium flex items-center gap-2">
                {savingDestete ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : <><Check size={14} /> Registrar Destete</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Animal */}
      {showEditForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowEditForm(false)}>
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-lg border border-gray-700" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-100 mb-1">✏️ Editar Animal</h3>
            <p className="text-sm text-gray-400 mb-4">Cría: <strong className="text-green-400">{animal.id}</strong> • {n.sexo === 'M' ? '♂ Macho' : '♀ Hembra'} • Nacida: {formatDate(n.fecha)}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Peso Nacer (kg)</label>
                <input type="number" step="0.1" value={editData.peso_nacer} onChange={e => setEditData({ ...editData, peso_nacer: e.target.value })}
                  placeholder="Ej: 32" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Peso Destete (kg)</label>
                <input type="number" step="0.1" value={editData.peso_destete} onChange={e => setEditData({ ...editData, peso_destete: e.target.value })}
                  placeholder="Ej: 228" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Fecha Destete</label>
                <input type="date" value={editData.fecha_destete} onChange={e => setEditData({ ...editData, fecha_destete: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Estado</label>
                <select value={editData.estado} onChange={e => setEditData({ ...editData, estado: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm">
                  <option value="Activo">Activo</option>
                  <option value="Vendido">Vendido</option>
                  <option value="Muerto">Muerto</option>
                  <option value="Trasladado">Trasladado</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-400 mb-1">Comentario</label>
                <textarea value={editData.comentario} onChange={e => setEditData({ ...editData, comentario: e.target.value })}
                  rows={2} placeholder="Notas adicionales..." className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm resize-none" />
              </div>
            </div>
            {/* Preview GDP si hay peso nacer y destete */}
            {editData.peso_nacer && editData.peso_destete && editData.fecha_destete && n.fecha && (
              <div className="bg-gray-800 rounded-lg p-3 border border-gray-700 mt-4">
                <p className="text-xs text-gray-500 mb-1">GDP recalculado:</p>
                {(() => {
                  const dias = Math.round((new Date(editData.fecha_destete + 'T00:00:00') - new Date(n.fecha + 'T00:00:00')) / (1000 * 60 * 60 * 24));
                  const gdp = dias > 0 ? Math.round((parseFloat(editData.peso_destete) - parseFloat(editData.peso_nacer)) / dias * 1000) : null;
                  return <p className={`text-lg font-bold ${gdp ? (gdp >= 800 ? 'text-green-400' : gdp >= 600 ? 'text-amber-400' : 'text-red-400') : 'text-gray-400'}`}>{gdp || '-'} g/día <span className="text-xs text-gray-500">({dias} días)</span></p>;
                })()}
              </div>
            )}
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowEditForm(false)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm">Cancelar</button>
              <button onClick={async () => {
                setSavingEdit(true);
                try {
                  const updates = {};
                  if (editData.peso_nacer !== '' && editData.peso_nacer != null) updates.peso_nacer = parseFloat(editData.peso_nacer);
                  if (editData.peso_destete !== '' && editData.peso_destete != null) updates.peso_destete = parseFloat(editData.peso_destete);
                  if (editData.fecha_destete) updates.fecha_destete = editData.fecha_destete;
                  if (editData.estado) updates.estado = editData.estado;
                  if (editData.comentario !== undefined) updates.comentario = editData.comentario;
                  await onEditAnimal(animal.id, updates);
                  setShowEditForm(false);
                } catch (e) { alert('Error guardando: ' + e.message); }
                setSavingEdit(false);
              }} disabled={savingEdit}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2">
                {savingEdit ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : <><Check size={14} /> Guardar Cambios</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== FICHA BARILOCHE (LEVANTE) ====================
function FichaBariloche({ animal, formatDate }) {
  const { pesajes, ultimo } = animal;
  const pesajesOrden = [...pesajes].sort((a, b) => (a.fecha_pesaje || '').localeCompare(b.fecha_pesaje || ''));

  // GDP promedio entre pesajes (all records)
  const conGDP = pesajes.filter(p => p.gdp_entre_pesajes && p.gdp_entre_pesajes > 0);
  const gdpPromEntre = conGDP.length ? Math.round(conGDP.reduce((s, p) => s + p.gdp_entre_pesajes, 0) / conGDP.length) : null;

  // Weight gain since first pesaje
  const primero = pesajesOrden[0];
  const gananciaTotal = ultimo && primero && ultimo.peso && primero.peso ? ultimo.peso - primero.peso : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl font-bold text-green-400">{animal.id}</span>
          <span className="px-3 py-1 rounded-full text-sm font-medium bg-amber-500/20 text-amber-400">{ultimo?.categoria || '-'}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Peso Actual" value={ultimo?.peso ? `${ultimo.peso} kg` : '-'} sub={ultimo?.fecha_pesaje ? formatDate(ultimo.fecha_pesaje) : ''} />
          <Stat label="GDP Vida" value={ultimo?.gdp_vida ? `${Math.round(ultimo.gdp_vida)} g/día` : '-'} sub={ultimo?.gdp_vida ? (ultimo.gdp_vida >= 500 ? '✅ Meta' : '⚠️ Bajo meta') : ''} />
          <Stat label="GDP Prom. Entre Pesajes" value={gdpPromEntre ? `${gdpPromEntre} g/día` : '-'} sub={gdpPromEntre ? (gdpPromEntre >= 500 ? '✅ Meta' : '⚠️ Bajo meta') : ''} />
          <Stat label="Edad" value={formatEdad(animal.fechaNacimiento)} sub={animal.fechaNacimiento ? `Nac: ${formatDate(animal.fechaNacimiento)}` : 'Estimada'} />
        </div>
        {gananciaTotal !== null && (
          <div className="mt-3 pt-3 border-t border-gray-700 flex items-center gap-4 text-sm">
            <span className="text-gray-400">Ganancia total:</span>
            <span className={`font-medium ${gananciaTotal >= 0 ? 'text-green-400' : 'text-red-400'}`}>{gananciaTotal >= 0 ? '+' : ''}{gananciaTotal} kg</span>
            <span className="text-gray-500">({pesajes.length} pesajes registrados)</span>
          </div>
        )}
      </div>

      {/* Weight evolution chart (simple bar representation) */}
      {pesajesOrden.length > 1 && (
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <h4 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">📈 Evolución de Peso</h4>
          <div className="flex items-end gap-1 h-32">
            {pesajesOrden.map((p, i) => {
              const maxPeso = Math.max(...pesajesOrden.map(x => x.peso || 0));
              const minPeso = Math.min(...pesajesOrden.filter(x => x.peso).map(x => x.peso));
              const range = maxPeso - minPeso || 1;
              const height = p.peso ? Math.max(10, ((p.peso - minPeso) / range) * 100) : 0;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-700 text-gray-200 text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 transition-opacity pointer-events-none">
                    {Math.round(p.peso)} kg • {formatDate(p.fecha_pesaje)}
                  </div>
                  <div className={`w-full rounded-t transition-all ${p.gdp_entre_pesajes && p.gdp_entre_pesajes >= 500 ? 'bg-green-500' : p.gdp_entre_pesajes && p.gdp_entre_pesajes < 0 ? 'bg-red-500' : 'bg-amber-500'}`} style={{ height: `${height}%` }} />
                  <span className="text-[9px] text-gray-500 leading-none">{(p.fecha_pesaje || '').slice(5)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pesajes table */}
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
        <h4 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">⚖️ Historial de Pesajes ({pesajes.length})</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 border-b border-gray-700">
                <th className="text-left py-2 px-2">Fecha</th>
                <th className="text-right py-2 px-2">Peso</th>
                <th className="text-right py-2 px-2">Anterior</th>
                <th className="text-right py-2 px-2">Δ kg</th>
                <th className="text-right py-2 px-2">Días</th>
                <th className="text-right py-2 px-2">GDP Entre</th>
                <th className="text-right py-2 px-2">GDP Vida</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {[...pesajes].sort((a, b) => (b.fecha_pesaje || '').localeCompare(a.fecha_pesaje || '')).map((p, i) => (
                <tr key={i} className="hover:bg-gray-700/50">
                  <td className="py-2 px-2 text-gray-300">{formatDate(p.fecha_pesaje)}</td>
                  <td className="py-2 px-2 text-right font-medium text-gray-200">{p.peso ? `${Math.round(p.peso)} kg` : '-'}</td>
                  <td className="py-2 px-2 text-right text-gray-400">{p.peso_anterior ? `${Math.round(p.peso_anterior)} kg` : '-'}</td>
                  <td className={`py-2 px-2 text-right font-medium ${p.incremento_kg > 0 ? 'text-green-400' : p.incremento_kg < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                    {p.incremento_kg != null ? `${p.incremento_kg > 0 ? '+' : ''}${p.incremento_kg}` : '-'}
                  </td>
                  <td className="py-2 px-2 text-right text-gray-400">{p.diferencia_dias || '-'}</td>
                  <td className={`py-2 px-2 text-right font-medium ${p.gdp_entre_pesajes >= 500 ? 'text-green-400' : p.gdp_entre_pesajes > 0 ? 'text-amber-400' : p.gdp_entre_pesajes < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                    {p.gdp_entre_pesajes != null ? `${Math.round(p.gdp_entre_pesajes)} g` : '-'}
                  </td>
                  <td className={`py-2 px-2 text-right ${p.gdp_vida >= 500 ? 'text-green-400' : p.gdp_vida > 0 ? 'text-amber-400' : 'text-gray-400'}`}>
                    {p.gdp_vida != null ? `${Math.round(p.gdp_vida)} g` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Helper stat component
function Stat({ label, value, sub }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-lg font-semibold text-gray-200">{value}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  );
}
function HatoGeneral({ nacimientos, setNacimientos, pesajes, palpaciones, servicios, destetes, onAnimalClick, isOnline }) {
  const [filtros, setFiltros] = useState({ finca: '', categoria: '', estado: 'Activo', sexo: '', busqueda: '' });
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const [editAnimal, setEditAnimal] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [showMadreList, setShowMadreList] = useState(false);
  const [showPadreList, setShowPadreList] = useState(false);

  // Build hembras and padres lists for autocomplete
  const { hembras, padres } = useMemo(() => {
    const hSet = new Set();
    const pSet = new Set();
    (nacimientos || []).forEach(n => {
      if (n.estado !== 'Activo') return;
      const finca = n.fincaDB || n.finca || '';
      const id = n.cria ? String(n.cria).trim() : null;
      // Hembras: madres + crías hembra activas
      if (n.madre) hSet.add(String(n.madre).trim());
      if (id && n.sexo === 'H') hSet.add(id);
      // Padres: registrados + toros
      if (n.padre) pSet.add(String(n.padre).trim());
      if (id && n.sexo === 'M') {
        const edad = calcularEdad(n.fecha);
        if ((edad && edad.unidad === 'años' && edad.valor >= 3)) pSet.add(id);
      }
    });
    return { hembras: [...hSet].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), padres: [...pSet].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) };
  }, [nacimientos]);

  // Construir lista unificada de TODOS los animales
  const todosAnimales = useMemo(() => {
    const mapa = {}; // id → animal

    // Lookup de estado y finca por cría ID
    const estadoPorId = {};
    const fincaPorId = {};
    (nacimientos || []).forEach(n => {
      if (n.cria) {
        const id = String(n.cria).trim();
        estadoPorId[id] = n.estado || 'Activo';
        if (n.fincaDB) fincaPorId[id] = n.fincaDB;
      }
    });

    // 1) Crías de nacimientos
    (nacimientos || []).forEach(n => {
      if (!n.cria || !esAnimalValido(n.cria)) return;
      const id = String(n.cria).trim();
      const finca = fincaPorId[id] || 'La Vega';
      if (!mapa[id]) mapa[id] = { id, finca, fuente: 'nacimiento' };
      const a = mapa[id];
      a.sexo = n.sexo;
      a.fechaNac = n.fecha;
      a.madre = n.madre;
      a.padre = n.padre;
      a.pesoNacer = n.pesoNacer || n.peso_nacer;
      a.pesoDestete = n.pesoDestete || n.peso_destete;
      a.fechaDestete = n.fechaDestete || n.fecha_destete;
      a.estado = n.estado || 'Activo';
      a.comentario = n.comentario;
      a.categoriaActual = n.categoriaActual || n.categoria_actual || null;
      a.gdp = calcularGDPDestete(n);
    });

    // 2) Madres de nacimientos
    (nacimientos || []).forEach(n => {
      if (!n.madre || !esAnimalValido(n.madre)) return;
      const id = String(n.madre).trim();
      if (!mapa[id]) {
        const estadoCria = estadoPorId[id] || 'Inactivo';
        const finca = fincaPorId[id] || 'La Vega';
        mapa[id] = { id, finca, fuente: 'madre', sexo: 'H', estado: estadoCria };
      }
      const a = mapa[id];
      a.esMadre = true;
      a.numPartos = (a.numPartos || 0) + 1;
      // Si esta madre también nació aquí, ya tiene datos de cría
      if (!a.sexo) a.sexo = 'H';
    });

    // 3) Animales de Bariloche (pesajes) — crea nuevas entradas
    (pesajes || []).filter(p => p.finca === 'Bariloche' && p.animal && esAnimalValido(p.animal)).forEach(p => {
      const id = String(p.animal).trim();
      if (!mapa[id]) {
        const estadoCria = estadoPorId[id] || 'Inactivo';
        mapa[id] = { id, finca: 'Bariloche', fuente: 'pesaje', estado: estadoCria };
      }
      const a = mapa[id];
      // Finca del DB tiene prioridad; solo si no hay dato del DB, usar pesaje como indicador
      if (!fincaPorId[id] && a.finca === 'La Vega') a.finca = 'Bariloche';
      // Último pesaje
      if (!a.ultimoPesaje || (p.fecha_pesaje || '') > (a.ultimoPesaje.fecha_pesaje || '')) {
        a.ultimoPesaje = p;
        a.pesoActual = p.peso;
        a.categoriaBar = p.categoria;
        a.gdpVida = p.gdp_vida;
      }
    });

    // 4) Pesajes de La Vega — solo actualiza peso de animales que ya existen en mapa
    (pesajes || []).filter(p => p.finca === 'La Vega' && p.animal && esAnimalValido(p.animal)).forEach(p => {
      const id = String(p.animal).trim();
      if (!mapa[id]) return; // no crear nuevas entradas desde pesajes LV
      const a = mapa[id];
      if (!a.ultimoPesaje || (p.fecha_pesaje || '') > (a.ultimoPesaje.fecha_pesaje || '')) {
        a.ultimoPesaje = p;
        a.pesoActual = p.peso;
        a.gdpVida = p.gdp_vida;
      }
    });

    // PASO FINAL: Finca del DB tiene prioridad absoluta sobre inferencias
    Object.values(mapa).forEach(a => {
      if (fincaPorId[a.id]) a.finca = fincaPorId[a.id];
    });

    // Calcular categoría para cada animal
    // Regla: cálculo dinámico SIEMPRE tiene prioridad (destetes, partos, edad)
    // Calcular categoría dinámicamente. categoriaActual del DB solo como fallback
    const CAT_LABELS = { VP: 'Vaca Parida', VS: 'Vaca Seca', NV: 'Novilla Vientre', HL: 'Hembra Levante', ML: 'Macho Levante', CM: 'Cría Macho', CH: 'Cría Hembra', TR: 'Toro', LEV: 'Levante' };
    // Construir lookup de última cría por madre para determinar VP vs VS
    const ultimaCriaPorMadre = {};
    (nacimientos || []).forEach(n => {
      if (!n.madre || !n.cria || !esAnimalValido(n.madre)) return;
      const madreId = String(n.madre).trim();
      const prev = ultimaCriaPorMadre[madreId];
      if (!prev || (n.fecha || '') > (prev.fecha || '')) {
        ultimaCriaPorMadre[madreId] = n;
      }
    });

    Object.values(mapa).forEach(a => {
      if (a.esMadre) {
        // VP si última cría NO está destetada, VS si ya se destetó
        const ultimaCria = ultimaCriaPorMadre[a.id];
        const ultimaCriaDestetada = ultimaCria && !!(ultimaCria.pesoDestete || ultimaCria.peso_destete || ultimaCria.fechaDestete || ultimaCria.fecha_destete);
        if (ultimaCria && !ultimaCriaDestetada) {
          a.categoria = 'VP';
          a.categoriaLabel = 'Vaca Parida';
        } else {
          // Destetada o sin datos de cría → usar DB como fallback, default VS
          const catDB = a.categoriaActual;
          a.categoria = (catDB === 'VP' || catDB === 'VS') ? catDB : 'VS';
          a.categoriaLabel = a.categoria === 'VP' ? 'Vaca Parida' : 'Vaca Seca';
        }
      } else if (a.finca === 'Bariloche' || a.fuente === 'pesaje') {
        a.categoria = a.categoriaBar || 'LEV';
        a.categoriaLabel = a.categoriaBar || 'Levante';
      } else if (a.sexo === 'M') {
        const destetada = !!(a.pesoDestete || a.fechaDestete);
        const catDB = a.categoriaActual;
        if (!destetada && catDB && ['TR', 'ML'].includes(catDB)) {
          // Sin datos de destete pero DB dice TR o ML → confiar en DB
          a.categoria = catDB;
          a.categoriaLabel = catDB === 'TR' ? 'Toro' : 'Macho Levante';
        } else if (!destetada) {
          a.categoria = 'CM';
          a.categoriaLabel = 'Cría Macho';
        } else {
          // ML → TR si edad ≥ 3 años o peso ≥ 400 kg
          const edad = calcularEdad(a.fechaNac);
          const pesoUltimo = a.pesoActual || a.pesoDestete || 0;
          if ((edad && edad.unidad === 'años' && edad.valor >= 3) || pesoUltimo >= 400) {
            a.categoria = 'TR';
            a.categoriaLabel = 'Toro';
          } else {
            a.categoria = 'ML';
            a.categoriaLabel = 'Macho Levante';
          }
        }
      } else if (a.sexo === 'H') {
        const destetada = !!(a.pesoDestete || a.fechaDestete);
        const catDB = a.categoriaActual;
        if (!destetada && catDB && ['NV', 'HL', 'VP', 'VS'].includes(catDB)) {
          // Sin datos de destete pero DB dice NV/HL/VP/VS → confiar en DB
          a.categoria = catDB;
          a.categoriaLabel = { NV: 'Novilla Vientre', HL: 'Hembra Levante', VP: 'Vaca Parida', VS: 'Vaca Seca' }[catDB];
        } else if (!destetada) {
          a.categoria = 'CH';
          a.categoriaLabel = 'Cría Hembra';
        } else {
          const edad = calcularEdad(a.fechaNac);
          if (edad && edad.unidad === 'años' && edad.valor >= 2) {
            a.categoria = 'NV';
            a.categoriaLabel = 'Novilla Vientre';
          } else {
            a.categoria = 'HL';
            a.categoriaLabel = 'Hembra Levante';
          }
        }
      } else {
        // Sin datos suficientes para calcular → usar DB como fallback
        if (a.categoriaActual && CAT_LABELS[a.categoriaActual]) {
          a.categoria = a.categoriaActual;
          a.categoriaLabel = CAT_LABELS[a.categoriaActual];
        } else {
          a.categoria = '?';
          a.categoriaLabel = 'Sin datos';
        }
      }
    });

    return Object.values(mapa).filter(a => a.categoriaActual !== 'EA').sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }, [nacimientos, pesajes]);

  // Categorías disponibles
  const categoriasDisponibles = useMemo(() => {
    const cats = {};
    todosAnimales.forEach(a => { if (a.categoria) cats[a.categoria] = a.categoriaLabel; });
    return Object.entries(cats).sort((a, b) => a[1].localeCompare(b[1]));
  }, [todosAnimales]);

  // Filtrar
  const filtrados = useMemo(() => {
    return todosAnimales.filter(a => {
      if (filtros.finca && a.finca !== filtros.finca) return false;
      if (filtros.categoria && a.categoria !== filtros.categoria) return false;
      if (filtros.estado) {
        if (filtros.estado === 'Activo' && a.estado !== 'Activo') return false;
        if (filtros.estado === 'Vendido' && a.estado !== 'Vendido') return false;
        if (filtros.estado === 'Muerto' && a.estado !== 'Muerto') return false;
      }
      if (filtros.sexo && a.sexo !== filtros.sexo) return false;
      if (filtros.busqueda) {
        const q = filtros.busqueda.toLowerCase();
        return a.id.toLowerCase().includes(q) || (a.madre || '').toLowerCase().includes(q) || (a.padre || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [todosAnimales, filtros]);

  // Stats
  const stats = useMemo(() => {
    const f = filtrados;
    const laVega = f.filter(a => a.finca === 'La Vega').length;
    const bariloche = f.filter(a => a.finca === 'Bariloche').length;
    const madres = f.filter(a => a.esMadre).length;
    const machos = f.filter(a => a.sexo === 'M').length;
    const hembras = f.filter(a => a.sexo === 'H').length;
    const activos = f.filter(a => a.estado === 'Activo').length;
    const vendidos = f.filter(a => a.estado === 'Vendido').length;
    const muertos = f.filter(a => a.estado === 'Muerto').length;
    return { total: f.length, laVega, bariloche, madres, machos, hembras, activos, vendidos, muertos };
  }, [filtrados]);

  // Paginación
  const paginados = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtrados.slice(start, start + PAGE_SIZE);
  }, [filtrados, page]);
  const totalPages = Math.ceil(filtrados.length / PAGE_SIZE);

  // Reset page on filter change
  const updateFiltro = (key, val) => { setFiltros(prev => ({ ...prev, [key]: val })); setPage(1); };

  const catColor = (cat) => ({
    'VP': 'bg-green-500/20 text-green-400',
    'VS': 'bg-orange-500/20 text-orange-400',
    'NV': 'bg-purple-500/20 text-purple-400',
    'HL': 'bg-teal-500/20 text-teal-400',
    'ML': 'bg-amber-500/20 text-amber-400',
    'CM': 'bg-blue-500/20 text-blue-400',
    'CH': 'bg-pink-500/20 text-pink-400',
    'LEV': 'bg-amber-500/20 text-amber-400',
  }[cat] || 'bg-gray-500/20 text-gray-400');

  const catIcon = (cat) => ({
    'VP': '🐄', 'VS': '🐄', 'NV': '♀', 'HL': '♀', 'ML': '♂', 'CM': '♂', 'CH': '♀', 'LEV': '🐂',
  }[cat] || '❓');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">🐮 Hato General</h2>
          <p className="text-gray-400 text-sm">{todosAnimales.length} animales en total • {todosAnimales.filter(a => a.estado === 'Activo').length} activos</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <p className="text-xs text-gray-500">Total Filtrado</p>
          <p className="text-2xl font-bold text-gray-100">{stats.total}</p>
          <p className="text-xs text-gray-500 mt-1">♂{stats.machos} / ♀{stats.hembras}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 border border-green-900/50">
          <p className="text-xs text-green-500">La Vega</p>
          <p className="text-2xl font-bold text-green-400">{stats.laVega}</p>
          <p className="text-xs text-gray-500 mt-1">{stats.madres} madres</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 border border-blue-900/50">
          <p className="text-xs text-blue-500">Bariloche</p>
          <p className="text-2xl font-bold text-blue-400">{stats.bariloche}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <p className="text-xs text-gray-500">Estado</p>
          <p className="text-sm mt-1"><span className="text-green-400 font-medium">{stats.activos}</span> <span className="text-gray-600">activos</span></p>
          <p className="text-sm"><span className="text-amber-400 font-medium">{stats.vendidos}</span> <span className="text-gray-600">vendidos</span></p>
          <p className="text-sm"><span className="text-red-400 font-medium">{stats.muertos}</span> <span className="text-gray-600">muertos</span></p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <p className="text-xs text-gray-500">Categorías</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {categoriasDisponibles.slice(0, 4).map(([cat, label]) => {
              const count = filtrados.filter(a => a.categoria === cat).length;
              return count > 0 ? <span key={cat} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${catColor(cat)}`}>{cat}: {count}</span> : null;
            })}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
        <div className="flex flex-wrap gap-3">
          <select value={filtros.finca} onChange={e => updateFiltro('finca', e.target.value)}
            className="px-3 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl text-sm">
            <option value="">Todas las fincas</option>
            <option value="La Vega">La Vega</option>
            <option value="Bariloche">Bariloche</option>
          </select>
          <select value={filtros.categoria} onChange={e => updateFiltro('categoria', e.target.value)}
            className="px-3 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl text-sm">
            <option value="">Todas las categorías</option>
            {categoriasDisponibles.map(([cat, label]) => <option key={cat} value={cat}>{cat} - {label}</option>)}
          </select>
          <select value={filtros.estado} onChange={e => updateFiltro('estado', e.target.value)}
            className="px-3 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl text-sm">
            <option value="">Todos los estados</option>
            <option value="Activo">Activos</option>
            <option value="Vendido">Vendidos</option>
            <option value="Muerto">Muertos</option>
          </select>
          <select value={filtros.sexo} onChange={e => updateFiltro('sexo', e.target.value)}
            className="px-3 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl text-sm">
            <option value="">Sexo</option>
            <option value="M">♂ Macho</option>
            <option value="H">♀ Hembra</option>
          </select>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input type="text" placeholder="Buscar por número, madre o padre..." value={filtros.busqueda}
              onChange={e => updateFiltro('busqueda', e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl text-sm placeholder-gray-500" />
          </div>
          {(filtros.finca || filtros.categoria || filtros.estado || filtros.sexo || filtros.busqueda) && (
            <button onClick={() => { setFiltros({ finca: '', categoria: '', estado: '', sexo: '', busqueda: '' }); setPage(1); }}
              className="px-3 py-2 bg-red-900/30 text-red-400 rounded-xl text-sm hover:bg-red-900/50 transition-colors">
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-gray-900 rounded-2xl shadow-sm overflow-hidden border border-gray-800">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-800/50 border-b border-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Animal</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Finca</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Categoría</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400">Sexo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Edad</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Madre</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Padre</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400">Último Peso</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Fecha U. Peso</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400">Estado</th>
                <th className="px-2 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {paginados.map(a => {
                const edadStr = formatEdad(a.fechaNac);
                const peso = a.pesoActual || a.pesoDestete || a.pesoNacer;
                const pesoLabel = a.pesoActual ? `${Math.round(a.pesoActual)} kg` : a.pesoDestete ? `${Math.round(a.pesoDestete)} kg` : a.pesoNacer ? `${Math.round(a.pesoNacer)} kg` : '-';
                const fechaPeso = a.ultimoPesaje?.fecha_pesaje ? formatDate(a.ultimoPesaje.fecha_pesaje) : a.fechaDestete ? formatDate(a.fechaDestete) : a.fechaNac && a.pesoNacer ? formatDate(a.fechaNac) : '-';
                return (
                  <tr key={a.id} className={`hover:bg-gray-800/50 transition-colors ${a.estado === 'Muerto' ? 'bg-red-900/10' : a.estado === 'Vendido' ? 'bg-amber-900/10' : ''}`}>
                    <td className="px-4 py-3"><AnimalLink id={a.id} onAnimalClick={onAnimalClick} className="text-green-400 font-bold text-sm" /></td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${a.finca === 'La Vega' ? 'bg-green-900/40 text-green-400' : a.finca === 'Bariloche' ? 'bg-blue-900/40 text-blue-400' : 'bg-purple-900/40 text-purple-400'}`}>{a.finca}</span></td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${catColor(a.categoria)}`}>{catIcon(a.categoria)} {a.categoria}{a.esMadre ? ` • ${a.numPartos}p` : ''}</span></td>
                    <td className="px-4 py-3 text-center">{a.sexo === 'M' ? <span className="text-blue-400">♂</span> : a.sexo === 'H' ? <span className="text-pink-400">♀</span> : <span className="text-gray-600">-</span>}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{edadStr || '-'}</td>
                    <td className="px-4 py-3">{a.madre ? <AnimalLink id={a.madre} onAnimalClick={onAnimalClick} className="text-green-400/70 text-sm" /> : <span className="text-gray-600 text-sm">-</span>}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{a.padre || '-'}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-300">{pesoLabel}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{fechaPeso}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${a.estado === 'Activo' ? 'bg-green-900/40 text-green-400' : a.estado === 'Vendido' ? 'bg-amber-900/40 text-amber-400' : a.estado === 'Muerto' ? 'bg-red-900/40 text-red-400' : 'bg-gray-700 text-gray-400'}`}>
                        {a.estado || '-'}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-center">
                      <button onClick={() => {
                        const nac = (nacimientos || []).find(n => String(n.cria).trim() === a.id);
                        setEditAnimal(a);
                        setEditForm({
                          fecha: nac?.fecha && nac.fecha !== '1900-01-01' ? nac.fecha : '',
                          sexo: a.sexo || '',
                          madre: a.madre || '',
                          padre: a.padre || '',
                          peso_nacer: nac?.pesoNacer || nac?.peso_nacer || '',
                          peso_destete: nac?.pesoDestete || nac?.peso_destete || '',
                          fecha_destete: nac?.fechaDestete || nac?.fecha_destete || '',
                          estado: a.estado || 'Activo',
                          finca: a.finca || '',
                          comentario: a.comentario || nac?.comentario || '',
                        });
                      }} className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-gray-700 rounded-lg transition-colors">
                        <Edit2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {paginados.length === 0 && (
                <tr><td colSpan={11} className="px-4 py-12 text-center text-gray-500">No se encontraron animales con los filtros seleccionados</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-gray-800">
            <p className="text-sm text-gray-500">Mostrando {((page - 1) * PAGE_SIZE) + 1}-{Math.min(page * PAGE_SIZE, filtrados.length)} de {filtrados.length}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 bg-gray-800 rounded-lg text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft size={16} />
              </button>
              <span className="px-3 py-1.5 text-sm text-gray-400">Pág. {page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 bg-gray-800 rounded-lg text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Editar Animal */}
      {editAnimal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setEditAnimal(null)}>
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-lg border border-gray-700 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-100 mb-1">✏️ Editar Animal</h3>
            <p className="text-sm text-gray-400 mb-4">Animal: <strong className="text-green-400">{editAnimal.id}</strong> • {editAnimal.finca}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Fecha Nacimiento</label>
                <input type="date" value={editForm.fecha} onChange={e => setEditForm({ ...editForm, fecha: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Sexo</label>
                <select value={editForm.sexo} onChange={e => setEditForm({ ...editForm, sexo: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm">
                  <option value="">—</option>
                  <option value="M">♂ Macho</option>
                  <option value="H">♀ Hembra</option>
                </select>
              </div>
              <div className="relative">
                <label className="block text-xs font-medium text-gray-400 mb-1">Madre</label>
                <input type="text" value={editForm.madre} 
                  onChange={e => { setEditForm({ ...editForm, madre: e.target.value }); setShowMadreList(true); }}
                  onFocus={() => setShowMadreList(true)}
                  onBlur={() => setTimeout(() => setShowMadreList(false), 200)}
                  placeholder="Buscar hembra..." className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" />
                {showMadreList && editForm.madre !== undefined && (
                  <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg max-h-40 overflow-y-auto shadow-lg">
                    {hembras.filter(h => !editForm.madre || h.toLowerCase().includes(String(editForm.madre).toLowerCase())).slice(0, 20).map(h => (
                      <button key={h} type="button" onClick={() => { setEditForm({ ...editForm, madre: h }); setShowMadreList(false); }}
                        className="w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700 transition-colors">
                        {h}
                      </button>
                    ))}
                    {hembras.filter(h => !editForm.madre || h.toLowerCase().includes(String(editForm.madre).toLowerCase())).length === 0 && (
                      <p className="px-3 py-2 text-xs text-gray-500">No se encontró</p>
                    )}
                  </div>
                )}
              </div>
              <div className="relative">
                <label className="block text-xs font-medium text-gray-400 mb-1">Padre</label>
                <input type="text" value={editForm.padre} 
                  onChange={e => { setEditForm({ ...editForm, padre: e.target.value }); setShowPadreList(true); }}
                  onFocus={() => setShowPadreList(true)}
                  onBlur={() => setTimeout(() => setShowPadreList(false), 200)}
                  placeholder="Buscar toro..." className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" />
                {showPadreList && editForm.padre !== undefined && (
                  <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg max-h-40 overflow-y-auto shadow-lg">
                    {padres.filter(p => !editForm.padre || p.toLowerCase().includes(String(editForm.padre).toLowerCase())).slice(0, 20).map(p => (
                      <button key={p} type="button" onClick={() => { setEditForm({ ...editForm, padre: p }); setShowPadreList(false); }}
                        className="w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700 transition-colors">
                        {p}
                      </button>
                    ))}
                    {padres.filter(p => !editForm.padre || p.toLowerCase().includes(String(editForm.padre).toLowerCase())).length === 0 && (
                      <p className="px-3 py-2 text-xs text-gray-500">No se encontró</p>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Peso Nacer (kg)</label>
                <input type="number" step="0.1" value={editForm.peso_nacer} onChange={e => setEditForm({ ...editForm, peso_nacer: e.target.value })}
                  placeholder="Ej: 28" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Peso Destete (kg)</label>
                <input type="number" step="0.1" value={editForm.peso_destete} onChange={e => setEditForm({ ...editForm, peso_destete: e.target.value })}
                  placeholder="Ej: 205" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Fecha Destete</label>
                <input type="date" value={editForm.fecha_destete} onChange={e => setEditForm({ ...editForm, fecha_destete: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Estado</label>
                <select value={editForm.estado} onChange={e => setEditForm({ ...editForm, estado: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm">
                  <option value="Activo">Activo</option>
                  <option value="Vendido">Vendido</option>
                  <option value="Muerto">Muerto</option>
                  <option value="Inactivo">Inactivo</option>
                  <option value="Sociedad">Sociedad</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Finca</label>
                <select value={editForm.finca} onChange={e => setEditForm({ ...editForm, finca: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm">
                  <option value="La Vega">La Vega</option>
                  <option value="Bariloche">Bariloche</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Comentario</label>
                <input type="text" value={editForm.comentario} onChange={e => setEditForm({ ...editForm, comentario: e.target.value })}
                  placeholder="Notas..." className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditAnimal(null)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm">Cancelar</button>
              <button disabled={savingEdit} onClick={async () => {
                setSavingEdit(true);
                try {
                  const nac = (nacimientos || []).find(n => String(n.cria).trim() === editAnimal.id);
                  if (!nac) { alert('No se encontró registro en nacimientos para este animal (cria: ' + editAnimal.id + ')'); setSavingEdit(false); return; }
                  const updates = {};
                  if (editForm.fecha) { updates.fecha = editForm.fecha; }
                  if (editForm.sexo) updates.sexo = editForm.sexo;
                  if (editForm.madre !== undefined) updates.madre = editForm.madre || null;
                  if (editForm.padre !== undefined) updates.padre = editForm.padre || null;
                  if (editForm.peso_nacer !== '' && editForm.peso_nacer != null) updates.peso_nacer = parseFloat(editForm.peso_nacer);
                  if (editForm.peso_destete !== '' && editForm.peso_destete != null) updates.peso_destete = parseFloat(editForm.peso_destete);
                  if (editForm.fecha_destete) updates.fecha_destete = editForm.fecha_destete;
                  if (editForm.estado) updates.estado = editForm.estado;
                  if (editForm.finca) updates.finca = editForm.finca;
                  if (editForm.comentario !== undefined) updates.comentario = editForm.comentario;
                  if (Object.keys(updates).length === 0) { alert('No hay cambios para guardar'); setSavingEdit(false); return; }
                  console.log('Guardando animal:', editAnimal.id, 'nac.id:', nac.id, 'updates:', updates);
                  // Optimistic update: actualizar estado local inmediatamente
                  setNacimientos(prev => prev.map(n => n.id === nac.id ? { ...n, ...updates, pesoNacer: updates.peso_nacer ?? n.pesoNacer, pesoDestete: updates.peso_destete ?? n.pesoDestete, fechaDestete: updates.fecha_destete ?? n.fechaDestete, fincaDB: updates.finca ?? n.fincaDB } : n));
                  setEditAnimal(null);
                  setSavingEdit(false);
                  // Fire-and-forget: enviar a DB en background
                  db.updateNacimiento(nac.id, updates).then(() => {
                    console.log('✅ Guardado en DB:', editAnimal.id);
                  }).catch(e => {
                    console.error('❌ Error guardando en DB:', e);
                    alert('Los cambios se ven localmente pero hubo un error al guardar en la base de datos. Recarga la página para verificar.');
                  });
                } catch (e) { console.error('Error:', e); alert('Error: ' + e.message); setSavingEdit(false); }
              }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2">
                {savingEdit ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : <><Check size={14} /> Guardar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== COMPONENTE COSTOS ====================
function Costos({ gastos, total, totales, filtros, setFiltros, onNew, onEdit, onDel, onApprove, page, pages, setPage, años, canEdit }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Costos y Gastos</h2>
          <p className="text-gray-400 text-sm">{total.toLocaleString()} registros • {formatCurrency(totales.total)}</p>
        </div>
        {canEdit && (
          <button onClick={onNew} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-xl shadow-lg hover:bg-green-700">
            <PlusCircle size={20} />Nuevo
          </button>
        )}
      </div>

      <div className="bg-gray-900 rounded-2xl p-4 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <select value={filtros.año} onChange={e => setFiltros({ ...filtros, año: e.target.value })} className="px-3 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl text-sm">
            <option value="">Año</option>
            {años.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={filtros.mes} onChange={e => setFiltros({ ...filtros, mes: e.target.value })} className="px-3 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl text-sm">
            <option value="">Mes</option>
            {['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map((m, i) => <option key={m} value={m}>{MESES[i + 1]}</option>)}
          </select>
          <select value={filtros.centro} onChange={e => setFiltros({ ...filtros, centro: e.target.value })} className="px-3 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl text-sm">
            <option value="">Centro</option>
            {CENTROS_COSTOS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filtros.categoria} onChange={e => setFiltros({ ...filtros, categoria: e.target.value })} className="px-3 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl text-sm">
            <option value="">Categoría</option>
            {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input type="text" placeholder="Buscar..." value={filtros.busqueda} onChange={e => setFiltros({ ...filtros, busqueda: e.target.value })} className="w-full pl-10 pr-4 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl text-sm" />
          </div>
        </div>
      </div>

      <div className="bg-gray-900 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-800/50 border-b border-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Fecha</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Proveedor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 hidden md:table-cell">Comentarios</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Centro</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400">Monto</th>
                {canEdit && <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400">Acc.</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {gastos.map(g => (
                <tr key={g.id} className={`hover:bg-gray-800/50 ${g.estado === 'pendiente' ? 'bg-orange-900/20' : ''}`}>
                  <td className="px-4 py-3 text-sm">{formatDate(g.fecha)}</td>
                  <td className="px-4 py-3 font-medium text-sm">{g.proveedor}</td>
                  <td className="px-4 py-3 text-sm text-gray-400 hidden md:table-cell truncate max-w-xs">{g.comentarios}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-full ${centroColor(g.centro)}`}>{g.centro}</span></td>
                  <td className="px-4 py-3 text-right font-semibold text-sm">{formatCurrency(g.monto)}</td>
                  {canEdit && (
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-1">
                        {g.estado === 'pendiente' && <button onClick={() => onApprove(g.id)} className="p-1.5 text-green-500 hover:bg-green-900/20 rounded-lg"><Check size={16} /></button>}
                        <button onClick={() => onEdit(g)} className="p-1.5 text-blue-500 hover:bg-blue-900/20 rounded-lg"><Edit2 size={16} /></button>
                        <button onClick={() => onDel(g.id)} className="p-1.5 text-red-500 hover:bg-red-900/20 rounded-lg"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-800/50">
            <span className="text-sm text-gray-400">Pág {page}/{pages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(page - 1)} disabled={page === 1} className="p-2 rounded-lg hover:bg-gray-700 disabled:opacity-50"><ChevronLeft size={20} /></button>
              <button onClick={() => setPage(page + 1)} disabled={page === pages} className="p-2 rounded-lg hover:bg-gray-700 disabled:opacity-50"><ChevronRight size={20} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== COMPONENTE FORM ====================
function Form({ gasto, onSave, onClose }) {
  const [f, setF] = useState(gasto || { fecha: new Date().toISOString().split('T')[0], monto: '', proveedor: '', tipo: 'Costo', centro: 'La Vega', categoria: '', comentarios: '' });
  const [sug, setSug] = useState([]);

  const handleProv = v => {
    setF({ ...f, proveedor: v });
    if (v.length >= 2) setSug(Object.keys(PROVEEDORES_CONOCIDOS).filter(p => p.toLowerCase().includes(v.toLowerCase())).slice(0, 5));
    else setSug([]);
    if (PROVEEDORES_CONOCIDOS[v]) { setF(x => ({ ...x, categoria: PROVEEDORES_CONOCIDOS[v].categoria, centro: PROVEEDORES_CONOCIDOS[v].centro })); setSug([]); }
  };

  const selSug = p => {
    setF({ ...f, proveedor: p, categoria: PROVEEDORES_CONOCIDOS[p].categoria, centro: PROVEEDORES_CONOCIDOS[p].centro });
    setSug([]);
  };

  const submit = e => {
    e.preventDefault();
    if (!f.fecha || !f.monto || !f.proveedor || !f.categoria) { alert('Complete campos'); return; }
    onSave({ ...f, monto: parseFloat(f.monto) });
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-lg">
        <div className="p-6 border-b border-gray-800 flex justify-between">
          <h3 className="text-lg font-semibold">{gasto ? 'Editar' : 'Nuevo'} Registro</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg"><X size={20} /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Fecha</label>
              <input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} className="w-full px-3 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Monto</label>
              <input type="number" value={f.monto} onChange={e => setF({ ...f, monto: e.target.value })} className="w-full px-3 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl" required />
            </div>
          </div>
          <div className="relative">
            <label className="block text-sm font-medium mb-1">Proveedor</label>
            <input type="text" value={f.proveedor} onChange={e => handleProv(e.target.value)} className="w-full px-3 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl" required />
            {sug.length > 0 && <div className="absolute z-10 w-full bg-gray-800 border border-gray-700 rounded-xl mt-1 shadow-lg">{sug.map(p => <button key={p} type="button" onClick={() => selSug(p)} className="w-full px-4 py-2 text-left hover:bg-gray-800/50 text-sm">{p}</button>)}</div>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Tipo</label>
              <select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })} className="w-full px-3 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl"><option>Costo</option><option>Gasto</option></select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Centro</label>
              <select value={f.centro} onChange={e => setF({ ...f, centro: e.target.value })} className="w-full px-3 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl">{CENTROS_COSTOS.map(c => <option key={c}>{c}</option>)}</select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Categoría</label>
            <select value={f.categoria} onChange={e => setF({ ...f, categoria: e.target.value })} className="w-full px-3 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl" required><option value="">Seleccione</option>{CATEGORIAS.map(c => <option key={c}>{c}</option>)}</select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Comentarios</label>
            <textarea value={f.comentarios} onChange={e => setF({ ...f, comentarios: e.target.value })} className="w-full px-3 py-2 border border-gray-700 bg-gray-800 text-gray-200 rounded-xl" rows={2} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-700 text-gray-300 rounded-xl hover:bg-gray-800">Cancelar</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700">Guardar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==================== COMPONENTE CARD ====================
function Card({ title, value, icon: Icon, color, sub }) {
  return (
    <div className={`bg-gradient-to-br ${color} rounded-2xl p-4 text-white shadow-lg`}>
      <div className="flex justify-between">
        <div>
          <p className="text-white/80 text-sm">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {sub && <p className="text-white/60 text-xs">{sub}</p>}
        </div>
        <Icon size={32} className="opacity-50" />
      </div>
    </div>
  );
}
