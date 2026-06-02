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
  customer_email: string
  check_in: string
  check_out: string
  total_amount: number
  suite_id: string
  package_id: string
  type: string
  payment_method: string | null
  extras: {
    packageLabel?: string | null
    includes?: string[]
    drink?: string | null
    food?: string | null
    type?: string | null
  } | null
}

const DRINK_LABEL: Record<string, string> = {
  vinho:    'Vinho',
  frisante: 'Frisante',
  drinque:  'Drink especial',
}
const FOOD_LABEL: Record<string, string> = {
  jantar: 'Jantar',
  sushi:  'Sushi',
  pizza:  'Pizza',
}
const TYPE_LABEL: Record<string, string> = {
  period:    'Período (2h)',
  overnight: 'Pernoite (12h)',
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

function fmtBRL(reais: number): string {
  // total_amount está em REAIS (numeric(10,2)), não em centavos.
  return Number(reais).toLocaleString('pt-BR', {
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
    .select('id, customer_name, customer_phone, customer_email, check_in, check_out, total_amount, suite_id, package_id, type, payment_method, extras')
    .eq('id', reservationId)
    .single<Reservation>()

  if (error || !r) {
    console.error('Reservation not found:', reservationId, error)
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
  }

  const phone = normalizePhoneBR(r.customer_phone)

  // Busca nome bonito da suíte (a tabela tem name + category) — fallback pro id
  const { data: suite } = await supabase
    .from('suites')
    .select('name, category')
    .eq('id', r.suite_id)
    .maybeSingle<{ name: string; category: string | null }>()

  const ex = r.extras ?? {}
  const firstName = (r.customer_name ?? '').split(' ')[0]
  const codigo    = r.id.slice(0, 8).toUpperCase()
  const suiteNome = suite?.name ?? r.suite_id
  const suiteCat  = suite?.category ? ` · ${suite.category}` : ''
  const tipoLabel = TYPE_LABEL[ex.type ?? r.type] ?? (ex.type ?? r.type)

  const lines: string[] = []
  lines.push(`✨ *Reserva confirmada!*`)
  lines.push(`_Select Motel_`)
  lines.push(``)
  lines.push(`Olá *${firstName}*, recebemos seu pagamento e tudo está pronto pra te receber. 💛`)
  lines.push(``)
  lines.push(`━━━━━━━━━━━━━━━━━━`)
  lines.push(`📋 *Código:* \`${codigo}\``)
  lines.push(`━━━━━━━━━━━━━━━━━━`)
  lines.push(``)
  lines.push(`🛏 *Suíte*`)
  lines.push(`${suiteNome}${suiteCat}`)
  lines.push(``)
  lines.push(`📅 *Período*`)
  lines.push(`Entrada:  ${fmtDateTime(r.check_in)}`)
  lines.push(`Saída:    ${fmtDateTime(r.check_out)}`)
  lines.push(`⏱ ${tipoLabel}`)
  lines.push(``)
  lines.push(`📦 *Pacote:* ${ex.packageLabel ?? r.package_id}`)
  if (Array.isArray(ex.includes) && ex.includes.length) {
    lines.push(ex.includes.map(i => `  ✓ ${i}`).join('\n'))
  }
  if (ex.drink || ex.food) lines.push('')
  if (ex.drink) lines.push(`🥂 *Bebida:* ${DRINK_LABEL[ex.drink] ?? ex.drink}`)
  if (ex.food)  lines.push(`🍽 *Comida:* ${FOOD_LABEL[ex.food]  ?? ex.food}`)
  lines.push(``)
  lines.push(`💳 *Total pago:* *${fmtBRL(r.total_amount)}*` +
             (r.payment_method ? `  _(${r.payment_method.toUpperCase()})_` : ''))
  lines.push(``)
  lines.push(`━━━━━━━━━━━━━━━━━━`)
  lines.push(`📍 *No dia da reserva*`)
  lines.push(`Apresente o código *${codigo}* na recepção. Chegue até o horário de entrada — a suíte fica reservada por 30 minutos após esse horário.`)
  lines.push(``)
  lines.push(`Qualquer dúvida, é só responder esta mensagem que a gente te ajuda. 🤍`)
  lines.push(``)
  lines.push(`_Obrigado por escolher o Select Motel._`)
  const msg = lines.join('\n')

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

    // Monta detalhes do pacote + escolhas (bebida/comida) + tipo + pagamento.
    const ex = r.extras ?? {}
    const lines: string[] = []
    lines.push(`🆕 *Nova reserva confirmada*`)
    lines.push('')
    lines.push(`👤 *Cliente:* ${r.customer_name}`)
    lines.push(`📱 *Telefone:* ${r.customer_phone}`)
    if (r.customer_email) lines.push(`✉️ *E-mail:* ${r.customer_email}`)
    lines.push('')
    lines.push(`🛏 *Suíte:* ${r.suite_id}`)
    lines.push(`📅 *Check-in:*  ${fmtDateTime(r.check_in)}`)
    lines.push(`📅 *Check-out:* ${fmtDateTime(r.check_out)}`)
    const typeLabel = TYPE_LABEL[ex.type ?? r.type] ?? (ex.type ?? r.type)
    lines.push(`⏱ *Tipo:* ${typeLabel}`)
    lines.push('')
    lines.push(`📦 *Pacote:* ${ex.packageLabel ?? r.package_id}`)
    if (Array.isArray(ex.includes) && ex.includes.length) {
      lines.push(`   • ${ex.includes.join('\n   • ')}`)
    }
    if (ex.drink) lines.push(`🥂 *Bebida escolhida:* ${DRINK_LABEL[ex.drink] ?? ex.drink}`)
    if (ex.food)  lines.push(`🍽 *Comida escolhida:* ${FOOD_LABEL[ex.food]  ?? ex.food}`)
    lines.push('')
    lines.push(`💳 *Total:* ${fmtBRL(r.total_amount)}` +
               (r.payment_method ? `  (${r.payment_method.toUpperCase()})` : ''))
    lines.push('')
    lines.push(`Código da reserva: ${r.id}`)
    const motelMsg = lines.join('\n')

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
