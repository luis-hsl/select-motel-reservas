import { useStore } from '../store/useStore'
import { SUITE_CATEGORIES } from '../data/suiteCategories'
import type { SuiteCategoryDef } from '../data/suiteCategories'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })
}

const THEMES = [
  {
    // Tradicional — dourado
    accent:      '#c9a84c',
    accentBright:'#f5d87a',
    bg:          'linear-gradient(145deg, #100e04 0%, #0a0800 100%)',
    border:      'rgba(201,168,76,0.28)',
    borderHover: 'rgba(201,168,76,0.7)',
    glow:        '0 0 40px rgba(201,168,76,0.08)',
    priceBg:     'rgba(201,168,76,0.07)',
    priceBorder: 'rgba(201,168,76,0.18)',
    labelColor:  'rgba(245,216,122,0.45)',
    tag:         null,
  },
  {
    // Hidro Light — azul água
    accent:      '#2eb8cc',
    accentBright:'#7de8f5',
    bg:          'linear-gradient(145deg, #03101400 0%, #010a0d 100%)',
    border:      'rgba(46,184,204,0.28)',
    borderHover: 'rgba(46,184,204,0.7)',
    glow:        '0 0 40px rgba(46,184,204,0.08)',
    priceBg:     'rgba(46,184,204,0.07)',
    priceBorder: 'rgba(46,184,204,0.18)',
    labelColor:  'rgba(125,232,245,0.45)',
    tag:         null,
  },
  {
    // VIP Piscina — violeta
    accent:      '#a855f7',
    accentBright:'#d8b4fe',
    bg:          'linear-gradient(145deg, #0c0416 0%, #070210 100%)',
    border:      'rgba(168,85,247,0.28)',
    borderHover: 'rgba(168,85,247,0.7)',
    glow:        '0 0 40px rgba(168,85,247,0.10)',
    priceBg:     'rgba(168,85,247,0.07)',
    priceBorder: 'rgba(168,85,247,0.18)',
    labelColor:  'rgba(216,180,254,0.45)',
    tag:         'Premium',
  },
]

const PRICE_ROWS = [
  { key: 'oneHour'  as const, label: '1 Hora',   sublabel: '1 hora' },
  { key: 'period'   as const, label: 'Período',  sublabel: '2 horas' },
  { key: 'overnight'as const, label: 'Pernoite', sublabel: '~12 horas' },
  { key: 'diaria'   as const, label: 'Diária',   sublabel: '24 horas' },
]

export default function StepSuiteCategoria() {
  const { setSuiteCategory, nextStep, prevStep } = useStore()

  function choose(cat: SuiteCategoryDef) {
    setSuiteCategory(cat.dbCategory)
    nextStep()
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
        {SUITE_CATEGORIES.map((cat, i) => {
          const t = THEMES[i]
          return (
            <Card key={cat.id} cat={cat} theme={t} onChoose={() => choose(cat)} />
          )
        })}
      </div>
    </div>
  )
}

function Card({
  cat,
  theme: t,
  onChoose,
}: {
  cat: SuiteCategoryDef
  theme: typeof THEMES[number]
  onChoose: () => void
}) {
  return (
    <div
      className="relative flex flex-col rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.015]"
      style={{
        background: t.bg,
        border: `1px solid ${t.border}`,
        boxShadow: t.glow,
      }}
    >
      {/* Tag premium */}
      {t.tag && (
        <div className="absolute top-4 right-4">
          <span
            className="text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full"
            style={{
              background: `${t.accent}20`,
              border: `1px solid ${t.accent}50`,
              color: t.accentBright,
            }}
          >
            {t.tag}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="px-6 pt-7 pb-5">
        {/* Accent line */}
        <div
          className="w-8 h-0.5 mb-5 rounded-full"
          style={{ background: t.accent, boxShadow: `0 0 8px ${t.accent}` }}
        />

        {/* Title */}
        <h2
          className="font-serif font-semibold leading-none mb-3"
          style={{
            fontSize: 'clamp(1.6rem, 4.5vw, 2.1rem)',
            color: t.accentBright,
            textShadow: `0 0 30px ${t.accent}60`,
          }}
        >
          {cat.label}
        </h2>

        {/* Description */}
        <p className="text-sm leading-relaxed" style={{ color: 'rgba(210,200,185,0.6)' }}>
          {cat.description}
        </p>
      </div>

      {/* Divider */}
      <div className="mx-6" style={{ height: '1px', background: `${t.accent}20` }} />

      {/* Prices */}
      <div className="px-6 py-5 flex-1 space-y-2">
        {PRICE_ROWS.map(row => {
          const price = cat.prices[row.key]
          if (price === undefined) return null
          return (
            <div
              key={row.key}
              className="flex items-center justify-between rounded-xl px-4 py-3"
              style={{
                background: t.priceBg,
                border: `1px solid ${t.priceBorder}`,
              }}
            >
              <div>
                <p className="text-sm font-medium" style={{ color: 'rgba(230,220,200,0.85)' }}>
                  {row.label}
                </p>
                <p className="text-[11px]" style={{ color: t.labelColor }}>
                  {row.sublabel}
                </p>
              </div>
              <p
                className="font-serif font-semibold text-xl"
                style={{ color: t.accentBright }}
              >
                {fmt(price)}
              </p>
            </div>
          )
        })}
      </div>

      {/* CTA */}
      <div className="px-6 pb-6 pt-1">
        <button
          onClick={onChoose}
          className="w-full py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
          style={{
            background: `linear-gradient(135deg, ${t.accent}cc, ${t.accentBright}cc, ${t.accent}cc)`,
            color: '#000',
            boxShadow: `0 0 24px ${t.accent}50`,
          }}
        >
          Escolher esta suíte →
        </button>
      </div>

      {/* Bottom accent glow */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: `linear-gradient(to right, transparent, ${t.accent}80, transparent)` }}
      />
    </div>
  )
}
