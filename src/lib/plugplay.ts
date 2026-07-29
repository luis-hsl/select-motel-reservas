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
