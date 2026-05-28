import './index.css'
import { useState, useEffect } from 'react'
import ProgressBar from './components/ProgressBar'
import ReservaSidebar from './components/ReservaSidebar'
import StepPacote from './pages/StepPacote'
import StepTipo from './pages/StepTipo'
import StepData from './pages/StepData'
import StepSuite from './pages/StepSuite'
import StepBebida from './pages/StepBebida'
import StepRefeicao from './pages/StepRefeicao'
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
  7: StepDados,
  8: StepPagamento,
}

export default function App() {
  const { currentStep } = useStore()
  const [shown, setShown] = useState(currentStep)
  const [phase, setPhase] = useState<'in' | 'out'>('in')

  useEffect(() => {
    if (currentStep === shown) return
    setPhase('out')
    const t = setTimeout(() => {
      setShown(currentStep)
      setPhase('in')
    }, 180)
    return () => clearTimeout(t)
  }, [currentStep])

  const StepComponent = STEPS[shown] ?? StepPacote

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <ProgressBar currentStep={currentStep} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 xl:px-10 pt-24 sm:pt-28 pb-20 sm:pb-16">
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 xl:gap-16 items-start">
          {/* Main content */}
          <main className="flex-1 min-w-0 w-full">
            <div key={shown} className={phase === 'out' ? 'step-out' : 'step-in'}>
              <StepComponent />
            </div>
          </main>

          {/* Sidebar — desktop only */}
          <ReservaSidebar />
        </div>
      </div>
    </div>
  )
}
