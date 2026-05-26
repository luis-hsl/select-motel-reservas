import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

export default function AdminLogin({ onLogin }: { onLogin: (u: User) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Email ou senha inválidos.')
      setLoading(false)
      return
    }
    if (data.user) onLogin(data.user)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <p className="text-gold-700/50 text-[10px] tracking-[0.4em] uppercase mb-2">Select Motel</p>
          <h1 className="font-serif text-3xl text-white font-light">
            Painel <span className="gold-gradient italic font-semibold">Admin</span>
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-white/40 text-xs tracking-widest uppercase block mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-gold-500/40 transition-colors text-sm"
              placeholder="seu@email.com"
              required
            />
          </div>
          <div>
            <label className="text-white/40 text-xs tracking-widest uppercase block mb-1.5">Senha</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-gold-500/40 transition-colors text-sm"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <p className="text-red-400/80 text-sm py-2 px-3 rounded-lg bg-red-500/10 border border-red-500/20">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl font-semibold text-black text-sm tracking-wide transition-all active:scale-[0.98] disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #c8a035 0%, #e8c060 50%, #c8a035 100%)' }}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
