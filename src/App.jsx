import React, { useState, useMemo } from 'react';
import { PlusCircle, Search, Filter, TrendingUp, DollarSign, FileText, Check, X, Edit2, Trash2, BarChart3, PieChart, Menu, Home, Receipt, Beef, ChevronLeft, ChevronRight, ArrowUpDown, ArrowDownAZ, ArrowDown10 } from 'lucide-react';
import { CATEGORIAS, CENTROS_COSTOS, PROVEEDORES_CONOCIDOS } from './datos';
import { GASTOS_HISTORICOS } from './gastos-historicos';

const formatCurrency = (v) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v);
const formatDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
const ITEMS_PER_PAGE = 50;
const centroColor = (c) => ({ 'La Vega': 'bg-green-100 text-green-800', 'Bariloche': 'bg-blue-100 text-blue-800', 'Global': 'bg-purple-100 text-purple-800' }[c] || 'bg-gray-100 text-gray-800');
const centroBarColor = (c) => ({ 'La Vega': 'bg-green-500', 'Bariloche': 'bg-blue-500', 'Global': 'bg-purple-500' }[c] || 'bg-gray-500');

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
    if (filtros.año && año !== filtros.año) return false;
    if (filtros.mes && mes !== filtros.mes) return false;
    if (filtros.centro && g.centro !== filtros.centro) return false;
    if (filtros.categoria && g.categoria !== filtros.categoria) return false;
    if (filtros.busqueda && !g.proveedor.toLowerCase().includes(filtros.busqueda.toLowerCase()) && !g.comentarios.toLowerCase().includes(filtros.busqueda.toLowerCase())) return false;
    return true;
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
    return Object.entries(cats).map(([c, t]) => ({ categoria: c, total: t }));
  }, [filtered]);

  const porCentro = useMemo(() => {
    const c = {};
    filtered.forEach(g => { c[g.centro] = (c[g.centro] || 0) + g.monto; });
    return CENTROS_COSTOS.map(centro => ({ centro, total: c[centro] || 0 })).filter(x => x.total > 0);
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
            <div className="flex items-center gap-2">
              <span className="text-2xl">🐄</span>
              <div><h1 className="text-xl font-bold">Ganadería La Vega</h1><p className="text-xs text-green-200 hidden sm:block">Sistema de Gestión</p></div>
            </div>
          </div>
          <span className="text-sm bg-white/20 px-3 py-1 rounded-full">{totales.registros.toLocaleString()} registros</span>
        </div>
      </header>

      <div className="flex">
        <aside className={`${menuOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-40 w-64 bg-white shadow-lg transition-transform pt-16 lg:pt-0`}>
          <nav className="p-4 space-y-1">
            {[{id:'dashboard',icon:Home,label:'Dashboard'},{id:'costos',icon:Receipt,label:'Costos y Gastos'},{id:'nacimientos',icon:Beef,label:'Nacimientos',badge:'Pronto'}].map(item => (
              <button key={item.id} onClick={() => {setView(item.id);setMenuOpen(false);}} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl ${view===item.id?'bg-green-50 text-green-700 font-medium':'text-gray-600 hover:bg-gray-50'}`}>
                <item.icon size={20}/><span>{item.label}</span>
                {item.badge && <span className="ml-auto text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">{item.badge}</span>}
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex-1 p-4 lg:p-6 max-w-7xl">
          {view === 'dashboard' && <Dashboard totales={totales} porCategoria={porCategoria} porCentro={porCentro} pendientes={gastos.filter(g=>g.estado==='pendiente').slice(0,5)} onApprove={approve} filtros={filtros} setFiltros={updateFiltros} años={años}/>}
          {view === 'costos' && <Costos gastos={paginated} total={filtered.length} totales={totales} filtros={filtros} setFiltros={updateFiltros} onNew={()=>setShowForm(true)} onEdit={g=>{setEditGasto(g);setShowForm(true);}} onDel={del} onApprove={approve} page={page} pages={totalPages} setPage={setPage} años={años}/>}
          {view === 'nacimientos' && <div className="bg-white rounded-2xl p-8 text-center"><span className="text-6xl block mb-4">🐮</span><h2 className="text-2xl font-bold text-gray-800 mb-2">Módulo de Nacimientos</h2><p className="text-gray-600">Próximamente</p></div>}
        </main>
      </div>

      {showForm && <Form gasto={editGasto} onSave={save} onClose={()=>{setShowForm(false);setEditGasto(null);}}/>}
      {menuOpen && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={()=>setMenuOpen(false)}/>}
    </div>
  );
}

function Dashboard({totales, porCategoria, porCentro, pendientes, onApprove, filtros, setFiltros, años}) {
  // Estados para ordenamiento
  const [sortCat, setSortCat] = useState('monto-desc'); // monto-desc, monto-asc, alfa-asc, alfa-desc
  const [sortCentro, setSortCentro] = useState('monto-desc');

  // Ordenar categorías
  const categoriasOrdenadas = useMemo(() => {
    const sorted = [...porCategoria];
    switch(sortCat) {
      case 'monto-desc': return sorted.sort((a,b) => b.total - a.total);
      case 'monto-asc': return sorted.sort((a,b) => a.total - b.total);
      case 'alfa-asc': return sorted.sort((a,b) => a.categoria.localeCompare(b.categoria));
      case 'alfa-desc': return sorted.sort((a,b) => b.categoria.localeCompare(a.categoria));
      default: return sorted;
    }
  }, [porCategoria, sortCat]);

  // Ordenar centros
  const centrosOrdenados = useMemo(() => {
    const sorted = [...porCentro];
    switch(sortCentro) {
      case 'monto-desc': return sorted.sort((a,b) => b.total - a.total);
      case 'monto-asc': return sorted.sort((a,b) => a.total - b.total);
      case 'alfa-asc': return sorted.sort((a,b) => a.centro.localeCompare(b.centro));
      case 'alfa-desc': return sorted.sort((a,b) => b.centro.localeCompare(a.centro));
      default: return sorted;
    }
  }, [porCentro, sortCentro]);

  const maxCat = Math.max(...categoriasOrdenadas.map(c=>c.total), 1);
  const maxCen = Math.max(...centrosOrdenados.map(c=>c.total), 1);

  // Botón de ordenamiento
  const SortButton = ({ current, onChange, label }) => (
    <div className="flex items-center gap-1">
      <select 
        value={current} 
        onChange={(e) => onChange(e.target.value)}
        className="text-xs bg-gray-100 border-0 rounded-lg px-2 py-1 cursor-pointer hover:bg-gray-200"
      >
        <option value="monto-desc">Mayor a menor</option>
        <option value="monto-asc">Menor a mayor</option>
        <option value="alfa-asc">A → Z</option>
        <option value="alfa-desc">Z → A</option>
      </select>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Dashboard</h2>
        <select value={filtros.año} onChange={e=>setFiltros({...filtros,año:e.target.value})} className="px-4 py-2 border rounded-xl">
          <option value="">Todos</option>{años.map(a=><option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card title="Total Egresos" value={formatCurrency(totales.total)} icon={DollarSign} color="from-green-500 to-green-600"/>
        <Card title="Costos" value={formatCurrency(totales.costos)} icon={TrendingUp} color="from-blue-500 to-blue-600"/>
        <Card title="Gastos" value={formatCurrency(totales.gastos)} icon={Receipt} color="from-purple-500 to-purple-600"/>
        <Card title="Pendientes" value={totales.pendientes} icon={FileText} color="from-orange-500 to-orange-600" sub="por aprobar"/>
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Por Categoría */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="text-green-600" size={20}/>
              <h3 className="font-semibold">Por Categoría</h3>
            </div>
            <SortButton current={sortCat} onChange={setSortCat} />
          </div>
          <div className="space-y-3">
            {categoriasOrdenadas.slice(0, 10).map(({categoria,total})=>(
              <div key={categoria}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 truncate">{categoria}</span>
                  <span className="font-medium">{formatCurrency(total)}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full">
                  <div className="h-full bg-green-500 rounded-full transition-all duration-300" style={{width:`${(total/maxCat)*100}%`}}/>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Por Centro */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <PieChart className="text-green-600" size={20}/>
              <h3 className="font-semibold">Por Centro</h3>
            </div>
            <SortButton current={sortCentro} onChange={setSortCentro} />
          </div>
          <div className="space-y-3">
            {centrosOrdenados.map(({centro,total})=>(
              <div key={centro}>
                <div className="flex justify-between text-sm mb-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${centroColor(centro)}`}>{centro}</span>
                  <span className="font-medium">{formatCurrency(total)}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full">
                  <div className={`h-full rounded-full transition-all duration-300 ${centroBarColor(centro)}`} style={{width:`${(total/maxCen)*100}%`}}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pendientes */}
      {pendientes.length>0 && (
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex justify-between mb-4">
            <h3 className="font-semibold">Pendientes</h3>
            <span className="bg-orange-100 text-orange-600 text-xs px-2 py-1 rounded-full">{pendientes.length}</span>
          </div>
          <div className="space-y-2">
            {pendientes.map(g=>(
              <div key={g.id} className="flex items-center justify-between p-3 bg-orange-50 rounded-xl">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{g.proveedor}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${centroColor(g.centro)}`}>{g.centro}</span>
                  </div>
                  <p className="text-sm text-gray-500">{formatDate(g.fecha)} • {g.categoria}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-green-700">{formatCurrency(g.monto)}</span>
                  <button onClick={()=>onApprove(g.id)} className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600">
                    <Check size={16}/>
                  </button>
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
  return <div className={`bg-gradient-to-br ${color} rounded-2xl p-4 text-white shadow-lg`}><div className="flex justify-between"><div><p className="text-white/80 text-sm">{title}</p><p className="text-2xl font-bold mt-1">{value}</p>{sub&&<p className="text-white/60 text-xs mt-1">{sub}</p>}</div><div className="p-2 bg-white/20 rounded-xl"><Icon size={24}/></div></div></div>;
}

function Costos({gastos,total,totales,filtros,setFiltros,onNew,onEdit,onDel,onApprove,page,pages,setPage,años}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div><h2 className="text-2xl font-bold text-gray-800">Costos y Gastos</h2><p className="text-gray-500 text-sm">{total.toLocaleString()} registros • {formatCurrency(totales.total)}</p></div>
        <button onClick={onNew} className="flex items-center gap-2 bg-gradient-to-r from-green-600 to-green-500 text-white px-4 py-2 rounded-xl shadow-lg"><PlusCircle size={20}/><span>Nuevo</span></button>
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3 text-gray-600"><Filter size={18}/><span className="font-medium">Filtros</span></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <select value={filtros.año} onChange={e=>setFiltros({...filtros,año:e.target.value})} className="px-3 py-2 border rounded-xl text-sm"><option value="">Año</option>{años.map(a=><option key={a} value={a}>{a}</option>)}</select>
          <select value={filtros.mes} onChange={e=>setFiltros({...filtros,mes:e.target.value})} className="px-3 py-2 border rounded-xl text-sm"><option value="">Mes</option>{['01','02','03','04','05','06','07','08','09','10','11','12'].map((m,i)=><option key={m} value={m}>{['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][i]}</option>)}</select>
          <select value={filtros.centro} onChange={e=>setFiltros({...filtros,centro:e.target.value})} className="px-3 py-2 border rounded-xl text-sm"><option value="">Centro</option>{CENTROS_COSTOS.map(c=><option key={c} value={c}>{c}</option>)}</select>
          <select value={filtros.categoria} onChange={e=>setFiltros({...filtros,categoria:e.target.value})} className="px-3 py-2 border rounded-xl text-sm"><option value="">Categoría</option>{CATEGORIAS.map(c=><option key={c} value={c}>{c}</option>)}</select>
          <div className="col-span-2 relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18}/><input type="text" placeholder="Buscar..." value={filtros.busqueda} onChange={e=>setFiltros({...filtros,busqueda:e.target.value})} className="w-full pl-10 pr-4 py-2 border rounded-xl text-sm"/></div>
        </div>
      </div>
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b"><tr><th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Fecha</th><th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Proveedor</th><th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 hidden md:table-cell">Comentarios</th><th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Centro</th><th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 hidden lg:table-cell">Categoría</th><th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Monto</th><th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Acciones</th></tr></thead>
            <tbody className="divide-y">{gastos.map(g=>(<tr key={g.id} className={`hover:bg-gray-50 ${g.estado==='pendiente'?'bg-orange-50':''}`}><td className="px-4 py-3 text-sm whitespace-nowrap">{formatDate(g.fecha)}</td><td className="px-4 py-3"><div className="font-medium text-sm">{g.proveedor}</div><div className="text-xs text-gray-500 md:hidden truncate max-w-[150px]">{g.comentarios}</div></td><td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell truncate max-w-xs">{g.comentarios}</td><td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-full ${centroColor(g.centro)}`}>{g.centro}</span></td><td className="px-4 py-3 text-sm text-gray-600 hidden lg:table-cell">{g.categoria}</td><td className="px-4 py-3 text-right font-semibold text-sm">{formatCurrency(g.monto)}</td><td className="px-4 py-3"><div className="flex justify-center gap-1">{g.estado==='pendiente'&&<button onClick={()=>onApprove(g.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"><Check size={16}/></button>}<button onClick={()=>onEdit(g)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={16}/></button><button onClick={()=>onDel(g.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16}/></button></div></td></tr>))}</tbody>
          </table>
        </div>
        {pages>1&&<div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50"><p className="text-sm text-gray-600">Pág {page} de {pages}</p><div className="flex gap-2"><button onClick={()=>setPage(page-1)} disabled={page===1} className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-50"><ChevronLeft size={20}/></button><button onClick={()=>setPage(page+1)} disabled={page===pages} className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-50"><ChevronRight size={20}/></button></div></div>}
      </div>
    </div>
  );
}

function Form({gasto,onSave,onClose}) {
  const [f, setF] = useState(gasto || {fecha:new Date().toISOString().split('T')[0],monto:'',proveedor:'',tipo:'Costo',centro:'La Vega',categoria:'',comentarios:''});
  const [sug, setSug] = useState([]);
  const handleProv = (v) => {
    setF({...f,proveedor:v});
    if(v.length>=2) setSug(Object.keys(PROVEEDORES_CONOCIDOS).filter(p=>p.toLowerCase().includes(v.toLowerCase())).slice(0,5));
    else setSug([]);
    if(PROVEEDORES_CONOCIDOS[v]) { setF(x=>({...x,proveedor:v,categoria:PROVEEDORES_CONOCIDOS[v].categoria,centro:PROVEEDORES_CONOCIDOS[v].centro})); setSug([]); }
  };
  const selSug = (p) => { setF({...f,proveedor:p,categoria:PROVEEDORES_CONOCIDOS[p].categoria,centro:PROVEEDORES_CONOCIDOS[p].centro}); setSug([]); };
  const submit = (e) => { e.preventDefault(); if(!f.fecha||!f.monto||!f.proveedor||!f.categoria){alert('Complete todos los campos');return;} onSave({...f,monto:parseFloat(f.monto)}); };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b flex justify-between"><h3 className="text-lg font-semibold">{gasto?'Editar':'Nuevo'} Registro</h3><button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20}/></button></div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">Fecha *</label><input type="date" value={f.fecha} onChange={e=>setF({...f,fecha:e.target.value})} className="w-full px-3 py-2 border rounded-xl" required/></div>
            <div><label className="block text-sm font-medium mb-1">Monto *</label><input type="number" value={f.monto} onChange={e=>setF({...f,monto:e.target.value})} className="w-full px-3 py-2 border rounded-xl" required/></div>
          </div>
          <div className="relative"><label className="block text-sm font-medium mb-1">Proveedor *</label><input type="text" value={f.proveedor} onChange={e=>handleProv(e.target.value)} className="w-full px-3 py-2 border rounded-xl" required/>{sug.length>0&&<div className="absolute z-10 w-full bg-white border rounded-xl mt-1 shadow-lg">{sug.map(s=><button key={s} type="button" onClick={()=>selSug(s)} className="w-full px-4 py-2 text-left hover:bg-green-50">{s}<span className="text-xs text-gray-500 ml-2">{PROVEEDORES_CONOCIDOS[s]?.categoria}</span></button>)}</div>}</div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">Tipo</label><select value={f.tipo} onChange={e=>setF({...f,tipo:e.target.value})} className="w-full px-3 py-2 border rounded-xl"><option>Costo</option><option>Gasto</option></select></div>
            <div><label className="block text-sm font-medium mb-1">Centro *</label><select value={f.centro} onChange={e=>setF({...f,centro:e.target.value})} className="w-full px-3 py-2 border rounded-xl">{CENTROS_COSTOS.map(c=><option key={c}>{c}</option>)}</select></div>
          </div>
          <div><label className="block text-sm font-medium mb-1">Categoría *</label><select value={f.categoria} onChange={e=>setF({...f,categoria:e.target.value})} className="w-full px-3 py-2 border rounded-xl" required><option value="">Seleccione</option>{CATEGORIAS.map(c=><option key={c}>{c}</option>)}</select></div>
          <div><label className="block text-sm font-medium mb-1">Comentarios</label><textarea value={f.comentarios} onChange={e=>setF({...f,comentarios:e.target.value})} className="w-full px-3 py-2 border rounded-xl" rows={3}/></div>
          <div className="flex gap-3 pt-4"><button type="button" onClick={onClose} className="flex-1 px-4 py-2 border rounded-xl hover:bg-gray-50">Cancelar</button><button type="submit" className="flex-1 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700">{gasto?'Guardar':'Crear'}</button></div>
        </form>
      </div>
    </div>
  );
}
