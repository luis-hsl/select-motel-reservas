import './index.css'
import { useMemo, useEffect } from 'react'
import { trackStep } from './lib/tracking'
import ProgressBar from './components/ProgressBar'
import CountdownBanner from './components/CountdownBanner'
import { InstagramFab } from './components/InstagramLink'
import ReservaSidebar from './components/ReservaSidebar'
import CardPaymentReturn from './components/CardPaymentReturn'
import StepEscolha from './pages/StepEscolha'
import StepPacote from './pages/StepPacote'
import StepTipo from './pages/StepTipo'
import StepData from './pages/StepData'
import StepSuite from './pages/StepSuite'
import StepExtras from './pages/StepExtras'
import StepPagamento from './pages/StepPagamento'
import { useStore } from './store/useStore'

// Dados coletados inline no StepEscolha — StepDados removido do fluxo.
//   PACOTE:      Escolha → Pacote → Tipo → Data → Suíte → Extras → Pagamento  (7 steps)
//   EXPERIÊNCIA: Escolha → Tipo  → Data → Suíte → Extras → Pagamento          (6 steps)
const STEPS_PACKAGE: Record<number, React.ComponentType> = {
  1: StepEscolha,
  2: StepPacote,
  3: StepTipo,
  4: StepData,
  5: StepSuite,
  6: StepExtras,
  7: StepPagamento,
}

const STEPS_EXPERIENCE: Record<number, React.ComponentType> = {
  1: StepEscolha,
  2: StepTipo,
  3: StepData,
  4: StepSuite,
  5: StepExtras,
  6: StepPagamento,
}

export default function App() {
  const { currentStep, mode } = useStore()

  // Detect return from AbacatePay card payment page
  const paymentReturn = useMemo(() => {
    const p = new URLSearchParams(window.location.search)
    const ref = p.get('ref')
    return p.get('payment') === 'ok' && ref ? ref : null
  }, [])

  // Volta ao topo ao trocar de step
  useEffect(() => {
    if (paymentReturn) return
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [currentStep, paymentReturn])

  // Tracking anônimo do onboarding (envia o mode quando já escolhido)
  useEffect(() => {
    if (paymentReturn) return
    trackStep(currentStep, mode)
  }, [currentStep, mode, paymentReturn])

  useEffect(() => {
    if (paymentReturn) return
    const id = setInterval(() => trackStep(currentStep, mode), 30_000)
    return () => clearInterval(id)
  }, [currentStep, mode, paymentReturn])

  if (paymentReturn) {
    return <CardPaymentReturn reservationId={paymentReturn} />
  }

  const STEPS = mode === 'experience' ? STEPS_EXPERIENCE : STEPS_PACKAGE
  const StepComponent = STEPS[currentStep] ?? StepEscolha

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <ProgressBar currentStep={currentStep} />
      <CountdownBanner />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 xl:px-10 pt-36 sm:pt-40 pb-20 sm:pb-16">
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 xl:gap-16 items-start">
          <main className="flex-1 min-w-0 w-full">
            <StepComponent />
          </main>
          <ReservaSidebar />
        </div>
      </div>

      <InstagramFab />
    </div>
  )
}
