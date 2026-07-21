import type { SuiteCategory } from '../types'

export interface SuiteCategoryDef {
  id: string
  label: string
  dbCategory: SuiteCategory
  description: string
  prices: {
    oneHour?: number  // apenas Standard
    period: number    // 2h
    overnight: number // ~12h
    diaria: number    // 24h
  }
}

export const SUITE_CATEGORIES: SuiteCategoryDef[] = [
  {
    id: 'standard',
    label: 'Suíte Tradicional',
    dbCategory: 'Standard',
    description: 'Conforto e privacidade com tudo que vocês precisam.',
    prices: { oneHour: 75, period: 95, overnight: 150, diaria: 260 },
  },
  {
    id: 'hidro',
    label: 'Suíte Hidro',
    dbCategory: 'Hidro',
    description: 'Hidromassagem, 2 quartos, Roleta Erótica, TV Smart e frigobar.',
    prices: { period: 180, overnight: 310, diaria: 400 },
  },
  {
    id: 'hidrolite',
    label: 'Hidrolite',
    dbCategory: 'Hidrolite',
    description: 'Banheira de hidromassagem para relaxar juntos.',
    prices: { period: 130, overnight: 220, diaria: 310 },
  },
  {
    id: 'vip-piscina',
    label: 'VIP Piscina',
    dbCategory: 'VIP Piscina',
    description: 'Piscina privativa exclusiva para vocês dois.',
    prices: { period: 200, overnight: 490, diaria: 590 },
  },
]
