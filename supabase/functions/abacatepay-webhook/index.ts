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

  // Extract billing/data object — AbacatePay nests differently per event
  const data = payload?.data ?? {}
  const billing = data?.billing ?? data ?? {}

  // Check if this event indicates payment by event name OR by status field
  const statusInPayload: string =
    billing?.status ?? data?.status ?? payload?.status ?? ''

  const isKnownPaidEvent = PAID_EVENTS.has(event)
  const hasKnownPaidStatus = PAID_STATUSES.has(statusInPayload)

  if (!isKnownPaidEvent && !hasKnownPaidStatus) {
    console.log(`Ignoring event "${event}" with status "${statusInPayload}"`)
    return new Response(JSON.stringify({ received: true, ignored: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Extract reservationId from metadata (tried in multiple places)
  const reservationId: string | undefined =
    billing?.metadata?.reservationId ??
    data?.metadata?.reservationId ??
    payload?.metadata?.reservationId ??
    data?.externalId ??
    billing?.externalId ??
    payload?.externalId

  if (!reservationId) {
    console.error('No reservationId in webhook payload', JSON.stringify(payload))
    return new Response(JSON.stringify({ error: 'missing reservationId' }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  console.log('Processing payment confirmation for reservation:', reservationId)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { error: updateError } = await supabase
    .from('reservations')
    .update({ status: 'paid' })
    .eq('id', reservationId)
    .eq('status', 'pending')

  if (updateError) {
    console.error('Failed to update reservation:', updateError)
    return new Response(JSON.stringify({ error: 'db update failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  console.log('Reservation updated to paid:', reservationId)

  // Marca a sessão de onboarding como convertida (se vier session_token no metadata)
  // O frontend repassa o session_token via extras.tracking_session_token
  const { data: reservationRow } = await supabase
    .from('reservations')
    .select('extras')
    .eq('id', reservationId)
    .maybeSingle<{ extras: { trackingSessionToken?: string } | null }>()
  const trackingToken = reservationRow?.extras?.trackingSessionToken
  if (trackingToken) {
    await supabase.rpc('onboarding_mark_converted', {
      p_session_token:  trackingToken,
      p_reservation_id: reservationId,
    })
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
