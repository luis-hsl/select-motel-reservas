import { TOTAL_STEPS } from '../store/useStore'

const STEP_LABELS = ['Pacote', 'Tipo', 'Data', 'Suíte', 'Refeição', 'Bebida', 'Surpresa', 'Dados', 'Pagamento']

interface Props { currentStep: number }

export default function ProgressBar({ currentStep }: Props) {
  const pct = ((currentStep - 1) / (TOTAL_STEPS - 1)) * 100

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-black/90 backdrop-blur border-b border-gold-800/30">
      <div className="max-w-7xl mx-auto px-6 xl:px-10 py-3.5 flex items-center justify-between gap-6">
        {/* Logo */}
        <div className="flex items-center shrink-0">
          <img src="/logo.webp" alt="Select Motel" className="w-auto" style={{ height: 'clamp(3.6rem, 5.5vw, 5.2rem)' }} />
        </div>

        {/* Step label + bar */}
        <div className="flex-1 max-w-xs sm:max-w-sm xl:max-w-md">
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
