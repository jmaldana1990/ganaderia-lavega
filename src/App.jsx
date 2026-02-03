import React, { useState, useMemo } from 'react';
import { PlusCircle, Search, Filter, TrendingUp, DollarSign, FileText, Check, X, Edit2, Trash2, BarChart3, PieChart, Menu, Home, Receipt, Beef, ChevronLeft, ChevronRight, Baby, Scale, Users } from 'lucide-react';
import { CATEGORIAS, CENTROS_COSTOS, PROVEEDORES_CONOCIDOS } from './datos';
import { GASTOS_HISTORICOS } from './gastos-historicos';
import { NACIMIENTOS_LA_VEGA } from './nacimientos-lavega';
import { INVENTARIO_LA_VEGA } from './inventario-lavega';

const formatCurrency = (v) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v);
const formatDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
const ITEMS_PER_PAGE = 50;
const centroColor = (c) => ({ 'La Vega': 'bg-green-100 text-green-800', 'Bariloche': 'bg-blue-100 text-blue-800', 'Global': 'bg-purple-100 text-purple-800' }[c] || 'bg-gray-100 text-gray-800');
const centroBarColor = (c) => ({ 'La Vega': 'bg-green-500', 'Bariloche': 'bg-blue-500', 'Global': 'bg-purple-500' }[c] || 'bg-gray-500');
const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default function GanaderiaApp() {
  const [view, setView] = useState('dashboard');
  const [gastos, setGastos] = useState(GASTOS_HISTORICOS);
  const [showForm, setShowForm] = useState(false);
  const [editGasto, setEditGasto] = useState(null);
  const [filtros, setFiltros] = useState({ mes: '', año: '2025', centro: '', categoria: '', busqueda: '' });
  const [menuOpen, setMenuOpen] = useState(false);
  const [page, setPage] = useState(1);

  const años = useMemo(() => [...new Set(gastos.map(g => g.fecha.split('-')[0]))].sort().reverse(), [gastos]);
  
  const filtered = useMemo(() => gastos.filter(g => {
    const [año, mes] = g.fecha.split('-');
    return (!filtros.año || año === filtros.año) &&
           (!filtros.mes || mes === filtros.mes) &&
           (!filtros.centro || g.centro === filtros.centro) &&
           (!filtros.categoria || g.categoria === filtros.categoria) &&
           (!filtros.busqueda || g.proveedor.toLowerCase().includes(filtros.busqueda.toLowerCase()) || g.comentarios.toLowerCase().includes(filtros.busqueda.toLowerCase()));
  }).sort((a, b) => new Date(b.fecha) - new Date(a.fecha)), [gastos, filtros]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const totales = useMemo(() => ({
    total: filtered.reduce((s, g) => s + g.monto, 0),
    costos: filtered.filter(g => g.tipo === 'Costo').reduce((s, g) => s + g.monto, 0),
    gastos: filtered.filter(g => g.tipo === 'Gasto').reduce((s, g) => s + g.monto, 0),
    pendientes: gastos.filter(g => g.estado === 'pendiente').length,
    registros: filtered.length
  }), [filtered, gastos]);

  const porCategoria = useMemo(() => {
    const cats = {};
    filtered.forEach(g => { cats[g.categoria] = (cats[g.categoria] || 0) + g.monto; });
    return Object.entries(cats).map(([c, t]) => ({ categoria: c, total: t })).sort((a,b) => b.total - a.total);
  }, [filtered]);

  const porCentro = useMemo(() => {
    const c = {};
    filtered.forEach(g => { c[g.centro] = (c[g.centro] || 0) + g.monto; });
    return CENTROS_COSTOS.map(centro => ({ centro, total: c[centro] || 0 })).filter(x => x.total > 0).sort((a,b) => b.total - a.total);
  }, [filtered]);

  const updateFiltros = (f) => { setFiltros(f); setPage(1); };
  const approve = (id) => setGastos(gastos.map(g => g.id === id ? {...g, estado: 'aprobado'} : g));
  const del = (id) => { if(confirm('¿Eliminar?')) setGastos(gastos.filter(g => g.id !== id)); };
  const save = (g) => {
    if (editGasto) setGastos(gastos.map(x => x.id === editGasto.id ? {...g, id: editGasto.id} : x));
    else setGastos([{...g, id: Math.max(...gastos.map(x => x.id)) + 1, estado: 'pendiente'}, ...gastos]);
    setShowForm(false); setEditGasto(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-green-700 to-green-600 text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setMenuOpen(!menuOpen)} className="lg:hidden p-2 hover:bg-white/10 rounded-lg"><Menu size={24}/></button>
            <div className="flex items-center gap-2"><span className="text-2xl">🐄</span><div><h1 className="text-xl font-bold">Ganadería La Vega</h1><p className="text-xs text-green-200 hidden sm:block">Sistema de Gestión</p></div></div>
          </div>
          <span className="text-sm bg-white/20 px-3 py-1 rounded-full">{totales.registros.toLocaleString()} registros</span>
        </div>
      </header>

      <div className="flex">
        <aside className={`${menuOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-40 w-64 bg-white shadow-lg transition-transform pt-16 lg:pt-0`}>
          <nav className="p-4 space-y-1">
            {[{id:'dashboard',icon:Home,label:'Dashboard'},{id:'costos',icon:Receipt,label:'Costos y Gastos'},{id:'nacimientos',icon:Beef,label:'Nacimientos'}].map(item => (
              <button key={item.id} onClick={() => {setView(item.id);setMenuOpen(false);}} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl ${view===item.id?'bg-green-50 text-green-700 font-medium':'text-gray-600 hover:bg-gray-50'}`}><item.icon size={20}/><span>{item.label}</span></button>
            ))}
          </nav>
        </aside>

        <main className="flex-1 p-4 lg:p-6 max-w-7xl">
          {view === 'dashboard' && <Dashboard totales={totales} porCategoria={porCategoria} porCentro={porCentro} pendientes={gastos.filter(g=>g.estado==='pendiente').slice(0,5)} onApprove={approve} filtros={filtros} setFiltros={updateFiltros} años={años}/>}
          {view === 'costos' && <Costos gastos={paginated} total={filtered.length} totales={totales} filtros={filtros} setFiltros={updateFiltros} onNew={()=>setShowForm(true)} onEdit={g=>{setEditGasto(g);setShowForm(true);}} onDel={del} onApprove={approve} page={page} pages={totalPages} setPage={setPage} años={años}/>}
          {view === 'nacimientos' && <Nacimientos />}
        </main>
      </div>

      {showForm && <Form gasto={editGasto} onSave={save} onClose={()=>{setShowForm(false);setEditGasto(null);}}/>}
      {menuOpen && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={()=>setMenuOpen(false)}/>}
    </div>
  );
}

function Nacimientos() {
  const [filtros, setFiltros] = useState({ año: '2025', sexo: '', padre: '', busqueda: '', estado: 'Activo' });
  const [detalle, setDetalle] = useState(null);

  // Años de nacimiento para el filtro principal
  const años = [...new Set(NACIMIENTOS_LA_VEGA.map(n => n.año))].sort().reverse();
  
  // Años de destete disponibles para estadísticas
  const añosDestete = [...new Set(NACIMIENTOS_LA_VEGA.filter(n => n.añoDestete).map(n => n.añoDestete))].sort().reverse();
  
  const padres = ['477-375', '854-476', '509-0', '595-1'];

  // Filtrado por año de NACIMIENTO para la tabla
  const filtered = useMemo(() => NACIMIENTOS_LA_VEGA.filter(n => {
    if (filtros.año && n.año !== parseInt(filtros.año)) return false;
    if (filtros.sexo && n.sexo !== filtros.sexo) return false;
    if (filtros.padre && n.padre !== filtros.padre) return false;
    if (filtros.estado && n.estado !== filtros.estado) return false;
    if (filtros.busqueda) {
      const b = filtros.busqueda.toLowerCase();
      if (!n.cria.toLowerCase().includes(b) && !n.madre.toLowerCase().includes(b) && !n.padre.toLowerCase().includes(b)) return false;
    }
    return true;
  }), [filtros]);

  // Para estadísticas de destete, usar añoDestete en vez de año de nacimiento
  const activosParaDestete = useMemo(() => NACIMIENTOS_LA_VEGA.filter(n => {
    // Filtrar por año de DESTETE, no de nacimiento
    if (filtros.año && n.añoDestete !== parseInt(filtros.año)) return false;
    return n.estado === 'Activo' && n.pesoDestete !== null;
  }), [filtros.año]);

  // Activos por año de nacimiento (para conteos generales)
  const activos = useMemo(() => NACIMIENTOS_LA_VEGA.filter(n => {
    if (filtros.año && n.año !== parseInt(filtros.año)) return false;
    return n.estado === 'Activo';
  }), [filtros.año]);

  const stats = useMemo(() => {
    const base = filtros.estado ? filtered : activos;
    const m = base.filter(n => n.sexo === 'M'), h = base.filter(n => n.sexo === 'H');
    const pn = base.filter(n => n.pesoNacer);
    
    // Para peso destete, usar activosParaDestete (filtrado por añoDestete)
    const activosM = activosParaDestete.filter(n => n.sexo === 'M');
    const activosH = activosParaDestete.filter(n => n.sexo === 'H');
    
    return {
      total: filtered.length,
      machos: m.length,
      hembras: h.length,
      pesoNacer: pn.length ? (pn.reduce((s,n) => s + n.pesoNacer, 0) / pn.length).toFixed(1) : '-',
      pesoDesteteM: activosM.length ? (activosM.reduce((s,n) => s + n.pesoDestete, 0) / activosM.length).toFixed(1) : '-',
      pesoDesteteH: activosH.length ? (activosH.reduce((s,n) => s + n.pesoDestete, 0) / activosH.length).toFixed(1) : '-',
      totalDestetes: activosParaDestete.length,
      totalActivos: activos.length,
      totalVendidos: NACIMIENTOS_LA_VEGA.filter(n => (!filtros.año || n.año === parseInt(filtros.año)) && n.estado === 'Vendido').length,
      totalMuertos: NACIMIENTOS_LA_VEGA.filter(n => (!filtros.año || n.año === parseInt(filtros.año)) && n.estado === 'Muerto').length
    };
  }, [filtered, activos, activosParaDestete, filtros]);

  const porMes = useMemo(() => {
    const d = {};
    filtered.forEach(n => {
      const k = `${n.año}-${String(n.mes).padStart(2,'0')}`;
      d[k] = (d[k]||0) + 1;
    });
    return Object.entries(d).sort().slice(-12);
  }, [filtered]);

  const porPadre = useMemo(() => {
    const d = {};
    filtered.forEach(n => {
      const p = padres.includes(n.padre) ? n.padre : 'Otros';
      d[p] = (d[p]||0) + 1;
    });
    return Object.entries(d).sort((a,b) => b[1] - a[1]);
  }, [filtered]);

  const detalleMadre = useMemo(() => {
    if (!detalle || detalle.tipo !== 'madre') return null;
    const crias = NACIMIENTOS_LA_VEGA.filter(n => n.madre === detalle.id);
    const criasActivas = crias.filter(n => n.estado === 'Activo');
    const m = criasActivas.filter(n => n.sexo === 'M' && n.pesoDestete), h = criasActivas.filter(n => n.sexo === 'H' && n.pesoDestete);
    const fechas = crias.map(n => new Date(n.fecha)).sort((a,b) => a-b);
    let iep = 0, c = 0;
    for (let i = 1; i < fechas.length; i++) {
      const d = (fechas[i] - fechas[i-1]) / 86400000;
      if (d > 200 && d < 800) { iep += d; c++; }
    }
    return {
      id: detalle.id,
      partos: crias.length,
      pesoM: m.length ? (m.reduce((s,n)=>s+n.pesoDestete,0)/m.length).toFixed(1) : '-',
      pesoH: h.length ? (h.reduce((s,n)=>s+n.pesoDestete,0)/h.length).toFixed(1) : '-',
      iep: c ? Math.round(iep/c) : '-',
      crias
    };
  }, [detalle]);

  const detallePadre = useMemo(() => {
    if (!detalle || detalle.tipo !== 'padre') return null;
    const crias = NACIMIENTOS_LA_VEGA.filter(n => n.padre === detalle.id);
    const criasActivas = crias.filter(n => n.estado === 'Activo');
    const m = criasActivas.filter(n => n.sexo === 'M'), h = criasActivas.filter(n => n.sexo === 'H');
    const pn = crias.filter(n => n.pesoNacer);
    const dm = m.filter(n => n.pesoDestete), dh = h.filter(n => n.pesoDestete);
    return {
      id: detalle.id,
      total: crias.length,
      machos: m.length,
      hembras: h.length,
      pesoNacer: pn.length ? (pn.reduce((s,n)=>s+n.pesoNacer,0)/pn.length).toFixed(1) : '-',
      pesoM: dm.length ? (dm.reduce((s,n)=>s+n.pesoDestete,0)/dm.length).toFixed(1) : '-',
      pesoH: dh.length ? (dh.reduce((s,n)=>s+n.pesoDestete,0)/dh.length).toFixed(1) : '-',
      crias
    };
  }, [detalle]);

  const inv = useMemo(() => {
    let d = INVENTARIO_LA_VEGA.filter(i => i.TOTAL > 50);
    if (filtros.año) d = d.filter(i => i.año === parseInt(filtros.año));
    return d.slice(-12);
  }, [filtros.año]);

  const lastInv = inv[inv.length - 1] || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <h2 className="text-2xl font-bold text-gray-800">🐮 Nacimientos - La Vega</h2>
        <select value={filtros.año} onChange={e => setFiltros({...filtros, año: e.target.value})} className="px-4 py-2 border rounded-xl">
          <option value="">Todos</option>
          {años.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filtros.estado} onChange={e => setFiltros({...filtros, estado: e.target.value})} className="px-4 py-2 border rounded-xl">
          <option value="">Todos</option>
          <option value="Activo">Activos</option>
          <option value="Vendido">Vendidos</option>
          <option value="Muerto">Muertos</option>
        </select>
        <span className="text-sm text-gray-500">({stats.totalActivos} activos, {stats.totalVendidos} vendidos, {stats.totalMuertos} muertos)</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-4 text-white shadow-lg">
          <div className="flex justify-between">
            <div>
              <p className="text-white/80 text-sm">Total Nacimientos</p>
              <p className="text-3xl font-bold mt-1">{stats.total}</p>
            </div>
            <Baby size={32} className="opacity-50"/>
          </div>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-pink-500 rounded-2xl p-4 text-white shadow-lg">
          <div className="flex justify-between">
            <div>
              <p className="text-white/80 text-sm">Machos / Hembras</p>
              <p className="text-2xl font-bold mt-1">♂{stats.machos} / ♀{stats.hembras}</p>
            </div>
            <Users size={32} className="opacity-50"/>
          </div>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl p-4 text-white shadow-lg">
          <div className="flex justify-between">
            <div>
              <p className="text-white/80 text-sm">Peso Nacer Prom.</p>
              <p className="text-3xl font-bold mt-1">{stats.pesoNacer}<span className="text-lg ml-1">kg</span></p>
            </div>
            <Scale size={32} className="opacity-50"/>
          </div>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-4 text-white shadow-lg">
          <div className="flex justify-between">
            <div>
              <p className="text-white/80 text-sm">Peso Destete (año destete {filtros.año || 'todos'})</p>
              <p className="text-lg font-bold">♂ {stats.pesoDesteteM} kg</p>
              <p className="text-lg font-bold">♀ {stats.pesoDesteteH} kg</p>
              <p className="text-xs text-white/60">n={stats.totalDestetes}</p>
            </div>
            <TrendingUp size={32} className="opacity-50"/>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm lg:col-span-2">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><BarChart3 size={20} className="text-green-600"/>Nacimientos por Mes</h3>
          <div className="flex items-end gap-1 h-40">
            {porMes.map(([m, c]) => {
              const max = Math.max(...porMes.map(([,v]) => v));
              return (
                <div key={m} className="flex-1 flex flex-col items-center">
                  <span className="text-xs text-gray-600 mb-1">{c}</span>
                  <div className="w-full bg-green-500 rounded-t" style={{height: `${(c/max)*100}%`}}/>
                  <span className="text-xs text-gray-500 mt-1">{MESES[parseInt(m.split('-')[1])]}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><PieChart size={20} className="text-green-600"/>Por Sexo</h3>
          <div className="flex justify-center mb-4">
            <div className="relative w-32 h-32">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="40" fill="none" strokeWidth="20" className="stroke-blue-500" strokeDasharray={`${(stats.machos/(stats.total||1))*251} 251`}/>
                <circle cx="50" cy="50" r="40" fill="none" strokeWidth="20" className="stroke-pink-500" strokeDasharray={`${(stats.hembras/(stats.total||1))*251} 251`} strokeDashoffset={-(stats.machos/(stats.total||1))*251}/>
              </svg>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between"><span className="flex items-center gap-2"><span className="w-3 h-3 bg-blue-500 rounded-full"/>Machos</span><span className="font-medium">{stats.machos}</span></div>
            <div className="flex justify-between"><span className="flex items-center gap-2"><span className="w-3 h-3 bg-pink-500 rounded-full"/>Hembras</span><span className="font-medium">{stats.hembras}</span></div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><PieChart size={20} className="text-green-600"/>Por Padre/Toro</h3>
          <div className="space-y-3">
            {porPadre.slice(0,5).map(([p, c]) => {
              const max = porPadre[0]?.[1] || 1;
              const colors = {'477-375':'bg-blue-500','854-476':'bg-green-500','509-0':'bg-purple-500','595-1':'bg-amber-500','Otros':'bg-gray-400'};
              return (
                <div key={p}>
                  <div className="flex justify-between text-sm mb-1">
                    <button onClick={() => p !== 'Otros' && setDetalle({tipo:'padre',id:p})} className={p !== 'Otros' ? 'text-blue-600 hover:underline' : ''}>{p}</button>
                    <span className="font-medium">{c} crías</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full"><div className={`h-full rounded-full ${colors[p]||'bg-gray-400'}`} style={{width:`${(c/max)*100}%`}}/></div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><TrendingUp size={20} className="text-green-600"/>Inventario por Categoría</h3>
          {inv.length > 0 ? (
            <div className="space-y-2">
              {[['VP','Vacas Paridas','bg-green-500'],['VH','Vacas Horras','bg-blue-500'],['NAS','Novillas','bg-purple-500'],['CH','Crías H','bg-pink-400'],['CM','Crías M','bg-blue-400'],['HL','Levante H','bg-pink-300'],['ML','Levante M','bg-blue-300']].map(([k,l,c]) => {
                const v = lastInv[k] || 0;
                const max = Math.max(lastInv.VP||0, lastInv.VH||0, lastInv.NAS||0, 1);
                return (
                  <div key={k} className="flex items-center gap-2">
                    <span className="text-xs w-20 text-gray-600 truncate">{l}</span>
                    <div className="flex-1 h-4 bg-gray-100 rounded-full"><div className={`h-full ${c} rounded-full`} style={{width:`${(v/max)*100}%`}}/></div>
                    <span className="text-xs w-8 text-right font-medium">{v}</span>
                  </div>
                );
              })}
              <p className="text-xs text-gray-500 text-center mt-2">{MESES[lastInv.mes]} {lastInv.año} • Total: {lastInv.TOTAL}</p>
            </div>
          ) : <p className="text-gray-500 text-center py-8">Sin datos</p>}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b flex flex-wrap gap-3">
          <select value={filtros.sexo} onChange={e => setFiltros({...filtros, sexo: e.target.value})} className="px-3 py-2 border rounded-xl text-sm">
            <option value="">Sexo</option>
            <option value="M">Macho</option>
            <option value="H">Hembra</option>
          </select>
          <select value={filtros.padre} onChange={e => setFiltros({...filtros, padre: e.target.value})} className="px-3 py-2 border rounded-xl text-sm">
            <option value="">Padre</option>
            {[...new Set(NACIMIENTOS_LA_VEGA.map(n => n.padre))].filter(Boolean).sort().map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18}/>
            <input type="text" placeholder="Buscar..." value={filtros.busqueda} onChange={e => setFiltros({...filtros, busqueda: e.target.value})} className="w-full pl-10 pr-4 py-2 border rounded-xl text-sm"/>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Cría</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Fecha Nac.</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Sexo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Madre</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Padre</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">P.Nacer</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">P.Destete</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Año Dest.</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.slice(0,50).map(n => (
                <tr key={n.id} className={`hover:bg-gray-50 ${n.estado !== 'Activo' ? 'bg-red-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-sm">{n.cria}</td>
                  <td className="px-4 py-3 text-sm">{formatDate(n.fecha)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${n.sexo==='M'?'bg-blue-100 text-blue-700':'bg-pink-100 text-pink-700'}`}>
                      {n.sexo==='M'?'♂':'♀'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <button onClick={() => setDetalle({tipo:'madre',id:n.madre})} className="text-blue-600 hover:underline">{n.madre}</button>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <button onClick={() => setDetalle({tipo:'padre',id:n.padre})} className="text-blue-600 hover:underline">{n.padre}</button>
                  </td>
                  <td className="px-4 py-3 text-sm text-right">{n.pesoNacer || '-'}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium">{n.pesoDestete || '-'}</td>
                  <td className="px-4 py-3 text-sm text-center text-gray-500">{n.añoDestete || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${n.estado==='Activo'?'bg-green-100 text-green-700':n.estado==='Vendido'?'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-700'}`}>
                      {n.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 50 && <div className="p-4 text-center text-sm text-gray-500">Mostrando 50 de {filtered.length}</div>}
      </div>

      {detalle && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDetalle(null)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b flex justify-between">
              <h3 className="text-lg font-semibold">{detalle.tipo === 'madre' ? `🐄 Madre: ${detalle.id}` : `🐂 Padre: ${detalle.id}`}</h3>
              <button onClick={() => setDetalle(null)} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20}/></button>
            </div>
            <div className="p-6">
              {detalle.tipo === 'madre' && detalleMadre && (
                <>
                  <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="bg-green-50 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-green-700">{detalleMadre.partos}</p>
                      <p className="text-sm text-gray-600">Partos</p>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-blue-700">{detalleMadre.pesoM}</p>
                      <p className="text-sm text-gray-600">Destete ♂</p>
                    </div>
                    <div className="bg-pink-50 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-pink-700">{detalleMadre.pesoH}</p>
                      <p className="text-sm text-gray-600">Destete ♀</p>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-amber-700">{detalleMadre.iep}</p>
                      <p className="text-sm text-gray-600">IEP días</p>
                    </div>
                  </div>
                  <h4 className="font-medium mb-3">Crías</h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {detalleMadre.crias.sort((a,b) => new Date(b.fecha)-new Date(a.fecha)).map(c => (
                      <div key={c.id} className={`flex justify-between p-3 rounded-xl ${c.estado !== 'Activo' ? 'bg-red-50' : 'bg-gray-50'}`}>
                        <div>
                          <span className="font-medium">{c.cria}</span>
                          <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${c.sexo==='M'?'bg-blue-100 text-blue-700':'bg-pink-100 text-pink-700'}`}>{c.sexo==='M'?'♂':'♀'}</span>
                          {c.estado !== 'Activo' && <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">{c.estado}</span>}
                        </div>
                        <span className="text-sm text-gray-500">{formatDate(c.fecha)} • {c.pesoNacer||'-'}kg → {c.pesoDestete||'-'}kg</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {detalle.tipo === 'padre' && detallePadre && (
                <>
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-green-50 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-green-700">{detallePadre.total}</p>
                      <p className="text-sm text-gray-600">Crías</p>
                      <p className="text-xs text-gray-500">♂{detallePadre.machos} ♀{detallePadre.hembras}</p>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-amber-700">{detallePadre.pesoNacer}</p>
                      <p className="text-sm text-gray-600">Peso Nacer</p>
                    </div>
                    <div className="bg-purple-50 rounded-xl p-4 text-center">
                      <p className="text-lg font-bold text-blue-700">♂{detallePadre.pesoM}</p>
                      <p className="text-lg font-bold text-pink-700">♀{detallePadre.pesoH}</p>
                      <p className="text-sm text-gray-600">Destete</p>
                    </div>
                  </div>
                  <h4 className="font-medium mb-3">Últimas crías</h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {detallePadre.crias.sort((a,b) => new Date(b.fecha)-new Date(a.fecha)).slice(0,20).map(c => (
                      <div key={c.id} className={`flex justify-between p-3 rounded-xl ${c.estado !== 'Activo' ? 'bg-red-50' : 'bg-gray-50'}`}>
                        <div>
                          <span className="font-medium">{c.cria}</span>
                          <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${c.sexo==='M'?'bg-blue-100 text-blue-700':'bg-pink-100 text-pink-700'}`}>{c.sexo==='M'?'♂':'♀'}</span>
                          {c.estado !== 'Activo' && <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">{c.estado}</span>}
                          <span className="ml-2 text-sm text-gray-500">Madre: {c.madre}</span>
                        </div>
                        <span className="text-sm text-gray-500">{formatDate(c.fecha)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Dashboard({totales, porCategoria, porCentro, pendientes, onApprove, filtros, setFiltros, años}) {
  const maxCat = Math.max(...porCategoria.map(c=>c.total), 1);
  const maxCen = Math.max(...porCentro.map(c=>c.total), 1);
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Dashboard</h2>
        <select value={filtros.año} onChange={e=>setFiltros({...filtros,año:e.target.value})} className="px-4 py-2 border rounded-xl">
          <option value="">Todos</option>
          {años.map(a=><option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card title="Total Egresos" value={formatCurrency(totales.total)} icon={DollarSign} color="from-green-500 to-green-600"/>
        <Card title="Costos" value={formatCurrency(totales.costos)} icon={TrendingUp} color="from-blue-500 to-blue-600"/>
        <Card title="Gastos" value={formatCurrency(totales.gastos)} icon={Receipt} color="from-purple-500 to-purple-600"/>
        <Card title="Pendientes" value={totales.pendientes} icon={FileText} color="from-orange-500 to-orange-600" sub="por aprobar"/>
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><BarChart3 size={20} className="text-green-600"/>Por Categoría</h3>
          <div className="space-y-3">
            {porCategoria.slice(0,10).map(({categoria,total})=>(
              <div key={categoria}>
                <div className="flex justify-between text-sm mb-1"><span className="truncate">{categoria}</span><span className="font-medium">{formatCurrency(total)}</span></div>
                <div className="h-2 bg-gray-100 rounded-full"><div className="h-full bg-green-500 rounded-full" style={{width:`${(total/maxCat)*100}%`}}/></div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><PieChart size={20} className="text-green-600"/>Por Centro</h3>
          <div className="space-y-3">
            {porCentro.map(({centro,total})=>(
              <div key={centro}>
                <div className="flex justify-between text-sm mb-1"><span className={`px-2 py-0.5 rounded-full text-xs ${centroColor(centro)}`}>{centro}</span><span className="font-medium">{formatCurrency(total)}</span></div>
                <div className="h-2 bg-gray-100 rounded-full"><div className={`h-full rounded-full ${centroBarColor(centro)}`} style={{width:`${(total/maxCen)*100}%`}}/></div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {pendientes.length>0&&(
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold mb-4">Pendientes <span className="bg-orange-100 text-orange-600 text-xs px-2 py-1 rounded-full ml-2">{pendientes.length}</span></h3>
          <div className="space-y-2">
            {pendientes.map(g=>(
              <div key={g.id} className="flex items-center justify-between p-3 bg-orange-50 rounded-xl">
                <div>
                  <span className="font-medium">{g.proveedor}</span>
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${centroColor(g.centro)}`}>{g.centro}</span>
                  <p className="text-sm text-gray-500">{formatDate(g.fecha)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-green-700">{formatCurrency(g.monto)}</span>
                  <button onClick={()=>onApprove(g.id)} className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600"><Check size={16}/></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Card({title,value,icon:Icon,color,sub}) {
  return (
    <div className={`bg-gradient-to-br ${color} rounded-2xl p-4 text-white shadow-lg`}>
      <div className="flex justify-between">
        <div>
          <p className="text-white/80 text-sm">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {sub&&<p className="text-white/60 text-xs">{sub}</p>}
        </div>
        <Icon size={32} className="opacity-50"/>
      </div>
    </div>
  );
}

function Costos({gastos,total,totales,filtros,setFiltros,onNew,onEdit,onDel,onApprove,page,pages,setPage,años}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Costos y Gastos</h2>
          <p className="text-gray-500 text-sm">{total.toLocaleString()} registros • {formatCurrency(totales.total)}</p>
        </div>
        <button onClick={onNew} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-xl shadow-lg hover:bg-green-700"><PlusCircle size={20}/>Nuevo</button>
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <select value={filtros.año} onChange={e=>setFiltros({...filtros,año:e.target.value})} className="px-3 py-2 border rounded-xl text-sm"><option value="">Año</option>{años.map(a=><option key={a} value={a}>{a}</option>)}</select>
          <select value={filtros.mes} onChange={e=>setFiltros({...filtros,mes:e.target.value})} className="px-3 py-2 border rounded-xl text-sm"><option value="">Mes</option>{['01','02','03','04','05','06','07','08','09','10','11','12'].map((m,i)=><option key={m} value={m}>{MESES[i+1]}</option>)}</select>
          <select value={filtros.centro} onChange={e=>setFiltros({...filtros,centro:e.target.value})} className="px-3 py-2 border rounded-xl text-sm"><option value="">Centro</option>{CENTROS_COSTOS.map(c=><option key={c} value={c}>{c}</option>)}</select>
          <select value={filtros.categoria} onChange={e=>setFiltros({...filtros,categoria:e.target.value})} className="px-3 py-2 border rounded-xl text-sm"><option value="">Categoría</option>{CATEGORIAS.map(c=><option key={c} value={c}>{c}</option>)}</select>
          <div className="col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18}/>
            <input type="text" placeholder="Buscar..." value={filtros.busqueda} onChange={e=>setFiltros({...filtros,busqueda:e.target.value})} className="w-full pl-10 pr-4 py-2 border rounded-xl text-sm"/>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Fecha</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Proveedor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 hidden md:table-cell">Comentarios</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Centro</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Monto</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Acc.</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {gastos.map(g=>(
                <tr key={g.id} className={`hover:bg-gray-50 ${g.estado==='pendiente'?'bg-orange-50':''}`}>
                  <td className="px-4 py-3 text-sm">{formatDate(g.fecha)}</td>
                  <td className="px-4 py-3 font-medium text-sm">{g.proveedor}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell truncate max-w-xs">{g.comentarios}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-full ${centroColor(g.centro)}`}>{g.centro}</span></td>
                  <td className="px-4 py-3 text-right font-semibold text-sm">{formatCurrency(g.monto)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-1">
                      {g.estado==='pendiente'&&<button onClick={()=>onApprove(g.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"><Check size={16}/></button>}
                      <button onClick={()=>onEdit(g)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={16}/></button>
                      <button onClick={()=>onDel(g.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages>1&&(
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <span className="text-sm text-gray-600">Pág {page}/{pages}</span>
            <div className="flex gap-2">
              <button onClick={()=>setPage(page-1)} disabled={page===1} className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-50"><ChevronLeft size={20}/></button>
              <button onClick={()=>setPage(page+1)} disabled={page===pages} className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-50"><ChevronRight size={20}/></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Form({gasto,onSave,onClose}) {
  const [f,setF] = useState(gasto||{fecha:new Date().toISOString().split('T')[0],monto:'',proveedor:'',tipo:'Costo',centro:'La Vega',categoria:'',comentarios:''});
  const [sug,setSug] = useState([]);
  
  const handleProv = v => {
    setF({...f,proveedor:v});
    if(v.length>=2)setSug(Object.keys(PROVEEDORES_CONOCIDOS).filter(p=>p.toLowerCase().includes(v.toLowerCase())).slice(0,5));
    else setSug([]);
    if(PROVEEDORES_CONOCIDOS[v]){setF(x=>({...x,categoria:PROVEEDORES_CONOCIDOS[v].categoria,centro:PROVEEDORES_CONOCIDOS[v].centro}));setSug([]);}
  };
  
  const selSug = p => {
    setF({...f,proveedor:p,categoria:PROVEEDORES_CONOCIDOS[p].categoria,centro:PROVEEDORES_CONOCIDOS[p].centro});
    setSug([]);
  };
  
  const submit = e => {
    e.preventDefault();
    if(!f.fecha||!f.monto||!f.proveedor||!f.categoria){alert('Complete campos');return;}
    onSave({...f,monto:parseFloat(f.monto)});
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg">
        <div className="p-6 border-b flex justify-between">
          <h3 className="text-lg font-semibold">{gasto?'Editar':'Nuevo'}</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20}/></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Fecha</label>
              <input type="date" value={f.fecha} onChange={e=>setF({...f,fecha:e.target.value})} className="w-full px-3 py-2 border rounded-xl" required/>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Monto</label>
              <input type="number" value={f.monto} onChange={e=>setF({...f,monto:e.target.value})} className="w-full px-3 py-2 border rounded-xl" required/>
            </div>
          </div>
          <div className="relative">
            <label className="block text-sm font-medium mb-1">Proveedor</label>
            <input type="text" value={f.proveedor} onChange={e=>handleProv(e.target.value)} className="w-full px-3 py-2 border rounded-xl" required/>
            {sug.length>0&&<div className="absolute z-10 w-full bg-white border rounded-xl mt-1 shadow-lg">{sug.map(p=><button key={p} type="button" onClick={()=>selSug(p)} className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm">{p}</button>)}</div>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Tipo</label>
              <select value={f.tipo} onChange={e=>setF({...f,tipo:e.target.value})} className="w-full px-3 py-2 border rounded-xl"><option>Costo</option><option>Gasto</option></select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Centro</label>
              <select value={f.centro} onChange={e=>setF({...f,centro:e.target.value})} className="w-full px-3 py-2 border rounded-xl">{CENTROS_COSTOS.map(c=><option key={c}>{c}</option>)}</select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Categoría</label>
            <select value={f.categoria} onChange={e=>setF({...f,categoria:e.target.value})} className="w-full px-3 py-2 border rounded-xl" required><option value="">Seleccione</option>{CATEGORIAS.map(c=><option key={c}>{c}</option>)}</select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Comentarios</label>
            <textarea value={f.comentarios} onChange={e=>setF({...f,comentarios:e.target.value})} className="w-full px-3 py-2 border rounded-xl" rows={2}/>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border rounded-xl hover:bg-gray-50">Cancelar</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700">Guardar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
