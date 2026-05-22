import type { Package, Suite } from '../types'

export const PACKAGES: Package[] = [
  {
    id: 'ouro',
    label: 'Pacote Ouro',
    tagline: 'A experiência completa',
    highlighted: true,
    includes: [
      'Decoração romântica',
      'Jantar ou Sushi',
      'Fondue',
      'Entrada (somente para jantar)',
      'Vinho ou frisante',
    ],
    note: 'Ao escolher Sushi, a entrada não está inclusa.',
    price_period: 1200,
    price_overnight: 2500,
  },
  {
    id: 'prata',
    label: 'Pacote Prata',
    tagline: 'Requinte e sabor',
    includes: [
      'Decoração romântica',
      'Fondue',
      'Pizza ou pratos',
      'Vinho ou frisante',
    ],
    price_period: 800,
    price_overnight: 2000,
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
    price_period: 600,
    price_overnight: 1500,
  },
]

export const SUITES: Suite[] = [
  { id: 'master', name: 'Suíte Master', description: 'Espaçosa com banheira e hidromassagem', size: 'large', cleaning_buffer_h: 2 },
  { id: 'luxo', name: 'Suíte Luxo', description: 'Conforto e elegância com cama king', size: 'large', cleaning_buffer_h: 2 },
  { id: 'classic', name: 'Suíte Clássica', description: 'Aconchegante com todo o necessário', size: 'small', cleaning_buffer_h: 1 },
  { id: 'romantica', name: 'Suíte Romântica', description: 'Decoração especial para casais', size: 'small', cleaning_buffer_h: 1 },
]

// Valentine's week — June 9 to June 12, 2026
export const PROMO_START = new Date(2026, 5, 9)
export const PROMO_END   = new Date(2026, 5, 12)

export const PERIOD_SLOTS  = ['14:00', '16:00', '18:00', '20:00']
export const OVERNIGHT_CHECKIN = '21:00'
