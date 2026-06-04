import './index.css'
import { useMemo, useEffect } from 'react'
import { trackStep } from './lib/tracking'
import ProgressBar from './components/ProgressBar'
import ReservaSidebar from './components/ReservaSidebar'
import CardPaymentReturn from './components/CardPaymentReturn'
import StepPacote from './pages/StepPacote'
import StepTipo from './pages/StepTipo'
import StepData from './pages/StepData'
import StepSuite from './pages/StepSuite'
import StepRefeicao from './pages/StepRefeicao'
import StepBebida from './pages/StepBebida'
import StepPresente from './pages/StepPresente'
import StepDados from './pages/StepDados'
import StepPagamento from './pages/StepPagamento'
import { useStore } from './store/useStore'

const STEPS: Record<number, React.ComponentType> = {
  1: StepPacote,
  2: StepTipo,
  3: StepData,
  4: StepSuite,
  5: StepRefeicao,
  6: StepBebida,
  7: StepPresente,
  8: StepDados,
  9: StepPagamento,
}

export default function App() {
  const { currentStep } = useStore()

  // Detect return from AbacatePay card payment page
  const paymentReturn = useMemo(() => {
    const p = new URLSearchParams(window.location.search)
    const ref = p.get('ref')
    return p.get('payment') === 'ok' && ref ? ref : null
  }, [])

  // Tracking anônimo do onboarding — só quando estiver no fluxo normal,
  // não na tela de retorno do pagamento (que já foi convertida).
  useEffect(() => {
    if (paymentReturn) return
    trackStep(currentStep)
  }, [currentStep, paymentReturn])

  // Heartbeat a cada 30s pra manter sessão "ativa" no painel admin
  useEffect(() => {
    if (paymentReturn) return
    const id = setInterval(() => trackStep(currentStep), 30_000)
    return () => clearInterval(id)
  }, [currentStep, paymentReturn])

  if (paymentReturn) {
    return <CardPaymentReturn reservationId={paymentReturn} />
  }

  const StepComponent = STEPS[currentStep] ?? StepPacote

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
    </div>
  )
}
