import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

// Recebe eventos anônimos do checkout do site público.
// Cada evento tem: session_token (uuid gerado no client e persistido em localStorage)
// + step (1..9) + meta opcional (ua, referrer, utm, landing).
//
// Comportamento:
//   - cria a sessão na primeira chamada (UPSERT por session_token)
//   - atualiza current_step / max_step / last_active_at em chamadas subsequentes
//   - hasheia o IP com SHA-256 (não armazena IP cru — LGPD)
//
// CORS aberto pra qualquer origem (é evento client-side de site público).

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

function detectDevice(ua: string): 'mobile' | 'tablet' | 'desktop' {
  const s = (ua ?? '').toLowerCase()
  if (/\b(ipad|tablet|playbook|kindle)\b/.test(s)) return 'tablet'
  if (/\b(mobile|iphone|android|phone|ipod|blackberry)\b/.test(s)) return 'mobile'
  return 'desktop'
}

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
}

const IP_SALT = Deno.env.get('TRACKING_IP_SALT') ?? 'select-motel-default-salt'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST')   return new Response('Method Not Allowed', { status: 405 })

  let body: {
    session_token?: string
    step?: number
    mode?: 'package' | 'experience' | null
    user_agent?: string
    referrer?: string
    landing_path?: string
    utm?: Record<string, string | undefined>
  }
  try { body = await req.json() } catch { return json({ error: 'bad json' }, 400) }

  const session_token = (body.session_token ?? '').trim()
  if (!session_token || session_token.length < 8 || session_token.length > 64) {
    return json({ error: 'invalid session_token' }, 422)
  }
  const step = Math.max(1, Math.min(9, Number(body.step ?? 1) | 0))
  const mode = body.mode === 'package' || body.mode === 'experience' ? body.mode : null

  // Hash do IP
  const xff = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  const ip_hash = await sha256Hex(`${IP_SALT}:${xff}`)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Verifica se a sessão já existe
  const { data: existing } = await supabase
    .from('onboarding_sessions')
    .select('id, current_step, max_step, steps_history')
    .eq('session_token', session_token)
    .maybeSingle<{
      id: string
      current_step: number
      max_step: number
      steps_history: Array<{ step: number; at: string }>
    }>()

  const now = new Date().toISOString()

  if (existing) {
    const lastStep = existing.steps_history?.[existing.steps_history.length - 1]?.step
    const history = lastStep !== step
      ? [...(existing.steps_history ?? []), { step, at: now }]
      : existing.steps_history
    const max_step = Math.max(existing.max_step ?? 1, step)

    // Só atualiza mode se cliente mandou um valor explícito — evita sobrescrever
    // pra null em pings posteriores que não conhecem o modo.
    const update: Record<string, unknown> = {
      current_step: step,
      max_step,
      last_active_at: now,
      steps_history: history.slice(-60),  // cap histórico pra não estourar
    }
    if (mode) update.mode = mode

    await supabase
      .from('onboarding_sessions')
      .update(update)
      .eq('id', existing.id)
    return json({ ok: true, mode: 'update' })
  }

  // Cria sessão nova
  const user_agent = body.user_agent ?? req.headers.get('user-agent') ?? ''
  const device     = detectDevice(user_agent)
  const utm        = body.utm ?? {}

  const { error } = await supabase
    .from('onboarding_sessions')
    .insert({
      session_token,
      current_step:  step,
      max_step:      step,
      mode,
      steps_history: [{ step, at: now }],
      user_agent,
      device,
      referrer:      body.referrer     ?? null,
      landing_path:  body.landing_path ?? null,
      utm_source:    utm.source        ?? null,
      utm_medium:    utm.medium        ?? null,
      utm_campaign:  utm.campaign      ?? null,
      utm_content:   utm.content       ?? null,
      utm_term:      utm.term          ?? null,
      ip_hash,
    })

  if (error) {
    console.error('insert error', error)
    return json({ error: 'insert failed' }, 500)
  }
  return json({ ok: true, mode: 'created' })
})
