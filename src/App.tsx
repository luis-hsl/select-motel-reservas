import './index.css'
import ProgressBar from './components/ProgressBar'
import ReservaSidebar from './components/ReservaSidebar'
import StepPacote from './pages/StepPacote'
import StepTipo from './pages/StepTipo'
import StepSuite from './pages/StepSuite'
import StepData from './pages/StepData'
import StepDados from './pages/StepDados'
import StepPagamento from './pages/StepPagamento'
import { useStore } from './store/useStore'

const STEPS: Record<number, React.ComponentType> = {
  1: StepPacote,
  2: StepTipo,
  3: StepSuite,
  4: StepData,
  5: StepDados,
  6: StepPagamento,
}

export default function App() {
  const { currentStep } = useStore()
  const StepComponent = STEPS[currentStep] ?? StepPacote

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <ProgressBar currentStep={currentStep} />

      <div className="max-w-5xl mx-auto px-6 pt-24 pb-16">
        <div className="flex gap-12 items-start">
          {/* Main content */}
          <main className="flex-1 min-w-0">
            <StepComponent />
          </main>

          {/* Sidebar */}
          <ReservaSidebar />
        </div>
      </div>
    </div>
  )
}
