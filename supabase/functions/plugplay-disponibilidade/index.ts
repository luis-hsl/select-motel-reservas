import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  disponibilidadePorSuite,
  isConfigured,
  toPmsDateTime,
} from '../_shared/plugplay.ts'

// Consulta a disponibilidade real no PMS antes de fechar a venda.
//
// O site já sabe o que ele mesmo vendeu (get_occupied_suite_ids), mas não
// enxerga walk-in da recepção, bloqueio de manutenção nem reserva feita por
// telefone. Sem isto o cliente paga por uma suíte que está ocupada.
//
// Chamada do browser, então o token do PMS nunca sai daqui.
//
// Body: { checkIn: ISO, checkOut: ISO, suiteIds?: string[] }
// Resp: { configured, unavailableSuiteIds, checked, errors }

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Chamadas simultâneas ao PMS. Ele é um ERP de motel, não uma API elástica. */
const CONCURRENCY = 5

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/** Executa `worker` sobre `items` com no máximo `limit` em voo. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      out[i] = await worker(items[i])
    }
  })
  await Promise.all(runners)
  return out
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  let checkIn: string, checkOut: string, suiteIds: string[] | undefined
  try {
    const body = await req.json()
    checkIn  = body?.checkIn
    checkOut = body?.checkOut
    suiteIds = Array.isArray(body?.suiteIds) ? body.suiteIds : undefined
  } catch {
    return json({ error: 'invalid json' }, 400)
  }

  if (!checkIn || !checkOut) {
    return json({ error: 'checkIn e checkOut obrigatórios' }, 400)
  }

  let entrada: string, saida: string
  try {
    entrada = toPmsDateTime(checkIn)
    saida   = toPmsDateTime(checkOut)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'datas inválidas' }, 400)
  }

  // Integração desligada: devolve vazio em vez de erro. O front trata isso
  // como "sem informação do PMS" e segue com a checagem local.
  if (!isConfigured()) {
    return json({ configured: false, unavailableSuiteIds: [], checked: 0, errors: 0 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let q = supabase
    .from('suites')
    .select('id, pms_suite_id')
    .eq('active', true)
    .not('pms_suite_id', 'is', null)
  if (suiteIds?.length) q = q.in('id', suiteIds)

  const { data: suites, error } = await q.returns<{ id: string; pms_suite_id: number }[]>()

  if (error) {
    console.error('Erro lendo suites:', error)
    return json({ error: 'db read failed' }, 500)
  }
  if (!suites?.length) {
    return json({ configured: true, unavailableSuiteIds: [], checked: 0, errors: 0 })
  }

  const results = await mapLimit(suites, CONCURRENCY, async (s) => {
    try {
      const r = await disponibilidadePorSuite(s.pms_suite_id, entrada, saida)
      return { id: s.id, disponivel: r?.disponivel !== false, erro: false }
    } catch (e) {
      // PMS fora do ar não pode bloquear a venda: na dúvida, deixa passar e
      // deixa a checagem local decidir. Bloquear tudo seria pior que o bug.
      console.warn('Disponibilidade falhou para suite', s.id, e instanceof Error ? e.message : e)
      return { id: s.id, disponivel: true, erro: true }
    }
  })

  const unavailableSuiteIds = results.filter((r) => !r.disponivel).map((r) => r.id)
  const errors = results.filter((r) => r.erro).length

  return json({
    configured: true,
    unavailableSuiteIds,
    checked: results.length,
    errors,
  })
})
