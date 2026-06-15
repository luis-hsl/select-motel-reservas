import type { SuiteCategory } from '../types'

export interface SuiteCategoryDef {
  id: string
  label: string
  dbCategory: SuiteCategory
  description: string
  prices: {
    period: number    // 2h
    overnight: number // ~12h
    diaria: number    // 24h
  }
}

export const SUITE_CATEGORIES: SuiteCategoryDef[] = [
  {
    id: 'standard',
    label: 'Tradicional',
    dbCategory: 'Standard',
    description: 'Conforto e privacidade com tudo que vocês precisam.',
    prices: { period: 95, overnight: 150, diaria: 260 },
  },
  {
    id: 'hidro-light',
    label: 'Hidro Light',
    dbCategory: 'Hidro Light',
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
