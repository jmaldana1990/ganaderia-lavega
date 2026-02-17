import { useState } from 'react';
import { Loader2, Lock, Mail, Eye, EyeOff } from 'lucide-react';
import * as db from './supabase';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) { setError('Ingresa correo y contraseña'); return; }
    setLoading(true);
    setError('');
    try {
      const { user, session } = await db.signIn(email, password);
      if (user && session) {
        onLogin(user, session);
      } else {
        setError('Credenciales incorrectas');
      }
    } catch (err) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      {/* Fondo decorativo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-green-900/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-emerald-900/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo y título */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <img 
              src="/logo_lavega.jpg" 
              alt="Ganadería La Vega" 
              className="h-24 w-24 object-contain rounded-2xl bg-white p-2 shadow-lg shadow-green-900/20"
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-100">Ganadería La Vega</h1>
          <p className="text-gray-500 text-sm mt-1">Sistema de Gestión Ganadera</p>
        </div>

        {/* Card de login */}
        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">Correo electrónico</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                placeholder="correo@ejemplo.com"
                autoComplete="email"
                className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm placeholder-gray-600 focus:border-green-500 focus:ring-1 focus:ring-green-500/30 outline-none transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">Contraseña</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full pl-10 pr-11 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-gray-200 text-sm placeholder-gray-600 focus:border-green-500 focus:ring-1 focus:ring-green-500/30 outline-none transition-colors"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-800/50 rounded-xl px-4 py-2.5 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-600/50 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-green-900/20"
          >
            {loading ? (
              <><Loader2 size={18} className="animate-spin" /> Ingresando...</>
            ) : (
              'Iniciar sesión'
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-xs text-gray-600 mt-6">
          Acceso restringido — Solo personal autorizado
        </p>
      </div>
    </div>
  );
}
