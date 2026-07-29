import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  criarReserva,
  cancelarReserva,
  isConfigured,
  toPmsDateTime,
  PlugPlayError,
  type ReservaPayload,
} from '../_shared/plugplay.ts'

// Empurra uma reserva paga para o MotelMais PlugPlay.
//
// Chamada pelo worker da fila (kind='pms_reserva'), que já dá retry com
// backoff exponencial. Aqui a regra é simples: erro retryable → devolve 5xx
// pro worker reagendar; erro definitivo → devolve 200 com {skipped} pra não
// ficar batendo à toa, e registra o motivo em reservations.pms_last_error.
//
// Body: { reservationId: string, cancel?: boolean }

// OcupacaoModo é `type: integer` cru na spec, sem enum. Os valores abaixo
// vieram de GET /api/Entidades/TabelaPreco, que expõe cada modalidade com seu
// `modo` e a duração/preço correspondentes:
//
//   modo 0  normal     60 min  → nosso 'oneHour'
//   modo 2  pernoite2  120 min → nosso 'period'   (2h)
//   modo 1  pernoite   1020min → nosso 'overnight'
//   modo 4  pernoite4  1440min → nosso 'diaria'   (24h)
//
// Conferido pelos preços: Suíte Hidro (180/310/400) e VIP Piscina
// (200/490/590) batem exatamente com a nossa tabela em src/data/suiteCategories.
// PLUGPLAY_MODO_MAP sobrescreve se o motel remanejar as modalidades.
const MODO_PADRAO: Record<string, number> = {
  oneHour:   0,
  period:    2,
  overnight: 1,
  diaria:    4,
}

function modoFor(type: string | null): number | undefined {
  if (!type) return undefined
  const raw = Deno.env.get('PLUGPLAY_MODO_MAP')
  if (raw) {
    try {
      const v = (JSON.parse(raw) as Record<string, number>)[type]
      if (typeof v === 'number') return v
    } catch {
      console.warn('PLUGPLAY_MODO_MAP inválido, usando o mapa padrão:', raw)
    }
  }
  return MODO_PADRAO[type]
}

const TYPE_LABEL: Record<string, string> = {
  period:    'Período',
  overnight: 'Pernoite',
  diaria:    'Diária',
  oneHour:   '1 hora',
}

const MODE_LABEL: Record<string, string> = {
  package:    'Pacote',
  experience: 'Experiência',
  suite:      'Suíte avulsa',
}

interface ReservationRow {
  id: string
  status: string
  mode: string | null
  type: string | null
  check_in: string
  check_out: string
  customer_name: string
  customer_phone: string
  customer_email: string
  total_amount: number
  payment_method: string | null
  payment_id: string | null
  package_id: string | null
  extras: Record<string, unknown> | null
  pms_reserva_id: string | null
  pms_synced_at: string | null
  suites: {
    name: string | null
    room_number: number | null
    cleaning_buffer_h: number | null
    pms_suite_id: number | null
    pms_categoria_id: number | null
  } | null
}

/** Resumo legível para a recepção ver no PMS. */
function buildObservacoes(r: ReservationRow, pacote: string | null): string {
  const linhas: string[] = ['Reserva online — selectreservas.com.br']

  const modo = r.mode ? MODE_LABEL[r.mode] ?? r.mode : null
  const tipo = r.type ? TYPE_LABEL[r.type] ?? r.type : null
  if (modo || tipo) linhas.push([modo, tipo].filter(Boolean).join(' · '))
  if (pacote) linhas.push(`Pacote: ${pacote}`)

  // extras guarda itens escolhidos (comida/bebida/decoração) além de campos
  // internos de tracking, que não interessam à recepção.
  const itens = r.extras?.items
  if (Array.isArray(itens) && itens.length) {
    const nomes = itens
      .map((i) => (typeof i === 'string' ? i : (i as { name?: string })?.name))
      .filter(Boolean)
    if (nomes.length) linhas.push(`Itens: ${nomes.join(', ')}`)
  }

  if (r.payment_method) linhas.push(`Pagamento: ${r.payment_method} (pago online)`)
  linhas.push(`Ref: ${r.id}`)

  return linhas.join('\n')
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  let reservationId: string | undefined
  let cancel = false
  try {
    const body = await req.json()
    reservationId = body?.reservationId
    cancel = body?.cancel === true
  } catch {
    return json({ error: 'invalid json' }, 400)
  }

  if (!reservationId) return json({ error: 'reservationId obrigatório' }, 400)

  // Sem credenciais a integração fica inerte — não é erro, é estado esperado
  // enquanto o motel não devolve o token. Devolve 200 pra fila não insistir.
  if (!isConfigured()) {
    console.warn('PlugPlay não configurado — pulando sync de', reservationId)
    return json({ skipped: 'not_configured', reservationId })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: r, error: readErr } = await supabase
    .from('reservations')
    .select(`
      id, status, mode, type, check_in, check_out,
      customer_name, customer_phone, customer_email,
      total_amount, payment_method, payment_id, package_id, extras,
      pms_reserva_id, pms_synced_at,
      suites ( name, room_number, cleaning_buffer_h, pms_suite_id, pms_categoria_id )
    `)
    .eq('id', reservationId)
    .maybeSingle<ReservationRow>()

  if (readErr) {
    console.error('Erro lendo reserva:', readErr)
    return json({ error: 'db read failed' }, 500) // retryable
  }
  if (!r) return json({ skipped: 'reservation_not_found', reservationId })

  // ── Cancelamento ───────────────────────────────────────────────────────────
  if (cancel) {
    // pms_synced_at é o marcador confiável de "existe lá" — pms_reserva_id pode
    // estar nulo se o POST passou mas o retorno veio sem id.
    if (!r.pms_synced_at && !r.pms_reserva_id) {
      return json({ skipped: 'never_synced', reservationId })
    }
    try {
      await cancelarReserva({
        // Sem o id deles, o integracaoId sozinho localiza a reserva.
        ...(r.pms_reserva_id ? { id: r.pms_reserva_id } : {}),
        integracaoId: r.id,
        motivo: 'Cancelada no site',
      })
      await supabase
        .from('reservations')
        .update({ pms_synced_at: new Date().toISOString(), pms_last_error: null })
        .eq('id', r.id)
      console.log('Reserva cancelada no PMS:', reservationId)
      return json({ ok: true, cancelled: true, reservationId })
    } catch (e) {
      const err = e instanceof PlugPlayError ? e : null
      const msg = e instanceof Error ? e.message : String(e)
      await supabase.from('reservations').update({ pms_last_error: msg }).eq('id', r.id)
      if (err && !err.retryable) return json({ skipped: 'cancel_rejected', error: msg })
      return json({ error: msg }, 502)
    }
  }

  // ── Push ───────────────────────────────────────────────────────────────────
  if (r.status !== 'paid') {
    return json({ skipped: `status_${r.status}`, reservationId })
  }
  if (r.pms_synced_at && r.pms_reserva_id) {
    return json({ skipped: 'already_synced', reservationId, pmsReservaId: r.pms_reserva_id })
  }

  const suite = r.suites
  if (!suite?.pms_suite_id && !suite?.pms_categoria_id) {
    // Falta mapeamento — insistir não resolve, alguém precisa preencher
    // suites.pms_suite_id. Fica visível na view pms_sync_pendentes.
    const msg = 'Suíte sem pms_suite_id/pms_categoria_id — mapeamento pendente'
    console.error(msg, 'reserva', reservationId)
    await supabase.from('reservations').update({ pms_last_error: msg }).eq('id', r.id)
    return json({ skipped: 'suite_unmapped', reservationId })
  }

  let pacote: string | null = null
  if (r.package_id) {
    const { data: p } = await supabase
      .from('packages').select('name').eq('id', r.package_id).maybeSingle<{ name: string }>()
    pacote = p?.name ?? null
  }

  const payload: ReservaPayload = {
    // suiteId manda na escolha; sem ele o PMS aloca uma suíte da categoria
    ...(suite.pms_suite_id
      ? { suiteId: suite.pms_suite_id }
      : { suiteCategoriaIntegracaoId: suite.pms_categoria_id! }),
    dataInicio:      toPmsDateTime(r.check_in),
    saidaNegociado:  toPmsDateTime(r.check_out),
    modo:            modoFor(r.type),
    // `horasInterdicao` é omitido de propósito: o PMS aplica o default do
    // integrador (2h, medido) e assim o site nunca diverge da recepção. Enviar
    // o campo funciona — verificado — mas congelaria o nosso valor e faria o
    // site ignorar uma mudança futura no cadastro deles.
    // Para prazo por suíte (ex.: decoração sazonal), mandar
    // suites.cleaning_buffer_h aqui.
    nome:            r.customer_name,
    telefone:        r.customer_phone,
    email:           r.customer_email,
    observacoes:     buildObservacoes(r, pacote),
    // Chave de idempotência: o PMS rejeita (400) um integracaoId repetido
    integracaoId:    r.id,
    valorPago:       Number(r.total_amount),
    valorNegociado:  Number(r.total_amount),
    codigoPagamento: r.payment_id ?? undefined,
  }

  try {
    const result = await criarReserva(payload)
    // Guardamos só o id que veio deles. Nunca o nosso — pms_reserva_id existe
    // justamente para apontar para o registro do outro lado.
    await supabase
      .from('reservations')
      .update({
        pms_reserva_id: result?.id ?? null,
        pms_synced_at:  new Date().toISOString(),
        pms_last_error: null,
      })
      .eq('id', r.id)

    console.log('Reserva criada no PMS:', reservationId, '→', result?.id, 'suite', result?.suiteRef)
    return json({ ok: true, reservationId, pmsReservaId: result?.id })
  } catch (e) {
    const err = e instanceof PlugPlayError ? e : null
    const msg = e instanceof Error ? e.message : String(e)
    const detail = err?.body ? `${msg} — ${err.body}` : msg

    // 400 por integracaoId duplicado significa que a reserva já está lá: um
    // retry anterior passou e só a gravação local falhou. É sucesso.
    // Mensagem real da API: "Já foi cadastrado uma reserva com o código de
    // integração desse mesmo aplicativo: IntegracaoId: <uuid> / AppId: 4"
    if (err?.status === 400 && /integra|duplic|exist|j[áa] foi cadastrad/i.test(err.body)) {
      // Sem o id deles nesta resposta; o cancelamento funciona por integracaoId.
      await supabase
        .from('reservations')
        .update({
          pms_synced_at:  new Date().toISOString(),
          pms_last_error: null,
        })
        .eq('id', r.id)
      console.log('Reserva já existia no PMS (integracaoId duplicado):', reservationId)
      return json({ ok: true, reservationId, duplicate: true })
    }

    await supabase.from('reservations').update({ pms_last_error: detail }).eq('id', r.id)

    if (err && !err.retryable) {
      console.error('PlugPlay rejeitou definitivamente', reservationId, detail)
      return json({ skipped: 'rejected', reservationId, error: detail })
    }

    console.warn('PlugPlay falhou (retryable)', reservationId, detail)
    return json({ error: detail }, 502)
  }
})
