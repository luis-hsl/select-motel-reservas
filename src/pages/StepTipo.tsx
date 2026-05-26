import { useStore } from '../store/useStore'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function StepTipo() {
  const { package: pkg, type, setType, nextStep, prevStep } = useStore()
  if (!pkg) return null

  function choose(t: 'period' | 'overnight') {
    setType(t)
    setTimeout(nextStep, 300)
  }

  return (
    <div>
      <button onClick={prevStep} className="flex items-center gap-1 text-gold-700/60 text-sm mb-8 hover:text-gold-500 transition-colors">
        <span>←</span> Voltar
      </button>

      <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-light mb-2 leading-tight">
        Período ou<br />
        <span className="gold-gradient font-semibold italic">pernoite?</span>
      </h1>
      <p className="text-gold-700/70 text-sm mb-6 sm:mb-10">
        Escolha a duração da sua experiência no <strong className="text-gold-500 font-medium">{pkg.label}</strong>.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 max-w-xl">
        {([
          { id: 'period', label: 'Período', desc: 'Aproveite algumas horas inesquecíveis', price: pkg.price_period },
          { id: 'overnight', label: 'Pernoite', desc: 'A noite toda até a manhã seguinte', price: pkg.price_overnight },
        ] as const).map((opt) => {
          const sel = type === opt.id
          return (
            <button
              key={opt.id}
              onClick={() => choose(opt.id)}
              className={[
                'text-left rounded-xl border p-6 transition-all duration-300 card-hover outline-none',
                sel
                  ? 'border-gold-500 bg-gold-900/20 ring-1 ring-gold-500/30'
                  : 'border-gold-900/40 bg-black/40 hover:border-gold-700/60 hover:bg-gold-900/10',
              ].join(' ')}
            >
              <p className="font-serif text-2xl font-semibold gold-gradient mb-1">{opt.label}</p>
              <p className="text-sm text-gold-700/60 mb-5">{opt.desc}</p>
              <p className="text-2xl font-semibold text-gold-400">{fmt(opt.price)}</p>
              {sel && (
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
