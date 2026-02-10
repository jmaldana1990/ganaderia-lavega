import React, { useState, useMemo, useEffect } from 'react';
import { PlusCircle, Search, TrendingUp, DollarSign, FileText, Check, X, Edit2, Trash2, BarChart3, PieChart, Menu, Home, Receipt, Beef, ChevronLeft, ChevronRight, Baby, Scale, Users, Upload, LogOut, Loader2, Wifi, WifiOff, RefreshCw, MapPin, ShoppingCart } from 'lucide-react';
import { CATEGORIAS, CENTROS_COSTOS, PROVEEDORES_CONOCIDOS } from './datos';
import { GASTOS_HISTORICOS } from './gastos-historicos';
import { NACIMIENTOS_LA_VEGA } from './nacimientos-lavega';
import { INVENTARIO_FINCAS } from './inventario-fincas';
import * as db from './supabase';
import Login from './Login';
import CargaArchivos from './CargaArchivos';
import CargaInventario from './CargaInventario';
import { VENTAS_GANADO, TIPO_ANIMAL_LABELS } from './ventas-ganado';

// ==================== HELPERS ====================
const formatCurrency = (v) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v);
const formatDate = (d) => {
  if (!d) return '-';
  return new Date(d + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
};
const ITEMS_PER_PAGE = 50;
const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const centroColor = (c) => ({ 'La Vega': 'bg-green-100 text-green-800', 'Bariloche': 'bg-blue-100 text-blue-800', 'Global': 'bg-purple-100 text-purple-800' }[c] || 'bg-gray-100 text-gray-800');
const centroBarColor = (c) => ({ 'La Vega': 'bg-green-500', 'Bariloche': 'bg-blue-500', 'Global': 'bg-purple-500' }[c] || 'bg-gray-500');

const HATO_CATEGORIAS = [
  { key: 'vp', label: 'Vacas Paridas', color: 'bg-green-50 text-green-700' },
  { key: 'vh', label: 'Vacas Horras', color: 'bg-blue-50 text-blue-700' },
  { key: 'nas', label: 'Novillas', color: 'bg-purple-50 text-purple-700' },
  { key: 'cm', label: 'Crías ♂', color: 'bg-orange-50 text-orange-700' },
  { key: 'ch', label: 'Crías ♀', color: 'bg-pink-50 text-pink-700' },
  { key: 'hl', label: 'Hemb. Levante', color: 'bg-teal-50 text-teal-700' },
  { key: 'ml', label: 'Machos Levante', color: 'bg-amber-50 text-amber-700' },
  { key: 't', label: 'Toros', color: 'bg-red-50 text-red-700' },
];

// ==================== COMPONENTE PRINCIPAL ====================
export default function GanaderiaApp() {
  // Auth
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
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

  // UI
  const [view, setView] = useState('dashboard');
  const [showForm, setShowForm] = useState(false);
  const [showCarga, setShowCarga] = useState(false);
  const [showCargaInv, setShowCargaInv] = useState(false);
  const [editGasto, setEditGasto] = useState(null);
  const [filtros, setFiltros] = useState({ mes: '', año: new Date().getFullYear().toString(), centro: '', categoria: '', busqueda: '' });
  const [menuOpen, setMenuOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

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

    const { data: { subscription } } = db.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { setUser(null); setSession(null); }
      else if (session) { setSession(session); setUser(session.user); }
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
      const [nacData, costosData, invData, ventasData] = await Promise.all([
        db.getNacimientos(), db.getCostos(), db.getInventario(), db.getVentas().catch(() => null)
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
      if (cachedNac) setNacimientos(JSON.parse(cachedNac));
      if (cachedCostos) setGastos(JSON.parse(cachedCostos));
      if (cachedVentas) setVentas(JSON.parse(cachedVentas));
      if (cachedInv) setInventario(JSON.parse(cachedInv));
      const ts = localStorage.getItem('cache_timestamp');
      if (ts) setDataSource('cache');
      console.log('[Offline] Datos cargados desde caché local', ts ? `(${ts})` : '');
    } catch (e) {
      console.error('[Offline] Error cargando caché:', e);
    }
  };

  const handleLogin = (user, session) => { setUser(user); setSession(session); setShowLogin(false); loadCloudData(); };
  const handleLogout = async () => { try { await db.signOut(); setUser(null); setSession(null); } catch (err) { console.error(err); } };

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={48} className="animate-spin text-green-600 mx-auto mb-4" />
          <p className="text-gray-600">Cargando sistema...</p>
        </div>
      </div>
    );
  }

  if (showLogin) return <Login onLogin={handleLogin} onSkip={() => setShowLogin(false)} />;

  const menuItems = [
    { id: 'dashboard', icon: Home, label: 'Dashboard' },
    { id: 'lavega', icon: MapPin, label: 'Finca La Vega', accent: 'text-green-600' },
    { id: 'bariloche', icon: MapPin, label: 'Finca Bariloche', accent: 'text-blue-600' },
    { id: 'nacimientos', icon: Baby, label: 'Nacimientos' },
    { id: 'ventas', icon: ShoppingCart, label: 'Ventas Totales', accent: 'text-amber-600' },
    { id: 'costos', icon: Receipt, label: 'Costos y Gastos' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-green-700 to-green-600 text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setMenuOpen(!menuOpen)} className="lg:hidden p-2 hover:bg-white/10 rounded-lg"><Menu size={24} /></button>
            <div className="flex items-center gap-3">
              <img src="/logo_lavega.jpg" alt="Hierro La Vega" className="h-12 w-12 object-contain rounded-lg bg-white p-1 shadow-sm" />
              <div>
                <h1 className="text-xl font-bold">Ganadería La Vega</h1>
                <p className="text-xs text-green-200 hidden sm:block">Sistema de Gestión</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${isOnline ? 'bg-green-500/30' : 'bg-red-500/30'}`}>
              {syncing ? <RefreshCw size={14} className="animate-spin" /> : isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
              <span className="hidden sm:inline">{syncing ? 'Sincronizando...' : isOnline ? 'En línea' : 'Sin conexión'}</span>
            </div>
            {isOnline && !syncing && (
              <button onClick={loadCloudData} className="p-2 hover:bg-white/20 rounded-lg" title="Sincronizar datos"><RefreshCw size={18} /></button>
            )}
            {user && isOnline && (
              <div className="flex items-center gap-1">
                <button onClick={() => setShowCarga(true)} className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-sm transition-colors" title="Cargar costos/nacimientos">
                  <Upload size={16} /><span className="hidden sm:inline">Costos</span>
                </button>
                <button onClick={() => setShowCargaInv(true)} className="flex items-center gap-1.5 bg-emerald-400/30 hover:bg-emerald-400/50 px-3 py-1.5 rounded-lg text-sm transition-colors" title="Cargar movimientos de inventario">
                  <FileText size={16} /><span className="hidden sm:inline">Inventario</span>
                </button>
              </div>
            )}
            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-sm bg-white/20 px-3 py-1 rounded-full hidden md:block truncate max-w-[150px]">{user.email}</span>
                <button onClick={handleLogout} className="p-2 hover:bg-white/20 rounded-lg" title="Cerrar sesión"><LogOut size={18} /></button>
              </div>
            ) : (
              <button onClick={() => setShowLogin(true)} className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-sm">Iniciar sesión</button>
            )}
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className={`${menuOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-40 w-64 bg-white shadow-lg transition-transform pt-16 lg:pt-0`}>
          <nav className="p-4 space-y-1">
            {menuItems.map(item => (
              <button key={item.id} onClick={() => { setView(item.id); setMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${view === item.id ? 'bg-green-50 text-green-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                <item.icon size={20} className={item.accent || ''} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="p-4 border-t">
            <p className="text-xs text-gray-400 mb-2">Fuente: {dataSource === 'cloud' ? '☁️ Nube' : dataSource === 'cache' ? '📦 Caché offline' : '💾 Local'}</p>
            <div className="space-y-1 text-sm text-gray-600">
              <p>📋 {nacimientos.length} nacimientos</p>
              <p>💰 {gastos.length} costos</p>
              <p>📊 {inventario.length} inventarios</p>
              <p>🛒 {ventas.length} ventas</p>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-4 lg:p-6 max-w-7xl">
          {view === 'dashboard' && (
            <Dashboard totales={totales} porCategoria={porCategoria} porCentro={porCentro}
              pendientes={gastos.filter(g => g.estado === 'pendiente').slice(0, 5)} onApprove={approve}
              filtros={filtros} setFiltros={updateFiltros} años={años}
              nacimientos={nacimientos} inventario={inventario} gastos={gastos} ventas={ventas} />
          )}
          {view === 'lavega' && (
            <FincaView finca="La Vega" subtitulo="Finca de Cría" color="green"
              inventario={inventario} nacimientos={nacimientos} gastos={gastos} años={años} />
          )}
          {view === 'bariloche' && (
            <FincaView finca="Bariloche" subtitulo="Finca de Levante" color="blue"
              inventario={inventario} nacimientos={nacimientos} gastos={gastos} años={años} />
          )}
          {view === 'nacimientos' && <Nacimientos data={nacimientos} inventario={inventario} />}
          {view === 'ventas' && <VentasTotales ventas={ventas} />}
          {view === 'costos' && (
            <Costos gastos={paginated} total={filtered.length} totales={totales}
              filtros={filtros} setFiltros={updateFiltros} onNew={() => setShowForm(true)}
              onEdit={g => { setEditGasto(g); setShowForm(true); }} onDel={del} onApprove={approve}
              page={page} pages={totalPages} setPage={setPage} años={años} canEdit={!!user} />
          )}
        </main>
      </div>

      {/* Modales */}
      {showForm && <Form gasto={editGasto} onSave={save} onClose={() => { setShowForm(false); setEditGasto(null); }} />}
      {showCarga && <CargaArchivos user={user} onClose={() => setShowCarga(false)} onSuccess={() => { setShowCarga(false); loadCloudData(); }} />}
      {showCargaInv && <CargaInventario user={user} onClose={() => setShowCargaInv(false)} onSuccess={() => { setShowCargaInv(false); loadCloudData(); }} />}
      {menuOpen && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setMenuOpen(false)} />}
    </div>
  );
}

// ==================== COMPONENTE DASHBOARD ====================
function Dashboard({ totales, porCategoria, porCentro, pendientes, onApprove, filtros, setFiltros, años, nacimientos, inventario, gastos, ventas }) {
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
        <h2 className="text-2xl font-bold text-gray-800">Dashboard</h2>
        <select value={filtros.año} onChange={e => setFiltros({ ...filtros, año: e.target.value })} className="px-4 py-2 border rounded-xl">
          <option value="">Todos</option>
          {años.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Cards financieros */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card title="Total Egresos" value={formatCurrency(totales.total)} icon={DollarSign} color="from-green-500 to-green-600" />
        <Card title="Costos" value={formatCurrency(totales.costos)} icon={TrendingUp} color="from-blue-500 to-blue-600" />
        <Card title="Gastos" value={formatCurrency(totales.gastos)} icon={Receipt} color="from-purple-500 to-purple-600" />
        <Card title={`Ventas ${ventasAñoLabel}`} value={formatCurrency(ventasAño)} icon={ShoppingCart} color="from-amber-500 to-amber-600" sub="ingresos ganado" />
      </div>

      {/* Inventario por finca */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border-l-4 border-green-500">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-100 rounded-lg"><Beef size={20} className="text-green-600" /></div>
            <div>
              <h3 className="font-semibold text-gray-800">La Vega <span className="text-xs font-normal text-gray-400">(Cría)</span></h3>
              <p className="text-xs text-gray-400">{MESES[invLaVega?.mes]} {invLaVega?.año}</p>
            </div>
          </div>
          <p className="text-3xl font-bold text-green-600">{invLaVega?.total || 0} <span className="text-sm font-normal text-gray-500">cabezas</span></p>
          <div className="flex gap-3 mt-2 text-xs text-gray-500">
            <span>VP:{invLaVega?.vp || 0}</span><span>VH:{invLaVega?.vh || 0}</span><span>NAS:{invLaVega?.nas || 0}</span><span>Crías:{(invLaVega?.cm || 0) + (invLaVega?.ch || 0)}</span>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border-l-4 border-blue-500">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 rounded-lg"><Beef size={20} className="text-blue-600" /></div>
            <div>
              <h3 className="font-semibold text-gray-800">Bariloche <span className="text-xs font-normal text-gray-400">(Levante)</span></h3>
              <p className="text-xs text-gray-400">{MESES[invBariloche?.mes]} {invBariloche?.año}</p>
            </div>
          </div>
          <p className="text-3xl font-bold text-blue-600">{invBariloche?.total || 0} <span className="text-sm font-normal text-gray-500">cabezas</span></p>
          <div className="flex gap-3 mt-2 text-xs text-gray-500">
            <span>NAS:{invBariloche?.nas || 0}</span><span>HL:{invBariloche?.hl || 0}</span><span>ML:{invBariloche?.ml || 0}</span><span>VP:{invBariloche?.vp || 0}</span>
          </div>
        </div>
      </div>

      {/* Nacimientos + Egresos por categoría */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold flex items-center gap-2"><Baby size={20} className="text-green-600" />Nacimientos por Mes</h3>
            <span className="text-sm text-gray-500">Total: {statsNac.total} (♂{statsNac.machos} / ♀{statsNac.hembras})</span>
          </div>
          <div className="h-48">
            <div className="flex items-end justify-between h-full gap-1 px-2">
              {nacimientosPorMes.map(({ mes, count, label }) => (
                <div key={mes} className="flex-1 flex flex-col items-center h-full justify-end">
                  {count > 0 && <span className="text-xs font-semibold text-green-700 mb-1">{count}</span>}
                  <div className={`w-full rounded-t transition-all duration-300 ${count > 0 ? 'bg-gradient-to-t from-green-600 to-green-400' : 'bg-gray-100'}`}
                    style={{ height: count > 0 ? `${Math.max((count / maxNac) * 100, 8)}%` : '4px' }} />
                  <span className="text-xs text-gray-500 mt-2 font-medium">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><BarChart3 size={20} className="text-green-600" />Egresos por Categoría</h3>
          <div className="space-y-3">
            {porCategoria.slice(0, 8).map(({ categoria, total }) => (
              <div key={categoria}>
                <div className="flex justify-between text-sm mb-1"><span className="truncate">{categoria}</span><span className="font-medium">{formatCurrency(total)}</span></div>
                <div className="h-2 bg-gray-100 rounded-full"><div className="h-full bg-green-500 rounded-full" style={{ width: `${(total / maxCat) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Egresos por Centro */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><PieChart size={20} className="text-green-600" />Egresos por Centro de Costos</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {porCentro.map(({ centro, total }) => (
            <div key={centro}>
              <div className="flex justify-between text-sm mb-1">
                <span className={`px-2 py-0.5 rounded-full text-xs ${centroColor(centro)}`}>{centro}</span>
                <span className="font-medium">{formatCurrency(total)}</span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full"><div className={`h-full rounded-full ${centroBarColor(centro)}`} style={{ width: `${(total / maxCen) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      </div>

      {/* Pendientes */}
      {pendientes.length > 0 && (
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold mb-4">Pendientes <span className="bg-orange-100 text-orange-600 text-xs px-2 py-1 rounded-full ml-2">{pendientes.length}</span></h3>
          <div className="space-y-2">
            {pendientes.map(g => (
              <div key={g.id} className="flex items-center justify-between p-3 bg-orange-50 rounded-xl">
                <div>
                  <span className="font-medium">{g.proveedor}</span>
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${centroColor(g.centro)}`}>{g.centro}</span>
                  <p className="text-sm text-gray-500">{formatDate(g.fecha)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-green-700">{formatCurrency(g.monto)}</span>
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
function VentasTotales({ ventas: ventasData }) {
  const [añoSel, setAñoSel] = useState('');
  const allVentas = ventasData || VENTAS_GANADO;
  const añosDisponibles = useMemo(() => 
    [...new Set(allVentas.map(v => v.año))].sort((a, b) => b - a).map(String), 
    [allVentas]);

  const COLORES_TIPO = {
    ML: { bg: 'bg-blue-100', text: 'text-blue-700', bar: 'bg-blue-500' },
    HL: { bg: 'bg-pink-100', text: 'text-pink-700', bar: 'bg-pink-500' },
    VD: { bg: 'bg-amber-100', text: 'text-amber-700', bar: 'bg-amber-500' },
    T: { bg: 'bg-red-100', text: 'text-red-700', bar: 'bg-red-500' },
    CM: { bg: 'bg-cyan-100', text: 'text-cyan-700', bar: 'bg-cyan-500' },
    CH: { bg: 'bg-purple-100', text: 'text-purple-700', bar: 'bg-purple-500' },
  };

  // Ventas filtradas
  const ventasFiltradas = useMemo(() => {
    if (!añoSel) return allVentas;
    return allVentas.filter(v => v.año === parseInt(añoSel));
  }, [añoSel, allVentas]);

  // Totales globales
  const totalGlobal = useMemo(() => {
    const total = ventasFiltradas.reduce((s, v) => s + (v.valor || 0), 0);
    const kg = ventasFiltradas.reduce((s, v) => s + (v.kg || 0), 0);
    return { total, kg, precioPromedio: kg > 0 ? Math.round(total / kg) : 0, transacciones: ventasFiltradas.length };
  }, [ventasFiltradas]);

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
      // Tipos por año
      const tipos = {};
      ventasAño.forEach(v => {
        if (!tipos[v.tipo]) tipos[v.tipo] = { kg: 0, precio: 0, valor: 0 };
        tipos[v.tipo].kg += v.kg || 0;
        tipos[v.tipo].valor += v.valor || 0;
      });
      Object.values(tipos).forEach(t => { t.precio = t.kg > 0 ? Math.round(t.valor / t.kg) : 0; });
      return { año, totalKg, precioPromedio, ingresosTotales, tipos };
    });
  }, [allVentas, añosDisponibles]);

  // Transacciones del periodo
  const transacciones = useMemo(() => {
    return [...ventasFiltradas].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }, [ventasFiltradas]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <ShoppingCart size={28} className="text-amber-600" /> Ventas Totales
        </h2>
        <select value={añoSel} onChange={e => setAñoSel(e.target.value)} className="px-4 py-2 border rounded-xl">
          <option value="">Todos los años</option>
          {añosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Cards resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card title="Ingresos Totales" value={formatCurrency(totalGlobal.total)} icon={DollarSign} color="from-amber-500 to-amber-600" />
        <Card title="Total Kg" value={totalGlobal.kg.toLocaleString('es-CO')} icon={Scale} color="from-blue-500 to-blue-600" sub="kg vendidos" />
        <Card title="Precio Prom/kg" value={formatCurrency(totalGlobal.precioPromedio)} icon={TrendingUp} color="from-green-500 to-green-600" sub="$/kg" />
        <Card title="Transacciones" value={totalGlobal.transacciones} icon={FileText} color="from-purple-500 to-purple-600" sub="ventas realizadas" />
      </div>

      {/* Desglose por tipo de animal */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><Beef size={20} className="text-amber-600" />Ventas por Tipo de Animal</h3>
        <div className="space-y-4">
          {porTipo.map(({ tipo, label, kg, valor, precioPromedio }) => (
            <div key={tipo}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${COLORES_TIPO[tipo]?.bg || 'bg-gray-100'} ${COLORES_TIPO[tipo]?.text || 'text-gray-700'}`}>{tipo}</span>
                  <span className="text-sm font-medium text-gray-700">{label}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-500">{kg.toLocaleString('es-CO')} kg</span>
                  <span className="text-gray-500">{formatCurrency(precioPromedio)}/kg</span>
                  <span className="font-semibold text-gray-800">{formatCurrency(valor)}</span>
                </div>
              </div>
              <div className="h-3 bg-gray-100 rounded-full">
                <div className={`h-full rounded-full transition-all duration-300 ${COLORES_TIPO[tipo]?.bar || 'bg-gray-500'}`} style={{ width: `${(kg / maxKg) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabla comparativa por año */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><BarChart3 size={20} className="text-amber-600" />Comparativo Anual</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-2 font-semibold text-gray-600">Año</th>
                <th className="text-right py-3 px-2 font-semibold text-gray-600">Kg Totales</th>
                <th className="text-right py-3 px-2 font-semibold text-gray-600">Precio Prom/kg</th>
                <th className="text-right py-3 px-2 font-semibold text-gray-600">Ingresos Totales</th>
              </tr>
            </thead>
            <tbody>
              {porAño.map(({ año, totalKg, precioPromedio, ingresosTotales }) => (
                <tr key={año} className={`border-b hover:bg-amber-50 ${añoSel && parseInt(añoSel) === año ? 'bg-amber-50 font-semibold' : ''}`}>
                  <td className="py-3 px-2 font-medium">{año}</td>
                  <td className="py-3 px-2 text-right">{totalKg.toLocaleString('es-CO')}</td>
                  <td className="py-3 px-2 text-right">{formatCurrency(precioPromedio)}</td>
                  <td className="py-3 px-2 text-right font-medium text-amber-700">{formatCurrency(ingresosTotales)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-bold">
                <td className="py-3 px-2">Total</td>
                <td className="py-3 px-2 text-right">{porAño.reduce((s, r) => s + r.totalKg, 0).toLocaleString('es-CO')}</td>
                <td className="py-3 px-2 text-right">{formatCurrency(Math.round(porAño.reduce((s, r) => s + r.ingresosTotales, 0) / porAño.reduce((s, r) => s + r.totalKg, 0)))}</td>
                <td className="py-3 px-2 text-right text-amber-700">{formatCurrency(porAño.reduce((s, r) => s + r.ingresosTotales, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Detalle por tipo por año */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><PieChart size={20} className="text-amber-600" />Detalle por Tipo de Animal y Año</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-2 font-semibold text-gray-600">Año</th>
                <th className="text-left py-3 px-2 font-semibold text-gray-600">Tipo</th>
                <th className="text-right py-3 px-2 font-semibold text-gray-600">Kg</th>
                <th className="text-right py-3 px-2 font-semibold text-gray-600">Precio/kg</th>
                <th className="text-right py-3 px-2 font-semibold text-gray-600">Valor</th>
              </tr>
            </thead>
            <tbody>
              {porAño.map(({ año, tipos }) => {
                const tipoKeys = Object.keys(tipos).sort();
                return tipoKeys.map((tipo, idx) => {
                  const t = tipos[tipo];
                  return (
                    <tr key={`${año}-${tipo}`} className={`border-b hover:bg-gray-50 ${idx === 0 ? 'border-t-2 border-t-gray-200' : ''}`}>
                      {idx === 0 && <td className="py-2 px-2 font-bold text-gray-800" rowSpan={tipoKeys.length}>{año}</td>}
                      <td className="py-2 px-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${COLORES_TIPO[tipo]?.bg || 'bg-gray-100'} ${COLORES_TIPO[tipo]?.text || 'text-gray-700'}`}>{tipo}</span>
                        <span className="ml-2 text-gray-600">{TIPO_ANIMAL_LABELS[tipo] || tipo}</span>
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
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><FileText size={20} className="text-amber-600" />Historial de Ventas ({transacciones.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-2 font-semibold text-gray-600">Fecha</th>
                <th className="text-left py-3 px-2 font-semibold text-gray-600">Factura</th>
                <th className="text-left py-3 px-2 font-semibold text-gray-600">Cliente</th>
                <th className="text-left py-3 px-2 font-semibold text-gray-600">Tipo</th>
                <th className="text-right py-3 px-2 font-semibold text-gray-600">Kg</th>
                <th className="text-right py-3 px-2 font-semibold text-gray-600">$/kg</th>
                <th className="text-right py-3 px-2 font-semibold text-gray-600">Valor</th>
              </tr>
            </thead>
            <tbody>
              {transacciones.map((v, i) => (
                <tr key={i} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-2 whitespace-nowrap">{v.fecha}</td>
                  <td className="py-2 px-2 text-gray-500">{v.factura || '—'}</td>
                  <td className="py-2 px-2 truncate max-w-[150px]">{v.cliente}</td>
                  <td className="py-2 px-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${COLORES_TIPO[v.tipo]?.bg || 'bg-gray-100'} ${COLORES_TIPO[v.tipo]?.text || 'text-gray-700'}`}>{v.tipo}</span>
                  </td>
                  <td className="py-2 px-2 text-right">{v.kg.toLocaleString('es-CO')}</td>
                  <td className="py-2 px-2 text-right">{formatCurrency(v.precio)}</td>
                  <td className="py-2 px-2 text-right font-medium text-amber-700">{formatCurrency(v.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==================== COMPONENTE FINCA (reutilizable) ====================
function FincaView({ finca, subtitulo, color, inventario, nacimientos, gastos, años }) {
  const [añoSel, setAñoSel] = useState(new Date().getFullYear().toString());
  const añoNum = parseInt(añoSel);

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

  const colorClasses = {
    green: { bg: 'bg-green-100', text: 'text-green-600', bar: 'bg-green-500', gradient: 'from-green-500 to-green-600', border: 'border-green-500' },
    blue: { bg: 'bg-blue-100', text: 'text-blue-600', bar: 'bg-blue-500', gradient: 'from-blue-500 to-blue-600', border: 'border-blue-500' }
  }[color];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Finca {finca}</h2>
          <p className="text-gray-500">{subtitulo}</p>
        </div>
        <select value={añoSel} onChange={e => setAñoSel(e.target.value)} className="px-4 py-2 border rounded-xl">
          {añosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

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
      <div className="bg-white rounded-2xl p-6 shadow-sm">
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
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">Evolución del Inventario {añoSel}</h3>
          <div className="h-56 flex items-end gap-2 px-2">
            {invAño.map((inv, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end">
                <span className="text-xs font-semibold mb-1" style={{ color: color === 'green' ? '#16a34a' : '#2563eb' }}>{inv.total}</span>
                <div className={`w-full rounded-t transition-all duration-300 ${colorClasses.bar}`}
                  style={{ height: `${Math.max((inv.total / maxInv) * 100, 8)}%` }} />
                <span className="text-xs text-gray-500 mt-2 font-medium">{MESES[inv.mes]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabla detalle mensual */}
      {invAño.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b">
            <h3 className="font-semibold">Detalle Mensual {añoSel}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Mes</th>
                  {HATO_CATEGORIAS.map(c => (
                    <th key={c.key} className="px-3 py-3 text-right text-xs font-semibold text-gray-600">{c.key.toUpperCase()}</th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-800">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {invAño.map((inv, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
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
    </div>
  );
}

// ==================== COMPONENTE NACIMIENTOS ====================
function Nacimientos({ data, inventario }) {
  const [filtros, setFiltros] = useState({ año: '2025', sexo: '', padre: '', busqueda: '', estado: 'Activo' });
  const años = [...new Set(data.map(n => n.año))].filter(Boolean).sort().reverse();

  const filtered = useMemo(() => data.filter(n => {
    if (filtros.año && n.año !== parseInt(filtros.año)) return false;
    if (filtros.sexo && n.sexo !== filtros.sexo) return false;
    if (filtros.padre && n.padre !== filtros.padre) return false;
    if (filtros.estado && n.estado !== filtros.estado) return false;
    if (filtros.busqueda) {
      const b = filtros.busqueda.toLowerCase();
      if (!n.cria?.toLowerCase().includes(b) && !n.madre?.toLowerCase().includes(b) && !n.padre?.toLowerCase().includes(b)) return false;
    }
    return true;
  }), [data, filtros]);

  const activosParaDestete = useMemo(() => data.filter(n => {
    const añoDest = n.añoDestete || n.año_destete;
    if (filtros.año && añoDest !== parseInt(filtros.año)) return false;
    return n.estado === 'Activo' && (n.pesoDestete || n.peso_destete);
  }), [data, filtros.año]);

  const activos = useMemo(() => data.filter(n => {
    if (filtros.año && n.año !== parseInt(filtros.año)) return false;
    return n.estado === 'Activo';
  }), [data, filtros.año]);

  const stats = useMemo(() => {
    const base = filtros.estado ? filtered : activos;
    const m = base.filter(n => n.sexo === 'M'), h = base.filter(n => n.sexo === 'H');
    const pn = base.filter(n => n.pesoNacer || n.peso_nacer);
    const getPeso = n => n.pesoDestete || n.peso_destete || 0;
    const getPesoN = n => n.pesoNacer || n.peso_nacer || 0;
    const activosM = activosParaDestete.filter(n => n.sexo === 'M');
    const activosH = activosParaDestete.filter(n => n.sexo === 'H');

    return {
      total: filtered.length,
      machos: m.length, hembras: h.length,
      pesoNacer: pn.length ? (pn.reduce((s, n) => s + getPesoN(n), 0) / pn.length).toFixed(1) : '-',
      pesoDesteteM: activosM.length ? (activosM.reduce((s, n) => s + getPeso(n), 0) / activosM.length).toFixed(1) : '-',
      pesoDesteteH: activosH.length ? (activosH.reduce((s, n) => s + getPeso(n), 0) / activosH.length).toFixed(1) : '-',
      totalActivos: activos.length,
      totalVendidos: data.filter(n => (!filtros.año || n.año === parseInt(filtros.año)) && n.estado === 'Vendido').length,
      totalMuertos: data.filter(n => (!filtros.año || n.año === parseInt(filtros.año)) && n.estado === 'Muerto').length
    };
  }, [filtered, activos, activosParaDestete, data, filtros]);

  const porMes = useMemo(() => {
    const d = {};
    filtered.forEach(n => {
      if (n.año && n.mes) { const k = `${n.año}-${String(n.mes).padStart(2, '0')}`; d[k] = (d[k] || 0) + 1; }
    });
    return Object.entries(d).sort().slice(-12);
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <h2 className="text-2xl font-bold text-gray-800">🐮 Nacimientos</h2>
        <select value={filtros.año} onChange={e => setFiltros({ ...filtros, año: e.target.value })} className="px-4 py-2 border rounded-xl">
          <option value="">Todos</option>
          {años.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filtros.estado} onChange={e => setFiltros({ ...filtros, estado: e.target.value })} className="px-4 py-2 border rounded-xl">
          <option value="">Todos</option>
          <option value="Activo">Activos</option>
          <option value="Vendido">Vendidos</option>
          <option value="Muerto">Muertos</option>
        </select>
        <span className="text-sm text-gray-500">({stats.totalActivos} activos, {stats.totalVendidos} vendidos, {stats.totalMuertos} muertos)</span>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card title="Total Nacimientos" value={stats.total} icon={Baby} color="from-green-500 to-green-600" />
        <div className="bg-gradient-to-br from-blue-500 to-pink-500 rounded-2xl p-4 text-white shadow-lg">
          <div className="flex justify-between">
            <div>
              <p className="text-white/80 text-sm">Machos / Hembras</p>
              <p className="text-2xl font-bold mt-1">♂{stats.machos} / ♀{stats.hembras}</p>
            </div>
            <Users size={32} className="opacity-50" />
          </div>
        </div>
        <Card title="Peso Nacer Prom." value={`${stats.pesoNacer} kg`} icon={Scale} color="from-amber-500 to-amber-600" />
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-4 text-white shadow-lg">
          <div className="flex justify-between">
            <div>
              <p className="text-white/80 text-sm">Peso Destete ({filtros.año || 'todos'})</p>
              <p className="text-lg font-bold">♂ {stats.pesoDesteteM} kg</p>
              <p className="text-lg font-bold">♀ {stats.pesoDesteteH} kg</p>
            </div>
            <TrendingUp size={32} className="opacity-50" />
          </div>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm lg:col-span-2">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><BarChart3 size={20} className="text-green-600" />Nacimientos por Mes</h3>
          <div className="h-48">
            {porMes.length > 0 ? (
              <div className="flex items-end justify-between h-full gap-1 px-2">
                {porMes.map(([m, c]) => {
                  const max = Math.max(...porMes.map(([, v]) => v));
                  const mesNum = parseInt(m.split('-')[1]);
                  return (
                    <div key={m} className="flex-1 flex flex-col items-center h-full justify-end">
                      <span className="text-xs font-semibold text-green-700 mb-1">{c}</span>
                      <div className="w-full rounded-t transition-all duration-300 bg-gradient-to-t from-green-600 to-green-400"
                        style={{ height: `${Math.max((c / max) * 100, 8)}%` }} />
                      <span className="text-xs text-gray-500 mt-2 font-medium">{MESES[mesNum]}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400"><p>Sin datos para el período</p></div>
            )}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><PieChart size={20} className="text-green-600" />Por Sexo</h3>
          <div className="flex justify-center mb-4">
            <div className="relative w-32 h-32">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="40" fill="none" strokeWidth="20" className="stroke-blue-500" strokeDasharray={`${(stats.machos / (stats.total || 1)) * 251} 251`} />
                <circle cx="50" cy="50" r="40" fill="none" strokeWidth="20" className="stroke-pink-500" strokeDasharray={`${(stats.hembras / (stats.total || 1)) * 251} 251`} strokeDashoffset={-(stats.machos / (stats.total || 1)) * 251} />
              </svg>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between"><span className="flex items-center gap-2"><span className="w-3 h-3 bg-blue-500 rounded-full" />Machos</span><span className="font-medium">{stats.machos}</span></div>
            <div className="flex justify-between"><span className="flex items-center gap-2"><span className="w-3 h-3 bg-pink-500 rounded-full" />Hembras</span><span className="font-medium">{stats.hembras}</span></div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b flex flex-wrap gap-3">
          <select value={filtros.sexo} onChange={e => setFiltros({ ...filtros, sexo: e.target.value })} className="px-3 py-2 border rounded-xl text-sm">
            <option value="">Sexo</option>
            <option value="M">Macho</option>
            <option value="H">Hembra</option>
          </select>
          <select value={filtros.padre} onChange={e => setFiltros({ ...filtros, padre: e.target.value })} className="px-3 py-2 border rounded-xl text-sm">
            <option value="">Padre</option>
            {[...new Set(data.map(n => n.padre))].filter(Boolean).sort().map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input type="text" placeholder="Buscar cría, madre o padre..." value={filtros.busqueda} onChange={e => setFiltros({ ...filtros, busqueda: e.target.value })} className="w-full pl-10 pr-4 py-2 border rounded-xl text-sm" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Cría</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Fecha</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Sexo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Madre</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Padre</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">P.Nacer</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">P.Destete</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.slice(0, 50).map(n => (
                <tr key={n.id || n.cria} className={`hover:bg-gray-50 ${n.estado !== 'Activo' ? 'bg-red-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-sm">{n.cria}</td>
                  <td className="px-4 py-3 text-sm">{formatDate(n.fecha)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${n.sexo === 'M' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
                      {n.sexo === 'M' ? '♂' : '♀'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">{n.madre}</td>
                  <td className="px-4 py-3 text-sm">{n.padre}</td>
                  <td className="px-4 py-3 text-sm text-right">{n.pesoNacer || n.peso_nacer || '-'}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium">{n.pesoDestete || n.peso_destete || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${n.estado === 'Activo' ? 'bg-green-100 text-green-700' : n.estado === 'Vendido' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
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
    </div>
  );
}

// ==================== COMPONENTE COSTOS ====================
function Costos({ gastos, total, totales, filtros, setFiltros, onNew, onEdit, onDel, onApprove, page, pages, setPage, años, canEdit }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Costos y Gastos</h2>
          <p className="text-gray-500 text-sm">{total.toLocaleString()} registros • {formatCurrency(totales.total)}</p>
        </div>
        {canEdit && (
          <button onClick={onNew} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-xl shadow-lg hover:bg-green-700">
            <PlusCircle size={20} />Nuevo
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <select value={filtros.año} onChange={e => setFiltros({ ...filtros, año: e.target.value })} className="px-3 py-2 border rounded-xl text-sm">
            <option value="">Año</option>
            {años.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={filtros.mes} onChange={e => setFiltros({ ...filtros, mes: e.target.value })} className="px-3 py-2 border rounded-xl text-sm">
            <option value="">Mes</option>
            {['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map((m, i) => <option key={m} value={m}>{MESES[i + 1]}</option>)}
          </select>
          <select value={filtros.centro} onChange={e => setFiltros({ ...filtros, centro: e.target.value })} className="px-3 py-2 border rounded-xl text-sm">
            <option value="">Centro</option>
            {CENTROS_COSTOS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filtros.categoria} onChange={e => setFiltros({ ...filtros, categoria: e.target.value })} className="px-3 py-2 border rounded-xl text-sm">
            <option value="">Categoría</option>
            {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input type="text" placeholder="Buscar..." value={filtros.busqueda} onChange={e => setFiltros({ ...filtros, busqueda: e.target.value })} className="w-full pl-10 pr-4 py-2 border rounded-xl text-sm" />
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
                {canEdit && <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Acc.</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {gastos.map(g => (
                <tr key={g.id} className={`hover:bg-gray-50 ${g.estado === 'pendiente' ? 'bg-orange-50' : ''}`}>
                  <td className="px-4 py-3 text-sm">{formatDate(g.fecha)}</td>
                  <td className="px-4 py-3 font-medium text-sm">{g.proveedor}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell truncate max-w-xs">{g.comentarios}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-full ${centroColor(g.centro)}`}>{g.centro}</span></td>
                  <td className="px-4 py-3 text-right font-semibold text-sm">{formatCurrency(g.monto)}</td>
                  {canEdit && (
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-1">
                        {g.estado === 'pendiente' && <button onClick={() => onApprove(g.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"><Check size={16} /></button>}
                        <button onClick={() => onEdit(g)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={16} /></button>
                        <button onClick={() => onDel(g.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <span className="text-sm text-gray-600">Pág {page}/{pages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(page - 1)} disabled={page === 1} className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-50"><ChevronLeft size={20} /></button>
              <button onClick={() => setPage(page + 1)} disabled={page === pages} className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-50"><ChevronRight size={20} /></button>
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg">
        <div className="p-6 border-b flex justify-between">
          <h3 className="text-lg font-semibold">{gasto ? 'Editar' : 'Nuevo'} Registro</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Fecha</label>
              <input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} className="w-full px-3 py-2 border rounded-xl" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Monto</label>
              <input type="number" value={f.monto} onChange={e => setF({ ...f, monto: e.target.value })} className="w-full px-3 py-2 border rounded-xl" required />
            </div>
          </div>
          <div className="relative">
            <label className="block text-sm font-medium mb-1">Proveedor</label>
            <input type="text" value={f.proveedor} onChange={e => handleProv(e.target.value)} className="w-full px-3 py-2 border rounded-xl" required />
            {sug.length > 0 && <div className="absolute z-10 w-full bg-white border rounded-xl mt-1 shadow-lg">{sug.map(p => <button key={p} type="button" onClick={() => selSug(p)} className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm">{p}</button>)}</div>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Tipo</label>
              <select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })} className="w-full px-3 py-2 border rounded-xl"><option>Costo</option><option>Gasto</option></select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Centro</label>
              <select value={f.centro} onChange={e => setF({ ...f, centro: e.target.value })} className="w-full px-3 py-2 border rounded-xl">{CENTROS_COSTOS.map(c => <option key={c}>{c}</option>)}</select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Categoría</label>
            <select value={f.categoria} onChange={e => setF({ ...f, categoria: e.target.value })} className="w-full px-3 py-2 border rounded-xl" required><option value="">Seleccione</option>{CATEGORIAS.map(c => <option key={c}>{c}</option>)}</select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Comentarios</label>
            <textarea value={f.comentarios} onChange={e => setF({ ...f, comentarios: e.target.value })} className="w-full px-3 py-2 border rounded-xl" rows={2} />
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
