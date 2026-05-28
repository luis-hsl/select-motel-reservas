import { create } from 'zustand'
import type { Package, Suite, ReservationType } from '../types'

interface StoreState {
  currentStep: number
  package: Package | null
  type: ReservationType | null
  suite: Suite | null
  checkIn: Date | null
  customerName: string
  customerPhone: string
  customerEmail: string

  setStep: (step: number) => void
  setPackage: (pkg: Package) => void
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
  type: null,
  suite: null,
  checkIn: null,
  customerName: '',
  customerPhone: '',
  customerEmail: '',

  setStep: (step) => set({ currentStep: step }),
  setPackage: (pkg) => set({ package: pkg }),
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

  nextStep: () => set((s) => ({ currentStep: s.currentStep + 1 })),
  prevStep: () => set((s) => ({ currentStep: Math.max(1, s.currentStep - 1) })),
}))

export const TOTAL_STEPS = 6
