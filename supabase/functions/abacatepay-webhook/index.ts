import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const PAID_EVENTS = new Set(['checkout.completed', 'transparent.completed'])

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  // Verify webhook secret sent by AbacatePay in the Authorization header
  const webhookSecret = Deno.env.get('ABACATEPAY_WEBHOOK_SECRET')
  if (webhookSecret) {
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader
    if (token !== webhookSecret) {
      console.warn('Webhook secret mismatch')
      return new Response('Unauthorized', { status: 401 })
    }
  }

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  const event: string = payload?.event ?? ''
  console.log('AbacatePay webhook received:', event, JSON.stringify(payload))

  // Only act on payment completion events
  if (!PAID_EVENTS.has(event)) {
    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Extract billing object — AbacatePay can nest it differently per event type
  const billing =
    payload?.data?.billing ??
    payload?.data ??
    payload?.billing ??
    {}

  // reservationId is stored in AbacatePay metadata when the charge is created
  const reservationId: string | undefined =
    billing?.metadata?.reservationId ??
    payload?.data?.metadata?.reservationId ??
    payload?.metadata?.reservationId

  if (!reservationId) {
    console.error('No reservationId in webhook payload', JSON.stringify(payload))
    return new Response(JSON.stringify({ error: 'missing reservationId' }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Update reservation status to paid (idempotent — only if still pending)
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

  // Send WhatsApp messages (fire-and-forget — don't fail the webhook on WhatsApp error)
  try {
    await supabase.functions.invoke('send-reservation-whatsapp', {
      body: { reservationId },
    })
  } catch (err) {
    console.error('WhatsApp send failed (non-fatal):', err)
  }

  return new Response(JSON.stringify({ received: true, reservationId }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
