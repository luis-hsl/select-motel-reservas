import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

// Webhook de ENTRADA do Wuzapi — o par de send-reservation-whatsapp, que só envia.
//
// Por que existe: o Wuzapi não tem endpoint de histórico, e o WhatsApp também
// não (o protocolo multi-dispositivo entrega a mensagem uma vez e o histórico
// fica no aparelho). Sem este webhook, toda conversa de atendimento é perdida
// no instante em que chega. Isto aqui é a única memória possível — e só vale
// daqui pra frente.
//
// Não responde nada, não é bot: só arquiva em whatsapp_messages.
//
// Segurança: o endpoint é público (verify_jwt = false, como todo webhook de
// terceiro). Quem autentica é o WUZAPI_WEBHOOK_SECRET na query string, no
// mesmo formato que abacatepay-webhook já usa.
//
// Privacidade: conteúdo de mensagem NUNCA vai pro console. Log de container
// não tem retenção nem RLS, e o expurgo de 90 dias da tabela não alcançaria
// o que vazasse pra lá. Só metadado é logado.

/** Extrai um valor aninhado tentando vários caminhos, sem quebrar no meio. */
function pick(obj: unknown, paths: string[][]): unknown {
  for (const path of paths) {
    let cur: any = obj
    let ok = true
    for (const key of path) {
      if (cur === null || typeof cur !== 'object' || !(key in cur)) { ok = false; break }
      cur = cur[key]
    }
    if (ok && cur !== undefined && cur !== null && cur !== '') return cur
  }
  return undefined
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

/** "5511999999999:12@s.whatsapp.net" -> "5511999999999" */
function jidToPhone(jid: string | null): string | null {
  if (!jid) return null
  const local = jid.split('@')[0].split(':')[0]
  const digits = local.replace(/\D/g, '')
  return digits.length >= 8 ? digits : null
}

/** Timestamp do whatsmeow pode vir ISO ou epoch (s ou ms). */
function toTimestamp(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const ms = v > 1e12 ? v : v * 1000
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  if (typeof v === 'string' && v.length > 0) {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  return null
}

// O formato do payload do Wuzapi não está documentado no README e varia entre
// versões da imagem :latest. Por isso a extração tenta vários caminhos e o
// payload cru vai inteiro pra coluna jsonb — se algum campo sair errado, dá
// pra reprocessar do original sem ter perdido nada.
interface Extracted {
  event_type: string
  wa_message_id: string | null
  chat_jid: string | null
  sender_phone: string | null
  is_group: boolean
  from_me: boolean
  body: string | null
  sent_at: string | null
}

function extract(payload: any): Extracted {
  const ev = payload?.event ?? payload

  const event_type =
    asString(pick(payload, [['type'], ['event', 'type'], ['Event']])) ?? 'Message'

  const wa_message_id = asString(
    pick(ev, [['Info', 'ID'], ['info', 'id'], ['ID'], ['id']]),
  )

  const chat_jid = asString(
    pick(ev, [['Info', 'Chat'], ['info', 'chat'], ['Chat'], ['chat']]),
  )

  const sender_jid = asString(
    pick(ev, [['Info', 'Sender'], ['info', 'sender'], ['Sender'], ['sender']]),
  )

  const from_me_raw = pick(ev, [
    ['Info', 'IsFromMe'], ['info', 'isFromMe'], ['IsFromMe'], ['fromMe'],
  ])

  // O texto vem em lugares diferentes conforme o tipo: conversation é a
  // mensagem simples, extendedTextMessage é a que tem link/citação, e
  // *.caption é legenda de mídia.
  const body = asString(
    pick(ev, [
      ['Message', 'conversation'],
      ['message', 'conversation'],
      ['Message', 'extendedTextMessage', 'text'],
      ['message', 'extendedTextMessage', 'text'],
      ['Message', 'imageMessage', 'caption'],
      ['Message', 'videoMessage', 'caption'],
      ['Message', 'documentMessage', 'caption'],
      ['body'],
      ['text'],
    ]),
  )

  const sent_at = toTimestamp(
    pick(ev, [['Info', 'Timestamp'], ['info', 'timestamp'], ['Timestamp'], ['timestamp']]),
  )

  return {
    event_type,
    wa_message_id,
    chat_jid,
    sender_phone: jidToPhone(sender_jid ?? chat_jid),
    is_group: (chat_jid ?? '').endsWith('@g.us'),
    from_me: from_me_raw === true,
    body,
    sent_at,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  // Só checa se a env estiver setada — mesmo contrato do abacatepay-webhook,
  // pra não travar o ambiente que ainda não configurou o secret.
  const secret = Deno.env.get('WUZAPI_WEBHOOK_SECRET')
  if (secret) {
    const fromQuery = new URL(req.url).searchParams.get('s') ?? ''
    const auth = req.headers.get('Authorization') ?? ''
    const fromHeader = auth.startsWith('Bearer ') ? auth.slice(7) : auth
    if (fromQuery !== secret && fromHeader !== secret) {
      console.warn('wuzapi-webhook: secret mismatch')
      return new Response('Unauthorized', { status: 401 })
    }
  }

  let payload: any
  try { payload = await req.json() } catch { return new Response('Bad Request', { status: 400 }) }

  const row = extract(payload)

  // Só arquiva conversa. Outros eventos (recibo de leitura, presença) devolvem
  // 2xx pra não gerar reentrega, mas não viram linha.
  if (row.event_type !== 'Message') {
    return new Response(JSON.stringify({ received: true, ignored: row.event_type }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { error } = await supabase
    .from('whatsapp_messages')
    .insert({ ...row, payload })

  if (error) {
    // 23505 = reentrega da mesma mensagem. É esperado: o Wuzapi reenvia quando
    // não recebe 2xx. Responde 200 pra ele parar de tentar.
    if (error.code === '23505') {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
    // Metadado só — nunca o conteúdo da mensagem.
    console.error('wuzapi-webhook insert failed:', error.code, error.message)
    // 500 faz o Wuzapi reentregar, que é o que se quer num erro transitório.
    return new Response(JSON.stringify({ error: 'insert failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Expurgo oportunista: o projeto não usa pg_cron, então a retenção se mantém
  // sozinha daqui. ~1% das chamadas, o que num motel dá algumas vezes por
  // semana — de sobra pra uma janela de 90 dias. Falha aqui não afeta o
  // arquivamento, que já foi feito.
  if (Math.random() < 0.01) {
    const { error: purgeErr } = await supabase.rpc('purge_whatsapp_messages', { p_days: 90 })
    if (purgeErr) console.error('wuzapi-webhook purge failed:', purgeErr.message)
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
