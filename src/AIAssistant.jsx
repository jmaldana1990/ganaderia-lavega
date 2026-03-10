import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { MessageCircle, X, Send, Loader2, Bot, User, ChevronDown, Maximize2, Minimize2, AlertTriangle, Check, Trash2, Sparkles } from 'lucide-react';
import * as db from './supabase';

// ==================== AI ASSISTANT ====================
export default function AIAssistant({ nacimientos, pesajes, palpaciones, servicios, ventas, gastos, inventario, destetes, traslados, genealogia, userEmail, isOnline, onAnimalClick, setNacimientos, setVentas, setPesajes, setTraslados, inline = false }) {
  const [isOpen, setIsOpen] = useState(inline);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: '¡Hola! 👋 Soy tu asistente ganadero. Puedo ayudarte a consultar datos del hato, analizar indicadores, registrar eventos y darte recomendaciones. ¿En qué puedo ayudarte?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [executingAction, setExecutingAction] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);

  // Build context summary from current data
  const buildContext = useCallback(() => {
    const nac = nacimientos || [];
    const activos = nac.filter(n => n.estado === 'Activo');
    const laVega = activos.filter(n => (n.fincaDB || 'La Vega') === 'La Vega');
    const bariloche = activos.filter(n => (n.fincaDB || 'La Vega') === 'Bariloche');
    const vendidos = nac.filter(n => n.estado === 'Vendido');
    const muertos = nac.filter(n => n.estado === 'Muerto');

    // Category counts
    const cats = {};
    activos.forEach(n => {
      const cat = n.categoriaActual || n.categoria_actual || '?';
      cats[cat] = (cats[cat] || 0) + 1;
    });

    // Recent births
    const recentBirths = nac.filter(n => n.fecha && n.fecha > new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0])
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).slice(0, 5);

    // Ventas del año
    const year = new Date().getFullYear();
    const ventasAño = (ventas || []).filter(v => v.año === year);
    const totalVentasKg = ventasAño.reduce((s, v) => s + (v.kg || 0), 0);
    const totalVentasValor = ventasAño.reduce((s, v) => s + (v.valor || 0), 0);

    // Costos del año
    const costosAño = (gastos || []).filter(g => {
      const gAño = g.año || (g.fecha ? parseInt(g.fecha.split('-')[0]) : null);
      return gAño === year;
    });
    const totalCostos = costosAño.reduce((s, g) => s + (g.monto || 0), 0);

    // Recent pesajes
    const recentPesajes = (pesajes || []).sort((a, b) => (b.fecha_pesaje || '').localeCompare(a.fecha_pesaje || '')).slice(0, 5);

    // Servicios del año
    const servAño = (servicios || []).filter(s => s.fecha && s.fecha.startsWith(String(year)));

    // Palpaciones recientes
    const palpRecientes = (palpaciones || []).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).slice(0, 5);

    // Genealogia summary
    const genCount = (genealogia || []).length;
    const genRazas = {};
    (genealogia || []).forEach(g => { genRazas[g.raza] = (genRazas[g.raza] || 0) + 1; });

    const stats = `- Total animales activos: ${activos.length} (La Vega: ${laVega.length}, Bariloche: ${bariloche.length})
- Vendidos: ${vendidos.length}, Muertos: ${muertos.length}
- Categorías: ${Object.entries(cats).map(([k, v]) => `${k}:${v}`).join(', ')}
- Nacimientos registrados: ${nac.length}
- Registros genealógicos: ${genCount} (${Object.entries(genRazas).map(([k, v]) => `${k}:${v}`).join(', ')})`;

    const recentEvents = `- Últimos nacimientos: ${recentBirths.map(n => `${n.cria} (${n.fecha}, ${n.sexo}, madre:${n.madre || '?'})`).join('; ') || 'Ninguno reciente'}
- Últimos pesajes: ${recentPesajes.map(p => `${p.animal} ${p.peso}kg (${p.fecha_pesaje}, ${p.finca})`).join('; ') || 'Ninguno'}
- Servicios IA/TE ${year}: ${servAño.length} registrados
- Palpaciones recientes: ${palpRecientes.map(p => `${p.hembra} ${p.resultado} (${p.fecha})`).join('; ') || 'Ninguna'}
- Traslados: ${(traslados || []).slice(0, 3).map(t => `${t.animal} ${t.finca_origen}→${t.finca_destino} (${t.fecha})`).join('; ') || 'Ninguno'}`;

    const kpis = `- Ventas ${year}: ${ventasAño.length} transacciones, ${totalVentasKg.toLocaleString('es-CO')} kg, $${totalVentasValor.toLocaleString('es-CO')} COP
- Precio promedio/kg ${year}: $${totalVentasKg > 0 ? Math.round(totalVentasValor / totalVentasKg).toLocaleString('es-CO') : '—'} COP
- Costos ${year}: $${totalCostos.toLocaleString('es-CO')} COP
- Costo/kg vendido: $${totalVentasKg > 0 ? Math.round(totalCostos / totalVentasKg).toLocaleString('es-CO') : '—'} COP`;

    return { stats, recentEvents, kpis };
  }, [nacimientos, pesajes, palpaciones, servicios, ventas, gastos, traslados, genealogia]);

  // Send message
  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const context = buildContext();
      const apiMessages = [...messages.filter(m => m.role !== 'system'), { role: 'user', content: userMsg }]
        .map(m => ({ role: m.role, content: m.content }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, context })
      });

      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      const responseText = data.response || 'No obtuve respuesta.';

      // Check for action blocks
      const actionMatch = responseText.match(/```action\n?([\s\S]*?)```/);
      if (actionMatch) {
        try {
          const action = JSON.parse(actionMatch[1].trim());
          const cleanText = responseText.replace(/```action\n?[\s\S]*?```/, '').trim();
          setMessages(prev => [...prev, { role: 'assistant', content: cleanText }]);
          setPendingAction(action);
        } catch {
          setMessages(prev => [...prev, { role: 'assistant', content: responseText }]);
        }
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: responseText }]);
      }
    } catch (err) {
      console.error('Chat error:', err);
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Error de conexión: ${err.message}. Verifica que estés en línea.` }]);
    } finally {
      setLoading(false);
    }
  };

  // Execute confirmed action
  const executeAction = async (action) => {
    setExecutingAction(true);
    try {
      const { tipo, datos } = action;

      if (tipo === 'venta') {
        const nacReg = (nacimientos || []).find(n => String(n.cria).trim() === datos.animal);
        if (!nacReg) throw new Error(`Animal ${datos.animal} no encontrado en nacimientos`);
        await db.insertVentaAnimal({
          fecha: datos.fecha, año: parseInt(datos.fecha.split('-')[0]), mes: parseInt(datos.fecha.split('-')[1]),
          animal: datos.animal, tipo: datos.tipo || 'ML', kg: datos.peso_kg, precio: datos.precio_kg,
          valor: datos.peso_kg * datos.precio_kg, cliente: datos.comprador || null,
          finca: nacReg.fincaDB || 'La Vega', registrado_por: userEmail
        });
        await db.updateNacimiento(nacReg.id, { estado: 'Vendido' });
        setNacimientos(prev => prev.map(n => n.id === nacReg.id ? { ...n, estado: 'Vendido' } : n));
        setMessages(prev => [...prev, { role: 'assistant', content: `✅ Venta registrada: ${datos.animal} — ${datos.peso_kg}kg × $${datos.precio_kg?.toLocaleString('es-CO')}/kg` }]);

      } else if (tipo === 'traslado') {
        const nacReg = (nacimientos || []).find(n => String(n.cria).trim() === datos.animal);
        if (!nacReg) throw new Error(`Animal ${datos.animal} no encontrado`);
        await db.insertTraslado({
          animal: datos.animal, fecha: datos.fecha, finca_origen: nacReg.fincaDB || 'La Vega',
          finca_destino: datos.finca_destino, registrado_por: userEmail
        });
        await db.updateNacimiento(nacReg.id, { finca: datos.finca_destino });
        setNacimientos(prev => prev.map(n => n.id === nacReg.id ? { ...n, fincaDB: datos.finca_destino } : n));
        setMessages(prev => [...prev, { role: 'assistant', content: `✅ Traslado registrado: ${datos.animal} → ${datos.finca_destino}` }]);

      } else if (tipo === 'muerte') {
        const nacReg = (nacimientos || []).find(n => String(n.cria).trim() === datos.animal);
        if (!nacReg) throw new Error(`Animal ${datos.animal} no encontrado`);
        await db.updateNacimiento(nacReg.id, { estado: 'Muerto', comentario: `Muerte ${datos.fecha} - ${datos.causa}` });
        setNacimientos(prev => prev.map(n => n.id === nacReg.id ? { ...n, estado: 'Muerto' } : n));
        setMessages(prev => [...prev, { role: 'assistant', content: `✅ Muerte registrada: ${datos.animal} — Causa: ${datos.causa}` }]);

      } else if (tipo === 'pesaje') {
        const nacReg = (nacimientos || []).find(n => String(n.cria).trim() === datos.animal);
        const fechaNac = nacReg?.fecha;
        let edadMeses = null, gdpVida = null;
        if (fechaNac && fechaNac !== '1900-01-01') {
          const dias = Math.round((new Date(datos.fecha + 'T00:00:00') - new Date(fechaNac + 'T00:00:00')) / 86400000);
          edadMeses = dias > 0 ? Math.round((dias / 30.44) * 10) / 10 : null;
          const pn = nacReg?.pesoNacer || nacReg?.peso_nacer || 0;
          if (dias > 0 && datos.peso_kg > pn) gdpVida = Math.round(((datos.peso_kg - pn) / dias) * 1000);
        }
        await db.insertPesaje({
          animal: datos.animal, fecha_pesaje: datos.fecha, peso: datos.peso_kg,
          finca: datos.finca || nacReg?.fincaDB || 'La Vega', edad_meses: edadMeses, gdp_vida: gdpVida
        });
        setPesajes(prev => [{ animal: datos.animal, fecha_pesaje: datos.fecha, peso: datos.peso_kg, finca: datos.finca, edad_meses: edadMeses, gdp_vida: gdpVida }, ...prev]);
        setMessages(prev => [...prev, { role: 'assistant', content: `✅ Pesaje registrado: ${datos.animal} — ${datos.peso_kg}kg${gdpVida ? ` (GDP: ${gdpVida} g/día)` : ''}` }]);

      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Acción "${tipo}" no reconocida.` }]);
      }
    } catch (err) {
      console.error('Action error:', err);
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ Error ejecutando acción: ${err.message}` }]);
    } finally {
      setPendingAction(null);
      setExecutingAction(false);
    }
  };

  const clearChat = () => {
    setMessages([{ role: 'assistant', content: '¡Chat limpiado! 🧹 ¿En qué puedo ayudarte?' }]);
    setPendingAction(null);
  };

  // Quick suggestions
  const suggestions = [
    '¿Cuántos animales tengo activos?',
    '¿Qué vacas llevan más días abiertos?',
    '¿Cómo van las ventas este año?',
    'Resumen del hato de La Vega',
  ];

  const renderMessages = () => (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((msg, i) => (
        <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          {msg.role === 'assistant' && (
            <div className="w-7 h-7 bg-green-600/20 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
              <Bot size={14} className="text-green-400" />
            </div>
          )}
          <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            msg.role === 'user'
              ? 'bg-green-600 text-white rounded-br-md'
              : 'bg-gray-800 text-gray-200 border border-gray-700/50 rounded-bl-md'
          }`}>
            {msg.content.split('\n').map((line, j) => (
              <p key={j} className={j > 0 ? 'mt-1.5' : ''}>{line}</p>
            ))}
          </div>
          {msg.role === 'user' && (
            <div className="w-7 h-7 bg-green-600/30 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
              <User size={14} className="text-green-300" />
            </div>
          )}
        </div>
      ))}
      {loading && (
        <div className="flex gap-3">
          <div className="w-7 h-7 bg-green-600/20 rounded-lg flex items-center justify-center shrink-0">
            <Bot size={14} className="text-green-400" />
          </div>
          <div className="bg-gray-800 border border-gray-700/50 rounded-2xl rounded-bl-md px-4 py-3">
            <div className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-green-400" />
              <span className="text-sm text-gray-400">Pensando...</span>
            </div>
          </div>
        </div>
      )}
      {pendingAction && (
        <div className="bg-amber-900/20 border border-amber-700 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-400" />
            <span className="text-sm font-medium text-amber-300">Confirmar acción</span>
          </div>
          <div className="text-sm text-gray-300">
            <p className="font-medium text-gray-200 mb-1">
              {pendingAction.tipo === 'venta' && `🏷️ Venta: ${pendingAction.datos.animal} — ${pendingAction.datos.peso_kg}kg × $${pendingAction.datos.precio_kg?.toLocaleString('es-CO')}/kg`}
              {pendingAction.tipo === 'traslado' && `🚚 Traslado: ${pendingAction.datos.animal} → ${pendingAction.datos.finca_destino}`}
              {pendingAction.tipo === 'muerte' && `☠️ Muerte: ${pendingAction.datos.animal} — ${pendingAction.datos.causa}`}
              {pendingAction.tipo === 'pesaje' && `⚖️ Pesaje: ${pendingAction.datos.animal} — ${pendingAction.datos.peso_kg}kg`}
            </p>
            <p className="text-xs text-gray-500">Fecha: {pendingAction.datos.fecha}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => executeAction(pendingAction)} disabled={executingAction}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-40">
              {executingAction ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {executingAction ? 'Ejecutando...' : 'Confirmar'}
            </button>
            <button onClick={() => { setPendingAction(null); setMessages(prev => [...prev, { role: 'assistant', content: '❌ Acción cancelada.' }]); }}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm">
              Cancelar
            </button>
          </div>
        </div>
      )}
      {messages.length <= 1 && !loading && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 font-medium">Prueba preguntarme:</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => setInput(s)}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-full text-xs text-gray-400 hover:text-gray-200 transition-colors">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );

  const renderInput = () => (
    <div className="p-3 border-t border-gray-700/50 bg-gray-900/50 shrink-0">
      <div className="flex gap-2">
        <input ref={inputRef} type="text" value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder={isOnline ? 'Escribe tu pregunta...' : 'Sin conexión'}
          disabled={loading || !isOnline}
          className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/30 disabled:opacity-40" />
        <button onClick={sendMessage} disabled={loading || !input.trim() || !isOnline}
          className="px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl transition-colors shrink-0">
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>
    </div>
  );

  if (!isOpen && !inline) {
    return (
      <button onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-green-600 hover:bg-green-700 text-white rounded-full shadow-2xl shadow-green-600/40 flex items-center justify-center transition-all hover:scale-110 active:scale-95">
        <Sparkles size={26} />
      </button>
    );
  }

  if (inline) {
    // Inline mode — renders inside main content area
    return (
      <div className="h-[calc(100vh-120px)] bg-gray-900 rounded-2xl border border-gray-800 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-900/80 to-gray-900 px-5 py-4 flex items-center justify-between border-b border-gray-700/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center shadow-lg shadow-green-600/30">
              <Sparkles size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-100">Asistente AI — Ganadería La Vega</h2>
              <p className="text-xs text-green-400">Consulta, analiza y registra con lenguaje natural</p>
            </div>
          </div>
          <button onClick={clearChat} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded-lg text-sm transition-colors flex items-center gap-1.5">
            <Trash2 size={14} /> Limpiar
          </button>
        </div>

        {/* Messages area — reuse same JSX */}
        {renderMessages()}

        {/* Input */}
        {renderInput()}
      </div>
    );
  }

  const chatWidth = isExpanded ? 'w-full max-w-3xl' : 'w-[420px]';
  const chatHeight = isExpanded ? 'h-[90vh]' : 'h-[600px]';

  return (
    <div className={`fixed ${isExpanded ? 'inset-0 flex items-center justify-center bg-black/50 z-[70]' : 'bottom-6 right-6 z-[70]'}`}
      onClick={isExpanded ? (e) => { if (e.target === e.currentTarget) setIsOpen(false); } : undefined}>
      <div className={`${chatWidth} ${chatHeight} bg-gray-900 rounded-2xl shadow-2xl border border-gray-700 flex flex-col overflow-hidden`}>

        {/* Header */}
        <div className="bg-gradient-to-r from-green-900/80 to-gray-900 px-4 py-3 flex items-center justify-between border-b border-gray-700/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-green-600 rounded-xl flex items-center justify-center shadow-lg shadow-green-600/30">
              <Sparkles size={18} className="text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-100">Asistente La Vega</h3>
              <p className="text-[10px] text-green-400">Powered by Claude AI</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={clearChat} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-gray-200 transition-colors" title="Limpiar chat">
              <Trash2 size={16} />
            </button>
            <button onClick={() => setIsExpanded(!isExpanded)} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-gray-200 transition-colors" title={isExpanded ? 'Minimizar' : 'Expandir'}>
              {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-gray-200 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Messages */}
        {renderMessages()}

        {/* Input */}
        {renderInput()}
      </div>
    </div>
  );
}
