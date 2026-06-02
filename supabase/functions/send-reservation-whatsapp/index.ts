import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

// Envia mensagem de confirmacao no WhatsApp via Wuzapi.
// Invocada (fire-and-forget) pelo abacatepay-webhook quando a reserva vira "paid".
//
// Secrets esperados:
//   WUZAPI_URL          ex: http://wuzapi:8080  (na network docker do self-host)
//                            ou http://host.docker.internal:8080 / IP interno
//   WUZAPI_USER_TOKEN   token do usuario Wuzapi (criado via /admin/users)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  (auto-injetadas pelo runtime)

interface Reservation {
  id: string
  customer_name: string
  customer_phone: string
  check_in: string
  check_out: string
  total_amount: number
  suite_id: string
}

function normalizePhoneBR(raw: string): string {
  // Remove tudo que nao e digito; garante prefixo 55 (Brasil).
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('55')) return digits
  return '55' + digits
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL',
  })
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const wuzUrl   = Deno.env.get('WUZAPI_URL')
  const wuzToken = Deno.env.get('WUZAPI_USER_TOKEN')
  if (!wuzUrl || !wuzToken) {
    console.error('WUZAPI_URL / WUZAPI_USER_TOKEN nao configurados')
    return new Response(JSON.stringify({ error: 'wuzapi not configured' }), { status: 500 })
  }

  let body: { reservationId?: string }
  try { body = await req.json() } catch { return new Response('Bad Request', { status: 400 }) }
  const reservationId = body?.reservationId
  if (!reservationId) return new Response('missing reservationId', { status: 422 })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: r, error } = await supabase
    .from('reservations')
    .select('id, customer_name, customer_phone, check_in, check_out, total_amount, suite_id')
    .eq('id', reservationId)
    .single<Reservation>()

  if (error || !r) {
    console.error('Reservation not found:', reservationId, error)
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
  }

  const phone = normalizePhoneBR(r.customer_phone)
  const msg =
`Olá *${r.customer_name}*! 🏨

Sua reserva no Select Motel está *confirmada* ✅

🛏 Suíte: ${r.suite_id}
📅 Check-in: ${fmtDateTime(r.check_in)}
📅 Check-out: ${fmtDateTime(r.check_out)}
💳 Total: ${fmtBRL(r.total_amount)}

Código da reserva: ${r.id}

Em caso de dúvidas, é só responder esta mensagem.`

  async function sendText(toPhone: string, body: string) {
    const r = await fetch(`${wuzUrl!.replace(/\/$/, '')}/chat/send/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'token': wuzToken! },
      body: JSON.stringify({ Phone: toPhone, Body: body }),
    })
    return { ok: r.ok, status: r.status, body: await r.text() }
  }

  // 1) Cliente
  const clientRes = await sendText(phone, msg)
  if (!clientRes.ok) {
    console.error('Wuzapi (cliente) error', clientRes.status, clientRes.body)
    return new Response(
      JSON.stringify({ error: 'wuzapi failed', detail: clientRes.body }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    )
  }
  console.log('WhatsApp enviado ao cliente', phone, 'reserva', reservationId)

  // 2) Motel (best-effort, nao falha se nao configurado)
  let motelSent = false
  const { data: setting } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'motel_notification_phone')
    .maybeSingle<{ value: string }>()

  const motelPhoneRaw = setting?.value?.trim() ?? ''
  if (motelPhoneRaw) {
    const motelPhone = normalizePhoneBR(motelPhoneRaw)
    const motelMsg =
`🆕 *Nova reserva confirmada*

👤 ${r.customer_name}
📱 ${r.customer_phone}
🛏 Suíte: ${r.suite_id}
📅 ${fmtDateTime(r.check_in)} → ${fmtDateTime(r.check_out)}
💳 ${fmtBRL(r.total_amount)}

#${r.id.slice(0, 8)}`
    const mRes = await sendText(motelPhone, motelMsg)
    motelSent = mRes.ok
    if (!mRes.ok) console.error('Wuzapi (motel) error', mRes.status, mRes.body)
    else console.log('Notificacao enviada ao motel', motelPhone)
  }

  return new Response(
    JSON.stringify({ sent: true, phone, motelNotified: motelSent }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
