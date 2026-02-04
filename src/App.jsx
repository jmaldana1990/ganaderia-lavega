import React, { useState, useMemo, useEffect } from 'react';
import { PlusCircle, Search, TrendingUp, DollarSign, FileText, Check, X, Edit2, Trash2, BarChart3, PieChart, Menu, Home, Receipt, Beef, ChevronLeft, ChevronRight, Baby, Scale, Users, Upload, LogOut, Loader2, Wifi, WifiOff, RefreshCw, MapPin, Calendar, Activity } from 'lucide-react';
import { CATEGORIAS, CENTROS_COSTOS, PROVEEDORES_CONOCIDOS } from './datos';
import { GASTOS_HISTORICOS } from './gastos-historicos';
import { NACIMIENTOS_LA_VEGA } from './nacimientos-lavega';
import { INVENTARIO_FINCAS } from './inventario-fincas';
import * as db from './supabase';
import Login from './Login';
import CargaArchivos from './CargaArchivos';

const formatCurrency = (v) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v);
const formatDate = (d) => {
  if (!d) return '-';
  return new Date(d + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
};

const ITEMS_PER_PAGE = 50;

const centroColor = (c) => ({
  'La Vega': 'bg-green-100 text-green-800',
  'Bariloche': 'bg-blue-100 text-blue-800',
  'Global': 'bg-purple-100 text-purple-800'
}[c] || 'bg-gray-100 text-gray-800');

const centroBarColor = (c) => ({
  'La Vega': 'bg-green-500',
  'Bariloche': 'bg-blue-500',
  'Global': 'bg-purple-500'
}[c] || 'bg-gray-500');

const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// Distribución de costos globales
const distribuirCostosGlobales = (costos, finca) => {
  return costos.map(c => {
    if (c.centro === 'Global') {
      return { ...c, montoFinca: c.monto * 0.5 }; // 50% para cada finca
    }
    if (c.centro === finca) {
      return { ...c, montoFinca: c.monto };
    }
    return null;
  }).filter(Boolean);
};

export default function GanaderiaApp() {
  // Estado de autenticación
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [showLogin, setShowLogin] = useState(false);

  // Estado de conexión
  const [isOnline, setIsOnline] = useState(true);
  const [dataSource, setDataSource] = useState('local');
  const [syncing, setSyncing] = useState(false);

  // Estado de datos
  const [nacimientos, setNacimientos] = useState(NACIMIENTOS_LA_VEGA);
  const [gastos, setGastos] = useState(GASTOS_HISTORICOS);
  const [inventario, setInventario] = useState(INVENTARIO_FINCAS);

  // Estado de UI
  const [view, setView] = useState('dashboard');
  const [showForm, setShowForm] = useState(false);
  const [showCarga, setShowCarga] = useState(false);
  const [editGasto, setEditGasto] = useState(null);
  const [filtros, setFiltros] = useState({ mes: '', año: '2025', centro: '', categoria: '', busqueda: '' });
  const [menuOpen, setMenuOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Verificar conexión y cargar datos al inicio
  useEffect(() => {
    const init = async () => {
      try {
        const session = await db.getSession();
        if (session) {
          setSession(session);
          setUser(session.user);
        }
        const online = await db.checkConnection();
        setIsOnline(online);
        if (online) {
          await loadCloudData();
        }
      } catch (err) {
        console.error('Error en inicialización:', err);
        setIsOnline(false);
      } finally {
        setLoading(false);
      }
    };
    init();

    const { data: { subscription } } = db.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setSession(null);
      } else if (session) {
        setSession(session);
        setUser(session.user);
      }
    });

    const handleOnline = () => checkConnection();
    const handleOffline = () => setIsOnline(false);
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
    if (online && dataSource === 'local') {
      await loadCloudData();
    }
  };

  const loadCloudData = async () => {
    setSyncing(true);
    try {
      const [nacData, costosData, invData] = await Promise.all([
        db.getNacimientos(),
        db.getCostos(),
        db.getInventario()
      ]);
      if (nacData && nacData.length > 0) setNacimientos(nacData);
      if (costosData && costosData.length > 0) setGastos(costosData);
      if (invData && invData.length > 0) setInventario(invData);
      setDataSource('cloud');
    } catch (err) {
      console.error('Error cargando datos de la nube:', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleLogin = (user, session) => {
    setUser(user);
    setSession(session);
    setShowLogin(false);
    loadCloudData();
  };

  const handleLogout = async () => {
    try {
      await db.signOut();
      setUser(null);
      setSession(null);
    } catch (err) {
      console.error('Error al cerrar sesión:', err);
    }
  };

  // Cálculos memorizados
  const años = useMemo(() => {
    const añosGastos = gastos.map(g => g.fecha?.split('-')[0]).filter(Boolean);
    const añosNacimientos = nacimientos.map(n => n.año?.toString()).filter(Boolean);
    const añosInventario = inventario.map(i => i.año?.toString()).filter(Boolean);
    return [...new Set([...añosGastos, ...añosNacimientos, ...añosInventario])].sort().reverse();
  }, [gastos, nacimientos, inventario]);

  const filtered = useMemo(() => gastos.filter(g => {
    if (!g.fecha) return false;
    const [año, mes] = g.fecha.split('-');
    return (!filtros.año || año === filtros.año) &&
           (!filtros.mes || mes === filtros.mes) &&
           (!filtros.centro || g.centro === filtros.centro) &&
           (!filtros.categoria || g.categoria === filtros.categoria) &&
           (!filtros.busqueda || g.proveedor?.toLowerCase().includes(filtros.busqueda.toLowerCase()) ||
            g.comentarios?.toLowerCase().includes(filtros.busqueda.toLowerCase()));
  }).sort((a, b) => new Date(b.fecha) - new Date(a.fecha)), [gastos, filtros]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const totales = useMemo(() => ({
    total: filtered.reduce((s, g) => s + (g.monto || 0), 0),
    costos: filtered.filter(g => g.tipo === 'Costo').reduce((s, g) => s + (g.monto || 0), 0),
    gastos: filtered.filter(g => g.tipo === 'Gasto').reduce((s, g) => s + (g.monto || 0), 0),
    pendientes: gastos.filter(g => g.estado === 'pendiente').length,
    registros: filtered.length
  }), [filtered, gastos]);

  const porCategoria = useMemo(() => {
    const cats = {};
    filtered.forEach(g => { cats[g.categoria] = (cats[g.categoria] || 0) + (g.monto || 0); });
    return Object.entries(cats).map(([c, t]) => ({ categoria: c, total: t })).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const porCentro = useMemo(() => {
    const c = {};
    filtered.forEach(g => { c[g.centro] = (c[g.centro] || 0) + (g.monto || 0); });
    return CENTROS_COSTOS.map(centro => ({ centro, total: c[centro] || 0 })).filter(x => x.total > 0).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const updateFiltros = (f) => { setFiltros(f); setPage(1); };

  const approve = async (id) => {
    if (isOnline && user) {
      try { await db.updateCosto(id, { estado: 'aprobado' }); } catch (err) { console.error('Error aprobando:', err); }
    }
    setGastos(gastos.map(g => g.id === id ? { ...g, estado: 'aprobado' } : g));
  };

  const del = async (id) => {
    if (confirm('¿Eliminar este registro?')) {
      if (isOnline && user) {
        try { await db.deleteCosto(id); } catch (err) { console.error('Error eliminando:', err); }
      }
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
        if (isOnline && user) {
          const data = await db.insertCosto(g);
          if (data) newGasto = data;
        }
        setGastos([newGasto, ...gastos]);
      }
      setShowForm(false);
      setEditGasto(null);
    } catch (err) {
      console.error('Error guardando:', err);
      alert('Error al guardar: ' + err.message);
    }
  };

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

  if (showLogin) {
    return <Login onLogin={handleLogin} onSkip={() => setShowLogin(false)} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-green-700 to-green-600 text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setMenuOpen(!menuOpen)} className="lg:hidden p-2 hover:bg-white/10 rounded-lg">
              <Menu size={24} />
            </button>
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
              <button onClick={loadCloudData} className="p-2 hover:bg-white/20 rounded-lg" title="Sincronizar datos">
                <RefreshCw size={18} />
              </button>
            )}
            {user && (
              <button onClick={() => setShowCarga(true)} className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-sm transition-colors">
                <Upload size={18} /><span className="hidden sm:inline">Cargar</span>
              </button>
            )}
            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-sm bg-white/20 px-3 py-1 rounded-full hidden md:block truncate max-w-[150px]">{user.email}</span>
                <button onClick={handleLogout} className="p-2 hover:bg-white/20 rounded-lg" title="Cerrar sesión"><LogOut size={18} /></button>
              </div>
            ) : (
              <button onClick={() => setShowLogin(true)} className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-sm">
                Iniciar sesión
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className={`${menuOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-40 w-64 bg-white shadow-lg transition-transform pt-16 lg:pt-0`}>
          <nav className="p-4 space-y-1">
            {[
              { id: 'dashboard', icon: Home, label: 'Dashboard' },
              { id: 'costos', icon: Receipt, label: 'Costos y Gastos' },
              { id: 'lavega', icon: MapPin, label: 'La Vega', color: 'text-green-600' },
              { id: 'bariloche', icon: MapPin, label: 'Bariloche', color: 'text-blue-600' },
            ].map(item => (
              <button key={item.id} onClick={() => { setView(item.id); setMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl ${view === item.id ? 'bg-green-50 text-green-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                <item.icon size={20} className={item.color || ''} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="p-4 border-t">
            <p className="text-xs text-gray-400 mb-2">Fuente: {dataSource === 'cloud' ? '☁️ Nube' : '💾 Local'}</p>
            <div className="space-y-1 text-sm text-gray-600">
              <p>📋 {nacimientos.length} nacimientos</p>
              <p>💰 {gastos.length} costos</p>
              <p>📊 {inventario.length} inventarios</p>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-4 lg:p-6 max-w-7xl">
          {view === 'dashboard' && (
            <Dashboard
              totales={totales} porCategoria={porCategoria} porCentro={porCentro}
              pendientes={gastos.filter(g => g.estado === 'pendiente').slice(0, 5)}
              onApprove={approve} filtros={filtros} setFiltros={updateFiltros} años={años}
              nacimientos={nacimientos} inventario={inventario} gastos={gastos}
            />
          )}
          {view === 'costos' && (
            <Costos
              gastos={paginated} total={filtered.length} totales={totales}
              filtros={filtros} setFiltros={updateFiltros}
              onNew={() => setShowForm(true)} onEdit={g => { setEditGasto(g); setShowForm(true); }}
              onDel={del} onApprove={approve} page={page} pages={totalPages} setPage={setPage}
              años={años} canEdit={!!user}
            />
          )}
          {view === 'lavega' && (
            <FincaLaVega
              nacimientos={nacimientos}
              inventario={inventario.filter(i => i.finca === 'La Vega')}
              gastos={gastos}
              años={años}
            />
          )}
          {view === 'bariloche' && (
            <FincaBariloche
              inventario={inventario.filter(i => i.finca === 'Bariloche')}
              gastos={gastos}
              años={años}
            />
          )}
        </main>
      </div>

      {/* Modales */}
      {showForm && <Form gasto={editGasto} onSave={save} onClose={() => { setShowForm(false); setEditGasto(null); }} />}
      {showCarga && <CargaArchivos user={user} onClose={() => setShowCarga(false)} onSuccess={() => { setShowCarga(false); loadCloudData(); }} />}
      {menuOpen && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setMenuOpen(false)} />}
    </div>
  );
}

// ==================== COMPONENTE FINCA LA VEGA ====================
function FincaLaVega({ nacimientos, inventario, gastos, años }) {
  const [filtroAño, setFiltroAño] = useState('2025');

  // Calcular costos de La Vega (directos + 50% Global)
  const costosFinca = useMemo(() => {
    return gastos.filter(g => {
      if (!g.fecha) return false;
      const año = g.fecha.split('-')[0];
      if (filtroAño && año !== filtroAño) return false;
      return g.centro === 'La Vega' || g.centro === 'Global';
    }).map(g => ({
      ...g,
      montoFinca: g.centro === 'Global' ? g.monto * 0.5 : g.monto
    }));
  }, [gastos, filtroAño]);

  const totalCostos = costosFinca.reduce((s, g) => s + g.montoFinca, 0);

  // Stats de nacimientos
  const statsNacimientos = useMemo(() => {
    const filtered = nacimientos.filter(n => !filtroAño || n.año === parseInt(filtroAño));
    const activos = filtered.filter(n => n.estado === 'Activo');
    const conDestete = activos.filter(n => n.pesoDestete);
    const conNacer = activos.filter(n => n.pesoNacer);
    
    return {
      total: filtered.length,
      activos: activos.length,
      machos: activos.filter(n => n.sexo === 'M').length,
      hembras: activos.filter(n => n.sexo === 'H').length,
      pesoNacerProm: conNacer.length ? (conNacer.reduce((s, n) => s + n.pesoNacer, 0) / conNacer.length).toFixed(1) : '-',
      pesoDesteteProm: conDestete.length ? (conDestete.reduce((s, n) => s + n.pesoDestete, 0) / conDestete.length).toFixed(1) : '-'
    };
  }, [nacimientos, filtroAño]);

  // Último inventario
  const ultimoInventario = useMemo(() => {
    const sorted = [...inventario].sort((a, b) => (b.año * 100 + b.mes) - (a.año * 100 + a.mes));
    return sorted[0] || {};
  }, [inventario]);

  // Indicadores reproductivos (IEP, fertilidad)
  const indicadoresReproductivos = useMemo(() => {
    // Calcular IEP promedio de vacas con más de 1 parto
    // Este es un cálculo simplificado - en producción debería venir de datos reales
    const vacasConMultiplesPartos = nacimientos.filter(n => {
      // Agrupar por madre y contar partos
      return n.estado === 'Activo';
    });

    // Placeholder para IEP - necesitaría datos de fechas de parto por vaca
    return {
      iepPromedio: '420', // días promedio entre partos
      tasaPreñez: '74', // % de vacas preñadas
      tasaDestete: '92' // % de crías destetadas
    };
  }, [nacimientos, filtroAño]);

  // Nacimientos por mes
  const nacimientosPorMes = useMemo(() => {
    const meses = Array(12).fill(0);
    nacimientos.filter(n => n.año === parseInt(filtroAño) && n.estado === 'Activo').forEach(n => {
      if (n.mes >= 1 && n.mes <= 12) meses[n.mes - 1]++;
    });
    return meses;
  }, [nacimientos, filtroAño]);

  const maxNac = Math.max(...nacimientosPorMes, 1);

  // Por padre
  const porPadre = useMemo(() => {
    const padres = {};
    nacimientos.filter(n => n.año === parseInt(filtroAño) && n.estado === 'Activo').forEach(n => {
      if (n.padre) padres[n.padre] = (padres[n.padre] || 0) + 1;
    });
    return Object.entries(padres).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [nacimientos, filtroAño]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
            <MapPin size={24} className="text-green-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Finca La Vega</h2>
            <p className="text-sm text-gray-500">Sistema de Cría</p>
          </div>
        </div>
        <select value={filtroAño} onChange={e => setFiltroAño(e.target.value)} className="px-4 py-2 border rounded-xl">
          <option value="">Todos los años</option>
          {años.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Cards principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-4 text-white shadow-lg">
          <div className="flex justify-between">
            <div>
              <p className="text-white/80 text-sm">Inventario Actual</p>
              <p className="text-3xl font-bold mt-1">{ultimoInventario.total || 0}</p>
              <p className="text-white/60 text-xs">cabezas</p>
            </div>
            <Beef size={32} className="opacity-50" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl p-4 text-white shadow-lg">
          <div className="flex justify-between">
            <div>
              <p className="text-white/80 text-sm">Nacimientos {filtroAño}</p>
              <p className="text-3xl font-bold mt-1">{statsNacimientos.activos}</p>
              <p className="text-white/60 text-xs">♂{statsNacimientos.machos} / ♀{statsNacimientos.hembras}</p>
            </div>
            <Baby size={32} className="opacity-50" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 text-white shadow-lg">
          <div className="flex justify-between">
            <div>
              <p className="text-white/80 text-sm">Peso Destete Prom.</p>
              <p className="text-3xl font-bold mt-1">{statsNacimientos.pesoDesteteProm}</p>
              <p className="text-white/60 text-xs">kg</p>
            </div>
            <Scale size={32} className="opacity-50" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-4 text-white shadow-lg">
          <div className="flex justify-between">
            <div>
              <p className="text-white/80 text-sm">Costos {filtroAño}</p>
              <p className="text-xl font-bold mt-1">{formatCurrency(totalCostos)}</p>
              <p className="text-white/60 text-xs">incluye 50% global</p>
            </div>
            <DollarSign size={32} className="opacity-50" />
          </div>
        </div>
      </div>

      {/* Indicadores reproductivos */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Activity size={20} className="text-green-600" />
          Indicadores Reproductivos
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-4 bg-green-50 rounded-xl">
            <p className="text-3xl font-bold text-green-700">{indicadoresReproductivos.iepPromedio}</p>
            <p className="text-sm text-gray-600">IEP Promedio (días)</p>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-xl">
            <p className="text-3xl font-bold text-blue-700">{indicadoresReproductivos.tasaPreñez}%</p>
            <p className="text-sm text-gray-600">Tasa de Preñez</p>
          </div>
          <div className="text-center p-4 bg-amber-50 rounded-xl">
            <p className="text-3xl font-bold text-amber-700">{indicadoresReproductivos.tasaDestete}%</p>
            <p className="text-sm text-gray-600">Tasa de Destete</p>
          </div>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Nacimientos por mes */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <BarChart3 size={20} className="text-green-600" />
            Nacimientos por Mes
          </h3>
          <div className="h-48">
            <div className="flex items-end justify-between h-full gap-1 px-2">
              {nacimientosPorMes.map((count, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end">
                  {count > 0 && <span className="text-xs font-semibold text-green-700 mb-1">{count}</span>}
                  <div
                    className={`w-full rounded-t transition-all ${count > 0 ? 'bg-gradient-to-t from-green-600 to-green-400' : 'bg-gray-100'}`}
                    style={{ height: count > 0 ? `${Math.max((count / maxNac) * 100, 8)}%` : '4px' }}
                  />
                  <span className="text-xs text-gray-500 mt-2">{MESES[idx + 1]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Por padre */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <PieChart size={20} className="text-green-600" />
            Crías por Reproductor
          </h3>
          <div className="space-y-3">
            {porPadre.map(([padre, count]) => (
              <div key={padre}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{padre}</span>
                  <span>{count} crías</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full">
                  <div
                    className="h-full bg-green-500 rounded-full"
                    style={{ width: `${(count / (porPadre[0]?.[1] || 1)) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Inventario detallado */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Beef size={20} className="text-green-600" />
          Composición del Hato ({MESES[ultimoInventario.mes]} {ultimoInventario.año})
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {[
            { label: 'Vacas Paridas', key: 'vp', color: 'bg-green-100 text-green-700' },
            { label: 'Vacas Horras', key: 'vh', color: 'bg-blue-100 text-blue-700' },
            { label: 'Novillas', key: 'nas', color: 'bg-purple-100 text-purple-700' },
            { label: 'Crías Macho', key: 'cm', color: 'bg-amber-100 text-amber-700' },
            { label: 'Crías Hembra', key: 'ch', color: 'bg-pink-100 text-pink-700' },
            { label: 'Toros', key: 't', color: 'bg-red-100 text-red-700' },
            { label: 'Hembras Lev.', key: 'hl', color: 'bg-indigo-100 text-indigo-700' },
            { label: 'Machos Lev.', key: 'ml', color: 'bg-orange-100 text-orange-700' },
          ].map(cat => (
            <div key={cat.key} className={`p-3 rounded-xl ${cat.color}`}>
              <p className="text-2xl font-bold">{ultimoInventario[cat.key] || 0}</p>
              <p className="text-xs">{cat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==================== COMPONENTE FINCA BARILOCHE ====================
function FincaBariloche({ inventario, gastos, años }) {
  const [filtroAño, setFiltroAño] = useState('2025');

  // Costos de Bariloche (directos + 50% Global)
  const costosFinca = useMemo(() => {
    return gastos.filter(g => {
      if (!g.fecha) return false;
      const año = g.fecha.split('-')[0];
      if (filtroAño && año !== filtroAño) return false;
      return g.centro === 'Bariloche' || g.centro === 'Global';
    }).map(g => ({
      ...g,
      montoFinca: g.centro === 'Global' ? g.monto * 0.5 : g.monto
    }));
  }, [gastos, filtroAño]);

  const totalCostos = costosFinca.reduce((s, g) => s + g.montoFinca, 0);

  // Último inventario
  const ultimoInventario = useMemo(() => {
    const sorted = [...inventario].sort((a, b) => (b.año * 100 + b.mes) - (a.año * 100 + a.mes));
    return sorted[0] || {};
  }, [inventario]);

  // Inventario por mes para gráfico
  const inventarioPorMes = useMemo(() => {
    return inventario
      .filter(i => !filtroAño || i.año === parseInt(filtroAño))
      .sort((a, b) => (a.año * 100 + a.mes) - (b.año * 100 + b.mes));
  }, [inventario, filtroAño]);

  const maxInv = Math.max(...inventarioPorMes.map(i => i.total), 1);

  // Datos de ganancia de peso (placeholder - estos datos deberían venir de pesajes reales)
  const gananciaPesoNovillas = [
    { categoria: 'Novillas < 12 meses', gdp: 650, meta: 700 },
    { categoria: 'Novillas 12-18 meses', gdp: 580, meta: 600 },
    { categoria: 'Novillas 18-24 meses', gdp: 520, meta: 550 },
  ];

  const gananciaPesoMachos = [
    { categoria: 'Machos < 12 meses', gdp: 750, meta: 800 },
    { categoria: 'Machos 12-18 meses', gdp: 680, meta: 750 },
    { categoria: 'Machos 18-24 meses', gdp: 620, meta: 700 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
            <MapPin size={24} className="text-blue-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Finca Bariloche</h2>
            <p className="text-sm text-gray-500">Sistema de Levante</p>
          </div>
        </div>
        <select value={filtroAño} onChange={e => setFiltroAño(e.target.value)} className="px-4 py-2 border rounded-xl">
          <option value="">Todos los años</option>
          {años.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Cards principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 text-white shadow-lg">
          <div className="flex justify-between">
            <div>
              <p className="text-white/80 text-sm">Inventario Actual</p>
              <p className="text-3xl font-bold mt-1">{ultimoInventario.total || 0}</p>
              <p className="text-white/60 text-xs">cabezas</p>
            </div>
            <Beef size={32} className="opacity-50" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-4 text-white shadow-lg">
          <div className="flex justify-between">
            <div>
              <p className="text-white/80 text-sm">Novillas en Levante</p>
              <p className="text-3xl font-bold mt-1">{(ultimoInventario.nas || 0) + (ultimoInventario.hl || 0)}</p>
              <p className="text-white/60 text-xs">hembras</p>
            </div>
            <Users size={32} className="opacity-50" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl p-4 text-white shadow-lg">
          <div className="flex justify-between">
            <div>
              <p className="text-white/80 text-sm">Machos en Levante</p>
              <p className="text-3xl font-bold mt-1">{ultimoInventario.ml || 0}</p>
              <p className="text-white/60 text-xs">machos</p>
            </div>
            <TrendingUp size={32} className="opacity-50" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-4 text-white shadow-lg">
          <div className="flex justify-between">
            <div>
              <p className="text-white/80 text-sm">Costos {filtroAño}</p>
              <p className="text-xl font-bold mt-1">{formatCurrency(totalCostos)}</p>
              <p className="text-white/60 text-xs">incluye 50% global</p>
            </div>
            <DollarSign size={32} className="opacity-50" />
          </div>
        </div>
      </div>

      {/* Gráfico de inventario mensual */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <BarChart3 size={20} className="text-blue-600" />
          Evolución del Inventario
        </h3>
        <div className="h-48">
          <div className="flex items-end justify-between h-full gap-2 px-2">
            {inventarioPorMes.slice(-12).map((inv, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end">
                <span className="text-xs font-semibold text-blue-700 mb-1">{inv.total}</span>
                <div
                  className="w-full rounded-t bg-gradient-to-t from-blue-600 to-blue-400"
                  style={{ height: `${Math.max((inv.total / maxInv) * 100, 8)}%` }}
                />
                <span className="text-xs text-gray-500 mt-2">{MESES[inv.mes]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tablas de ganancia de peso */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Novillas */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Scale size={20} className="text-purple-600" />
            Ganancia de Peso - Novillas
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-purple-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-purple-700">Categoría</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-purple-700">GDP (gr/día)</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-purple-700">Meta</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-purple-700">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {gananciaPesoNovillas.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">{row.categoria}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium">{row.gdp}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-500">{row.meta}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${row.gdp >= row.meta ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {row.gdp >= row.meta ? '✓ Meta' : `${((row.gdp / row.meta) * 100).toFixed(0)}%`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Machos */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Scale size={20} className="text-amber-600" />
            Ganancia de Peso - Machos
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-amber-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-amber-700">Categoría</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-amber-700">GDP (gr/día)</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-amber-700">Meta</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-amber-700">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {gananciaPesoMachos.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">{row.categoria}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium">{row.gdp}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-500">{row.meta}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${row.gdp >= row.meta ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {row.gdp >= row.meta ? '✓ Meta' : `${((row.gdp / row.meta) * 100).toFixed(0)}%`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Composición del hato */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Beef size={20} className="text-blue-600" />
          Composición del Hato ({MESES[ultimoInventario.mes]} {ultimoInventario.año})
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {[
            { label: 'Vacas Paridas', key: 'vp', color: 'bg-green-100 text-green-700' },
            { label: 'Vacas Horras', key: 'vh', color: 'bg-blue-100 text-blue-700' },
            { label: 'Novillas', key: 'nas', color: 'bg-purple-100 text-purple-700' },
            { label: 'Crías Macho', key: 'cm', color: 'bg-amber-100 text-amber-700' },
            { label: 'Crías Hembra', key: 'ch', color: 'bg-pink-100 text-pink-700' },
            { label: 'Hembras Lev.', key: 'hl', color: 'bg-indigo-100 text-indigo-700' },
            { label: 'Machos Lev.', key: 'ml', color: 'bg-orange-100 text-orange-700' },
          ].map(cat => (
            <div key={cat.key} className={`p-3 rounded-xl ${cat.color}`}>
              <p className="text-2xl font-bold">{ultimoInventario[cat.key] || 0}</p>
              <p className="text-xs">{cat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==================== COMPONENTE DASHBOARD ====================
function Dashboard({ totales, porCategoria, porCentro, pendientes, onApprove, filtros, setFiltros, años, nacimientos, inventario, gastos }) {
  const maxCat = Math.max(...porCategoria.map(c => c.total), 1);
  const maxCen = Math.max(...porCentro.map(c => c.total), 1);

  // Totales por finca
  const totalesPorFinca = useMemo(() => {
    const vegaInv = inventario.filter(i => i.finca === 'La Vega').sort((a, b) => (b.año * 100 + b.mes) - (a.año * 100 + a.mes))[0];
    const bariInv = inventario.filter(i => i.finca === 'Bariloche').sort((a, b) => (b.año * 100 + b.mes) - (a.año * 100 + a.mes))[0];
    
    return {
      laVega: vegaInv?.total || 0,
      bariloche: bariInv?.total || 0,
      total: (vegaInv?.total || 0) + (bariInv?.total || 0)
    };
  }, [inventario]);

  // Nacimientos del año
  const nacimientosAño = useMemo(() => {
    const año = filtros.año ? parseInt(filtros.año) : new Date().getFullYear();
    return nacimientos.filter(n => n.año === año && n.estado === 'Activo').length;
  }, [nacimientos, filtros.año]);

  // Nacimientos por mes
  const nacimientosPorMes = useMemo(() => {
    const año = filtros.año ? parseInt(filtros.año) : new Date().getFullYear();
    const meses = Array(12).fill(0);
    nacimientos.filter(n => n.año === año && n.estado === 'Activo').forEach(n => {
      if (n.mes >= 1 && n.mes <= 12) meses[n.mes - 1]++;
    });
    return meses;
  }, [nacimientos, filtros.año]);

  const maxNac = Math.max(...nacimientosPorMes, 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Dashboard General</h2>
        <select value={filtros.año} onChange={e => setFiltros({ ...filtros, año: e.target.value })} className="px-4 py-2 border rounded-xl">
          <option value="">Todos</option>
          {años.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Cards resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card title="Inventario Total" value={totalesPorFinca.total} icon={Beef} color="from-green-500 to-green-600" sub={`La Vega: ${totalesPorFinca.laVega} | Bariloche: ${totalesPorFinca.bariloche}`} />
        <Card title="Nacimientos" value={nacimientosAño} icon={Baby} color="from-amber-500 to-amber-600" sub={`año ${filtros.año || new Date().getFullYear()}`} />
        <Card title="Total Egresos" value={formatCurrency(totales.total)} icon={DollarSign} color="from-blue-500 to-blue-600" />
        <Card title="Pendientes" value={totales.pendientes} icon={FileText} color="from-orange-500 to-orange-600" sub="por aprobar" />
      </div>

      {/* Gráficas principales */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Nacimientos por mes */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Baby size={20} className="text-amber-600" />
            Nacimientos por Mes ({filtros.año || 'Todos'})
          </h3>
          <div className="h-48">
            <div className="flex items-end justify-between h-full gap-1 px-2">
              {nacimientosPorMes.map((count, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end">
                  {count > 0 && <span className="text-xs font-semibold text-amber-700 mb-1">{count}</span>}
                  <div
                    className={`w-full rounded-t transition-all ${count > 0 ? 'bg-gradient-to-t from-amber-600 to-amber-400' : 'bg-gray-100'}`}
                    style={{ height: count > 0 ? `${Math.max((count / maxNac) * 100, 8)}%` : '4px' }}
                  />
                  <span className="text-xs text-gray-500 mt-2">{MESES[idx + 1]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Por centro de costos */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <PieChart size={20} className="text-green-600" />
            Egresos por Centro de Costos
          </h3>
          <div className="space-y-3">
            {porCentro.map(({ centro, total }) => (
              <div key={centro}>
                <div className="flex justify-between text-sm mb-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${centroColor(centro)}`}>{centro}</span>
                  <span className="font-medium">{formatCurrency(total)}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full">
                  <div className={`h-full rounded-full ${centroBarColor(centro)}`} style={{ width: `${(total / maxCen) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Por categoría */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <BarChart3 size={20} className="text-green-600" />
          Egresos por Categoría
        </h3>
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-3">
          {porCategoria.slice(0, 10).map(({ categoria, total }) => (
            <div key={categoria}>
              <div className="flex justify-between text-sm mb-1">
                <span className="truncate">{categoria}</span>
                <span className="font-medium">{formatCurrency(total)}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full">
                <div className="h-full bg-green-500 rounded-full" style={{ width: `${(total / maxCat) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pendientes */}
      {pendientes.length > 0 && (
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold mb-4">
            Pendientes <span className="bg-orange-100 text-orange-600 text-xs px-2 py-1 rounded-full ml-2">{pendientes.length}</span>
          </h3>
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
                  <button onClick={() => onApprove(g.id)} className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600">
                    <Check size={16} />
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

  const selSug = p => { setF({ ...f, proveedor: p, categoria: PROVEEDORES_CONOCIDOS[p].categoria, centro: PROVEEDORES_CONOCIDOS[p].centro }); setSug([]); };

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
            <div><label className="block text-sm font-medium mb-1">Fecha</label><input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} className="w-full px-3 py-2 border rounded-xl" required /></div>
            <div><label className="block text-sm font-medium mb-1">Monto</label><input type="number" value={f.monto} onChange={e => setF({ ...f, monto: e.target.value })} className="w-full px-3 py-2 border rounded-xl" required /></div>
          </div>
          <div className="relative">
            <label className="block text-sm font-medium mb-1">Proveedor</label>
            <input type="text" value={f.proveedor} onChange={e => handleProv(e.target.value)} className="w-full px-3 py-2 border rounded-xl" required />
            {sug.length > 0 && <div className="absolute z-10 w-full bg-white border rounded-xl mt-1 shadow-lg">{sug.map(p => <button key={p} type="button" onClick={() => selSug(p)} className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm">{p}</button>)}</div>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">Tipo</label><select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })} className="w-full px-3 py-2 border rounded-xl"><option>Costo</option><option>Gasto</option></select></div>
            <div><label className="block text-sm font-medium mb-1">Centro</label><select value={f.centro} onChange={e => setF({ ...f, centro: e.target.value })} className="w-full px-3 py-2 border rounded-xl">{CENTROS_COSTOS.map(c => <option key={c}>{c}</option>)}</select></div>
          </div>
          <div><label className="block text-sm font-medium mb-1">Categoría</label><select value={f.categoria} onChange={e => setF({ ...f, categoria: e.target.value })} className="w-full px-3 py-2 border rounded-xl" required><option value="">Seleccione</option>{CATEGORIAS.map(c => <option key={c}>{c}</option>)}</select></div>
          <div><label className="block text-sm font-medium mb-1">Comentarios</label><textarea value={f.comentarios} onChange={e => setF({ ...f, comentarios: e.target.value })} className="w-full px-3 py-2 border rounded-xl" rows={2} /></div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border rounded-xl hover:bg-gray-50">Cancelar</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700">Guardar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
