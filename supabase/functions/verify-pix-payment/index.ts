import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const API_KEY = Deno.env.get('ABACATEPAY_API_KEY')
const BASE_V2 = 'https://api.abacatepay.com/v2'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const PAID_STATUSES = new Set(['PAID', 'paid', 'COMPLETED', 'completed', 'APPROVED', 'approved', 'ACTIVE', 'active'])

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  try {
    const { reservationId } = await req.json()
    if (!reservationId) return json({ error: 'reservationId required' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: reservation } = await supabase
      .from('reservations')
      .select('id, status, payment_id, payment_method')
      .eq('id', reservationId)
      .single()

    if (!reservation) return json({ error: 'not found' }, 404)
    if (reservation.status === 'paid') return json({ paid: true })
    if (reservation.payment_method !== 'pix' || !reservation.payment_id) {
      return json({ paid: false })
    }

    const apiRes = await fetch(`${BASE_V2}/transparents/${reservation.payment_id}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    })

    if (!apiRes.ok) {
      console.warn('AbacatePay GET returned', apiRes.status)
      return json({ paid: false })
    }

    const apiData = (await apiRes.json()) as Record<string, unknown>
    const d = ((apiData?.data ?? apiData) as Record<string, unknown>)
    const status = (d?.status ?? '') as string

    if (!PAID_STATUSES.has(status)) return json({ paid: false })

    await supabase
      .from('reservations')
      .update({ status: 'paid' })
      .eq('id', reservationId)
      .eq('status', 'pending')

    await supabase.from('notification_queue').insert({
      kind: 'reservation_whatsapp',
      payload: { reservationId },
      status: 'pending',
    })

    console.log('Reservation marked paid via PIX poll:', reservationId)
    return json({ paid: true })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
