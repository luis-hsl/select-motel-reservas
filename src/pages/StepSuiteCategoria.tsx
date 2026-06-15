import { useStore } from '../store/useStore'
import { SUITE_CATEGORIES } from '../data/suiteCategories'
import type { SuiteCategoryDef } from '../data/suiteCategories'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })
}

const CARD_STYLES: { bg: string; border: string; ring: string; titleColor: string; divider: string; glowBottom: string }[] = [
  {
    // Tradicional — warm gold
    bg: [
      'radial-gradient(ellipse at 80% 25%, rgba(210,160,55,0.38) 0%, transparent 55%)',
      'radial-gradient(ellipse at 30% 85%, rgba(160,95,25,0.32) 0%, transparent 50%)',
      '#060503',
    ].join(', '),
    border: 'rgba(180,140,50,0.45)',
    ring:   'rgba(200,160,60,0.35)',
    titleColor: 'linear-gradient(180deg,#f8e8b0 0%,#d4a020 50%,#8a6010 100%)',
    divider: '#9a7828',
    glowBottom: 'rgba(180,120,30,0.2)',
  },
  {
    // Hidro Light — cool blue-teal
    bg: [
      'radial-gradient(ellipse at 75% 20%, rgba(50,140,180,0.4) 0%, transparent 55%)',
      'radial-gradient(ellipse at 25% 80%, rgba(30,100,140,0.3) 0%, transparent 50%)',
      '#020508',
    ].join(', '),
    border: 'rgba(60,150,200,0.45)',
    ring:   'rgba(80,170,220,0.35)',
    titleColor: 'linear-gradient(180deg,#b0dff8 0%,#2090c8 50%,#105888 100%)',
    divider: '#1e78a8',
    glowBottom: 'rgba(30,120,180,0.2)',
  },
  {
    // VIP Piscina — rich purple-violet
    bg: [
      'radial-gradient(ellipse at 70% 20%, rgba(140,60,200,0.42) 0%, transparent 55%)',
      'radial-gradient(ellipse at 30% 80%, rgba(100,30,160,0.32) 0%, transparent 50%)',
      '#040208',
    ].join(', '),
    border: 'rgba(150,80,210,0.45)',
    ring:   'rgba(170,100,230,0.35)',
    titleColor: 'linear-gradient(180deg,#e0b0f8 0%,#a040d0 50%,#601090 100%)',
    divider: '#7a28a8',
    glowBottom: 'rgba(120,40,180,0.22)',
  },
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
      <p className="text-gold-700/70 text-sm mb-6 sm:mb-8">
        Escolha a categoria e veja os preços por duração.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl xl:max-w-4xl">
        {SUITE_CATEGORIES.map((cat, i) => {
          const style = CARD_STYLES[i]
          return (
            <div
              key={cat.id}
              className="relative text-left rounded-2xl overflow-hidden flex flex-col"
              style={{
                background: style.bg,
                border: `1px solid ${style.border}`,
                boxShadow: `inset 0 0 50px rgba(0,0,0,0.55), 0 0 20px ${style.glowBottom}`,
                minHeight: '280px',
              }}
            >
              {/* Content */}
              <div className="flex-1 flex flex-col justify-end p-6 pb-3">
                <div className="flex items-center gap-2 mb-4">
                  <div
                    className="h-px w-8"
                    style={{ background: style.divider, boxShadow: `0 0 6px ${style.divider}` }}
                  />
                </div>

                <h2
                  className="font-serif font-bold text-transparent bg-clip-text leading-none mb-2"
                  style={{
                    fontSize: 'clamp(1.5rem, 4vw, 2rem)',
                    letterSpacing: '0.04em',
                    backgroundImage: style.titleColor,
                  }}
                >
                  {cat.label}
                </h2>

                <p className="text-xs text-gold-600/60 leading-relaxed mb-4">
                  {cat.description}
                </p>

                {/* Price table */}
                <div className="space-y-1 mb-1">
                  <PriceRow label="Período 2h"  value={fmt(cat.prices.period)}    divider={style.divider} />
                  <PriceRow label="Pernoite"     value={fmt(cat.prices.overnight)} divider={style.divider} />
                  <PriceRow label="Diária 24h"   value={fmt(cat.prices.diaria)}    divider={style.divider} />
                </div>
              </div>

              {/* CTA */}
              <div
                className="px-6 pb-5 pt-3 border-t"
                style={{ borderColor: `${style.divider}25` }}
              >
                <button
                  onClick={() => choose(cat)}
                  className="w-full flex items-center justify-center gap-1.5 py-3 rounded-lg text-xs tracking-wide uppercase font-bold text-black transition-all duration-200 hover:opacity-90 active:scale-95"
                  style={{
                    background: `linear-gradient(135deg, ${style.divider}, ${style.ring.replace('0.35', '1')}, ${style.divider})`,
                    boxShadow: `0 0 22px ${style.divider}55, inset 0 1px 0 rgba(255,255,255,0.15)`,
                  }}
                >
                  Escolher <span className="text-sm leading-none">→</span>
                </button>
              </div>

              {/* Bottom glow strip */}
              <div
                className="absolute bottom-0 left-0 right-0 h-1 rounded-b-2xl pointer-events-none"
                style={{
                  background: `linear-gradient(to right, transparent, ${style.divider}90, transparent)`,
                  boxShadow: `0 0 12px 4px ${style.divider}60`,
                }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PriceRow({ label, value, divider }: { label: string; value: string; divider: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-gold-700/60">{label}</span>
      <span
        className="text-[13px] font-semibold font-serif"
        style={{ color: divider }}
      >
        {value}
      </span>
    </div>
  )
}
