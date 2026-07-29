import { supabase } from './supabase'

// Ponte para o PMS do motel (MotelMais PlugPlay), sempre via edge function —
// o token do PMS não pode chegar ao browser.

export interface DisponibilidadeResponse {
  configured: boolean
  unavailableSuiteIds: string[]
  checked: number
  errors: number
}

/**
 * Suítes que o PMS considera ocupadas no intervalo.
 *
 * Complementa a checagem local: o banco do site só conhece as reservas que ele
 * mesmo criou, enquanto o PMS enxerga walk-in, manutenção e reserva por
 * telefone. Sem isso o cliente consegue pagar por uma suíte já ocupada.
 *
 * Nunca lança: se a integração estiver desligada ou o PMS fora do ar, devolve
 * conjunto vazio e o fluxo segue com a informação local.
 */
export async function fetchPmsUnavailableSuites(
  checkIn: Date,
  checkOut: Date,
  suiteIds?: string[],
): Promise<Set<string>> {
  try {
    const { data, error } = await supabase.functions.invoke<DisponibilidadeResponse>(
      'plugplay-disponibilidade',
      {
        body: {
          checkIn:  checkIn.toISOString(),
          checkOut: checkOut.toISOString(),
          ...(suiteIds?.length ? { suiteIds } : {}),
        },
      },
    )

    if (error || !data?.configured) return new Set()
    return new Set(data.unavailableSuiteIds ?? [])
  } catch {
    return new Set()
  }
}

export interface SlotAvailability {
  available: number
  suiteIds: string[]
}

export interface DayMapResponse {
  configured: boolean
  degradado?: boolean
  totalSuites?: number
  slots: Record<string, SlotAvailability>
}

/**
 * Quantas suítes o PMS tem livres em cada horário de um dia.
 *
 * Uma chamada cobre a grade inteira: a edge function cruza as reservas e o
 * status atual do PMS localmente, em vez de consultar suíte por suíte (24
 * slots × 13 suítes seriam 312 chamadas).
 *
 * Devolve `null` quando não há informação — integração desligada, PMS fora do
 * ar ou erro. O chamador deve tratar `null` como "sem dado" e não como
 * "esgotado", senão uma instabilidade do ERP derruba a grade toda.
 */
export async function fetchPmsDayMap(
  date: Date,
  durationHours: number,
  slots: string[],
): Promise<DayMapResponse | null> {
  const iso = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')

  try {
    const { data, error } = await supabase.functions.invoke<DayMapResponse>(
      'plugplay-mapa-dia',
      { body: { date: iso, durationHours, slots } },
    )
    if (error || !data?.configured) return null
    return data
  } catch {
    return null
  }
}
