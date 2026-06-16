import type { Package, Suite } from '../types'

export const PACKAGES: Package[] = [
  {
    id: 'ouro',
    label: 'Pacote Ouro',
    tagline: 'A experiência completa',
    includes: [
      'Decoração romântica',
      'Jantar completo (com entrada) — ou Sushi',
      'Fondue de chocolate',
      'Vinho ou frisante',
    ],
    note: 'Ao escolher Sushi, a entrada não está inclusa.',
    price_period: 1199,
    price_overnight: 2499,
  },
  {
    id: 'prata',
    label: 'Pacote Prata',
    tagline: 'Requinte e sabor',
    highlighted: true,
    includes: [
      'Decoração romântica',
      'Fondue',
      'Pizza ou pratos',
      'Vinho ou frisante',
    ],
    price_period: 799,
    price_overnight: 1999,
  },
  {
    id: 'bronze',
    label: 'Pacote Bronze',
    tagline: 'Clássico e especial',
    includes: [
      'Decoração romântica',
      'Fondue',
      'Pizza',
      'Drink',
    ],
    price_period: 599,
    price_overnight: 1499,
  },
]

export const SUITES: Suite[] = [
  // ── Pacote Ouro ─────────────────────────────────────────
  { id: 'suite-14', name: 'Suíte 14', category: 'VIP Piscina', description: 'Suíte VIP com piscina privativa', room_number: 14, size: 'large', cleaning_buffer_h: 1, packageIds: ['ouro'] },
  { id: 'suite-16', name: 'Suíte 16', category: 'VIP Piscina', description: 'Suíte VIP com piscina privativa', room_number: 16, size: 'large', cleaning_buffer_h: 1, packageIds: ['ouro'] },

  // ── Pacote Prata ─────────────────────────────────────────
  { id: 'suite-15', name: 'Suíte 15', category: 'Hidro Light', description: 'Suíte com banheira de hidromassagem', room_number: 15, size: 'large', cleaning_buffer_h: 1, packageIds: ['prata'] },
  { id: 'suite-18', name: 'Suíte 18', category: 'Hidro Light', description: 'Suíte com banheira de hidromassagem', room_number: 18, size: 'large', cleaning_buffer_h: 1, packageIds: ['prata'] },

  // ── Pacote Bronze · Hidro Light ──────────────────────────
  { id: 'suite-12', name: 'Suíte 12', category: 'Hidro Light', description: 'Suíte com hidromassagem compacta', room_number: 12, size: 'small', cleaning_buffer_h: 1, packageIds: ['bronze'] },
  { id: 'suite-13', name: 'Suíte 13', category: 'Hidro Light', description: 'Suíte com hidromassagem compacta', room_number: 13, size: 'small', cleaning_buffer_h: 1, packageIds: ['bronze'] },

  // ── Pacote Bronze · Standard ─────────────────────────────
  { id: 'suite-11', name: 'Suíte 11', category: 'Standard', description: 'Suíte confortável e aconchegante', room_number: 11, size: 'small', cleaning_buffer_h: 1, packageIds: ['bronze'] },
  { id: 'suite-17', name: 'Suíte 17', category: 'Standard', description: 'Suíte confortável e aconchegante', room_number: 17, size: 'small', cleaning_buffer_h: 1, packageIds: ['bronze'] },
  { id: 'suite-22', name: 'Suíte 22', category: 'Standard', description: 'Suíte confortável e aconchegante', room_number: 22, size: 'small', cleaning_buffer_h: 1, packageIds: ['bronze'] },
  { id: 'suite-23', name: 'Suíte 23', category: 'Standard', description: 'Suíte confortável e aconchegante', room_number: 23, size: 'small', cleaning_buffer_h: 1, packageIds: ['bronze'] },
  { id: 'suite-24', name: 'Suíte 24', category: 'Standard', description: 'Suíte confortável e aconchegante', room_number: 24, size: 'small', cleaning_buffer_h: 1, packageIds: ['bronze'] },
  { id: 'suite-25', name: 'Suíte 25', category: 'Standard', description: 'Suíte confortável e aconchegante', room_number: 25, size: 'small', cleaning_buffer_h: 1, packageIds: ['bronze'] },
  { id: 'suite-26', name: 'Suíte 26', category: 'Standard', description: 'Suíte confortável e aconchegante', room_number: 26, size: 'small', cleaning_buffer_h: 1, packageIds: ['bronze'] },
]

export const PERIOD_SLOTS = [
  '00:00', '01:00', '02:00', '03:00', '04:00', '05:00',
  '06:00', '07:00', '08:00', '09:00', '10:00', '11:00',
  '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
  '18:00', '19:00', '20:00', '21:00', '22:00', '23:00',
]
export const OVERNIGHT_CHECKIN = '00:00'

/** Retorna os próximos 90 dias a partir de hoje (inclusive). */
export function getAvailableDates(): Date[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dates: Date[] = []
  for (let i = 0; i < 90; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    dates.push(d)
  }
  return dates
}

export function calcCheckOut(checkIn: Date, type: 'period' | 'overnight' | 'diaria' | 'oneHour'): Date {
  const out = new Date(checkIn)
  const hours = type === 'oneHour' ? 1 : type === 'period' ? 2 : type === 'diaria' ? 24 : 12
  out.setHours(out.getHours() + hours)
  return out
}
