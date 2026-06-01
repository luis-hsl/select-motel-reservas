import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  try {
    const { reservationId, fromReturn } = await req.json()
    if (!reservationId) return json({ error: 'missing reservationId' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Check current DB status first
    const { data: reservation } = await supabase
      .from('reservations')
      .select('id, status, payment_id, payment_method')
      .eq('id', reservationId)
      .single()

    if (!reservation) return json({ error: 'reservation not found' }, 404)
    if (reservation.status === 'paid') return json({ status: 'paid' })

    // fromReturn=true means the user landed here via AbacatePay's completionUrl
    // AbacatePay ONLY redirects to completionUrl after successful payment —
    // so we can trust this redirect as payment confirmation.
    if (fromReturn === true) {
      console.log('Confirming payment via completionUrl redirect for:', reservationId)

      const { error: updateError } = await supabase
        .from('reservations')
        .update({ status: 'paid' })
        .eq('id', reservationId)
        .eq('status', 'pending')

      if (updateError) {
        console.error('DB update failed:', updateError)
        return json({ error: 'db update failed' }, 500)
      }

      // Fire WhatsApp (fire-and-forget)
      supabase.functions.invoke('send-reservation-whatsapp', {
        body: { reservationId },
      }).catch((err: unknown) => console.error('WhatsApp send failed:', err))

      return json({ status: 'paid' })
    }

    return json({ status: 'pending' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('verify-payment error:', msg)
    return json({ error: msg }, 500)
  }
})
