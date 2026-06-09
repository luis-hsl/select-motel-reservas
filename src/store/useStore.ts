import { create } from 'zustand'
import type { Package, Suite, ReservationType, ReservationMode, ExperienceItem } from '../types'

interface StoreState {
  currentStep: number
  mode: ReservationMode | null      // 'package' | 'experience' (set no StepEscolha)

  // ────── PACKAGE MODE ──────
  package: Package | null
  drink: 'vinho' | 'frisante' | 'drinque' | null
  food: 'jantar' | 'sushi' | 'pizza' | null
  jantarPrato: string | null
  jantarHorario: string | null
  fondueHorario: string | null      // horário do fondue (seção independente)

  // ────── EXPERIENCE MODE ──────
  // Items selecionados (cada um com seu preço, somam no total)
  selectedItems: ExperienceItem[]

  // ────── SHARED ──────
  type: ReservationType | null
  suite: Suite | null
  checkIn: Date | null
  customerName: string
  customerPhone: string
  customerEmail: string
  customerTaxId: string
  observations: string
  consentAt: string | null

  // ────── SETTERS ──────
  setStep: (step: number) => void
  setMode: (mode: ReservationMode) => void
  setPackage: (pkg: Package) => void
  setDrink: (drink: 'vinho' | 'frisante' | 'drinque') => void
  setFood: (food: 'jantar' | 'sushi' | 'pizza') => void
  setJantarPrato: (prato: string | null) => void
  setJantarHorario: (horario: string | null) => void
  setFondueHorario: (horario: string | null) => void
  setType: (type: ReservationType) => void
  setSuite: (suite: Suite) => void
  setCheckIn: (date: Date) => void
  setCustomer: (name: string, phone: string, email: string, taxId: string) => void
  setObservations: (obs: string) => void
  setConsentAt: (iso: string) => void
  toggleItem: (item: ExperienceItem) => void
  clearItems: () => void
  reset: () => void

  // ────── COMPUTED ──────
  totalAmount: () => number
  checkOut: () => Date | null
  nextStep: () => void
  prevStep: () => void
}

const INITIAL = {
  currentStep: 1,
  mode: null,
  package: null,
  drink: null,
  food: null,
  jantarPrato: null,
  jantarHorario: null,
  fondueHorario: null,
  selectedItems: [] as ExperienceItem[],
  type: null,
  suite: null,
  checkIn: null,
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  customerTaxId: '',
  observations: '',
  consentAt: null,
}

export const useStore = create<StoreState>((set, get) => ({
  ...INITIAL,

  setStep: (step) => set({ currentStep: step }),
  setMode: (mode) => set({ mode }),
  setPackage: (pkg) => set({ package: pkg }),
  setDrink: (drink) => set({ drink }),
  setFood: (food) => set({ food, jantarPrato: null, jantarHorario: null }),
  setJantarPrato: (jantarPrato) => set({ jantarPrato }),
  setJantarHorario: (jantarHorario) => set({ jantarHorario }),
  setFondueHorario: (fondueHorario) => set({ fondueHorario }),
  setType: (type) => set({ type }),
  setSuite: (suite) => set({ suite }),
  setCheckIn: (date) => set({ checkIn: date, suite: null }),
  setCustomer: (customerName, customerPhone, customerEmail, customerTaxId) =>
    set({ customerName, customerPhone, customerEmail, customerTaxId }),
  setObservations: (observations) => set({ observations }),
  setConsentAt: (consentAt) => set({ consentAt }),

  toggleItem: (item) => set((s) => {
    const exists = s.selectedItems.find((i) => i.id === item.id)
    return {
      selectedItems: exists
        ? s.selectedItems.filter((i) => i.id !== item.id)
        : [...s.selectedItems, item],
    }
  }),
  clearItems: () => set({ selectedItems: [] }),
  reset: () => set(INITIAL),

  totalAmount: () => {
    const { mode, package: pkg, type, suite, selectedItems } = get()
    if (!type) return 0

    // ─── Modo Pacote: preço fixo do pacote por tipo ───
    if (mode === 'package' || (!mode && pkg)) {
      if (!pkg) return 0
      return type === 'period' ? pkg.price_period : pkg.price_overnight
    }

    // ─── Modo Experiência: suíte + itens ───
    if (mode === 'experience') {
      const suitePrice = !suite ? 0
        : type === 'period'
          ? Number(suite.price_period_alacarte ?? 0)
          : Number(suite.price_overnight_alacarte ?? 0)
      const itemsTotal = selectedItems.reduce((sum, i) => sum + Number(i.price || 0), 0)
      return suitePrice + itemsTotal
    }

    return 0
  },

  checkOut: () => {
    const { checkIn, type } = get()
    if (!checkIn || !type) return null
    const out = new Date(checkIn)
    out.setHours(out.getHours() + (type === 'period' ? 2 : 12))
    return out
  },

  nextStep: () => set((s) => ({ currentStep: s.currentStep + 1 })),
  prevStep: () => set((s) => ({ currentStep: Math.max(1, s.currentStep - 1) })),
}))

// Total de steps muda por modo:
//   Pacote:     Escolha → Pacote → Tipo → Data → Suíte → Extras → Dados → Pagamento  (8)
//   Experiência:Escolha → Tipo  → Data → Suíte → Cardápio → Dados → Pagamento        (7)
export const TOTAL_STEPS_BY_MODE: Record<ReservationMode, number> = {
  package:    8,
  experience: 7,
}

/** Retorna o total de steps com base no mode escolhido (default 8 enquanto não escolheu). */
export function getTotalSteps(mode: ReservationMode | null): number {
  return mode ? TOTAL_STEPS_BY_MODE[mode] : 8
}

// Mantido pra compatibilidade com imports antigos
export const TOTAL_STEPS = 8
