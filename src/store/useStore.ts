import { create } from 'zustand'
import type { Package, Suite, SuiteCategory, ReservationType, ReservationMode, ExperienceItem } from '../types'
import { SUITE_CATEGORIES } from '../data/suiteCategories'

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

  // ────── SUITE MODE ──────
  suiteCategory: SuiteCategory | null

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
  setSuiteCategory: (cat: SuiteCategory) => void
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
  suiteCategory: null,
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
  setSuiteCategory: (suiteCategory) => set({ suiteCategory }),
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
    const { mode, package: pkg, type, suite, suiteCategory, selectedItems } = get()
    if (!type) return 0

    // ─── Modo Pacote: preço fixo do pacote por tipo ───
    if (mode === 'package' || (!mode && pkg)) {
      if (!pkg) return 0
      return type === 'period' ? pkg.price_period : pkg.price_overnight
    }

    // ─── Modo Suíte: preço por categoria + tipo + extras ───
    if (mode === 'suite') {
      if (!suiteCategory) return 0
      const cat = SUITE_CATEGORIES.find(c => c.dbCategory === suiteCategory)
      if (!cat) return 0
      const suitePrice =
        type === 'oneHour'   ? (cat.prices.oneHour ?? 0) :
        type === 'period'    ? cat.prices.period :
        type === 'overnight' ? cat.prices.overnight :
        type === 'diaria'    ? cat.prices.diaria : 0
      const extrasTotal = selectedItems.reduce((sum, i) => sum + Number(i.price || 0), 0)
      return suitePrice + extrasTotal
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
    const hours = type === 'oneHour' ? 1 : type === 'period' ? 2 : type === 'diaria' ? 24 : 12
    out.setHours(out.getHours() + hours)
    return out
  },

  nextStep: () => set((s) => ({ currentStep: s.currentStep + 1 })),
  prevStep: () => set((s) => ({ currentStep: Math.max(1, s.currentStep - 1) })),
}))

// Total de steps muda por modo (StepDados foi fundido inline no StepEscolha):
//   Pacote:     Escolha → Pacote → Tipo → Data → Suíte → Extras → Pagamento  (7)
//   Suite:      Escolha → Categoria → Suíte → Data → Extras → Pagamento      (6) — duração na etapa 2
//   Experiência:Escolha → Tipo  → Data → Suíte → Extras → Pagamento          (6)
export const TOTAL_STEPS_BY_MODE: Record<ReservationMode, number> = {
  package:    7,
  experience: 6,
  suite:      6,
}

/** Retorna o total de steps com base no mode escolhido (default 7 enquanto não escolheu). */
export function getTotalSteps(mode: ReservationMode | null): number {
  return mode ? TOTAL_STEPS_BY_MODE[mode] : 7
}

// Mantido pra compatibilidade com imports antigos
export const TOTAL_STEPS = 7
