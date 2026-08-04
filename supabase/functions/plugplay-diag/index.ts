import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { isConfigured, suitesStatus, PLUGPLAY_BASE } from '../_shared/plugplay.ts'
import { exigirAdmin } from '../_shared/adminAuth.ts'

// Diagnóstico da integração PlugPlay. Existe por um motivo prático: sem saber
// os ids das suítes do lado do PMS, não dá pra preencher suites.pms_suite_id,
// e sem esse mapeamento a integração inteira fica parada.
//
// Devolve o que o PMS conhece + o que já está mapeado aqui, lado a lado.
//
// Exige JWT de admin logado via `exigirAdmin`. A ausência em config.toml não
// bastava: no self-host o `VERIFY_JWT` do edge-runtime é global e está
// desligado, então esta função respondeu 200 sem header nenhum entre 29/07 e
// 04/08/2026, expondo a topologia interna do motel. Ver _shared/adminAuth.ts.

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const auth = await exigirAdmin(req)
  if (!auth.ok) return auth.response

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: suites } = await supabase
    .from('suites')
    .select('id, name, room_number, pms_suite_id, pms_categoria_id, active')
    .order('sort_order')

  const mapeadas    = (suites ?? []).filter((s) => s.pms_suite_id || s.pms_categoria_id)
  const naoMapeadas = (suites ?? []).filter((s) => !s.pms_suite_id && !s.pms_categoria_id)

  const body: Record<string, unknown> = {
    configured: isConfigured(),
    baseUrl: PLUGPLAY_BASE,
    suites: {
      total: suites?.length ?? 0,
      mapeadas: mapeadas.length,
      naoMapeadas: naoMapeadas.map((s) => ({
        id: s.id, name: s.name, room_number: s.room_number,
      })),
    },
  }

  if (!isConfigured()) {
    body.hint = 'Defina PLUGPLAY_ID e PLUGPLAY_TOKEN no container functions.'
    return new Response(JSON.stringify(body, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Lista as suítes do PMS para casar com as nossas pelo número do quarto
  try {
    body.pmsSuites = await suitesStatus()
  } catch (e) {
    body.pmsError = e instanceof Error ? e.message : String(e)
  }

  // Fila de reservas pagas que ainda não subiram
  const { data: pendentes } = await supabase
    .from('pms_sync_pendentes')
    .select('id, created_at, check_in, suite_nome, pms_last_error')
    .limit(20)
  body.syncPendentes = pendentes ?? []

  return new Response(JSON.stringify(body, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  })
})
