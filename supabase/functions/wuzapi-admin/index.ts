import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

// Proxy admin para a API do Wuzapi.
// Valida o JWT do user logado (precisa estar autenticado no Supabase)
// e usa o WUZAPI_USER_TOKEN interno para chamar a Wuzapi.
//
// Endpoints (action via query string):
//   GET  ?action=status                       → status da sessao
//   POST ?action=connect                      → conecta sessao
//   GET  ?action=qr                           → { qr: "data:image/png;base64,..." }
//   POST ?action=pair       body {phone}      → { code: "XXXX-XXXX" }  (pareamento por codigo)
//   POST ?action=disconnect                   → desconecta
//   POST ?action=logout                       → logout (encerra sessao)

const WUZAPI_URL        = Deno.env.get('WUZAPI_URL')        // ex: http://wuzapi:8080
const WUZAPI_USER_TOKEN = Deno.env.get('WUZAPI_USER_TOKEN')

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  }
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  })
}

async function wuz(path: string, init: RequestInit = {}): Promise<Response> {
  const url = `${WUZAPI_URL!.replace(/\/$/, '')}${path}`
  return fetch(url, {
    ...init,
    headers: { 'token': WUZAPI_USER_TOKEN!, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() })

  if (!WUZAPI_URL || !WUZAPI_USER_TOKEN) {
    return json({ error: 'wuzapi not configured' }, 500)
  }

  // ----- Auth: precisa de JWT valido (qualquer user logado) -----
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return json({ error: 'unauthorized' }, 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  )
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return json({ error: 'unauthorized' }, 401)

  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  try {
    if (action === 'status' && req.method === 'GET') {
      const r = await wuz('/session/status', { method: 'GET' })
      const body = await r.json()
      return json(body.data ?? body, r.status)
    }

    if (action === 'connect' && req.method === 'POST') {
      const r = await wuz('/session/connect', {
        method: 'POST',
        body: JSON.stringify({ Subscribe: ['Message', 'ReadReceipt'], Immediate: true }),
      })
      return json(await r.json(), r.status)
    }

    if (action === 'qr' && req.method === 'GET') {
      const r = await wuz('/session/qr', { method: 'GET' })
      const body = await r.json()
      const qr = body?.data?.QRCode ?? ''
      return json({ qr }, r.status)
    }

    if (action === 'pair' && req.method === 'POST') {
      const { phone } = await req.json() as { phone?: string }
      if (!phone) return json({ error: 'missing phone' }, 422)
      const digits = phone.replace(/\D/g, '')
      const r = await wuz('/session/pairphone', {
        method: 'POST',
        body: JSON.stringify({ Phone: digits.startsWith('55') ? digits : `55${digits}` }),
      })
      const body = await r.json()
      const code = body?.data?.LinkingCode ?? body?.data?.linkingCode ?? ''
      return json({ code, raw: body }, r.status)
    }

    if (action === 'disconnect' && req.method === 'POST') {
      const r = await wuz('/session/disconnect', { method: 'POST' })
      return json(await r.json(), r.status)
    }

    if (action === 'logout' && req.method === 'POST') {
      const r = await wuz('/session/logout', { method: 'POST' })
      return json(await r.json(), r.status)
    }

    return json({ error: 'unknown action' }, 400)
  } catch (e) {
    console.error('wuzapi-admin error', e)
    return json({ error: String(e) }, 500)
  }
})
