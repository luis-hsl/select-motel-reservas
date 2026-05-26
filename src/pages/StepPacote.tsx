import { PACKAGES } from '../data'
import { useStore } from '../store/useStore'
import type { Package } from '../types'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
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
      <p className="text-gold-700/70 text-sm mb-6 sm:mb-10">
        Cada pacote inclui decoração e experiências exclusivas.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {PACKAGES.map((pkg) => {
          const isSelected = selected?.id === pkg.id
          return (
            <button
              key={pkg.id}
              onClick={() => choose(pkg)}
              className={[
                'relative text-left rounded-xl border p-5 transition-all duration-300 card-hover outline-none',
                isSelected
                  ? 'border-gold-500 bg-gold-900/20 ring-1 ring-gold-500/30'
                  : 'border-gold-900/40 bg-black/40 hover:border-gold-700/60 hover:bg-gold-900/10',
                pkg.highlighted && !isSelected ? 'border-gold-700/60' : '',
              ].join(' ')}
            >
              {/* Badge */}
              {pkg.highlighted && (
                <span className="absolute -top-2.5 left-4 text-[10px] tracking-widest uppercase bg-gold-600 text-black font-semibold px-2.5 py-0.5 rounded-full">
                  Mais escolhido
                </span>
              )}

              {/* Title */}
              <p className="font-serif text-xl font-semibold gold-gradient mb-0.5">{pkg.label}</p>
              <p className="text-xs text-gold-700/60 mb-4">{pkg.tagline}</p>

              {/* Includes */}
              <ul className="space-y-1.5 mb-6">
                {pkg.includes.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-gold-300/80">
                    <span className="text-gold-600 mt-0.5 shrink-0">✦</span>
                    {item}
                  </li>
                ))}
              </ul>
              {pkg.note && (
                <p className="text-[11px] text-gold-800/60 italic mb-4">{pkg.note}</p>
              )}

              {/* Prices */}
              <div className="border-t border-gold-900/40 pt-3 space-y-1">
                <PriceLine label="Período" value={pkg.price_period} />
                <PriceLine label="Pernoite" value={pkg.price_overnight} />
              </div>

              {/* Selected check */}
              {isSelected && (
                <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-gold-500 flex items-center justify-center">
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

function PriceLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[11px] text-gold-700/50 uppercase tracking-wide">{label}</span>
      <span className="text-gold-400 font-semibold text-sm">{fmt(value)}</span>
    </div>
  )
}
