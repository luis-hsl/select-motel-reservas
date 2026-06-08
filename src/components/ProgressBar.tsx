import { getTotalSteps } from '../store/useStore'
import { useStore } from '../store/useStore'
import { InstagramInline } from './InstagramLink'

const STEP_LABELS_PACKAGE    = ['Início', 'Pacote', 'Tipo', 'Data', 'Suíte', 'Extras', 'Dados', 'Pagamento']
const STEP_LABELS_EXPERIENCE = ['Início', 'Tipo', 'Data', 'Suíte', 'Cardápio', 'Dados', 'Pagamento']

interface Props { currentStep: number }

export default function ProgressBar({ currentStep }: Props) {
  const mode = useStore((s) => s.mode)
  const totalSteps = getTotalSteps(mode)
  const labels = mode === 'experience' ? STEP_LABELS_EXPERIENCE : STEP_LABELS_PACKAGE
  const pct = ((currentStep - 1) / Math.max(1, totalSteps - 1)) * 100

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-gold-800/20" style={{ background: '#0a0806' }}>
      <div className="max-w-7xl mx-auto px-6 xl:px-10 py-3.5 flex items-center justify-between gap-6">
        {/* Logo */}
        <div className="flex items-center shrink-0">
          <img
            src="/logo-header.webp"
            alt="Select Motel · Grupo Scuira"
            className="w-auto"
            style={{ height: 'clamp(3.6rem, 5.5vw, 5.2rem)' }}
            onError={e => { (e.currentTarget as HTMLImageElement).src = '/logo.webp' }}
          />
        </div>

        {/* Step label + bar */}
        <div className="flex-1 max-w-xs sm:max-w-sm xl:max-w-md">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] tracking-widest uppercase text-gold-600/60">
              {String(currentStep).padStart(2, '0')} / {String(totalSteps).padStart(2, '0')}
            </span>
            <span className="text-[10px] tracking-widest uppercase text-gold-500/80">
              {labels[currentStep - 1] ?? ''}
            </span>
          </div>
          <div className="h-[1px] bg-gold-900/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-gold-700 to-gold-400 transition-all duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Instagram (desktop only) */}
        <InstagramInline />
      </div>
    </header>
  )
}
