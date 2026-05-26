export type PackageName = 'ouro' | 'prata' | 'bronze'
export type ReservationType = 'period' | 'overnight'
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
