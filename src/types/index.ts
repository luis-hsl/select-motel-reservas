export type PackageName = 'ouro' | 'prata' | 'bronze'
export type ReservationType = 'period' | 'overnight' | 'diaria'
export type SuiteSize = 'large' | 'small'
export type SuiteCategory = 'VIP Piscina' | 'Hidro' | 'Hidro Light' | 'Standard'

export interface Package {
  id: PackageName
  label: string
  tagline: string
  includes: string[]
  note?: string
  price_period: number
  price_overnight: number
  highlighted?: boolean
}

export interface Suite {
  id: string
  name: string
  category: SuiteCategory
  description: string
  size: SuiteSize
  cleaning_buffer_h: number
  room_number: number
  packageIds: PackageName[]
  /** Preço base oculto quando o cliente está montando a Experiência (modo a la carte). */
  price_period_alacarte?:    number | null
  price_overnight_alacarte?: number | null
}

export type ReservationMode = 'package' | 'experience' | 'suite'

export type ItemCategory = 'food' | 'drink' | 'extra'

export interface ExperienceItem {
  id:          string
  category:    ItemCategory
  label:       string
  description?: string | null
  price:       number   // 0 no modo pacote (incluso); >0 no modo experiência
  photo_url?:  string | null
  sort_order:  number
}

export interface ReservationState {
  package: Package | null
  type: ReservationType | null
  suite: Suite | null
  checkIn: Date | null
  customerName: string
  customerPhone: string
  customerEmail: string
  totalAmount: number
}
