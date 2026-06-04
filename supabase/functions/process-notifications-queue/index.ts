import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

// Worker da fila de notificações.
// Chamado por cron na VPS a cada 1 minuto.
//
// Para cada item pending cujo next_attempt_at já passou:
//   - dispara send-reservation-whatsapp (idempotente por reservationId)
//   - se ok: status='sent'
//   - se falhou: incrementa attempts e agenda próxima tentativa com backoff
//     exponencial 1m → 2m → 4m → 8m → ... cap em 1h. Após 10 falhas: 'failed'.
//
// Também roda housekeeping (rate_limit_cleanup + notification_queue_cleanup).

const MAX_BATCH    = 10
const MAX_ATTEMPTS = 10

function backoffSeconds(attempts: number): number {
  // 1, 2, 4, 8, 16, 32, 64 (cap 3600s = 1h)
  return Math.min(3600, 60 * Math.pow(2, attempts - 1))
}

Deno.serve(async (req: Request) => {
  // Aceita GET (mais simples pro cron com curl) ou POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Housekeeping: chaves antigas de rate limit + queue concluída há >30d
  // (PostgrestBuilder não é Promise nativa → try/catch em vez de .catch)
  try { await supabase.rpc('rate_limit_cleanup') }         catch { /* noop */ }
  try { await supabase.rpc('notification_queue_cleanup') } catch { /* noop */ }

  // Pega itens prontos pra processar
  const { data: items, error } = await supabase
    .from('notification_queue')
    .select('id, kind, payload, attempts')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(MAX_BATCH)

  if (error) {
    console.error('Failed to fetch queue:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  if (!items || items.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let ok = 0, failed = 0, retried = 0

  for (const item of items) {
    const attempts = (item.attempts ?? 0) + 1
    try {
      let invokeError: unknown = null
      if (item.kind === 'reservation_whatsapp') {
        const { error: invErr } = await supabase.functions.invoke(
          'send-reservation-whatsapp',
          { body: item.payload },
        )
        invokeError = invErr
      } else {
        invokeError = `unknown kind: ${item.kind}`
      }

      if (!invokeError) {
        await supabase
          .from('notification_queue')
          .update({
            status:     'sent',
            attempts,
            sent_at:    new Date().toISOString(),
            last_error: null,
          })
          .eq('id', item.id)
        ok++
        continue
      }

      // Falha: agenda próxima tentativa ou marca como failed se passou do limite
      const last_error = invokeError instanceof Error
        ? invokeError.message
        : (typeof invokeError === 'string' ? invokeError : JSON.stringify(invokeError))

      if (attempts >= MAX_ATTEMPTS) {
        await supabase
          .from('notification_queue')
          .update({ status: 'failed', attempts, last_error, sent_at: new Date().toISOString() })
          .eq('id', item.id)
        failed++
        console.error('Notification permanently failed', item.id, last_error)
      } else {
        const next = new Date(Date.now() + backoffSeconds(attempts) * 1000).toISOString()
        await supabase
          .from('notification_queue')
          .update({ attempts, last_error, next_attempt_at: next })
          .eq('id', item.id)
        retried++
        console.warn('Notification retry scheduled', item.id, 'attempt', attempts, '→', next)
      }
    } catch (e) {
      console.error('Worker exception on item', item.id, e)
    }
  }

  return new Response(JSON.stringify({ processed: items.length, ok, retried, failed }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
