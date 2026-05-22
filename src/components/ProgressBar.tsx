import { TOTAL_STEPS } from '../store/useStore'

const STEP_LABELS = ['Pacote', 'Tipo', 'Suíte', 'Data', 'Dados', 'Pagamento']

interface Props { currentStep: number }

export default function ProgressBar({ currentStep }: Props) {
  const pct = ((currentStep - 1) / (TOTAL_STEPS - 1)) * 100

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-black/90 backdrop-blur border-b border-gold-800/30">
      <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-6">
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-serif text-lg font-semibold gold-gradient">SM</span>
          <span className="text-gold-500/70 text-xs tracking-widest uppercase hidden sm:block">Select Motel</span>
        </div>

        {/* Step label + bar */}
        <div className="flex-1 max-w-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] tracking-widest uppercase text-gold-600/60">
              {String(currentStep).padStart(2, '0')} / {String(TOTAL_STEPS).padStart(2, '0')}
            </span>
            <span className="text-[10px] tracking-widest uppercase text-gold-500/80">
              {STEP_LABELS[currentStep - 1]}
            </span>
          </div>
          <div className="h-[1px] bg-gold-900/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-gold-700 to-gold-400 transition-all duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    </header>
  )
}
