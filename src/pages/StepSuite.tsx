import { SUITES } from '../data'
import { useStore } from '../store/useStore'

export default function StepSuite() {
  const { suite: selected, setSuite, nextStep, prevStep } = useStore()

  function choose(s: typeof SUITES[number]) {
    setSuite(s)
    setTimeout(nextStep, 300)
  }

  return (
    <div>
      <button onClick={prevStep} className="flex items-center gap-1 text-gold-700/60 text-sm mb-8 hover:text-gold-500 transition-colors">
        <span>←</span> Voltar
      </button>

      <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-light mb-2 leading-tight">
        Qual suíte<br />
        <span className="gold-gradient font-semibold italic">você prefere?</span>
      </h1>
      <p className="text-gold-700/70 text-sm mb-6 sm:mb-10">
        Selecione o ambiente ideal para a sua noite.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {SUITES.map((suite) => {
          const sel = selected?.id === suite.id
          return (
            <button
              key={suite.id}
              onClick={() => choose(suite)}
              className={[
                'relative text-left rounded-xl border p-5 transition-all duration-300 card-hover outline-none',
                sel
                  ? 'border-gold-500 bg-gold-900/20 ring-1 ring-gold-500/30'
                  : 'border-gold-900/40 bg-black/40 hover:border-gold-700/60 hover:bg-gold-900/10',
              ].join(' ')}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-serif text-xl font-semibold gold-gradient">{suite.name}</p>
                  <p className="text-xs text-gold-700/60 mt-0.5">{suite.description}</p>
                </div>
                <span className={[
                  'text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border',
                  suite.size === 'large'
                    ? 'border-gold-600/50 text-gold-500/70'
                    : 'border-gold-900/50 text-gold-700/50',
                ].join(' ')}>
                  {suite.size === 'large' ? 'Grande' : 'Compacta'}
                </span>
              </div>

              <p className="text-xs text-gold-800/50 italic">
                +{suite.cleaning_buffer_h}h de limpeza entre reservas
              </p>

              {sel && (
                <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-gold-500 flex items-center justify-center">
                  <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 12 12">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
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
