import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'
import AdminLogin from './AdminLogin'
import AdminDashboard from './AdminDashboard'

/**
 * Fonte das cifras do painel, carregada **só aqui**.
 *
 * O `index.css` é global: acrescentar a mono ao import de fontes de lá faria a
 * vitrine baixar uma família que ela nunca usa. O admin é uma tela interna
 * atrás de login, então paga o próprio custo. Sem ela, `.figura` cai no
 * monospace do sistema e nada quebra.
 */
function carregarFonteDeDados() {
  const ID = 'admin-mono'
  if (document.getElementById(ID)) return
  const link = document.createElement('link')
  link.id = ID
  link.rel = 'stylesheet'
  link.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap'
  document.head.appendChild(link)
}

export default function AdminApp() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { carregarFonteDeDados() }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div
          className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: '#c8a035 transparent transparent transparent' }}
        />
      </div>
    )
  }

  return user ? <AdminDashboard user={user} /> : <AdminLogin onLogin={setUser} />
}
