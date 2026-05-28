import { create } from 'zustand'
import type { Package, Suite, ReservationType } from '../types'

interface StoreState {
  currentStep: number
  package: Package | null
  drink: 'vinho' | 'frisante' | null
  food: 'jantar' | 'sushi' | null
  type: ReservationType | null
  suite: Suite | null
  checkIn: Date | null
  customerName: string
  customerPhone: string
  customerEmail: string

  setStep: (step: number) => void
  setPackage: (pkg: Package) => void
  setDrink: (drink: 'vinho' | 'frisante') => void
  setFood: (food: 'jantar' | 'sushi') => void
  setType: (type: ReservationType) => void
  setSuite: (suite: Suite) => void
  setCheckIn: (date: Date) => void
  setCustomer: (name: string, phone: string, email: string) => void
  totalAmount: () => number
  checkOut: () => Date | null
  nextStep: () => void
  prevStep: () => void
}

export const useStore = create<StoreState>((set, get) => ({
  currentStep: 1,
  package: null,
  drink: null,
  food: null,
  type: null,
  suite: null,
  checkIn: null,
  customerName: '',
  customerPhone: '',
  customerEmail: '',

  setStep: (step) => set({ currentStep: step }),
  setPackage: (pkg) => set({ package: pkg }),
  setDrink: (drink) => set({ drink }),
  setFood: (food) => set({ food }),
  setType: (type) => set({ type }),
  setSuite: (suite) => set({ suite }),
  setCheckIn: (date) => set({ checkIn: date, suite: null }),
  setCustomer: (customerName, customerPhone, customerEmail) =>
    set({ customerName, customerPhone, customerEmail }),

  totalAmount: () => {
    const { package: pkg, type } = get()
    if (!pkg || !type) return 0
    return type === 'period' ? pkg.price_period : pkg.price_overnight
  },

  checkOut: () => {
    const { checkIn, type } = get()
    if (!checkIn || !type) return null
    const out = new Date(checkIn)
    out.setHours(out.getHours() + (type === 'period' ? 2 : 12))
    return out
  },

  nextStep: () => set((s) => {
    const next = s.currentStep + 1
    // Refeição (5): só Ouro — Prata vai para Bebida (6), Bronze pula para Presente (7)
    if (next === 5 && s.package?.id !== 'ouro') {
      return { currentStep: s.package?.id === 'bronze' ? 7 : 6 }
    }
    // Bebida (6): Bronze pula para Presente (7)
    if (next === 6 && s.package?.id === 'bronze') return { currentStep: 7 }
    return { currentStep: next }
  }),
  prevStep: () => set((s) => {
    const prev = s.currentStep - 1
    // Voltando de Bebida (6): Prata pula Refeição → vai para Suíte (4)
    if (prev === 5 && s.package?.id === 'prata') return { currentStep: 4 }
    // Voltando de Presente (7): Bronze pula Bebida e Refeição → vai para Suíte (4)
    if (prev === 6 && s.package?.id === 'bronze') return { currentStep: 4 }
    return { currentStep: Math.max(1, prev) }
  }),
}))

export const TOTAL_STEPS = 9
