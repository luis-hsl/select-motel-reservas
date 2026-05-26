import { useState, useEffect } from 'react'
import { SUITES, PROMO_START, PROMO_END } from '../data'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import type { Suite, SuiteCategory } from '../types'

// Número do WhatsApp de suporte — atualizar com o número real
const WHATSAPP_NUMBER = '5543999999999'
const WHATSAPP_MSG = encodeURIComponent('Olá! Gostaria de verificar disponibilidade de suítes para o Dia dos Namorados.')

const CATEGORY_LABEL: Record<SuiteCategory, string> = {
  'VIP Piscina': 'VIP · Piscina',
  'Hidro': 'Hidro',
  'Hidro Light': 'Hidro Light',
  'Standard': 'Standard',
}

const CATEGORY_DESC: Record<SuiteCategory, string> = {
  'VIP Piscina': 'Piscina privativa + experiência completa',
  'Hidro': 'Banheira de hidromassagem',
  'Hidro Light': 'Hidromassagem compacta',
  'Standard': 'Confortável e aconchegante',
}

export default function StepSuite() {
  const { package: pkg, type, suite: selected, setSuite, nextStep, prevStep } = useStore()
  const [occupiedIds, setOccupiedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const packageSuites = SUITES.filter(s => pkg && s.packageIds.includes(pkg.id as never))

  // Slots máximos por tipo durante a promoção (4 dias)
  const maxSlots = type === 'overnight' ? 4 : 16

  useEffect(() => {
    if (!pkg || !type || packageSuites.length === 0) { setLoading(false); return }

    const ids = packageSuites.map(s => s.id)
    const promoEnd = new Date(PROMO_END)
    promoEnd.setHours(23, 59, 59)

    supabase
      .from('reservations')
      .select('suite_id')
      .in('suite_id', ids)
      .eq('type', type)
      .in('status', ['pending', 'confirmed', 'paid'])
      .gte('check_in', PROMO_START.toISOString())
      .lte('check_in', promoEnd.toISOString())
      .then(({ data }) => {
        const count: Record<string, number> = {}
        data?.forEach(r => { count[r.suite_id] = (count[r.suite_id] || 0) + 1 })
        const occupied = new Set(
          Object.entries(count).filter(([, n]) => n >= maxSlots).map(([id]) => id)
        )
        setOccupiedIds(occupied)
        setLoading(false)
      })
  }, [pkg?.id, type])

  const allOccupied = packageSuites.length > 0 && packageSuites.every(s => occupiedIds.has(s.id))

  function choose(suite: Suite) {
    if (occupiedIds.has(suite.id)) return
    setSuite(suite)
    setTimeout(nextStep, 300)
  }

  // Agrupa por categoria para exibir seções
  const categories = Array.from(new Set(packageSuites.map(s => s.category)))

  return (
    <div>
      <button
        onClick={prevStep}
        className="flex items-center gap-1 text-gold-700/60 text-sm mb-8 hover:text-gold-500 transition-colors"
      >
        <span>←</span> Voltar
      </button>

      <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-light mb-2 leading-tight">
        Qual suíte<br />
        <span className="gold-gradient font-semibold italic">você prefere?</span>
      </h1>
      <p className="text-gold-700/70 text-sm mb-6 sm:mb-8">
        Suítes disponíveis para o{' '}
        <strong className="text-gold-500 font-medium">{pkg?.label}</strong>.
      </p>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2].map(i => (
            <div key={i} className="h-32 rounded-xl border border-gold-900/30 bg-gold-900/10 animate-pulse" />
          ))}
        </div>
      ) : allOccupied ? (
        /* Todas ocupadas — exibe só o suporte */
        <div className="space-y-4">
          <div className="rounded-xl border border-red-900/40 bg-red-900/10 px-5 py-4 text-center">
            <p className="text-sm text-red-400/80 mb-1">Todas as suítes do {pkg?.label} estão ocupadas para este período.</p>
            <p className="text-xs text-gold-800/50">Entre em contato com nosso suporte para verificar disponibilidade.</p>
          </div>
          <SupportCard highlight />
        </div>
      ) : (
        <div className="space-y-6">
          {categories.map(cat => {
            const catSuites = packageSuites.filter(s => s.category === cat)
            return (
              <div key={cat}>
                {/* Cabeçalho da categoria */}
                <div className="flex items-center gap-3 mb-3">
                  <p className="text-[10px] tracking-widest uppercase text-gold-500/60 font-medium shrink-0">
                    {CATEGORY_LABEL[cat]}
                  </p>
                  <div className="h-px flex-1 bg-gradient-to-r from-gold-800/40 to-transparent" />
                </div>
                <p className="text-[11px] text-gold-700/40 italic mb-3 -mt-1">{CATEGORY_DESC[cat]}</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {catSuites.map(suite => {
                    const occupied = occupiedIds.has(suite.id)
                    const sel = selected?.id === suite.id
                    return (
                      <SuiteCard
                        key={suite.id}
                        suite={suite}
                        occupied={occupied}
                        selected={sel}
                        onChoose={() => choose(suite)}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}

          <SupportCard highlight={false} />
        </div>
      )}
    </div>
  )
}

// ── Suite Card ─────────────────────────────────────────────

function SuiteCard({ suite, occupied, selected, onChoose }: {
  suite: Suite
  occupied: boolean
  selected: boolean
  onChoose: () => void
}) {
  return (
    <button
      onClick={onChoose}
      disabled={occupied}
      className={[
        'relative w-full text-left rounded-xl border p-5 transition-all duration-300 outline-none',
        occupied
          ? 'border-gold-900/20 bg-black/20 opacity-50 cursor-not-allowed'
          : selected
          ? 'border-gold-500 bg-gold-900/20 ring-1 ring-gold-500/30'
          : 'border-gold-900/40 bg-black/40 hover:border-gold-700/60 hover:bg-gold-900/10 active:scale-[0.98]',
      ].join(' ')}
    >
      {/* Room number badge */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="font-serif text-2xl font-bold gold-gradient leading-none">
              {suite.room_number}
            </span>
            <span className="text-[10px] tracking-widest uppercase text-gold-600/60">
              {CATEGORY_LABEL[suite.category]}
            </span>
          </div>
          <p className="text-xs text-gold-700/50">{suite.description}</p>
        </div>

        {occupied ? (
          <span className="text-[9px] tracking-widest uppercase px-2 py-0.5 rounded-full border border-red-900/50 text-red-500/60 shrink-0">
            Esgotado
          </span>
        ) : (
          <span className={[
            'text-[9px] tracking-widest uppercase px-2 py-0.5 rounded-full border shrink-0',
            suite.size === 'large'
              ? 'border-gold-600/40 text-gold-500/60'
              : 'border-gold-900/40 text-gold-700/50',
          ].join(' ')}>
            {suite.size === 'large' ? 'Grande' : 'Compacta'}
          </span>
        )}
      </div>

      <p className="text-[10px] text-gold-800/40 italic">
        +{suite.cleaning_buffer_h}h limpeza entre reservas
      </p>

      {selected && !occupied && (
        <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-gold-500 flex items-center justify-center">
          <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 12 12">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </button>
  )
}

// ── Support Card ───────────────────────────────────────────

function SupportCard({ highlight }: { highlight: boolean }) {
  return (
    <a
      href={`https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_MSG}`}
      target="_blank"
      rel="noopener noreferrer"
      className={[
        'flex items-center gap-4 w-full rounded-xl border px-5 py-4 transition-all duration-200 hover:opacity-90 active:scale-[0.98]',
        highlight
          ? 'border-gold-600/60 bg-gold-900/20'
          : 'border-gold-900/30 bg-black/30 hover:border-gold-800/50',
      ].join(' ')}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-lg"
        style={{ background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.3)' }}
      >
        💬
      </div>
      <div className="min-w-0">
        <p className={['text-sm font-medium', highlight ? 'text-gold-300' : 'text-gold-400/80'].join(' ')}>
          Falar com o suporte
        </p>
        <p className="text-[11px] text-gold-700/50">
          Dúvidas sobre disponibilidade? Chamamos no WhatsApp.
        </p>
      </div>
      <span className="text-gold-700/40 text-sm ml-auto shrink-0">→</span>
    </a>
  )
}
