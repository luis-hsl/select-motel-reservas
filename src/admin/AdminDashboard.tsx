import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'
import { PanoramaProvider } from './PanoramaProvider'
import SuiteStrip from './SuiteStrip'
import InicioTab from './tabs/InicioTab'
import DashboardTab from './tabs/DashboardTab'
import ReservasTab from './tabs/ReservasTab'
import SuitesTab from './tabs/SuitesTab'
import PacotesTab from './tabs/PacotesTab'
import ConfigTab from './tabs/ConfigTab'
import PresenteTab from './tabs/PresenteTab'
import CardapioTab from './tabs/CardapioTab'
import WhatsAppTab from './tabs/WhatsAppTab'
import AoVivoTab from './tabs/AoVivoTab'
import MotelTab from './tabs/MotelTab'
import DesempenhoTab from './tabs/DesempenhoTab'
import LeadsTab from './tabs/LeadsTab'
import PromosTab from './tabs/PromosTab'

// Casca do painel.
//
// As 13 telas estavam numa fileira única, onde "Cardápio" tinha o mesmo peso
// visual de "Ao Vivo" e nada dizia o que era operação e o que era cadastro.
// Agora vão em quatro grupos, e a faixa das suítes fica fixa no topo — quem
// abre o admin vê o motel antes de qualquer menu.

type Tab =
  | 'inicio' | 'motel' | 'desempenho' | 'reservas'
  | 'visao-geral' | 'ao-vivo' | 'leads' | 'promos'
  | 'suites' | 'pacotes' | 'cardapio' | 'presente'
  | 'whatsapp' | 'config'

interface Grupo {
  titulo: string
  itens: { id: Tab; label: string }[]
}

// A ordem encoda prioridade real: o que a recepção e o dono olham todo dia
// primeiro, cadastro que muda uma vez por mês por último.
const GRUPOS: Grupo[] = [
  {
    titulo: 'Operação',
    itens: [
      { id: 'inicio',     label: 'Início' },
      { id: 'motel',      label: 'Mapa do motel' },
      { id: 'desempenho', label: 'Desempenho' },
      { id: 'reservas',   label: 'Reservas' },
    ],
  },
  {
    titulo: 'Site',
    itens: [
      // Era "Visão Geral", mas nunca resumiu o negócio: só enxerga o que o
      // site vendeu. O nome novo diz o que a tela realmente é.
      { id: 'visao-geral', label: 'Funil do site' },
      { id: 'ao-vivo',     label: 'Ao vivo' },
      { id: 'leads',       label: 'Leads' },
      { id: 'promos',      label: 'Promoções' },
    ],
  },
  {
    titulo: 'Catálogo',
    itens: [
      { id: 'suites',   label: 'Suítes' },
      { id: 'pacotes',  label: 'Pacotes' },
      { id: 'cardapio', label: 'Cardápio' },
      { id: 'presente', label: 'Presente' },
    ],
  },
  {
    titulo: 'Sistema',
    itens: [
      { id: 'whatsapp', label: 'WhatsApp' },
      { id: 'config',   label: 'Ajustes' },
    ],
  },
]

const TITULOS: Record<Tab, string> = Object.fromEntries(
  GRUPOS.flatMap((g) => g.itens.map((i) => [i.id, i.label])),
) as Record<Tab, string>

export default function AdminDashboard({ user }: { user: User }) {
  const [tab, setTab] = useState<Tab>('inicio')
  const [menuAberto, setMenuAberto] = useState(false)

  const ir = (destino: string) => {
    setTab(destino as Tab)
    setMenuAberto(false)
  }

  return (
    <PanoramaProvider>
      <div className="min-h-screen bg-[#0a0a0a]">
        {/* Topo: marca + faixa viva das suítes */}
        <header className="border-b border-white/8 sticky top-0 bg-[#0a0a0a] z-30">
          <div className="px-4 sm:px-6 py-3 flex items-center gap-4">
            <button
              onClick={() => setMenuAberto((v) => !v)}
              className="lg:hidden text-white/50 hover:text-white/80 shrink-0"
              aria-label="Abrir menu"
              aria-expanded={menuAberto}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 5h14M2 9h14M2 13h14" />
              </svg>
            </button>

            <div className="shrink-0">
              <p className="text-gold-700/50 text-[9px] tracking-[0.35em] uppercase leading-none">
                Select Motel
              </p>
              <h1 className="font-serif text-lg text-white font-light leading-tight">
                Painel
              </h1>
            </div>

            <div className="flex-1 min-w-0 hidden md:block">
              <SuiteStrip />
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span className="text-white/25 text-[11px] hidden xl:block">{user.email}</span>
              <button
                onClick={() => supabase.auth.signOut()}
                className="text-[11px] text-white/40 hover:text-white/70 transition-colors px-3 py-1.5 rounded-lg border border-white/8 hover:border-white/20"
              >
                Sair
              </button>
            </div>
          </div>

          {/* Em telas estreitas a faixa vai para a própria linha */}
          <div className="md:hidden px-4 pb-3">
            <SuiteStrip />
          </div>
        </header>

        <div className="flex">
          {/* Trilha */}
          <nav
            className={`${menuAberto ? 'block' : 'hidden'} lg:block
              fixed lg:sticky inset-x-0 lg:inset-x-auto top-[61px] lg:top-[73px]
              z-20 lg:z-0 bg-[#0a0a0a] lg:bg-transparent
              border-b lg:border-b-0 lg:border-r border-white/8
              w-full lg:w-52 shrink-0 lg:h-[calc(100vh-73px)] overflow-y-auto`}
          >
            <div className="p-3 space-y-5">
              {GRUPOS.map((g) => (
                <div key={g.titulo}>
                  <p className="text-white/25 text-[9px] uppercase tracking-[0.2em] px-3 mb-1.5">
                    {g.titulo}
                  </p>
                  <div className="space-y-0.5">
                    {g.itens.map((i) => {
                      const ativo = tab === i.id
                      return (
                        <button
                          key={i.id}
                          onClick={() => ir(i.id)}
                          aria-current={ativo ? 'page' : undefined}
                          className={`w-full text-left text-[13px] px-3 py-1.5 rounded-lg transition-colors relative ${
                            ativo
                              ? 'text-gold-500 bg-gold-500/[0.07]'
                              : 'text-white/45 hover:text-white/80 hover:bg-white/[0.03]'
                          }`}
                        >
                          {ativo && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-r bg-gold-500" />
                          )}
                          {i.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </nav>

          {/* Conteúdo */}
          <main className="flex-1 min-w-0 p-4 sm:p-6">
            <div className="max-w-5xl">
              <h2 className="sr-only">{TITULOS[tab]}</h2>
              {tab === 'inicio'      && <InicioTab ir={ir} />}
              {tab === 'motel'       && <MotelTab />}
              {tab === 'desempenho'  && <DesempenhoTab />}
              {tab === 'reservas'    && <ReservasTab />}
              {tab === 'visao-geral' && <DashboardTab />}
              {tab === 'ao-vivo'     && <AoVivoTab />}
              {tab === 'leads'       && <LeadsTab />}
              {tab === 'promos'      && <PromosTab />}
              {tab === 'suites'      && <SuitesTab />}
              {tab === 'pacotes'     && <PacotesTab />}
              {tab === 'cardapio'    && <CardapioTab />}
              {tab === 'presente'    && <PresenteTab />}
              {tab === 'whatsapp'    && <WhatsAppTab />}
              {tab === 'config'      && <ConfigTab />}
            </div>
          </main>
        </div>
      </div>
    </PanoramaProvider>
  )
}
