import { useState } from 'react'
import { useStore } from '../store/useStore'
import { SUITE_CATEGORIES } from '../data/suiteCategories'
import { SUITES } from '../data/index'
import type { SuiteCategoryDef } from '../data/suiteCategories'
import type { Suite } from '../types'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })
}

const THEMES = [
  {
    // Suíte Tradicional — âmbar dourado
    accent:      '#b8975a',
    accentBright:'#dfc07a',
    bg:          'linear-gradient(160deg, #0d0b08 0%, #080602 100%)',
    border:      'rgba(184,151,90,0.18)',
    glow:        '0 2px 20px rgba(184,151,90,0.04)',
    priceBg:     'rgba(184,151,90,0.05)',
    priceBorder: 'rgba(184,151,90,0.13)',
    labelColor:  'rgba(223,192,122,0.38)',
    tag:         null,
  },
  {
    // Hidro Light — teal gelado
    accent:      '#4aafc0',
    accentBright:'#78d0e4',
    bg:          'linear-gradient(160deg, #050c11 0%, #030810 100%)',
    border:      'rgba(74,175,192,0.18)',
    glow:        '0 2px 20px rgba(74,175,192,0.04)',
    priceBg:     'rgba(74,175,192,0.05)',
    priceBorder: 'rgba(74,175,192,0.13)',
    labelColor:  'rgba(120,208,228,0.38)',
    tag:         null,
  },
  {
    // VIP Piscina — cobre terracotta
    accent:      '#c07260',
    accentBright:'#e49a84',
    bg:          'linear-gradient(160deg, #100807 0%, #0c0503 100%)',
    border:      'rgba(192,114,96,0.18)',
    glow:        '0 2px 20px rgba(192,114,96,0.04)',
    priceBg:     'rgba(192,114,96,0.05)',
    priceBorder: 'rgba(192,114,96,0.13)',
    labelColor:  'rgba(228,154,132,0.38)',
    tag:         'Premium',
  },
]

const PRICE_ROWS = [
  { key: 'oneHour'    as const, label: '1 Hora',   sublabel: '1h' },
  { key: 'period'     as const, label: 'Período',  sublabel: '2h' },
  { key: 'overnight'  as const, label: 'Pernoite', sublabel: '~12h' },
  { key: 'diaria'     as const, label: 'Diária',   sublabel: '24h' },
]

function getSuitesForCategory(cat: SuiteCategoryDef): Suite[] {
  return SUITES.filter(s => s.category === cat.dbCategory)
}

export default function StepSuiteCategoria() {
  const { setSuiteCategory, setSuite, setStep, nextStep, prevStep } = useStore()
  const [modalCat, setModalCat] = useState<{ cat: SuiteCategoryDef; themeIdx: number } | null>(null)

  function choose(cat: SuiteCategoryDef) {
    setSuiteCategory(cat.dbCategory)
    nextStep()
  }

  function chooseSuiteFromModal(cat: SuiteCategoryDef, suite: Suite) {
    setSuiteCategory(cat.dbCategory)
    setSuite(suite)
    setStep(4) // pula StepSuite (step 3) — suíte já escolhida no modal
    setModalCat(null)
  }

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
        <span className="gold-gradient font-semibold italic pr-1 lg:pr-3">vocês preferem?</span>
      </h1>
      <p className="text-gold-700/70 text-sm mb-8 sm:mb-10">
        Escolha a categoria e veja os preços por duração.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-3xl xl:max-w-4xl">
        {SUITE_CATEGORIES.map((cat, i) => (
          <Card
            key={cat.id}
            cat={cat}
            theme={THEMES[i]}
            onChoose={() => choose(cat)}
            onViewSuites={() => setModalCat({ cat, themeIdx: i })}
          />
        ))}
      </div>

      {modalCat && (
        <SuiteModal
          cat={modalCat.cat}
          theme={THEMES[modalCat.themeIdx]}
          onClose={() => setModalCat(null)}
          onSelectSuite={(suite) => chooseSuiteFromModal(modalCat.cat, suite)}
        />
      )}
    </div>
  )
}

function Card({
  cat,
  theme: t,
  onChoose,
  onViewSuites,
}: {
  cat: SuiteCategoryDef
  theme: typeof THEMES[number]
  onChoose: () => void
  onViewSuites: () => void
}) {
  return (
    <div
      className="relative flex flex-col rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.012]"
      style={{
        background: t.bg,
        border: `1px solid ${t.border}`,
        boxShadow: t.glow,
      }}
    >
      {/* Tag Premium */}
      {t.tag && (
        <div className="absolute top-4 right-4">
          <span
            className="text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full"
            style={{
              background: `${t.accent}15`,
              border: `1px solid ${t.accent}40`,
              color: t.accentBright,
            }}
          >
            {t.tag}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="px-6 pt-7 pb-5">
        <div
          className="w-6 h-px mb-5"
          style={{ background: t.accent }}
        />
        <h2
          className="font-serif font-semibold uppercase leading-tight mb-3"
          style={{
            fontSize: 'clamp(1rem, 2.8vw, 1.3rem)',
            letterSpacing: '0.06em',
            color: t.accentBright,
          }}
        >
          {cat.label}
        </h2>
        <p className="text-xs leading-relaxed" style={{ color: 'rgba(205,195,178,0.5)' }}>
          {cat.description}
        </p>
      </div>

      {/* Divider */}
      <div className="mx-6" style={{ height: '1px', background: `${t.accent}15` }} />

      {/* Prices */}
      <div className="px-6 py-5 flex-1 space-y-1.5">
        {PRICE_ROWS.map(row => {
          const price = cat.prices[row.key]
          if (price === undefined) return null
          return (
            <div
              key={row.key}
              className="flex items-center justify-between rounded-lg px-3.5 py-2.5"
              style={{
                background: t.priceBg,
                border: `1px solid ${t.priceBorder}`,
              }}
            >
              <div>
                <p className="text-[13px] font-medium" style={{ color: 'rgba(228,218,198,0.75)' }}>
                  {row.label}
                </p>
                <p className="text-[10px]" style={{ color: t.labelColor }}>
                  {row.sublabel}
                </p>
              </div>
              <p
                className="font-sans font-bold tabular-nums text-lg tracking-tight"
                style={{ color: t.accentBright }}
              >
                {fmt(price)}
              </p>
            </div>
          )
        })}
      </div>

      {/* CTAs */}
      <div className="px-6 pb-6 pt-1 space-y-2">
        <button
          onClick={onChoose}
          className="w-full py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
          style={{
            background: `linear-gradient(135deg, ${t.accent}cc, ${t.accentBright}cc, ${t.accent}cc)`,
            color: '#080502',
          }}
        >
          Continuar reserva →
        </button>

        <button
          onClick={onViewSuites}
          className="w-full py-2.5 rounded-xl text-[11px] font-medium tracking-widest uppercase transition-all duration-200 hover:opacity-100 active:scale-[0.98]"
          style={{
            background: 'transparent',
            border: `1px solid ${t.border}`,
            color: t.labelColor,
          }}
        >
          Ver suítes disponíveis
        </button>
      </div>

      {/* Bottom accent */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: `linear-gradient(to right, transparent, ${t.accent}50, transparent)` }}
      />
    </div>
  )
}

function SuiteModal({
  cat,
  theme: t,
  onClose,
  onSelectSuite,
}: {
  cat: SuiteCategoryDef
  theme: typeof THEMES[number]
  onClose: () => void
  onSelectSuite: (suite: Suite) => void
}) {
  const suites = getSuitesForCategory(cat)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl overflow-hidden"
        style={{
          background: t.bg,
          border: `1px solid ${t.border}`,
          boxShadow: `0 0 80px rgba(0,0,0,0.9)`,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-start justify-between">
          <div>
            <div className="w-5 h-px mb-3" style={{ background: t.accent }} />
            <h3
              className="font-serif font-semibold uppercase tracking-wider mb-1"
              style={{ fontSize: '1.1rem', color: t.accentBright, letterSpacing: '0.06em' }}
            >
              {cat.label}
            </h3>
            <p className="text-[11px]" style={{ color: 'rgba(200,188,168,0.42)' }}>
              Escolha sua suíte e avance
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[11px] px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80 opacity-40"
            style={{ color: 'rgba(200,188,168,0.9)', border: '1px solid rgba(200,188,168,0.12)' }}
          >
            ✕
          </button>
        </div>

        <div className="mx-6" style={{ height: '1px', background: `${t.accent}15` }} />

        {/* Suite list */}
        <div className="px-6 py-4 space-y-2 max-h-80 overflow-y-auto">
          {suites.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: 'rgba(200,188,168,0.35)' }}>
              Nenhuma suíte disponível no momento.
            </p>
          ) : (
            suites.map(suite => (
              <div
                key={suite.id}
                className="flex items-center gap-3 rounded-xl px-4 py-3.5"
                style={{
                  background: t.priceBg,
                  border: `1px solid ${t.priceBorder}`,
                }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'rgba(228,218,198,0.88)' }}>
                    {suite.name}
                  </p>
                  <p className="text-[11px] mt-0.5 truncate" style={{ color: t.labelColor }}>
                    {suite.description}
                  </p>
                </div>
                <button
                  onClick={() => onSelectSuite(suite)}
                  className="shrink-0 text-[11px] font-bold px-3.5 py-2 rounded-lg transition-all hover:brightness-110 active:scale-[0.97]"
                  style={{
                    background: `linear-gradient(135deg, ${t.accent}cc, ${t.accentBright}bb)`,
                    color: '#080502',
                  }}
                >
                  Selecionar
                </button>
              </div>
            ))
          )}
        </div>

        <div className="px-6 pb-5 pt-1">
          <p className="text-center text-[10px]" style={{ color: 'rgba(200,188,168,0.22)' }}>
            Ao selecionar você avança para escolher o tipo de estadia.
          </p>
        </div>
      </div>
    </div>
  )
}
