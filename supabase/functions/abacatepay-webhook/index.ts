import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

// All known AbacatePay v2 events that indicate payment confirmed
const PAID_EVENTS = new Set([
  'checkout.completed',
  'checkout.paid',
  'checkout.approved',
  'transparent.completed',
  'transparent.paid',
  'transparent.approved',
  'billing.paid',
  'billing.completed',
  'payment.paid',
  'payment.completed',
])

// Status values inside the payload that mean paid
const PAID_STATUSES = new Set([
  'PAID', 'paid', 'COMPLETED', 'completed',
  'APPROVED', 'approved', 'ACTIVE', 'active',
])

// UUID puro, ou UUID com sufixo "-<timestamp>" (o externalId do /products/create
// no fluxo de cartão é `${reservationId}-${Date.now()}`).
const UUID_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-\d+)?$/i

// Prefixos de id de cobrança da AbacatePay — guardados em reservations.payment_id.
const CHARGE_ID_RE = /^(pix_char_|bill_|char_|chk_|checkout_)/

interface Candidates {
  reservationIds: string[]
  chargeIds:      string[]
  statuses:       string[]
}

// A AbacatePay aninha o objeto de forma diferente em cada evento
// (data.billing, data.pixQrCode, data.transparent, data.checkout, ...).
// Em vez de adivinhar o formato, varremos o payload inteiro atrás dos campos
// que interessam. Isso torna o webhook imune a mudanças de shape.
function collectCandidates(node: unknown, out: Candidates, depth = 0): void {
  if (!node || typeof node !== 'object' || depth > 8) return

  if (Array.isArray(node)) {
    for (const item of node) collectCandidates(item, out, depth + 1)
    return
  }

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (typeof value === 'string') {
      const uuidMatch = UUID_RE.exec(value)
      if ((key === 'reservationId' || key === 'externalId') && uuidMatch) {
        out.reservationIds.push(uuidMatch[1])
      } else if ((key === 'id' || key === '_id') && CHARGE_ID_RE.test(value)) {
        out.chargeIds.push(value)
      } else if (key === 'status') {
        out.statuses.push(value)
      }
    } else {
      collectCandidates(value, out, depth + 1)
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  // Verify webhook secret (opcional — só checa se a env var estiver setada).
  // AbacatePay envia o secret como ?webhookSecret=... na query string.
  // Mantemos suporte a Authorization: Bearer como fallback compatível.
  const webhookSecret = Deno.env.get('ABACATEPAY_WEBHOOK_SECRET')
  if (webhookSecret) {
    const url = new URL(req.url)
    const fromQuery = url.searchParams.get('webhookSecret') ?? ''
    const authHeader = req.headers.get('Authorization') ?? ''
    const fromHeader = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader

    if (fromQuery !== webhookSecret && fromHeader !== webhookSecret) {
      console.warn('Webhook secret mismatch. query?=', !!fromQuery, ' header?=', !!fromHeader)
      return new Response('Unauthorized', { status: 401 })
    }
  }

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  const event: string = payload?.event ?? payload?.type ?? ''
  console.log('AbacatePay webhook received event:', event)
  console.log('Full payload:', JSON.stringify(payload))

  const candidates: Candidates = { reservationIds: [], chargeIds: [], statuses: [] }
  collectCandidates(payload, candidates)

  // Check if this event indicates payment by event name OR by any status field
  const isKnownPaidEvent   = PAID_EVENTS.has(event)
  const hasKnownPaidStatus = candidates.statuses.some((s) => PAID_STATUSES.has(s))

  if (!isKnownPaidEvent && !hasKnownPaidStatus) {
    console.log(`Ignoring event "${event}" with statuses [${candidates.statuses.join(', ')}]`)
    return new Response(JSON.stringify({ received: true, ignored: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let reservationId: string | undefined = candidates.reservationIds[0]

  // Fallback: alguns eventos (PIX/transparent) chegam sem metadata nenhuma —
  // só com o id da cobrança. Ele foi gravado em reservations.payment_id na
  // criação da cobrança, então dá pra resolver a reserva por ele.
  if (!reservationId && candidates.chargeIds.length) {
    const { data: byCharge } = await supabase
      .from('reservations')
      .select('id')
      .in('payment_id', candidates.chargeIds)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>()
    reservationId = byCharge?.id
    if (reservationId) {
      console.log('Reservation resolved via payment_id fallback:', reservationId)
    }
  }

  if (!reservationId) {
    // Responde 200 de propósito: o payload é determinístico, retentar não muda
    // nada e 4xx repetido faz a AbacatePay desativar o webhook. O payload fica
    // logado pra diagnóstico.
    console.error(
      'No reservationId resolvable from webhook payload. chargeIds=',
      JSON.stringify(candidates.chargeIds),
      'payload=', JSON.stringify(payload),
    )
    return new Response(JSON.stringify({ received: true, unresolved: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  console.log('Processing payment confirmation for reservation:', reservationId)

  // .select() devolve as linhas afetadas — se vier vazio, a reserva já estava
  // paga (webhook duplicado, ou verify-pix-payment/verify-payment chegou antes)
  // e a notificação já foi enfileirada por quem fez a transição.
  // Evita WhatsApp duplicado.
  const { data: transitioned, error: updateError } = await supabase
    .from('reservations')
    .update({ status: 'paid' })
    .eq('id', reservationId)
    .eq('status', 'pending')
    .select('id')

  if (updateError) {
    console.error('Failed to update reservation:', updateError)
    return new Response(JSON.stringify({ error: 'db update failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!transitioned || transitioned.length === 0) {
    console.log('Reservation already paid, skipping notification:', reservationId)
    return new Response(JSON.stringify({ received: true, reservationId, duplicate: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  console.log('Reservation updated to paid:', reservationId)

  // Lê a reserva inteira (precisamos do customer pra Meta CAPI + tracking)
  const { data: reservationRow } = await supabase
    .from('reservations')
    .select('id, customer_name, customer_email, customer_phone, total_amount, package_id, extras')
    .eq('id', reservationId)
    .maybeSingle<{
      id: string
      customer_name:  string
      customer_email: string
      customer_phone: string
      total_amount:   number
      package_id:     string
      extras: {
        trackingSessionToken?: string
        metaInitCheckoutEventId?: string
      } | null
    }>()

  // Marca a sessão de onboarding como convertida
  const trackingToken = reservationRow?.extras?.trackingSessionToken
  if (trackingToken) {
    await supabase.rpc('onboarding_mark_converted', {
      p_session_token:  trackingToken,
      p_reservation_id: reservationId,
    })
  }

  // Meta Conversions API — Purchase server-side (dedup com Pixel via event_id)
  // O event_id usado aqui é o reservationId — o front também usa pra deduplicação
  if (reservationRow) {
    try {
      await supabase.functions.invoke('meta-capi', {
        body: {
          event_name: 'Purchase',
          event_id:   reservationRow.id,
          user_data: {
            email: reservationRow.customer_email,
            phone: reservationRow.customer_phone,
            name:  reservationRow.customer_name,
            city:  'Ivaiporã',
            state: 'PR',
            country: 'br',
          },
          custom_data: {
            value:        Number(reservationRow.total_amount),
            currency:     'BRL',
            content_type: 'product',
            content_ids:  [reservationRow.package_id],
            order_id:     reservationRow.id,
          },
          event_source_url: 'https://www.selectreservas.com.br/',
        },
      })
    } catch (e) {
      console.error('meta-capi Purchase failed (non-fatal):', e)
    }
  }

  // Enfileira notificação (garantia de entrega via process-notifications-queue + cron).
  // O worker processa de 1 em 1 minuto com backoff exponencial e até 10 tentativas.
  const { error: queueErr } = await supabase
    .from('notification_queue')
    .insert({
      kind:    'reservation_whatsapp',
      payload: { reservationId },
      status:  'pending',
    })
  if (queueErr) {
    console.error('Failed to enqueue notification (non-fatal):', queueErr)
  } else {
    console.log('Notification enqueued for', reservationId)
  }

  return new Response(JSON.stringify({ received: true, reservationId }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
