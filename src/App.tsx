import './index.css'
import { useMemo, useEffect } from 'react'
import { trackStep } from './lib/tracking'
import ProgressBar from './components/ProgressBar'
import { InstagramFab } from './components/InstagramLink'
import ReservaSidebar from './components/ReservaSidebar'
import CardPaymentReturn from './components/CardPaymentReturn'
import StepEscolha from './pages/StepEscolha'
import StepPacote from './pages/StepPacote'
import StepTipo from './pages/StepTipo'
import StepData from './pages/StepData'
import StepSuite from './pages/StepSuite'
import StepExtras from './pages/StepExtras'
import StepDados from './pages/StepDados'
import StepPagamento from './pages/StepPagamento'
import { useStore } from './store/useStore'

// O fluxo muda conforme o modo escolhido na step 1 (StepEscolha):
//   PACOTE:      Escolha → Pacote → Tipo → Data → Suíte → Extras → Dados → Pagamento  (8 steps)
//   EXPERIÊNCIA: Escolha → Tipo  → Data → Suíte → Cardápio → Dados → Pagamento        (7 steps)
const STEPS_PACKAGE: Record<number, React.ComponentType> = {
  1: StepEscolha,
  2: StepPacote,
  3: StepTipo,
  4: StepData,
  5: StepSuite,
  6: StepExtras,
  7: StepDados,
  8: StepPagamento,
}

const STEPS_EXPERIENCE: Record<number, React.ComponentType> = {
  1: StepEscolha,
  2: StepTipo,
  3: StepData,
  4: StepSuite,
  5: StepExtras,
  6: StepDados,
  7: StepPagamento,
}

export default function App() {
  const { currentStep, mode } = useStore()

  // Detect return from AbacatePay card payment page
  const paymentReturn = useMemo(() => {
    const p = new URLSearchParams(window.location.search)
    const ref = p.get('ref')
    return p.get('payment') === 'ok' && ref ? ref : null
  }, [])

  // Tracking anônimo do onboarding
  useEffect(() => {
    if (paymentReturn) return
    trackStep(currentStep)
  }, [currentStep, paymentReturn])

  useEffect(() => {
    if (paymentReturn) return
    const id = setInterval(() => trackStep(currentStep), 30_000)
    return () => clearInterval(id)
  }, [currentStep, paymentReturn])

  if (paymentReturn) {
    return <CardPaymentReturn reservationId={paymentReturn} />
  }

  const STEPS = mode === 'experience' ? STEPS_EXPERIENCE : STEPS_PACKAGE
  const StepComponent = STEPS[currentStep] ?? StepEscolha

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <ProgressBar currentStep={currentStep} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 xl:px-10 pt-24 sm:pt-28 pb-20 sm:pb-16">
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
