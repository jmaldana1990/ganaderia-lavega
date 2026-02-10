import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, Target, Activity, Baby, Scale } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend, ComposedChart, Cell
} from 'recharts';

// ==================== HELPERS ====================
const formatCurrency = (v) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v);

const CATEGORIAS_EXCLUIDAS = ['Las Victorias', 'Yegua Mauricio Aldana', 'Apicultura', 'Montaje finca'];
const CENTROS_EXCLUIDOS = ['Yegua MAG', 'Apicultura', 'Aparco'];

const COLORS = {
  primary: '#3b82f6',
  secondary: '#8b5cf6',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  pink: '#ec4899',
  teal: '#14b8a6',
  gray: '#6b7280',
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white p-3 rounded-xl shadow-lg border text-sm">
      <p className="font-bold text-gray-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: p.color }} />
          {p.name}: <span className="font-semibold">{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</span>
        </p>
      ))}
    </div>
  );
};

// ==================== TREND ARROW ====================
function TrendArrow({ current, previous, invertido = false }) {
  if (current == null || previous == null) return <Minus size={14} className="text-gray-400" />;
  const diff = current - previous;
  if (Math.abs(diff) < 0.5) return <Minus size={14} className="text-gray-400" />;
  const mejora = invertido ? diff < 0 : diff > 0;
  return mejora
    ? <TrendingUp size={14} className="text-green-500" />
    : <TrendingDown size={14} className="text-red-500" />;
}

// ==================== CHART WRAPPER ====================
function ChartCard({ title, children, subtitle }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-1">{title}</h3>
      {subtitle && <p className="text-xs text-gray-400 mb-3">{subtitle}</p>}
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ==================== MAIN COMPONENT ====================
export default function KPITrends({ finca, nacimientos, gastos, inventario, pesajes, palpaciones, servicios, destetes }) {
  // ---- Compute all available years from all data sources ----
  const todosAños = useMemo(() => {
    const set = new Set();
    nacimientos.forEach(n => { if (n.año) set.add(n.año); });
    gastos.filter(g => g.fecha && (g.centro === finca || g.centro === 'Global')).forEach(g => {
      const a = parseInt(g.fecha.split('-')[0]);
      if (!isNaN(a)) set.add(a);
    });
    inventario.filter(i => i.finca === finca).forEach(i => { if (i.año) set.add(i.año); });
    (pesajes || []).filter(p => p.finca === finca).forEach(p => {
      if (p.fecha_pesaje) { const a = parseInt(p.fecha_pesaje.split('-')[0]); if (!isNaN(a)) set.add(a); }
    });
    (palpaciones || []).filter(p => p.finca === finca).forEach(p => {
      if (p.fecha) { const a = parseInt(p.fecha.split('-')[0]); if (!isNaN(a)) set.add(a); }
    });
    (destetes || []).filter(d => d.fecha_destete).forEach(d => {
      const a = parseInt(d.fecha_destete.split('-')[0]); if (!isNaN(a)) set.add(a);
    });
    return [...set].sort();
  }, [nacimientos, gastos, inventario, pesajes, palpaciones, servicios, destetes, finca]);

  // ---- Compute La Vega KPIs per year ----
  const kpisLaVegaPorAño = useMemo(() => {
    if (finca !== 'La Vega') return [];

    return todosAños.map(año => {
      const nacTodos = nacimientos.filter(n => n.año === año);
      const nacActivos = nacTodos.filter(n => n.estado === 'Activo');
      const nacMuertos = nacTodos.filter(n => n.estado === 'Muerto');

      // Peso nacer
      const conPesoNacer = nacActivos.filter(n => n.pesoNacer && n.pesoNacer > 0);
      const pesoNacer = conPesoNacer.length ? conPesoNacer.reduce((s, n) => s + n.pesoNacer, 0) / conPesoNacer.length : null;

      // Destetes from nacimientos
      const destetadosNac = nacimientos.filter(n => {
        const ad = n.añoDestete || n.año_destete;
        return n.estado === 'Activo' && (n.pesoDestete || n.peso_destete) && ad === año;
      });
      // Destetes from destetes table
      const destetadosTab = (destetes || []).filter(d => d.fecha_destete && parseInt(d.fecha_destete.split('-')[0]) === año);

      const usarTabla = destetadosTab.length > destetadosNac.length;
      let pesoDestM = null, pesoDestH = null, destMn = 0, destHn = 0, destetadosTotal = 0, gdpProm = null;

      if (usarTabla && destetadosTab.length > 0) {
        const dm = destetadosTab.filter(d => d.sexo === 'M');
        const dh = destetadosTab.filter(d => d.sexo === 'H');
        pesoDestM = dm.length ? dm.reduce((s, d) => s + (d.peso_destete || 0), 0) / dm.length : null;
        pesoDestH = dh.length ? dh.reduce((s, d) => s + (d.peso_destete || 0), 0) / dh.length : null;
        destMn = dm.length; destHn = dh.length;
        destetadosTotal = destetadosTab.length;
        const conGDP = destetadosTab.filter(d => d.gdp_predestete && d.gdp_predestete > 0);
        gdpProm = conGDP.length ? conGDP.reduce((s, d) => s + d.gdp_predestete, 0) / conGDP.length : null;
      } else {
        const getPeso = n => n.pesoDestete || n.peso_destete || 0;
        const dm = destetadosNac.filter(n => n.sexo === 'M');
        const dh = destetadosNac.filter(n => n.sexo === 'H');
        pesoDestM = dm.length ? dm.reduce((s, n) => s + getPeso(n), 0) / dm.length : null;
        pesoDestH = dh.length ? dh.reduce((s, n) => s + getPeso(n), 0) / dh.length : null;
        destMn = dm.length; destHn = dh.length;
        destetadosTotal = destetadosNac.length;
        const conGDP = destetadosNac.filter(n => n.grDiaVida && n.grDiaVida > 0);
        gdpProm = conGDP.length ? conGDP.reduce((s, n) => s + n.grDiaVida, 0) / conGDP.length : null;
      }

      // Mortalidad
      const mortalidad = nacTodos.length > 0 ? (nacMuertos.length / nacTodos.length) * 100 : null;

      // IEP
      const porMadre = {};
      nacimientos.filter(n => n.madre && n.fecha).forEach(n => {
        if (!porMadre[n.madre]) porMadre[n.madre] = [];
        porMadre[n.madre].push(new Date(n.fecha));
      });
      // Filter intervals that end in this year
      const intervalosAño = [];
      Object.values(porMadre).forEach(fechas => {
        if (fechas.length < 2) return;
        fechas.sort((a, b) => a - b);
        for (let i = 1; i < fechas.length; i++) {
          if (fechas[i].getFullYear() === año) {
            const dias = (fechas[i] - fechas[i - 1]) / (1000 * 60 * 60 * 24);
            if (dias > 200 && dias < 800) intervalosAño.push(dias);
          }
        }
      });
      const iep = intervalosAño.length ? intervalosAño.reduce((s, d) => s + d, 0) / intervalosAño.length : null;

      // Fertilidad
      const palpAño = (palpaciones || []).filter(p => p.finca === 'La Vega' && p.fecha && parseInt(p.fecha.split('-')[0]) === año);
      const ultimaPalp = {};
      palpAño.forEach(p => { if (!ultimaPalp[p.hembra] || p.fecha > ultimaPalp[p.hembra].fecha) ultimaPalp[p.hembra] = p; });
      const palpUnicas = Object.values(ultimaPalp);
      const totalPalpadas = palpUnicas.length;
      const preñadas = palpUnicas.filter(p => {
        const gest = (p.dias_gestacion || '').toString().trim().toUpperCase();
        return gest !== 'VACIA' && gest !== '' && !isNaN(parseInt(gest));
      }).length;
      const fertilidad = totalPalpadas > 0 ? (preñadas / totalPalpadas) * 100 : null;

      // Costos
      const costosAño = gastos
        .filter(g => {
          if (!g.fecha) return false;
          const a = g.fecha.split('-')[0];
          const cat = (g.categoria || '').trim();
          const centro = (g.centro || '').trim();
          const esExcluido = CATEGORIAS_EXCLUIDAS.some(exc => cat.toLowerCase() === exc.toLowerCase()) ||
                             CENTROS_EXCLUIDOS.some(exc => centro.toLowerCase() === exc.toLowerCase());
          return !esExcluido && parseInt(a) === año && (g.centro === finca || g.centro === 'Global');
        })
        .reduce((sum, g) => sum + ((g.centro === 'Global' ? (g.monto || 0) * 0.5 : (g.monto || 0))), 0);

      const costoDestetado = destetadosTotal > 0 ? costosAño / destetadosTotal : null;

      // Nacimientos machos/hembras
      const machos = nacActivos.filter(n => n.sexo === 'M').length;
      const hembras = nacActivos.filter(n => n.sexo === 'H').length;

      return {
        año,
        nacidos: nacTodos.length,
        machos, hembras,
        pesoNacer,
        pesoDestM, pesoDestH,
        destMn, destHn,
        destetados: destetadosTotal,
        gdpProm,
        mortalidad,
        iep,
        fertilidad,
        totalPalpadas,
        preñadas,
        costos: costosAño,
        costoDestetado,
      };
    });
  }, [finca, todosAños, nacimientos, destetes, palpaciones, gastos]);

  // ---- Compute Bariloche KPIs per year ----
  const kpisBarilochePorAño = useMemo(() => {
    if (finca !== 'Bariloche') return [];

    return todosAños.map(año => {
      // Pesajes
      const pesAño = (pesajes || []).filter(p => p.finca === 'Bariloche' && p.fecha_pesaje && parseInt(p.fecha_pesaje.split('-')[0]) === año);
      const conGDPEntre = pesAño.filter(p => p.gdp_entre_pesajes && p.gdp_entre_pesajes > 0);
      const gdpEntreProm = conGDPEntre.length ? conGDPEntre.reduce((s, p) => s + p.gdp_entre_pesajes, 0) / conGDPEntre.length : null;
      const conGDPVida = pesAño.filter(p => p.gdp_vida && p.gdp_vida > 0);
      const gdpVidaProm = conGDPVida.length ? conGDPVida.reduce((s, p) => s + p.gdp_vida, 0) / conGDPVida.length : null;

      // Peso promedio (último pesaje por animal)
      const ultimoPesaje = {};
      pesAño.forEach(p => {
        if (!ultimoPesaje[p.animal] || p.fecha_pesaje > ultimoPesaje[p.animal].fecha_pesaje) ultimoPesaje[p.animal] = p;
      });
      const ultimos = Object.values(ultimoPesaje);
      const pesoProm = ultimos.length ? ultimos.reduce((s, p) => s + (p.peso || 0), 0) / ultimos.length : null;

      // Inventario
      const invAño = inventario.filter(i => i.finca === 'Bariloche' && i.año === año);
      const ultimoInv = invAño.sort((a, b) => b.mes - a.mes)[0];
      const cabezas = ultimoInv?.total || 0;

      // Costos
      const costosAño = gastos
        .filter(g => {
          if (!g.fecha) return false;
          const a = g.fecha.split('-')[0];
          const cat = (g.categoria || '').trim();
          const centro = (g.centro || '').trim();
          const esExcluido = CATEGORIAS_EXCLUIDAS.some(exc => cat.toLowerCase() === exc.toLowerCase()) ||
                             CENTROS_EXCLUIDOS.some(exc => centro.toLowerCase() === exc.toLowerCase());
          return !esExcluido && parseInt(a) === año && (g.centro === 'Bariloche' || g.centro === 'Global');
        })
        .reduce((sum, g) => sum + ((g.centro === 'Global' ? (g.monto || 0) * 0.5 : (g.monto || 0))), 0);

      const costoAnimal = cabezas > 0 ? costosAño / cabezas : null;

      // GDP por categoría
      const gdpPorCat = {};
      conGDPEntre.forEach(p => {
        const cat = p.categoria || 'Otro';
        if (!gdpPorCat[cat]) gdpPorCat[cat] = { sum: 0, count: 0 };
        gdpPorCat[cat].sum += p.gdp_entre_pesajes;
        gdpPorCat[cat].count++;
      });

      return {
        año,
        gdpEntreProm,
        gdpVidaProm,
        pesoProm,
        cabezas,
        costos: costosAño,
        costoAnimal,
        pesajesTotal: pesAño.length,
        animalesPesados: ultimos.length,
        gdpPorCat,
      };
    });
  }, [finca, todosAños, pesajes, inventario, gastos]);

  // ---- Choose data based on finca ----
  const dataAños = finca === 'La Vega' ? kpisLaVegaPorAño : kpisBarilochePorAño;
  const dataConDatos = dataAños.filter(d => {
    if (finca === 'La Vega') return d.nacidos > 0 || d.costos > 0 || d.fertilidad != null;
    return d.pesajesTotal > 0 || d.costos > 0 || d.cabezas > 0;
  });

  if (dataConDatos.length === 0) {
    return (
      <div className="bg-gray-50 border border-dashed border-gray-300 rounded-2xl p-8 text-center">
        <Activity size={48} className="mx-auto text-gray-300 mb-4" />
        <p className="text-gray-500">No hay suficientes datos para mostrar tendencias</p>
      </div>
    );
  }

  // ==================== LA VEGA RENDER ====================
  if (finca === 'La Vega') {
    // Prep chart data (only years with meaningful data)
    const chartData = dataConDatos.map(d => ({
      año: d.año.toString(),
      ...d,
      gdpDisplay: d.gdpProm != null ? (d.gdpProm > 100 ? d.gdpProm : d.gdpProm * 1000) : null, // ensure g/día
    }));

    // Scorecard data
    const current = chartData[chartData.length - 1];
    const prev = chartData.length >= 2 ? chartData[chartData.length - 2] : null;

    const scorecard = [
      { label: 'Nacimientos', val: current?.nacidos, prev: prev?.nacidos, fmt: v => v?.toFixed(0) || '—', meta: null },
      { label: 'Peso Nacer (kg)', val: current?.pesoNacer, prev: prev?.pesoNacer, fmt: v => v?.toFixed(1) || '—', meta: 28 },
      { label: 'Peso Dest. ♂ (kg)', val: current?.pesoDestM, prev: prev?.pesoDestM, fmt: v => v?.toFixed(1) || '—', meta: 220 },
      { label: 'Peso Dest. ♀ (kg)', val: current?.pesoDestH, prev: prev?.pesoDestH, fmt: v => v?.toFixed(1) || '—', meta: 210 },
      { label: 'GDP Pre-destete (g/d)', val: current?.gdpDisplay, prev: prev?.gdpDisplay, fmt: v => v?.toFixed(0) || '—', meta: 800 },
      { label: 'Mortalidad %', val: current?.mortalidad, prev: prev?.mortalidad, fmt: v => v?.toFixed(1) + '%' || '—', meta: null, invertido: true },
      { label: 'IEP (días)', val: current?.iep, prev: prev?.iep, fmt: v => v?.toFixed(0) || '—', meta: 400, invertido: true },
      { label: 'Fertilidad %', val: current?.fertilidad, prev: prev?.fertilidad, fmt: v => v?.toFixed(1) + '%' || '—', meta: 80 },
      { label: 'Costo/Destetado', val: current?.costoDestetado, prev: prev?.costoDestetado, fmt: v => v ? formatCurrency(v) : '—', meta: null, invertido: true },
    ];

    return (
      <div className="space-y-6">
        {/* Scorecard table */}
        <div className="bg-white rounded-2xl p-5 shadow-sm overflow-x-auto">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Target size={20} className="text-green-600" /> Scorecard Año a Año</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-2 pr-4 font-semibold text-gray-600">KPI</th>
                {chartData.map(d => (
                  <th key={d.año} className="text-center py-2 px-3 font-semibold text-gray-600">{d.año}</th>
                ))}
                <th className="text-center py-2 px-2 font-semibold text-gray-600">Meta</th>
                <th className="text-center py-2 px-2 font-semibold text-gray-600">Tend.</th>
              </tr>
            </thead>
            <tbody>
              {scorecard.map((row, ri) => (
                <tr key={ri} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2.5 pr-4 font-medium text-gray-700 whitespace-nowrap">{row.label}</td>
                  {chartData.map((d, ci) => {
                    const key = row.label.includes('Nacimientos') ? 'nacidos' :
                      row.label.includes('Nacer') ? 'pesoNacer' :
                      row.label.includes('♂') ? 'pesoDestM' :
                      row.label.includes('♀') ? 'pesoDestH' :
                      row.label.includes('GDP') ? 'gdpDisplay' :
                      row.label.includes('Mortalidad') ? 'mortalidad' :
                      row.label.includes('IEP') ? 'iep' :
                      row.label.includes('Fertilidad') ? 'fertilidad' :
                      row.label.includes('Costo') ? 'costoDestetado' : '';
                    const val = d[key];
                    const cumpleMeta = row.meta != null && val != null ?
                      (row.invertido ? val <= row.meta : val >= row.meta) : null;
                    return (
                      <td key={ci} className={`text-center py-2.5 px-3 font-mono text-sm ${cumpleMeta === true ? 'text-green-600 font-semibold' : cumpleMeta === false ? 'text-red-500' : 'text-gray-700'}`}>
                        {val != null ? row.fmt(val) : '—'}
                      </td>
                    );
                  })}
                  <td className="text-center py-2.5 px-2 text-xs text-gray-400">{row.meta != null ? (row.invertido ? `≤${row.meta}` : `≥${row.meta}`) : '—'}</td>
                  <td className="text-center py-2.5 px-2"><TrendArrow current={row.val} previous={row.prev} invertido={row.invertido} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Charts grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Nacimientos por año */}
          <ChartCard title="Nacimientos por Año" subtitle="♂ Machos vs ♀ Hembras">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="año" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="machos" name="♂ Machos" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
              <Bar dataKey="hembras" name="♀ Hembras" fill={COLORS.pink} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartCard>

          {/* Peso Nacer */}
          <ChartCard title="Peso al Nacer Promedio" subtitle="Meta: 28 kg">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="año" tick={{ fontSize: 12 }} />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={28} stroke={COLORS.success} strokeDasharray="6 3" label={{ value: 'Meta 28', position: 'right', fontSize: 11, fill: COLORS.success }} />
              <Bar dataKey="pesoNacer" name="Peso Nacer (kg)" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
            </ComposedChart>
          </ChartCard>

          {/* Peso Destete */}
          <ChartCard title="Peso al Destete" subtitle="Metas: ♂ 220 kg, ♀ 210 kg">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="año" tick={{ fontSize: 12 }} />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <ReferenceLine y={220} stroke={COLORS.primary} strokeDasharray="6 3" />
              <ReferenceLine y={210} stroke={COLORS.pink} strokeDasharray="6 3" />
              <Line type="monotone" dataKey="pesoDestM" name="♂ Machos (kg)" stroke={COLORS.primary} strokeWidth={2.5} dot={{ r: 5 }} connectNulls />
              <Line type="monotone" dataKey="pesoDestH" name="♀ Hembras (kg)" stroke={COLORS.pink} strokeWidth={2.5} dot={{ r: 5 }} connectNulls />
            </LineChart>
          </ChartCard>

          {/* GDP Pre-destete */}
          <ChartCard title="GDP Pre-destete" subtitle="Meta: 800 g/día">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="año" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={800} stroke={COLORS.success} strokeDasharray="6 3" label={{ value: 'Meta 800', position: 'right', fontSize: 11, fill: COLORS.success }} />
              <Bar dataKey="gdpDisplay" name="GDP (g/día)" fill={COLORS.warning} radius={[4, 4, 0, 0]}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.gdpDisplay >= 800 ? COLORS.success : COLORS.warning} />
                ))}
              </Bar>
            </ComposedChart>
          </ChartCard>

          {/* Mortalidad */}
          <ChartCard title="Tasa de Mortalidad %" subtitle="Menor es mejor">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="año" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="mortalidad" name="Mortalidad %" radius={[4, 4, 0, 0]}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.mortalidad <= 3 ? COLORS.success : d.mortalidad <= 5 ? COLORS.warning : COLORS.danger} />
                ))}
              </Bar>
            </BarChart>
          </ChartCard>

          {/* IEP */}
          <ChartCard title="Intervalo Entre Partos" subtitle="Meta: ≤ 400 días">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="año" tick={{ fontSize: 12 }} />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={400} stroke={COLORS.danger} strokeDasharray="6 3" label={{ value: 'Meta 400', position: 'right', fontSize: 11, fill: COLORS.danger }} />
              <Bar dataKey="iep" name="IEP (días)" fill={COLORS.secondary} radius={[4, 4, 0, 0]}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.iep && d.iep <= 400 ? COLORS.success : COLORS.secondary} />
                ))}
              </Bar>
            </ComposedChart>
          </ChartCard>

          {/* Fertilidad */}
          <ChartCard title="Índice de Fertilidad" subtitle="Meta: ≥ 80%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="año" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={80} stroke={COLORS.success} strokeDasharray="6 3" label={{ value: 'Meta 80%', position: 'right', fontSize: 11, fill: COLORS.success }} />
              <Bar dataKey="fertilidad" name="Fertilidad %" fill={COLORS.teal} radius={[4, 4, 0, 0]}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.fertilidad >= 80 ? COLORS.success : COLORS.danger} />
                ))}
              </Bar>
            </ComposedChart>
          </ChartCard>

          {/* Costo por destetado */}
          <ChartCard title="Costo por Destetado" subtitle="Menor es mejor">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="año" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={v => `$${(v / 1000000).toFixed(1)}M`} tick={{ fontSize: 12 }} />
              <Tooltip content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="bg-white p-3 rounded-xl shadow-lg border text-sm">
                    <p className="font-bold text-gray-700 mb-1">{label}</p>
                    {payload.map((p, i) => (
                      <p key={i} className="text-gray-600">{p.name}: <span className="font-semibold">{formatCurrency(p.value)}</span></p>
                    ))}
                  </div>
                );
              }} />
              <Bar dataKey="costoDestetado" name="$/Destetado" fill={COLORS.danger} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartCard>
        </div>
      </div>
    );
  }

  // ==================== BARILOCHE RENDER ====================
  if (finca === 'Bariloche') {
    const chartData = dataConDatos.map(d => ({
      año: d.año.toString(),
      ...d,
    }));

    const current = chartData[chartData.length - 1];
    const prev = chartData.length >= 2 ? chartData[chartData.length - 2] : null;

    const catNames = { NV: 'Novillas', HL: 'Hembras Lev.', ML: 'Machos Lev.', CM: 'Cría Macho', CH: 'Cría Hembra', TR: 'Toro', NAS: 'NAS' };

    // GDP por categoría across years for chart
    const allCats = new Set();
    chartData.forEach(d => {
      if (d.gdpPorCat) Object.keys(d.gdpPorCat).forEach(c => allCats.add(c));
    });
    const gdpCatData = chartData.map(d => {
      const row = { año: d.año };
      allCats.forEach(cat => {
        const c = d.gdpPorCat?.[cat];
        row[cat] = c ? c.sum / c.count : null;
      });
      return row;
    }).filter(d => Object.keys(d).some(k => k !== 'año' && d[k] != null));
    const catColors = [COLORS.primary, COLORS.pink, COLORS.warning, COLORS.teal, COLORS.secondary, COLORS.danger];

    const scorecard = [
      { label: 'Cabezas', val: current?.cabezas, prev: prev?.cabezas, fmt: v => v?.toFixed(0) || '—' },
      { label: 'GDP Entre Pesajes (g/d)', val: current?.gdpEntreProm, prev: prev?.gdpEntreProm, fmt: v => v?.toFixed(0) || '—', meta: 500 },
      { label: 'GDP Vida (g/d)', val: current?.gdpVidaProm, prev: prev?.gdpVidaProm, fmt: v => v?.toFixed(0) || '—' },
      { label: 'Peso Promedio (kg)', val: current?.pesoProm, prev: prev?.pesoProm, fmt: v => v?.toFixed(0) || '—' },
      { label: 'Costo/Animal', val: current?.costoAnimal, prev: prev?.costoAnimal, fmt: v => v ? formatCurrency(v) : '—', invertido: true },
      { label: 'Pesajes', val: current?.pesajesTotal, prev: prev?.pesajesTotal, fmt: v => v?.toFixed(0) || '—' },
    ];

    return (
      <div className="space-y-6">
        {/* Scorecard */}
        <div className="bg-white rounded-2xl p-5 shadow-sm overflow-x-auto">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Target size={20} className="text-blue-600" /> Scorecard Año a Año</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-2 pr-4 font-semibold text-gray-600">KPI</th>
                {chartData.map(d => (
                  <th key={d.año} className="text-center py-2 px-3 font-semibold text-gray-600">{d.año}</th>
                ))}
                <th className="text-center py-2 px-2 font-semibold text-gray-600">Meta</th>
                <th className="text-center py-2 px-2 font-semibold text-gray-600">Tend.</th>
              </tr>
            </thead>
            <tbody>
              {scorecard.map((row, ri) => {
                const key = row.label.includes('Cabezas') ? 'cabezas' :
                  row.label.includes('Entre') ? 'gdpEntreProm' :
                  row.label.includes('Vida') ? 'gdpVidaProm' :
                  row.label.includes('Peso') ? 'pesoProm' :
                  row.label.includes('Costo') ? 'costoAnimal' :
                  row.label.includes('Pesajes') ? 'pesajesTotal' : '';
                return (
                  <tr key={ri} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2.5 pr-4 font-medium text-gray-700 whitespace-nowrap">{row.label}</td>
                    {chartData.map((d, ci) => {
                      const val = d[key];
                      const cumple = row.meta != null && val != null ? (row.invertido ? val <= row.meta : val >= row.meta) : null;
                      return (
                        <td key={ci} className={`text-center py-2.5 px-3 font-mono text-sm ${cumple === true ? 'text-green-600 font-semibold' : cumple === false ? 'text-red-500' : 'text-gray-700'}`}>
                          {val != null ? row.fmt(val) : '—'}
                        </td>
                      );
                    })}
                    <td className="text-center py-2.5 px-2 text-xs text-gray-400">{row.meta != null ? `≥${row.meta}` : '—'}</td>
                    <td className="text-center py-2.5 px-2"><TrendArrow current={row.val} previous={row.prev} invertido={row.invertido} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* GDP entre pesajes */}
          <ChartCard title="GDP Entre Pesajes" subtitle="Meta: 500 g/día">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="año" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={500} stroke={COLORS.success} strokeDasharray="6 3" label={{ value: 'Meta 500', position: 'right', fontSize: 11, fill: COLORS.success }} />
              <Bar dataKey="gdpEntreProm" name="GDP (g/día)" fill={COLORS.primary} radius={[4, 4, 0, 0]}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.gdpEntreProm >= 500 ? COLORS.success : COLORS.warning} />
                ))}
              </Bar>
            </ComposedChart>
          </ChartCard>

          {/* Peso Promedio */}
          <ChartCard title="Peso Promedio" subtitle="Último pesaje por animal">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="año" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="pesoProm" name="Peso (kg)" fill={COLORS.secondary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartCard>

          {/* Costo por animal */}
          <ChartCard title="Costo por Animal" subtitle="Menor es mejor">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="año" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={v => `$${(v / 1000000).toFixed(1)}M`} tick={{ fontSize: 12 }} />
              <Tooltip content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="bg-white p-3 rounded-xl shadow-lg border text-sm">
                    <p className="font-bold text-gray-700 mb-1">{label}</p>
                    {payload.map((p, i) => (
                      <p key={i} className="text-gray-600">{p.name}: <span className="font-semibold">{formatCurrency(p.value)}</span></p>
                    ))}
                  </div>
                );
              }} />
              <Bar dataKey="costoAnimal" name="$/Animal" fill={COLORS.danger} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartCard>

          {/* GDP por categoría */}
          {gdpCatData.length > 0 && (
            <ChartCard title="GDP por Categoría" subtitle="Evolución año a año">
              <LineChart data={gdpCatData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="año" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <ReferenceLine y={500} stroke={COLORS.gray} strokeDasharray="6 3" />
                {[...allCats].map((cat, i) => (
                  <Line key={cat} type="monotone" dataKey={cat} name={catNames[cat] || cat}
                    stroke={catColors[i % catColors.length]} strokeWidth={2} dot={{ r: 4 }} connectNulls />
                ))}
              </LineChart>
            </ChartCard>
          )}
        </div>
      </div>
    );
  }

  return null;
}
