import { PACKAGES } from '../data'
import { useStore } from '../store/useStore'
import type { Package } from '../types'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

type PkgId = 'ouro' | 'prata' | 'bronze'

const THEME: Record<PkgId, {
  bg: string
  border: string
  ring: string
  nameCss: string
  accentColor: string
  labelColor: string
  iconColor: string
  dividerColor: string
  priceColor: string
}> = {
  ouro: {
    bg: [
      'radial-gradient(ellipse at 18% 88%, rgba(180,100,12,0.45) 0%, transparent 52%)',
      'radial-gradient(ellipse at 82% 72%, rgba(140,75,8,0.3) 0%, transparent 48%)',
      'radial-gradient(ellipse at 50% 108%, rgba(100,55,5,0.5) 0%, transparent 58%)',
      'radial-gradient(ellipse at 50% -10%, rgba(80,40,5,0.2) 0%, transparent 45%)',
      '#060504',
    ].join(', '),
    border: 'rgba(180,140,40,0.5)',
    ring: 'rgba(200,160,50,0.35)',
    nameCss: 'linear-gradient(180deg, #f5e0a0 0%, #d4a017 40%, #8b6010 100%)',
    accentColor: '#c9a84c',
    labelColor: 'rgba(201,168,76,0.5)',
    iconColor: '#c9a84c',
    dividerColor: '#a07820',
    priceColor: '#d4a850',
  },
  prata: {
    bg: [
      'radial-gradient(ellipse at 18% 88%, rgba(100,110,140,0.3) 0%, transparent 52%)',
      'radial-gradient(ellipse at 82% 72%, rgba(80,90,120,0.2) 0%, transparent 48%)',
      'radial-gradient(ellipse at 50% 108%, rgba(60,70,100,0.4) 0%, transparent 58%)',
      'radial-gradient(ellipse at 50% -10%, rgba(50,55,80,0.15) 0%, transparent 45%)',
      '#050507',
    ].join(', '),
    border: 'rgba(160,170,200,0.4)',
    ring: 'rgba(180,190,220,0.25)',
    nameCss: 'linear-gradient(180deg, #f0f2f8 0%, #b0b8cc 40%, #6a7090 100%)',
    accentColor: '#a8b0c8',
    labelColor: 'rgba(160,170,200,0.5)',
    iconColor: '#a8b0c8',
    dividerColor: '#7880a0',
    priceColor: '#b8c0d8',
  },
  bronze: {
    bg: [
      'radial-gradient(ellipse at 18% 88%, rgba(160,85,22,0.4) 0%, transparent 52%)',
      'radial-gradient(ellipse at 82% 72%, rgba(120,60,14,0.28) 0%, transparent 48%)',
      'radial-gradient(ellipse at 50% 108%, rgba(90,45,8,0.48) 0%, transparent 58%)',
      'radial-gradient(ellipse at 50% -10%, rgba(70,35,5,0.18) 0%, transparent 45%)',
      '#060402',
    ].join(', '),
    border: 'rgba(160,100,40,0.5)',
    ring: 'rgba(180,120,50,0.3)',
    nameCss: 'linear-gradient(180deg, #e8b880 0%, #c07830 40%, #7a4010 100%)',
    accentColor: '#c07830',
    labelColor: 'rgba(190,120,50,0.5)',
    iconColor: '#c07830',
    dividerColor: '#904820',
    priceColor: '#d09040',
  },
}

export default function StepPacote() {
  const { package: selected, setPackage, nextStep } = useStore()

  function choose(pkg: Package) {
    setPackage(pkg)
    setTimeout(nextStep, 300)
  }

  return (
    <div>
      <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-light mb-2 leading-tight">
        Qual pacote<br />
        <span className="gold-gradient font-semibold italic">você prefere?</span>
      </h1>
      <p className="text-gold-700/70 text-sm mb-6 sm:mb-8">
        Cada pacote inclui decoração e experiências exclusivas.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {PACKAGES.map((pkg) => {
          const id = pkg.id as PkgId
          const t = THEME[id]
          const isSel = selected?.id === pkg.id

          return (
            <button
              key={pkg.id}
              onClick={() => choose(pkg)}
              className="relative text-left rounded-2xl overflow-hidden outline-none transition-all duration-300"
              style={{
                background: t.bg,
                border: `1px solid ${t.border}`,
                boxShadow: isSel
                  ? `0 0 0 2px ${t.ring}, inset 0 0 40px rgba(0,0,0,0.4)`
                  : 'inset 0 0 40px rgba(0,0,0,0.5)',
              }}
            >
              {/* Top badge */}
              {pkg.highlighted && (
                <div className="absolute top-0 left-0 right-0 flex justify-center z-10">
                  <span
                    className="text-[9px] tracking-[0.3em] uppercase font-semibold px-4 py-1 rounded-b-xl text-black"
                    style={{ background: t.accentColor }}
                  >
                    Mais escolhido
                  </span>
                </div>
              )}

              {/* ── Visual hero area ── */}
              <div className="pt-10 pb-5 px-5 text-center">
                {/* "PACOTE" label */}
                <p
                  className="text-[9px] tracking-[0.6em] uppercase mb-4 font-medium"
                  style={{ color: t.labelColor }}
                >
                  Pacote
                </p>

                {/* Decorative divider */}
                <GlowDivider color={t.dividerColor} />

                {/* Package name */}
                <h2
                  className="font-serif font-bold tracking-widest my-5 text-transparent bg-clip-text"
                  style={{
                    fontSize: 'clamp(2.8rem, 8vw, 3.5rem)',
                    backgroundImage: t.nameCss,
                    textShadow: 'none',
                    lineHeight: 1,
                  }}
                >
                  {id.toUpperCase()}
                </h2>

                {/* Decorative divider */}
                <GlowDivider color={t.dividerColor} />

                <p className="text-[11px] mt-3 italic" style={{ color: t.labelColor }}>
                  {pkg.tagline}
                </p>
              </div>

              {/* ── Info area ── */}
              <div className="px-5 pb-5">
                <ul className="space-y-1.5 mb-4">
                  {pkg.includes.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-xs" style={{ color: 'rgba(245,224,180,0.75)' }}>
                      <span className="shrink-0 mt-0.5 text-[10px]" style={{ color: t.iconColor }}>✦</span>
                      {item}
                    </li>
                  ))}
                </ul>
                {pkg.note && (
                  <p className="text-[10px] italic mb-3" style={{ color: t.labelColor }}>
                    {pkg.note}
                  </p>
                )}

                {/* Prices */}
                <div
                  className="border-t pt-3 space-y-1.5"
                  style={{ borderColor: `${t.dividerColor}40` }}
                >
                  <PriceRow label="Período" value={pkg.price_period} color={t.priceColor} />
                  <PriceRow label="Pernoite" value={pkg.price_overnight} color={t.priceColor} />
                </div>
              </div>

              {/* Selected check */}
              {isSel && (
                <div
                  className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: t.accentColor }}
                >
                  <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 12 12">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function GlowDivider({ color }: { color: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-4">
      <div
        className="h-px flex-1"
        style={{ background: `linear-gradient(to right, transparent, ${color}60)` }}
      />
      <div
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: color, boxShadow: `0 0 8px 3px ${color}70` }}
      />
      <div
        className="h-px flex-1"
        style={{ background: `linear-gradient(to left, transparent, ${color}60)` }}
      />
    </div>
  )
}

function PriceRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[10px] uppercase tracking-widest" style={{ color: 'rgba(180,150,80,0.45)' }}>
        {label}
      </span>
      <span className="text-xs font-semibold" style={{ color }}>
        {fmt(value)}
      </span>
    </div>
  )
}
