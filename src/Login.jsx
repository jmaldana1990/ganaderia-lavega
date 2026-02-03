import React, { useState } from 'react';
import { LogIn, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { signIn } from './supabase';

export default function Login({ onLogin, onSkip }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { user, session } = await signIn(email, password);
      if (user && session) {
        onLogin(user, session);
      }
    } catch (err) {
      console.error('Error de login:', err);
      if (err.message.includes('Invalid login')) {
        setError('Email o contraseña incorrectos');
      } else if (err.message.includes('Email not confirmed')) {
        setError('Debes confirmar tu email antes de iniciar sesión');
      } else {
        setError(err.message || 'Error al iniciar sesión');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-600 to-green-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-700 to-green-600 p-8 text-center text-white">
          <span className="text-5xl mb-4 block">🐄</span>
          <h1 className="text-2xl font-bold">Ganadería La Vega</h1>
          <p className="text-green-200 text-sm mt-1">Sistema de Gestión</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Contraseña
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors pr-12"
                required
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Iniciando sesión...
              </>
            ) : (
              <>
                <LogIn size={20} />
                Iniciar Sesión
              </>
            )}
          </button>

          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              className="w-full py-3 text-gray-500 hover:text-gray-700 text-sm"
            >
              Continuar sin iniciar sesión (modo solo lectura)
            </button>
          )}
        </form>

        {/* Footer */}
        <div className="px-8 pb-8 text-center">
          <p className="text-xs text-gray-400">
            Sistema de gestión ganadera v2.0
          </p>
        </div>
      </div>
    </div>
  );
}
