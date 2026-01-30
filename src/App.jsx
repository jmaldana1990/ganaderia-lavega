import React, { useState, useEffect } from 'react';
import { PlusCircle, Search, Filter, Download, TrendingUp, DollarSign, Calendar, Building2, Tag, FileText, Check, X, Edit2, Trash2, BarChart3, PieChart, ArrowUpRight, ArrowDownRight, Menu, Home, Receipt, Beef, Users, Settings, ChevronDown, Upload } from 'lucide-react';

// Datos iniciales basados en tu archivo real
const CATEGORIAS = [
  'Alimentacion ganado', 'Caja menor', 'Genetica', 'Impuestos', 
  'Mano de obra', 'Mantenimiento potreros', 'Montaje finca', 
  'Otros gastos', 'Reparaciones', 'Sanidad animal', 
  'Servicios publicos', 'Transporte ganado'
];

const CENTROS_COSTOS = ['La Vega', 'Bariloche', 'Global'];

const PROVEEDORES_CATEGORIA = {
  'Celsia': { categoria: 'Servicios publicos', centro: 'La Vega' },
  'Proditel': { categoria: 'Servicios publicos', centro: 'La Vega' },
  'Distriservicios SAS ESP': { categoria: 'Servicios publicos', centro: 'Bariloche' },
  'Clemente Molina': { categoria: 'Mano de obra', centro: 'Global' },
  'Fernando Vargas': { categoria: 'Mano de obra', centro: 'La Vega' },
  'DIAN': { categoria: 'Impuestos', centro: 'Global' },
  'Central Pecuaria': { categoria: 'Sanidad animal', centro: 'La Vega' },
  'Serviarroz': { categoria: 'Sanidad animal', centro: 'La Vega' },
  'Distrimangueras': { categoria: 'Montaje finca', centro: 'Bariloche' },
  'Constructora MAG': { categoria: 'Otros gastos', centro: 'La Vega' },
  'Sergio Ayala': { categoria: 'Alimentacion ganado', centro: 'La Vega' },
  'Carlos Gongora': { categoria: 'Transporte ganado', centro: 'La Vega' },
  'Comité Ganaderos del Tolima': { categoria: 'Sanidad animal', centro: 'La Vega' },
  'Embriogenex': { categoria: 'Genetica', centro: 'La Vega' },
  'Agralba': { categoria: 'Mantenimiento potreros', centro: 'La Vega' },
};

// Datos de ejemplo basados en tu archivo 2025
const GASTOS_INICIALES = [
  { id: 1, fecha: '2025-01-03', monto: 560000, proveedor: 'Distrimangueras', tipo: 'costo', comentarios: 'Materiales riego', centro: 'Bariloche', categoria: 'Mantenimiento potreros', estado: 'aprobado' },
  { id: 2, fecha: '2025-01-08', monto: 701827, proveedor: 'Serviarroz', tipo: 'costo', comentarios: 'Fertilizantes potreros', centro: 'La Vega', categoria: 'Mantenimiento potreros', estado: 'aprobado' },
  { id: 3, fecha: '2025-01-08', monto: 701827, proveedor: 'Serviarroz', tipo: 'costo', comentarios: 'Fertilizantes potreros', centro: 'Bariloche', categoria: 'Mantenimiento potreros', estado: 'aprobado' },
  { id: 4, fecha: '2025-01-09', monto: 47554, proveedor: 'Celsia', tipo: 'costo', comentarios: 'Luz finca', centro: 'La Vega', categoria: 'Servicios publicos', estado: 'aprobado' },
  { id: 5, fecha: '2025-01-09', monto: 34410, proveedor: 'Distriservicios SAS ESP', tipo: 'gasto', comentarios: 'Gas finca', centro: 'Bariloche', categoria: 'Servicios publicos', estado: 'aprobado' },
  { id: 6, fecha: '2025-01-10', monto: 10000000, proveedor: 'Constructora MAG', tipo: 'gasto', comentarios: 'Abono a prestamo', centro: 'La Vega', categoria: 'Otros gastos', estado: 'aprobado' },
  { id: 7, fecha: '2025-01-10', monto: 250000, proveedor: 'Clemente Molina', tipo: 'costo', comentarios: 'Caja menor', centro: 'Global', categoria: 'Caja menor', estado: 'aprobado' },
  { id: 8, fecha: '2025-01-10', monto: 200000, proveedor: 'Carlos Gongora', tipo: 'costo', comentarios: 'Transporte ganado de La Vega a Bariloche', centro: 'La Vega', categoria: 'Transporte ganado', estado: 'aprobado' },
  { id: 9, fecha: '2025-01-28', monto: 185000, proveedor: 'Central Pecuaria', tipo: 'costo', comentarios: 'Compra medicamentos', centro: 'La Vega', categoria: 'Sanidad animal', estado: 'pendiente' },
  { id: 10, fecha: '2025-01-29', monto: 1500000, proveedor: 'Clemente Molina', tipo: 'costo', comentarios: 'Pago quincena', centro: 'Global', categoria: 'Mano de obra', estado: 'pendiente' },
];

const formatCurrency = (value) => {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

const formatDate = (dateStr) => {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Componente principal
export default function GanaderiaApp() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [gastos, setGastos] = useState(GASTOS_INICIALES);
  const [showForm, setShowForm] = useState(false);
  const [editingGasto, setEditingGasto] = useState(null);
  const [filtros, setFiltros] = useState({ mes: '', año: '', centro: '', categoria: '' });
  const [menuOpen, setMenuOpen] = useState(false);

  const gastosFiltered = gastos.filter(g => {
    const [año, mes] = g.fecha.split('-');
    if (filtros.año && año !== filtros.año) return false;
    if (filtros.mes && mes !== filtros.mes) return false;
    if (filtros.centro && g.centro !== filtros.centro) return false;
    if (filtros.categoria && g.categoria !== filtros.categoria) return false;
    return true;
  });

  const totales = {
    total: gastosFiltered.reduce((sum, g) => sum + g.monto, 0),
    costos: gastosFiltered.filter(g => g.tipo === 'costo').reduce((sum, g) => sum + g.monto, 0),
    gastos: gastosFiltered.filter(g => g.tipo === 'gasto').reduce((sum, g) => sum + g.monto, 0),
    pendientes: gastos.filter(g => g.estado === 'pendiente').length
  };

  const porCategoria = CATEGORIAS.map(cat => ({
    categoria: cat,
    total: gastosFiltered.filter(g => g.categoria === cat).reduce((sum, g) => sum + g.monto, 0)
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);

  const porCentro = CENTROS_COSTOS.map(centro => ({
    centro,
    total: gastosFiltered.filter(g => g.centro === centro).reduce((sum, g) => sum + g.monto, 0)
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-green-700 to-green-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => setMenuOpen(!menuOpen)} className="lg:hidden p-2 hover:bg-green-600 rounded-lg">
                <Menu size={24} />
              </button>
              <div className="flex items-center gap-2">
                <Beef className="h-8 w-8" />
                <div>
                  <h1 className="text-xl font-bold">Ganadería La Vega</h1>
                  <p className="text-green-200 text-sm">Sistema de Gestión</p>
                </div>
              </div>
            </div>
            <div className="hidden lg:flex items-center gap-2 bg-green-600/50 px-4 py-2 rounded-full">
              <div className="w-2 h-2 bg-green-300 rounded-full animate-pulse"></div>
              <span className="text-sm">En línea</span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className={`${menuOpen ? 'block' : 'hidden'} lg:block w-64 bg-white shadow-lg min-h-screen fixed lg:relative z-50`}>
          <nav className="p-4 space-y-2">
            <NavItem icon={Home} label="Dashboard" active={currentView === 'dashboard'} onClick={() => { setCurrentView('dashboard'); setMenuOpen(false); }} />
            <NavItem icon={Receipt} label="Costos y Gastos" active={currentView === 'gastos'} onClick={() => { setCurrentView('gastos'); setMenuOpen(false); }} />
            <NavItem icon={Beef} label="Nacimientos" active={currentView === 'nacimientos'} onClick={() => { setCurrentView('nacimientos'); setMenuOpen(false); }} badge="Próximo" />
            <NavItem icon={Upload} label="Importar Datos" active={currentView === 'importar'} onClick={() => { setCurrentView('importar'); setMenuOpen(false); }} badge="Próximo" />
            <NavItem icon={Users} label="Usuarios" active={currentView === 'usuarios'} onClick={() => { setCurrentView('usuarios'); setMenuOpen(false); }} badge="Próximo" />
            <NavItem icon={Settings} label="Configuración" active={currentView === 'config'} onClick={() => { setCurrentView('config'); setMenuOpen(false); }} badge="Próximo" />
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-4 lg:p-6 max-w-6xl">
          {currentView === 'dashboard' && (
            <Dashboard 
              totales={totales} 
              porCategoria={porCategoria} 
              porCentro={porCentro}
              gastosPendientes={gastos.filter(g => g.estado === 'pendiente')}
              onVerGastos={() => setCurrentView('gastos')}
              onAprobar={(id) => setGastos(gastos.map(g => g.id === id ? {...g, estado: 'aprobado'} : g))}
            />
          )}
          
          {currentView === 'gastos' && (
            <GastosView 
              gastos={gastosFiltered}
              filtros={filtros}
              setFiltros={setFiltros}
              onAdd={() => { setEditingGasto(null); setShowForm(true); }}
              onEdit={(g) => { setEditingGasto(g); setShowForm(true); }}
              onDelete={(id) => setGastos(gastos.filter(g => g.id !== id))}
              onAprobar={(id) => setGastos(gastos.map(g => g.id === id ? {...g, estado: 'aprobado'} : g))}
              totales={totales}
            />
          )}

          {currentView === 'nacimientos' && <ProximoModulo titulo="Módulo de Nacimientos" />}
          {currentView === 'importar' && <ProximoModulo titulo="Importar desde Software Ganadero" />}
          {currentView === 'usuarios' && <ProximoModulo titulo="Gestión de Usuarios" />}
          {currentView === 'config' && <ProximoModulo titulo="Configuración" />}
        </main>
      </div>

      {/* Modal de Formulario */}
      {showForm && (
        <GastoForm 
          gasto={editingGasto}
          onSave={(gasto) => {
            if (editingGasto) {
              setGastos(gastos.map(g => g.id === editingGasto.id ? {...gasto, id: editingGasto.id} : g));
            } else {
              setGastos([...gastos, { ...gasto, id: Date.now(), estado: 'aprobado' }]);
            }
            setShowForm(false);
            setEditingGasto(null);
          }}
          onCancel={() => { setShowForm(false); setEditingGasto(null); }}
        />
      )}

      {/* Overlay para menú móvil */}
      {menuOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMenuOpen(false)} />}
    </div>
  );
}

// Componente de navegación
function NavItem({ icon: Icon, label, active, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${
        active 
          ? 'bg-green-100 text-green-700 font-medium' 
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      <div className="flex items-center gap-3">
        <Icon size={20} />
        <span>{label}</span>
      </div>
      {badge && (
        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full">{badge}</span>
      )}
    </button>
  );
}

// Dashboard
function Dashboard({ totales, porCategoria, porCentro, gastosPendientes, onVerGastos, onAprobar }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Dashboard</h2>
          <p className="text-gray-500">Resumen de Enero 2025</p>
        </div>
      </div>

      {/* Tarjetas de resumen */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Total Egresos" 
          value={formatCurrency(totales.total)} 
          icon={DollarSign}
          color="blue"
        />
        <StatCard 
          title="Costos" 
          value={formatCurrency(totales.costos)} 
          icon={TrendingUp}
          color="green"
          subtitle="Producción"
        />
        <StatCard 
          title="Gastos" 
          value={formatCurrency(totales.gastos)} 
          icon={Receipt}
          color="orange"
          subtitle="Administración"
        />
        <StatCard 
          title="Pendientes" 
          value={totales.pendientes} 
          icon={FileText}
          color="red"
          subtitle="Por aprobar"
          onClick={onVerGastos}
        />
      </div>

      {/* Pendientes de aprobar */}
      {gastosPendientes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-amber-800 mb-4 flex items-center gap-2">
            <FileText size={20} />
            Gastos Pendientes de Aprobación
          </h3>
          <div className="space-y-3">
            {gastosPendientes.map(g => (
              <div key={g.id} className="bg-white rounded-xl p-4 flex items-center justify-between shadow-sm">
                <div>
                  <p className="font-medium text-gray-800">{g.proveedor}</p>
                  <p className="text-sm text-gray-500">{g.comentarios} • {formatDate(g.fecha)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-gray-800">{formatCurrency(g.monto)}</span>
                  <button 
                    onClick={() => onAprobar(g.id)}
                    className="p-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200 transition-colors"
                  >
                    <Check size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Por Categoría */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <PieChart size={20} className="text-green-600" />
            Por Categoría
          </h3>
          <div className="space-y-3">
            {porCategoria.slice(0, 6).map((item, i) => (
              <div key={item.categoria} className="flex items-center gap-3">
                <div className="w-32 text-sm text-gray-600 truncate">{item.categoria}</div>
                <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full"
                    style={{ width: `${(item.total / totales.total) * 100}%` }}
                  />
                </div>
                <div className="w-28 text-right text-sm font-medium">{formatCurrency(item.total)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Por Centro de Costos */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Building2 size={20} className="text-green-600" />
            Por Centro de Costos
          </h3>
          <div className="space-y-4">
            {porCentro.map((item) => (
              <div key={item.centro} className="bg-gray-50 rounded-xl p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium text-gray-800">{item.centro}</span>
                  <span className="text-lg font-bold text-green-700">{formatCurrency(item.total)}</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${
                      item.centro === 'La Vega' ? 'bg-green-500' : 
                      item.centro === 'Bariloche' ? 'bg-blue-500' : 'bg-purple-500'
                    }`}
                    style={{ width: `${totales.total > 0 ? (item.total / totales.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Tarjeta de estadística
function StatCard({ title, value, icon: Icon, color, subtitle, onClick }) {
  const colors = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    orange: 'from-orange-500 to-orange-600',
    red: 'from-red-500 to-red-600'
  };

  return (
    <div 
      onClick={onClick}
      className={`bg-white rounded-2xl p-6 shadow-sm ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-500 text-sm">{title}</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
        </div>
        <div className={`p-3 rounded-xl bg-gradient-to-br ${colors[color]} text-white`}>
          <Icon size={24} />
        </div>
      </div>
    </div>
  );
}

// Vista de Gastos
function GastosView({ gastos, filtros, setFiltros, onAdd, onEdit, onDelete, onAprobar, totales }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Costos y Gastos</h2>
          <p className="text-gray-500">{gastos.length} registros • Total: {formatCurrency(totales.total)}</p>
        </div>
        <button
          onClick={onAdd}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-green-500 text-white rounded-xl hover:shadow-lg transition-all font-medium"
        >
          <PlusCircle size={20} />
          Nuevo Registro
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3 text-gray-600">
          <Filter size={18} />
          <span className="font-medium">Filtros</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <select 
            value={filtros.año} 
            onChange={(e) => setFiltros({...filtros, año: e.target.value})}
            className="px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="">Todos los años</option>
            <option value="2025">2025</option>
            <option value="2024">2024</option>
            <option value="2023">2023</option>
            <option value="2022">2022</option>
            <option value="2021">2021</option>
            <option value="2020">2020</option>
          </select>
          <select 
            value={filtros.mes} 
            onChange={(e) => setFiltros({...filtros, mes: e.target.value})}
            className="px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="">Todos los meses</option>
            <option value="01">Enero</option>
            <option value="02">Febrero</option>
            <option value="03">Marzo</option>
            <option value="04">Abril</option>
            <option value="05">Mayo</option>
            <option value="06">Junio</option>
            <option value="07">Julio</option>
            <option value="08">Agosto</option>
            <option value="09">Septiembre</option>
            <option value="10">Octubre</option>
            <option value="11">Noviembre</option>
            <option value="12">Diciembre</option>
          </select>
          <select 
            value={filtros.centro} 
            onChange={(e) => setFiltros({...filtros, centro: e.target.value})}
            className="px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="">Todos los centros</option>
            {CENTROS_COSTOS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select 
            value={filtros.categoria} 
            onChange={(e) => setFiltros({...filtros, categoria: e.target.value})}
            className="px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="">Todas las categorías</option>
            {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Lista de gastos */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Fecha</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Proveedor</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 hidden md:table-cell">Concepto</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 hidden lg:table-cell">Centro</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 hidden lg:table-cell">Categoría</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Monto</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Estado</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {gastos.map((g) => (
                <tr key={g.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-600">{formatDate(g.fecha)}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-800">{g.proveedor}</span>
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${g.tipo === 'costo' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                      {g.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">{g.comentarios}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      g.centro === 'La Vega' ? 'bg-green-100 text-green-700' :
                      g.centro === 'Bariloche' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                    }`}>
                      {g.centro}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 hidden lg:table-cell">{g.categoria}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-800">{formatCurrency(g.monto)}</td>
                  <td className="px-4 py-3 text-center">
                    {g.estado === 'pendiente' ? (
                      <button 
                        onClick={() => onAprobar(g.id)}
                        className="text-xs px-3 py-1 bg-amber-100 text-amber-700 rounded-full hover:bg-amber-200 transition-colors"
                      >
                        Pendiente
                      </button>
                    ) : (
                      <span className="text-xs px-3 py-1 bg-green-100 text-green-700 rounded-full">
                        Aprobado
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button 
                        onClick={() => onEdit(g)}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => onDelete(g.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
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

// Formulario de Gasto
function GastoForm({ gasto, onSave, onCancel }) {
  const [form, setForm] = useState(gasto || {
    fecha: new Date().toISOString().split('T')[0],
    monto: '',
    proveedor: '',
    tipo: 'costo',
    comentarios: '',
    centro: 'La Vega',
    categoria: ''
  });

  const [sugerencias, setSugerencias] = useState([]);

  const handleProveedorChange = (value) => {
    setForm({ ...form, proveedor: value });
    
    // Auto-completar categoría y centro si existe el proveedor
    if (PROVEEDORES_CATEGORIA[value]) {
      setForm(prev => ({
        ...prev,
        proveedor: value,
        categoria: PROVEEDORES_CATEGORIA[value].categoria,
        centro: PROVEEDORES_CATEGORIA[value].centro
      }));
    }

    // Mostrar sugerencias
    if (value.length > 1) {
      const matches = Object.keys(PROVEEDORES_CATEGORIA).filter(p => 
        p.toLowerCase().includes(value.toLowerCase())
      );
      setSugerencias(matches);
    } else {
      setSugerencias([]);
    }
  };

  const selectSugerencia = (proveedor) => {
    handleProveedorChange(proveedor);
    setSugerencias([]);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-xl font-bold text-gray-800">
            {gasto ? 'Editar Registro' : 'Nuevo Registro'}
          </h3>
        </div>
        
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
              <input
                type="date"
                value={form.fecha}
                onChange={(e) => setForm({...form, fecha: e.target.value})}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monto</label>
              <input
                type="number"
                value={form.monto}
                onChange={(e) => setForm({...form, monto: parseInt(e.target.value) || 0})}
                placeholder="0"
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor</label>
            <input
              type="text"
              value={form.proveedor}
              onChange={(e) => handleProveedorChange(e.target.value)}
              placeholder="Escriba el nombre del proveedor"
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            {sugerencias.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                {sugerencias.map(s => (
                  <button
                    key={s}
                    onClick={() => selectSugerencia(s)}
                    className="w-full px-4 py-2 text-left hover:bg-green-50 text-sm"
                  >
                    {s}
                    <span className="text-gray-400 ml-2">→ {PROVEEDORES_CATEGORIA[s]?.categoria}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
              <select
                value={form.tipo}
                onChange={(e) => setForm({...form, tipo: e.target.value})}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="costo">Costo</option>
                <option value="gasto">Gasto</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Centro de Costos</label>
              <select
                value={form.centro}
                onChange={(e) => setForm({...form, centro: e.target.value})}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                {CENTROS_COSTOS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
            <select
              value={form.categoria}
              onChange={(e) => setForm({...form, categoria: e.target.value})}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="">Seleccione una categoría</option>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Comentarios</label>
            <textarea
              value={form.comentarios}
              onChange={(e) => setForm({...form, comentarios: e.target.value})}
              placeholder="Descripción del gasto"
              rows={2}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-6 py-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={!form.proveedor || !form.monto || !form.categoria}
            className="px-6 py-2 bg-gradient-to-r from-green-600 to-green-500 text-white rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {gasto ? 'Guardar Cambios' : 'Crear Registro'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Módulo próximo
function ProximoModulo({ titulo }) {
  return (
    <div className="flex flex-col items-center justify-center h-96 text-center">
      <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <Settings size={40} className="text-gray-400" />
      </div>
      <h3 className="text-xl font-bold text-gray-800 mb-2">{titulo}</h3>
      <p className="text-gray-500 max-w-md">
        Este módulo estará disponible próximamente. Estamos trabajando para traerte la mejor experiencia.
      </p>
    </div>
  );
}
