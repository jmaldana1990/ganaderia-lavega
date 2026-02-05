import React, { useState, useMemo, useEffect } from 'react';
import { PlusCircle, Search, TrendingUp, DollarSign, FileText, Check, X, Edit2, Trash2, BarChart3, PieChart, Menu, Home, Receipt, Beef, ChevronLeft, ChevronRight, Baby, Scale, Users, Upload, Logout, Loader2, Wifi } from 'lucide-react';
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


// Componente Finca La Vega
const FincaLaVega = ({ nacimientos, inventario, gastos, años }) => {
  const [añoSeleccionado, setAñoSeleccionado] = useState(new Date().getFullYear());
  
  // Filtrar datos para La Vega
  const inventarioLaVega = inventario.filter(i => i.finca === 'La Vega');
  const gastosLaVega = gastos.filter(g => g.centro === 'La Vega' || g.centro === 'Global');
  
  // Último inventario
  const ultimoInventario = inventarioLaVega
    .filter(i => i.año === añoSeleccionado)
    .sort((a, b) => b.mes - a.mes)[0] || inventarioLaVega.sort((a, b) => (b.año * 12 + b.mes) - (a.año * 12 + a.mes))[0];
  
  // Nacimientos del año
  const nacimientosAño = nacimientos.filter(n => {
    const fecha = new Date(n.fecha_nacimiento);
    return fecha.getFullYear() === añoSeleccionado;
  });
  
  // Costos del año (La Vega + 50% Global)
  const costosAño = gastosLaVega
    .filter(g => new Date(g.fecha).getFullYear() === añoSeleccionado)
    .reduce((sum, g) => sum + (g.centro === 'Global' ? g.valor * 0.5 : g.valor), 0);
  
  // Peso destete promedio
  const pesosDestete = nacimientos.filter(n => n.peso_destete && n.peso_destete > 0);
  const pesoDestePromedio = pesosDestete.length > 0 
    ? Math.round(pesosDestete.reduce((sum, n) => sum + n.peso_destete, 0) / pesosDestete.length)
    : 0;

  const meses = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Finca La Vega</h2>
          <p className="text-gray-500">Finca de Cría</p>
        </div>
        <select 
          value={añoSeleccionado} 
          onChange={(e) => setAñoSeleccionado(Number(e.target.value))}
          className="border rounded-lg px-3 py-2"
        >
          {años.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Cards de resumen */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Beef className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Inventario Actual</p>
              <p className="text-2xl font-bold text-gray-800">{ultimoInventario?.total || 0}</p>
              <p className="text-xs text-gray-400">{meses[ultimoInventario?.mes]} {ultimoInventario?.año}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-xl shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Baby className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Nacimientos {añoSeleccionado}</p>
              <p className="text-2xl font-bold text-gray-800">{nacimientosAño.length}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-xl shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Scale className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Peso Destete Prom.</p>
              <p className="text-2xl font-bold text-gray-800">{pesoDestePromedio} kg</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-xl shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <DollarSign className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Costos {añoSeleccionado}</p>
              <p className="text-2xl font-bold text-gray-800">{formatCurrency(costosAño)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Composición del hato */}
      <div className="bg-white p-6 rounded-xl shadow-sm border">
        <h3 className="text-lg font-semibold mb-4">Composición del Hato - {meses[ultimoInventario?.mes]} {ultimoInventario?.año}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          {[
            { key: 'vp', label: 'Vacas Paridas', color: 'green' },
            { key: 'vh', label: 'Vacas Horras', color: 'blue' },
            { key: 'nas', label: 'Novillas', color: 'purple' },
            { key: 'cm', label: 'Crías Macho', color: 'orange' },
            { key: 'ch', label: 'Crías Hembra', color: 'pink' },
            { key: 'hl', label: 'Hembras Levante', color: 'teal' },
            { key: 'ml', label: 'Machos Levante', color: 'amber' },
            { key: 't', label: 'Toros', color: 'red' }
          ].map(cat => (
            <div key={cat.key} className={`p-3 bg-${cat.color}-50 rounded-lg text-center`}>
              <p className="text-2xl font-bold text-gray-800">{ultimoInventario?.[cat.key] || 0}</p>
              <p className="text-xs text-gray-500">{cat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Evolución del inventario */}
      <div className="bg-white p-6 rounded-xl shadow-sm border">
        <h3 className="text-lg font-semibold mb-4">Evolución del Inventario {añoSeleccionado}</h3>
        <div className="h-64 flex items-end gap-2">
          {inventarioLaVega
            .filter(i => i.año === añoSeleccionado)
            .sort((a, b) => a.mes - b.mes)
            .map((inv, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center">
                <div 
                  className="w-full bg-green-500 rounded-t"
                  style={{ height: `${(inv.total / 300) * 200}px` }}
                />
                <span className="text-xs mt-1">{meses[inv.mes]}</span>
                <span className="text-xs font-semibold">{inv.total}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};



// Componente Finca Bariloche
const FincaBariloche = ({ inventario, gastos, años }) => {
  const [añoSeleccionado, setAñoSeleccionado] = useState(new Date().getFullYear());
  
  // Filtrar datos para Bariloche
  const inventarioBariloche = inventario.filter(i => i.finca === 'Bariloche');
  const gastosBariloche = gastos.filter(g => g.centro === 'Bariloche' || g.centro === 'Global');
  
  // Último inventario
  const ultimoInventario = inventarioBariloche
    .filter(i => i.año === añoSeleccionado)
    .sort((a, b) => b.mes - a.mes)[0] || inventarioBariloche.sort((a, b) => (b.año * 12 + b.mes) - (a.año * 12 + a.mes))[0];
  
  // Costos del año (Bariloche + 50% Global)
  const costosAño = gastosBariloche
    .filter(g => new Date(g.fecha).getFullYear() === añoSeleccionado)
    .reduce((sum, g) => sum + (g.centro === 'Global' ? g.valor * 0.5 : g.valor), 0);

  const meses = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  
  // Años disponibles para Bariloche (desde 2024)
  const añosBariloche = años.filter(a => a >= 2024);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Finca Bariloche</h2>
          <p className="text-gray-500">Finca de Levante</p>
        </div>
        <select 
          value={añoSeleccionado} 
          onChange={(e) => setAñoSeleccionado(Number(e.target.value))}
          className="border rounded-lg px-3 py-2"
        >
          {añosBariloche.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Cards de resumen */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Beef className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Inventario Actual</p>
              <p className="text-2xl font-bold text-gray-800">{ultimoInventario?.total || 0}</p>
              <p className="text-xs text-gray-400">{meses[ultimoInventario?.mes]} {ultimoInventario?.año}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-xl shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <TrendingUp className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Novillas (NAS)</p>
              <p className="text-2xl font-bold text-gray-800">{ultimoInventario?.nas || 0}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-xl shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-100 rounded-lg">
              <Scale className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Levante (HL+ML)</p>
              <p className="text-2xl font-bold text-gray-800">{(ultimoInventario?.hl || 0) + (ultimoInventario?.ml || 0)}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-xl shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <DollarSign className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Costos {añoSeleccionado}</p>
              <p className="text-2xl font-bold text-gray-800">{formatCurrency(costosAño)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Composición del hato */}
      <div className="bg-white p-6 rounded-xl shadow-sm border">
        <h3 className="text-lg font-semibold mb-4">Composición del Hato - {meses[ultimoInventario?.mes]} {ultimoInventario?.año}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          {[
            { key: 'vp', label: 'Vacas Paridas', color: 'green' },
            { key: 'vh', label: 'Vacas Horras', color: 'blue' },
            { key: 'nas', label: 'Novillas', color: 'purple' },
            { key: 'cm', label: 'Crías Macho', color: 'orange' },
            { key: 'ch', label: 'Crías Hembra', color: 'pink' },
            { key: 'hl', label: 'Hembras Levante', color: 'teal' },
            { key: 'ml', label: 'Machos Levante', color: 'amber' },
            { key: 't', label: 'Toros', color: 'red' }
          ].map(cat => (
            <div key={cat.key} className={`p-3 bg-${cat.color}-50 rounded-lg text-center`}>
              <p className="text-2xl font-bold text-gray-800">{ultimoInventario?.[cat.key] || 0}</p>
              <p className="text-xs text-gray-500">{cat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Evolución del inventario */}
      <div className="bg-white p-6 rounded-xl shadow-sm border">
        <h3 className="text-lg font-semibold mb-4">Evolución del Inventario {añoSeleccionado}</h3>
        <div className="h-64 flex items-end gap-2">
          {inventarioBariloche
            .filter(i => i.año === añoSeleccionado)
            .sort((a, b) => a.mes - b.mes)
            .map((inv, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center">
                <div 
                  className="w-full bg-blue-500 rounded-t"
                  style={{ height: `${(inv.total / 150) * 200}px` }}
                />
                <span className="text-xs mt-1">{meses[inv.mes]}</span>
                <span className="text-xs font-semibold">{inv.total}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Tabla de inventario mensual */}
      <div className="bg-white p-6 rounded-xl shadow-sm border overflow-x-auto">
        <h3 className="text-lg font-semibold mb-4">Detalle Mensual {añoSeleccionado}</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2">Mes</th>
              <th className="text-right p-2">VP</th>
              <th className="text-right p-2">VH</th>
              <th className="text-right p-2">NAS</th>
              <th className="text-right p-2">CM</th>
              <th className="text-right p-2">CH</th>
              <th className="text-right p-2">HL</th>
              <th className="text-right p-2">ML</th>
              <th className="text-right p-2 font-bold">Total</th>
            </tr>
          </thead>
          <tbody>
            {inventarioBariloche
              .filter(i => i.año === añoSeleccionado)
              .sort((a, b) => a.mes - b.mes)
              .map((inv, idx) => (
                <tr key={idx} className="border-b hover:bg-gray-50">
                  <td className="p-2">{meses[inv.mes]}</td>
                  <td className="text-right p-2">{inv.vp}</td>
                  <td className="text-right p-2">{inv.vh}</td>
                  <td className="text-right p-2">{inv.nas}</td>
                  <td className="text-right p-2">{inv.cm}</td>
                  <td className="text-right p-2">{inv.ch}</td>
                  <td className="text-right p-2">{inv.hl}</td>
                  <td className="text-right p-2">{inv.ml}</td>
                  <td className="text-right p-2 font-bold">{inv.total}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};


// Componente Dashboard
const Dashboard = ({ gastos, nacimientos, inventario, pendientes, onAprobar }) => {
  const año = new Date().getFullYear();
  const mes = new Date().getMonth() + 1;
  const meses = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  
  const gastosAño = gastos.filter(g => new Date(g.fecha).getFullYear() === año);
  const totalEgresos = gastosAño.reduce((sum, g) => sum + g.valor, 0);
  const costosProd = gastosAño.filter(g => g.categoria === 'Producción').reduce((sum, g) => sum + g.valor, 0);
  const costosAdmin = gastosAño.filter(g => g.categoria === 'Administración').reduce((sum, g) => sum + g.valor, 0);
  
  const nacimientosAño = nacimientos.filter(n => {
    const fecha = new Date(n.fecha_nacimiento);
    return fecha.getFullYear() === año;
  });
  
  // Inventario por finca (último disponible)
  const invLaVega = inventario.filter(i => i.finca === 'La Vega').sort((a, b) => (b.año * 12 + b.mes) - (a.año * 12 + a.mes))[0];
  const invBariloche = inventario.filter(i => i.finca === 'Bariloche').sort((a, b) => (b.año * 12 + b.mes) - (a.año * 12 + a.mes))[0];
  
  // Nacimientos por mes
  const nacPorMes = Array(12).fill(0);
  nacimientosAño.forEach(n => {
    const m = new Date(n.fecha_nacimiento).getMonth();
    nacPorMes[m]++;
  });
  
  // Egresos por centro
  const egresosPorCentro = {};
  gastosAño.forEach(g => {
    egresosPorCentro[g.centro] = (egresosPorCentro[g.centro] || 0) + g.valor;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-800">Dashboard</h2>
        <p className="text-gray-500">Resumen de {meses[mes]} {año}</p>
      </div>

      {/* Cards principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border flex items-center gap-4">
          <div className="p-3 bg-blue-100 rounded-lg"><DollarSign className="w-6 h-6 text-blue-600" /></div>
          <div>
            <p className="text-sm text-gray-500">Total Egresos</p>
            <p className="text-xl font-bold">{formatCurrency(totalEgresos)}</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border flex items-center gap-4">
          <div className="p-3 bg-green-100 rounded-lg"><TrendingUp className="w-6 h-6 text-green-600" /></div>
          <div>
            <p className="text-sm text-gray-500">Costos</p>
            <p className="text-xl font-bold">{formatCurrency(costosProd)}</p>
            <p className="text-xs text-gray-400">Producción</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border flex items-center gap-4">
          <div className="p-3 bg-orange-100 rounded-lg"><Receipt className="w-6 h-6 text-orange-600" /></div>
          <div>
            <p className="text-sm text-gray-500">Gastos</p>
            <p className="text-xl font-bold">{formatCurrency(costosAdmin)}</p>
            <p className="text-xs text-gray-400">Administración</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border flex items-center gap-4">
          <div className="p-3 bg-red-100 rounded-lg"><FileText className="w-6 h-6 text-red-600" /></div>
          <div>
            <p className="text-sm text-gray-500">Pendientes</p>
            <p className="text-xl font-bold">{pendientes.length}</p>
            <p className="text-xs text-gray-400">Por aprobar</p>
          </div>
        </div>
      </div>

      {/* Inventario por finca */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-green-100 rounded-lg"><Beef className="w-5 h-5 text-green-600" /></div>
            <div>
              <h3 className="font-semibold">La Vega (Cría)</h3>
              <p className="text-xs text-gray-400">{meses[invLaVega?.mes]} {invLaVega?.año}</p>
            </div>
          </div>
          <p className="text-3xl font-bold text-green-600">{invLaVega?.total || 0} <span className="text-sm font-normal text-gray-500">cabezas</span></p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-blue-100 rounded-lg"><Beef className="w-5 h-5 text-blue-600" /></div>
            <div>
              <h3 className="font-semibold">Bariloche (Levante)</h3>
              <p className="text-xs text-gray-400">{meses[invBariloche?.mes]} {invBariloche?.año}</p>
            </div>
          </div>
          <p className="text-3xl font-bold text-blue-600">{invBariloche?.total || 0} <span className="text-sm font-normal text-gray-500">cabezas</span></p>
        </div>
      </div>

      {/* Nacimientos del año */}
      <div className="bg-white p-6 rounded-xl shadow-sm border">
        <h3 className="text-lg font-semibold mb-4">Nacimientos {año}</h3>
        <div className="flex items-center gap-4 mb-4">
          <Baby className="w-8 h-8 text-blue-500" />
          <div>
            <p className="text-3xl font-bold">{nacimientosAño.length}</p>
            <p className="text-sm text-gray-500">crías nacidas</p>
          </div>
        </div>
        <div className="h-32 flex items-end gap-1">
          {nacPorMes.map((n, i) => (
            <div key={i} className="flex-1 flex flex-col items-center">
              <div className="w-full bg-blue-400 rounded-t" style={{ height: `${Math.max(n * 8, 4)}px` }} />
              <span className="text-xs mt-1">{meses[i + 1]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Pendientes */}
      {pendientes.length > 0 && (
        <div className="bg-white p-6 rounded-xl shadow-sm border">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-orange-500" />
            Gastos Pendientes de Aprobación
          </h3>
          <div className="space-y-3">
            {pendientes.slice(0, 5).map(g => (
              <div key={g.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium">{g.proveedor}</p>
                  <p className="text-sm text-gray-500">{g.descripcion} • {formatDate(g.fecha)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{formatCurrency(g.valor)}</span>
                  <button onClick={() => onAprobar(g.id)} className="p-1 bg-green-100 rounded hover:bg-green-200">
                    <Check className="w-4 h-4 text-green-600" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Componente Form para crear/editar gastos
const Form = ({ gasto, onSave, onCancel, proveedores }) => {
  const [form, setForm] = useState(gasto || {
    fecha: new Date().toISOString().split('T')[0],
    proveedor: '',
    descripcion: '',
    categoria: '',
    centro: 'La Vega',
    valor: '',
    aprobado: false
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...form, valor: Number(form.valor) });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">{gasto ? 'Editar' : 'Nuevo'} Gasto</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Fecha</label>
            <input type="date" value={form.fecha} onChange={e => setForm({...form, fecha: e.target.value})} className="w-full border rounded-lg p-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Proveedor</label>
            <input list="proveedores" value={form.proveedor} onChange={e => setForm({...form, proveedor: e.target.value})} className="w-full border rounded-lg p-2" required />
            <datalist id="proveedores">
              {proveedores.map(p => <option key={p} value={p} />)}
            </datalist>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Descripción</label>
            <input value={form.descripcion} onChange={e => setForm({...form, descripcion: e.target.value})} className="w-full border rounded-lg p-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Categoría</label>
            <select value={form.categoria} onChange={e => setForm({...form, categoria: e.target.value})} className="w-full border rounded-lg p-2" required>
              <option value="">Seleccionar...</option>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Centro de Costos</label>
            <select value={form.centro} onChange={e => setForm({...form, centro: e.target.value})} className="w-full border rounded-lg p-2" required>
              {CENTROS_COSTOS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Valor</label>
            <input type="number" value={form.valor} onChange={e => setForm({...form, valor: e.target.value})} className="w-full border rounded-lg p-2" required />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onCancel} className="flex-1 py-2 border rounded-lg hover:bg-gray-50">Cancelar</button>
            <button type="submit" className="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Guardar</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Componente Costos
const Costos = ({ gastos, onAdd, onEdit, onDelete, onAprobar, proveedores }) => {
  const [search, setSearch] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroCentro, setFiltroCentro] = useState('');
  const [filtroAño, setFiltroAño] = useState(new Date().getFullYear());
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);

  const años = [...new Set(gastos.map(g => new Date(g.fecha).getFullYear()))].sort((a, b) => b - a);

  const filtered = useMemo(() => {
    return gastos.filter(g => {
      const año = new Date(g.fecha).getFullYear();
      const matchSearch = !search || 
        g.proveedor?.toLowerCase().includes(search.toLowerCase()) ||
        g.descripcion?.toLowerCase().includes(search.toLowerCase());
      const matchCat = !filtroCategoria || g.categoria === filtroCategoria;
      const matchCentro = !filtroCentro || g.centro === filtroCentro;
      const matchAño = !filtroAño || año === filtroAño;
      return matchSearch && matchCat && matchCentro && matchAño;
    }).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }, [gastos, search, filtroCategoria, filtroCentro, filtroAño]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  const totalFiltered = filtered.reduce((sum, g) => sum + g.valor, 0);

  const handleSave = (gasto) => {
    if (editando) {
      onEdit({ ...gasto, id: editando.id });
    } else {
      onAdd(gasto);
    }
    setShowForm(false);
    setEditando(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Costos y Gastos</h2>
        <button onClick={() => { setEditando(null); setShowForm(true); }} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
          <PlusCircle className="w-4 h-4" /> Nuevo
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-xl shadow-sm border">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input placeholder="Buscar..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="w-full pl-10 pr-4 py-2 border rounded-lg" />
          </div>
          <select value={filtroCategoria} onChange={e => { setFiltroCategoria(e.target.value); setPage(1); }} className="border rounded-lg p-2">
            <option value="">Todas las categorías</option>
            {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filtroCentro} onChange={e => { setFiltroCentro(e.target.value); setPage(1); }} className="border rounded-lg p-2">
            <option value="">Todos los centros</option>
            {CENTROS_COSTOS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filtroAño} onChange={e => { setFiltroAño(Number(e.target.value)); setPage(1); }} className="border rounded-lg p-2">
            {años.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="mt-3 text-sm text-gray-500">
          {filtered.length} registros • Total: <span className="font-semibold text-gray-700">{formatCurrency(totalFiltered)}</span>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3 text-sm font-medium text-gray-600">Fecha</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">Proveedor</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">Descripción</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">Categoría</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">Centro</th>
                <th className="text-right p-3 text-sm font-medium text-gray-600">Valor</th>
                <th className="text-center p-3 text-sm font-medium text-gray-600">Estado</th>
                <th className="text-center p-3 text-sm font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(g => (
                <tr key={g.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 text-sm">{formatDate(g.fecha)}</td>
                  <td className="p-3 text-sm font-medium">{g.proveedor}</td>
                  <td className="p-3 text-sm text-gray-600">{g.descripcion}</td>
                  <td className="p-3 text-sm">{g.categoria}</td>
                  <td className="p-3"><span className={`px-2 py-1 rounded-full text-xs ${centroColor(g.centro)}`}>{g.centro}</span></td>
                  <td className="p-3 text-sm text-right font-medium">{formatCurrency(g.valor)}</td>
                  <td className="p-3 text-center">
                    {g.aprobado ? (
                      <span className="text-green-600"><Check className="w-4 h-4 inline" /></span>
                    ) : (
                      <button onClick={() => onAprobar(g.id)} className="text-orange-500 hover:text-orange-700">
                        <span className="text-xs">Pendiente</span>
                      </button>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex justify-center gap-1">
                      <button onClick={() => { setEditando(g); setShowForm(true); }} className="p-1 hover:bg-gray-100 rounded">
                        <Edit2 className="w-4 h-4 text-gray-500" />
                      </button>
                      <button onClick={() => onDelete(g.id)} className="p-1 hover:bg-gray-100 rounded">
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t">
            <span className="text-sm text-gray-500">Página {page} de {totalPages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 border rounded hover:bg-gray-50 disabled:opacity-50">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 border rounded hover:bg-gray-50 disabled:opacity-50">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {showForm && <Form gasto={editando} onSave={handleSave} onCancel={() => { setShowForm(false); setEditando(null); }} proveedores={proveedores} />}
    </div>
  );
};

// Componente Principal
export default function GanaderiaApp() {
  const [user, setUser] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState('dashboard');
  const [menuOpen, setMenuOpen] = useState(true);
  
  const [gastos, setGastos] = useState(GASTOS_HISTORICOS);
  const [nacimientos] = useState(NACIMIENTOS_LA_VEGA);
  const [inventario] = useState(INVENTARIO_FINCAS);
  
  const años = [...new Set([
    ...gastos.map(g => new Date(g.fecha).getFullYear()),
    ...inventario.map(i => i.año)
  ])].sort((a, b) => b - a);
  
  const proveedores = useMemo(() => {
    const fromGastos = [...new Set(gastos.map(g => g.proveedor))];
    return [...new Set([...fromGastos, ...PROVEEDORES_CONOCIDOS])].sort();
  }, [gastos]);

  const pendientes = gastos.filter(g => !g.aprobado);

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const connected = await db.checkConnection();
        setIsOnline(connected);
        if (connected) {
          const cloudGastos = await db.getGastos();
          if (cloudGastos.length > 0) {
            setGastos(prev => {
              const cloudIds = new Set(cloudGastos.map(g => g.id));
              const localOnly = prev.filter(g => !cloudIds.has(g.id));
              return [...cloudGastos, ...localOnly];
            });
          }
        }
      } catch (e) {
        console.log('Sin conexión');
      }
      setLoading(false);
    };
    checkConnection();
  }, []);

  const handleLogin = (userData) => setUser(userData);
  const handleLogout = () => setUser(null);

  const handleAprobar = async (id) => {
    setGastos(prev => prev.map(g => g.id === id ? { ...g, aprobado: true } : g));
    if (isOnline) {
      await db.updateGasto(id, { aprobado: true });
    }
  };

  const handleAddGasto = async (gasto) => {
    const newGasto = { ...gasto, id: Date.now() };
    setGastos(prev => [newGasto, ...prev]);
    if (isOnline) {
      await db.createGasto(newGasto);
    }
  };

  const handleEditGasto = async (gasto) => {
    setGastos(prev => prev.map(g => g.id === gasto.id ? gasto : g));
    if (isOnline) {
      await db.updateGasto(gasto.id, gasto);
    }
  };

  const handleDeleteGasto = async (id) => {
    if (confirm('¿Eliminar este gasto?')) {
      setGastos(prev => prev.filter(g => g.id !== id));
      if (isOnline) {
        await db.deleteGasto(id);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    );
  }

  const menuItems = [
    { id: 'dashboard', icon: Home, label: 'Dashboard' },
    { id: 'costos', icon: DollarSign, label: 'Costos y Gastos' },
    { id: 'lavega', icon: Beef, label: 'Finca La Vega', color: 'text-green-600' },
    { id: 'bariloche', icon: Beef, label: 'Finca Bariloche', color: 'text-blue-600' },
    { id: 'nacimientos', icon: Baby, label: 'Nacimientos', badge: 'Próximo' },
    { id: 'importar', icon: Upload, label: 'Importar Datos', badge: 'Próximo' },
    { id: 'usuarios', icon: Users, label: 'Usuarios', badge: 'Próximo' },
  ];

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <aside className={`${menuOpen ? 'w-64' : 'w-16'} bg-green-800 text-white transition-all duration-300 flex flex-col`}>
        <div className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
            <Beef className="w-6 h-6" />
          </div>
          {menuOpen && (
            <div>
              <h1 className="font-bold">Ganadería La Vega</h1>
              <p className="text-xs text-green-200">Sistema de Gestión</p>
            </div>
          )}
        </div>

        <nav className="flex-1 p-2">
          {menuItems.map(item => (
            <button
              key={item.id}
              onClick={() => !item.badge && setVista(item.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg mb-1 transition-colors ${
                vista === item.id ? 'bg-white/20' : 'hover:bg-white/10'
              } ${item.badge ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={!!item.badge}
            >
              <item.icon className={`w-5 h-5 ${item.color || ''}`} />
              {menuOpen && (
                <>
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.badge && <span className="text-xs bg-orange-500 px-2 py-0.5 rounded">{item.badge}</span>}
                </>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/20">
          <div className="flex items-center gap-2 text-sm">
            <Wifi className={`w-4 h-4 ${isOnline ? 'text-green-300' : 'text-red-300'}`} />
            {menuOpen && <span>{isOnline ? 'En línea' : 'Sin conexión'}</span>}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">
          {vista === 'dashboard' && (
            <Dashboard 
              gastos={gastos} 
              nacimientos={nacimientos} 
              inventario={inventario}
              pendientes={pendientes} 
              onAprobar={handleAprobar} 
            />
          )}
          {vista === 'costos' && (
            <Costos 
              gastos={gastos} 
              onAdd={handleAddGasto} 
              onEdit={handleEditGasto} 
              onDelete={handleDeleteGasto} 
              onAprobar={handleAprobar}
              proveedores={proveedores}
            />
          )}
          {vista === 'lavega' && (
            <FincaLaVega 
              nacimientos={nacimientos} 
              inventario={inventario} 
              gastos={gastos}
              años={años}
            />
          )}
          {vista === 'bariloche' && (
            <FincaBariloche 
              inventario={inventario} 
              gastos={gastos}
              años={años}
            />
          )}
        </div>
      </main>
    </div>
  );
}
