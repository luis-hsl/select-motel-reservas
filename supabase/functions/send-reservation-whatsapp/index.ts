import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

// Envia mensagem de confirmação no WhatsApp via Wuzapi ao cliente e ao motel.
// Invocada pelo process-notifications-queue quando a reserva vira "paid".
//
// Secrets esperados:
//   WUZAPI_URL          ex: http://wuzapi:8080
//   WUZAPI_USER_TOKEN   token do usuário Wuzapi
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  (auto-injetadas pelo runtime)

interface Extras {
  mode?: string | null
  packageId?: string | null
  packageLabel?: string | null
  includes?: string[]
  drink?: string | null
  food?: string | null
  jantarPrato?: string | null
  jantarHorario?: string | null
  fondue?: boolean | null
  fondueHorario?: string | null
  type?: string | null
  selectedItems?: Array<{ id: string; label: string; price: number; category: string }> | null
  observations?: string | null
}

interface Reservation {
  id: string
  customer_name: string
  customer_phone: string
  customer_email: string | null
  check_in: string
  check_out: string
  total_amount: number
  suite_id: string
  package_id: string | null
  type: string
  payment_method: string | null
  extras: Extras | null
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
const FOOD_TIME_LABEL: Record<string, string> = {
  jantar: 'Horário do jantar',
  sushi:  'Horário da barca',
  pizza:  'Horário da pizza',
}
const PRATO_LABEL: Record<string, string> = {
  risoto:     'Risoto de bacon com Brie',
  rigatone:   'Rigatone de cogumelos',
  mousseline: 'Mousseline com filé mignon',
}
const TYPE_LABEL: Record<string, string> = {
  period:    'Período (2 horas)',
  overnight: 'Pernoite (12 horas)',
  diaria:    'Diária (24 horas)',
  oneHour:   '1 hora',
}
const PAY_LABEL: Record<string, string> = {
  pix:  'PIX',
  card: 'Cartão de crédito',
}

function normalizePhoneBR(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : '55' + digits
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtBRL(reais: number): string {
  return Number(reais).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const wuzUrl   = Deno.env.get('WUZAPI_URL')
  const wuzToken = Deno.env.get('WUZAPI_USER_TOKEN')
  if (!wuzUrl || !wuzToken) {
    console.error('WUZAPI_URL / WUZAPI_USER_TOKEN não configurados')
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
    console.error('Reserva não encontrada:', reservationId, error)
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
  }

  const { data: suite } = await supabase
    .from('suites')
    .select('name, room_number, category')
    .eq('id', r.suite_id)
    .maybeSingle<{ name: string; room_number: number | null; category: string | null }>()

  const ex         = r.extras ?? {}
  const mode       = ex.mode ?? 'package'
  const firstName  = (r.customer_name ?? '').split(' ')[0]
  const codigo     = r.id.slice(0, 8).toUpperCase()
  const suiteNome  = suite?.name ?? r.suite_id
  const suiteNum   = suite?.room_number ? ` · nº ${suite.room_number}` : ''
  const suiteCat   = suite?.category ? ` (${suite.category})` : ''
  const tipoLabel  = TYPE_LABEL[ex.type ?? r.type] ?? (ex.type ?? r.type ?? '')
  const payLabel   = PAY_LABEL[r.payment_method ?? ''] ?? (r.payment_method?.toUpperCase() ?? '')

  // ─── Mensagem para o CLIENTE ───────────────────────────────────────────────
  const clientLines: string[] = []
  clientLines.push(`✨ *Reserva confirmada!*`)
  clientLines.push(`_Select Motel_`)
  clientLines.push(``)
  clientLines.push(`Olá *${firstName}*, seu pagamento foi confirmado e tudo está pronto para te receber! 💛`)
  clientLines.push(``)
  clientLines.push(`━━━━━━━━━━━━━━━━━━━━`)
  clientLines.push(`📋 *Código:* \`${codigo}\``)
  clientLines.push(`━━━━━━━━━━━━━━━━━━━━`)
  clientLines.push(``)
  clientLines.push(`🛏 *Suíte*`)
  clientLines.push(`${suiteNome}${suiteNum}`)
  clientLines.push(``)
  clientLines.push(`📅 *Check-in:*   ${fmtDateTime(r.check_in)}`)
  clientLines.push(`📅 *Check-out:* ${fmtDateTime(r.check_out)}`)
  clientLines.push(`⏱ *Modalidade:* ${tipoLabel}`)
  clientLines.push(``)

  if (mode === 'experience') {
    clientLines.push(`🎨 *Experiência personalizada*`)
    const items = ex.selectedItems ?? []
    if (items.length) {
      items.forEach(i => clientLines.push(`  ✓ ${i.label}`))
    }
  } else if (mode === 'package' && ex.packageLabel) {
    clientLines.push(`📦 *Pacote:* ${ex.packageLabel}`)
    if (Array.isArray(ex.includes) && ex.includes.length) {
      ex.includes.forEach(i => clientLines.push(`  ✓ ${i}`))
    }
  }

  // Refeição
  if (ex.food) {
    clientLines.push(``)
    clientLines.push(`🍽 *Refeição:* ${FOOD_LABEL[ex.food] ?? ex.food}`)
    if (ex.food === 'jantar' && ex.jantarPrato) {
      clientLines.push(`  └ *Prato:* ${PRATO_LABEL[ex.jantarPrato] ?? ex.jantarPrato}`)
    }
    if (ex.jantarHorario) {
      clientLines.push(`  └ *${FOOD_TIME_LABEL[ex.food] ?? 'Horário'}:* ${ex.jantarHorario}`)
    }
  }

  // Fondue
  if (ex.fondue) {
    clientLines.push(``)
    clientLines.push(`🫕 *Fondue de chocolate*${ex.fondueHorario ? ` — às ${ex.fondueHorario}` : ''}`)
  }

  // Bebida
  if (ex.drink) {
    clientLines.push(``)
    clientLines.push(`🥂 *Bebida:* ${DRINK_LABEL[ex.drink] ?? ex.drink}`)
  }

  // Observações
  if (ex.observations) {
    clientLines.push(``)
    clientLines.push(`📝 *Sua observação:*`)
    clientLines.push(ex.observations)
  }

  clientLines.push(``)
  clientLines.push(`💰 *Total pago:* *${fmtBRL(r.total_amount)}*${payLabel ? `  _(${payLabel})_` : ''}`)
  clientLines.push(``)
  clientLines.push(`━━━━━━━━━━━━━━━━━━━━`)
  clientLines.push(`📍 *Na chegada*`)
  clientLines.push(`Informe seu nome e o número da suíte na recepção. Tudo já estará preparado!`)
  clientLines.push(``)
  clientLines.push(`Qualquer dúvida, é só responder esta mensagem. 🤍`)
  clientLines.push(``)
  clientLines.push(`_Obrigado por escolher o Select Motel._`)

  const clientMsg = clientLines.join('\n')

  // ─── Mensagem para o MOTEL ─────────────────────────────────────────────────
  const motelLines: string[] = []
  motelLines.push(`🆕 *Nova reserva confirmada*`)
  motelLines.push(``)
  motelLines.push(`👤 *Cliente:* ${r.customer_name}`)
  motelLines.push(`📱 *Telefone:* ${r.customer_phone}`)
  if (r.customer_email) motelLines.push(`✉️ *E-mail:* ${r.customer_email}`)
  motelLines.push(``)
  motelLines.push(`🛏 *Suíte:* ${suiteNome}${suiteNum}${suiteCat}`)
  motelLines.push(`📅 *Check-in:*   ${fmtDateTime(r.check_in)}`)
  motelLines.push(`📅 *Check-out:* ${fmtDateTime(r.check_out)}`)
  motelLines.push(`⏱ *Tipo:* ${tipoLabel}`)
  motelLines.push(``)

  if (mode === 'experience') {
    motelLines.push(`🎨 *Modo:* Experiência personalizada`)
    const items = ex.selectedItems ?? []
    if (items.length) {
      const byCat: Record<string, typeof items> = {}
      items.forEach(i => { (byCat[i.category] ??= []).push(i) })
      if (byCat.food?.length)  motelLines.push(`🍽 *Comidas:* ${byCat.food.map(i => i.label).join(', ')}`)
      if (byCat.drink?.length) motelLines.push(`🥂 *Bebidas:* ${byCat.drink.map(i => i.label).join(', ')}`)
      if (byCat.extra?.length) motelLines.push(`✨ *Extras:* ${byCat.extra.map(i => i.label).join(', ')}`)
    }
  } else if (mode === 'package' && ex.packageLabel) {
    motelLines.push(`📦 *Pacote:* ${ex.packageLabel}`)
    if (Array.isArray(ex.includes) && ex.includes.length) {
      motelLines.push(`   • ${ex.includes.join('\n   • ')}`)
    }
  }

  // Refeição
  if (ex.food) {
    motelLines.push(``)
    motelLines.push(`🍽 *Refeição:* ${FOOD_LABEL[ex.food] ?? ex.food}`)
    if (ex.food === 'jantar' && ex.jantarPrato) {
      motelLines.push(`  └ *Prato:* ${PRATO_LABEL[ex.jantarPrato] ?? ex.jantarPrato}`)
    }
    if (ex.jantarHorario) {
      motelLines.push(`  └ *${FOOD_TIME_LABEL[ex.food] ?? 'Horário'}:* ${ex.jantarHorario}`)
    }
  }

  // Fondue
  if (ex.fondue) {
    motelLines.push(``)
    motelLines.push(`🫕 *Fondue:* Sim${ex.fondueHorario ? ` — às ${ex.fondueHorario}` : ''}`)
  }

  // Bebida
  if (ex.drink) {
    motelLines.push(``)
    motelLines.push(`🥂 *Bebida:* ${DRINK_LABEL[ex.drink] ?? ex.drink}`)
  }

  // Observações (destaque para o motel)
  if (ex.observations) {
    motelLines.push(``)
    motelLines.push(`⚠️ *Observações do cliente:*`)
    motelLines.push(ex.observations)
  }

  motelLines.push(``)
  motelLines.push(`💳 *Total:* ${fmtBRL(r.total_amount)}${payLabel ? ` (${payLabel})` : ''}`)
  motelLines.push(``)
  motelLines.push(`🔑 *Código:* ${codigo}`)
  motelLines.push(`_ID: ${r.id}_`)

  const motelMsg = motelLines.join('\n')

  // ─── Envio via Wuzapi ──────────────────────────────────────────────────────
  async function sendText(toPhone: string, message: string) {
    const res = await fetch(`${wuzUrl!.replace(/\/$/, '')}/chat/send/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'token': wuzToken! },
      body: JSON.stringify({ Phone: toPhone, Body: message }),
    })
    return { ok: res.ok, status: res.status, body: await res.text() }
  }

  // 1) Cliente
  const phone = normalizePhoneBR(r.customer_phone)
  const clientRes = await sendText(phone, clientMsg)
  if (!clientRes.ok) {
    console.error('Wuzapi (cliente) error', clientRes.status, clientRes.body)
    return new Response(
      JSON.stringify({ error: 'wuzapi failed', detail: clientRes.body }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    )
  }
  console.log('WhatsApp enviado ao cliente', phone, 'reserva', reservationId)

  // 2) Motel (best-effort)
  let motelSent = false
  const { data: setting } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'motel_notification_phone')
    .maybeSingle<{ value: string }>()

  const motelPhoneRaw = setting?.value?.trim() ?? ''
  if (motelPhoneRaw) {
    const motelPhone = normalizePhoneBR(motelPhoneRaw)
    const mRes = await sendText(motelPhone, motelMsg)
    motelSent = mRes.ok
    if (!mRes.ok) console.error('Wuzapi (motel) error', mRes.status, mRes.body)
    else console.log('Notificação enviada ao motel', motelPhone)
  }

  return new Response(
    JSON.stringify({ sent: true, phone, motelNotified: motelSent }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
