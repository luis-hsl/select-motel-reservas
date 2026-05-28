import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'
import DashboardTab from './tabs/DashboardTab'
import ReservasTab from './tabs/ReservasTab'
import SuitesTab from './tabs/SuitesTab'
import PacotesTab from './tabs/PacotesTab'
import ConfigTab from './tabs/ConfigTab'
import PresenteTab from './tabs/PresenteTab'
import CardapioTab from './tabs/CardapioTab'

type Tab = 'visao-geral' | 'reservas' | 'suites' | 'pacotes' | 'cardapio' | 'presente' | 'config'

const TABS: { id: Tab; label: string }[] = [
  { id: 'visao-geral', label: 'Visão Geral' },
  { id: 'reservas',    label: 'Reservas' },
  { id: 'suites',      label: 'Suítes' },
  { id: 'pacotes',     label: 'Pacotes' },
  { id: 'cardapio',    label: 'Cardápio' },
  { id: 'presente',    label: 'Presente' },
  { id: 'config',      label: 'Configurações' },
]

export default function AdminDashboard({ user }: { user: User }) {
  const [tab, setTab] = useState<Tab>('visao-geral')

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <header className="border-b border-white/5 px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 bg-[#0a0a0a] z-10">
        <div>
          <p className="text-gold-700/40 text-[10px] tracking-[0.4em] uppercase">Select Motel</p>
          <h1 className="font-serif text-xl text-white font-light">
            Painel <span className="gold-gradient italic font-semibold">Admin</span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-white/25 text-xs hidden sm:block">{user.email}</span>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-xs text-red-400/60 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg border border-red-500/20 hover:border-red-500/40"
          >
            Sair
          </button>
        </div>
      </header>

      {/* Tab nav */}
      <nav className="border-b border-white/5 px-4 sm:px-6 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-3.5 text-sm font-medium transition-colors relative whitespace-nowrap ${
                tab === t.id ? 'text-gold-400' : 'text-white/35 hover:text-white/65'
              }`}
            >
              {t.label}
              {tab === t.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t"
                  style={{ background: 'linear-gradient(to right, #c8a035, #e8c060)' }}
                />
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="p-4 sm:p-6 max-w-5xl mx-auto">
        {tab === 'visao-geral' && <DashboardTab />}
        {tab === 'reservas'    && <ReservasTab />}
        {tab === 'suites'      && <SuitesTab />}
        {tab === 'pacotes'     && <PacotesTab />}
        {tab === 'cardapio'    && <CardapioTab />}
        {tab === 'presente'    && <PresenteTab />}
        {tab === 'config'      && <ConfigTab />}
      </main>
    </div>
  )
}
