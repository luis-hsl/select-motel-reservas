import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

// Meta Conversions API — eventos server-side pra Pixel 1995965144620808.
// Resiste a adblock e iOS 14+ ATT. Recomendado pra Purchase e Lead.
//
// POST body:
//   {
//     "event_name": "Purchase" | "Lead" | "InitiateCheckout" | ...,
//     "event_id":   "<uuid>",         // mesmo gerado no client → DEDUP
//     "user_data":  { email, phone, name, city, state, country, zip, ip, ua },
//     "custom_data": { value, currency, content_ids, order_id, ... }
//     "event_source_url": "https://www.selectreservas.com.br/..."
//   }
//
// Secrets esperados (env do container functions):
//   META_PIXEL_ID
//   META_ACCESS_TOKEN
//   META_TEST_EVENT_CODE  (opcional — só pra debug em Events Manager → Test Events)

const PIXEL_ID     = Deno.env.get('META_PIXEL_ID')
const ACCESS_TOKEN = Deno.env.get('META_ACCESS_TOKEN')
const TEST_CODE    = Deno.env.get('META_TEST_EVENT_CODE')  // opcional

const CORS = {
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

// SHA-256 hex (Meta exige tudo em lowercase ANTES de hashear)
async function sha256Hex(s: string): Promise<string> {
  const buf  = new TextEncoder().encode(s.trim().toLowerCase())
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// Telefone só com dígitos, prefixo 55 obrigatório
function normalizePhoneBR(raw: string): string {
  const d = raw.replace(/\D/g, '')
  return d.startsWith('55') ? d : `55${d}`
}

interface UserData {
  email?:   string
  phone?:   string
  name?:    string  // "Luis Lima"
  city?:    string
  state?:   string  // "PR"
  country?: string  // default BR
  zip?:     string
  ip?:      string
  ua?:      string
  cpf?:     string  // external_id pra matching melhor
}

async function buildHashedUserData(u: UserData): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  if (u.email) out.em = [await sha256Hex(u.email)]
  if (u.phone) out.ph = [await sha256Hex(normalizePhoneBR(u.phone))]
  if (u.name) {
    const parts = u.name.trim().split(/\s+/)
    out.fn = [await sha256Hex(parts[0] ?? '')]
    if (parts.length > 1) out.ln = [await sha256Hex(parts[parts.length - 1])]
  }
  if (u.city)    out.ct = [await sha256Hex(u.city)]
  if (u.state)   out.st = [await sha256Hex(u.state)]
  if (u.zip)     out.zp = [await sha256Hex(u.zip.replace(/\D/g, ''))]
  if (u.country) out.country = [await sha256Hex(u.country)]
  else           out.country = [await sha256Hex('br')]
  if (u.cpf)     out.external_id = [await sha256Hex(u.cpf.replace(/\D/g, ''))]
  // IP e UA NÃO são hasheados (Meta exige plain)
  if (u.ip) out.client_ip_address = u.ip
  if (u.ua) out.client_user_agent = u.ua
  return out
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST')   return new Response('Method Not Allowed', { status: 405 })

  if (!PIXEL_ID || !ACCESS_TOKEN) {
    return json({ error: 'meta capi not configured' }, 500)
  }

  let body: {
    event_name?: string
    event_id?:   string
    user_data?:  UserData
    custom_data?: Record<string, unknown>
    event_source_url?: string
  }
  try { body = await req.json() } catch { return json({ error: 'bad json' }, 400) }

  if (!body.event_name) return json({ error: 'event_name required' }, 422)

  const user_data = await buildHashedUserData(body.user_data ?? {})

  const event = {
    event_name:       body.event_name,
    event_time:       Math.floor(Date.now() / 1000),
    event_id:         body.event_id,                       // dedup com pixel client-side
    action_source:    'website',
    event_source_url: body.event_source_url ?? 'https://www.selectreservas.com.br/',
    user_data,
    custom_data:      body.custom_data ?? {},
  }

  const payload: Record<string, unknown> = { data: [event] }
  if (TEST_CODE) payload.test_event_code = TEST_CODE

  const url = `https://graph.facebook.com/v18.0/${PIXEL_ID}/events?access_token=${encodeURIComponent(ACCESS_TOKEN)}`

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  })
  const text = await r.text()
  console.log(`Meta CAPI ${body.event_name} → ${r.status}`, text.slice(0, 300))

  if (!r.ok) return json({ error: 'meta capi failed', status: r.status, body: text }, 502)
  return json({ ok: true, response: JSON.parse(text) })
})
