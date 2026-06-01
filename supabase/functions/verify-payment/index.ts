import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const API_KEY = Deno.env.get('ABACATEPAY_API_KEY')!
const BASE_V2 = 'https://api.abacatepay.com/v2'

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

// AbacatePay status values that mean "paid"
const PAID_STATUSES = new Set([
  'PAID', 'paid', 'COMPLETED', 'completed', 'APPROVED', 'approved',
  'ACTIVE', 'active', // some checkout statuses use ACTIVE when paid
])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  try {
    const { reservationId } = await req.json()
    if (!reservationId) return json({ error: 'missing reservationId' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1. Check DB first
    const { data: reservation } = await supabase
      .from('reservations')
      .select('id, status, payment_id, payment_method, customer_name, check_in, check_out, total_amount')
      .eq('id', reservationId)
      .single()

    if (!reservation) return json({ error: 'reservation not found' }, 404)
    if (reservation.status === 'paid') return json({ status: 'paid' })

    // 2. Not paid yet — query AbacatePay API directly
    const paymentId = reservation.payment_id
    if (!paymentId) return json({ status: 'pending' })

    const isCard = reservation.payment_method === 'card'
    const endpoint = isCard ? `/checkouts/${paymentId}` : `/transparents/${paymentId}`

    let abacateStatus: string | null = null
    try {
      const res = await fetch(`${BASE_V2}${endpoint}`, {
        headers: { 'Authorization': `Bearer ${API_KEY}` },
      })
      const text = await res.text()
      console.log(`AbacatePay GET ${endpoint} ${res.status}:`, text)

      if (res.ok) {
        const body = JSON.parse(text)
        const d = body.data ?? body
        abacateStatus = d.status ?? d.paymentStatus ?? null
        console.log('AbacatePay status:', abacateStatus)
      }
    } catch (err) {
      console.error('AbacatePay API check failed:', err)
    }

    // 3. If AbacatePay confirms payment → update DB
    if (abacateStatus && PAID_STATUSES.has(abacateStatus)) {
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
      }).catch((err) => console.error('WhatsApp send failed:', err))

      return json({ status: 'paid' })
    }

    return json({ status: 'pending', abacateStatus })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('verify-payment error:', msg)
    return json({ error: msg }, 500)
  }
})
