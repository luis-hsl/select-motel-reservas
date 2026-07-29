import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { isConfigured, listarReservas, suitesStatus, toPmsDateTime } from '../_shared/plugplay.ts'

// Disponibilidade por horário para um dia inteiro, em tempo real.
//
// Por que não usar ReservaDisponibilidade/PorSuiteId: ele é por suíte e por
// janela. Para os 24 slots × 13 suítes daria 312 chamadas — inviável para uma
// tela. Aqui puxamos 2 endpoints (reservas + status) e cruzamos localmente.
//
// A regra de bloqueio foi medida contra a API, inclusive nas bordas:
//   bloqueado = [dataInicio - horasInterdicao, saidaNegociado]
//   sobrepõe  = entrada < fimBloqueio && saida > inicioBloqueio  (half-open)
// Ex.: reserva 18:00-20:00 com interdição 2h bloqueia 16:00-20:00; uma janela
// 15:00-16:00 passa, 15:30-16:30 não, 20:00-22:00 passa.
//
// Body: { date: 'YYYY-MM-DD', durationHours: number, slots: ['00:00', ...] }
// Resp: { configured, slots: { '18:00': { available, suiteIds } }, ... }

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Bloqueio para suíte em status não-Livre sem tempo restante confiável. */
const STATUS_BLOCK_H = 2

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/**
 * Converte "YYYY-MM-DDTHH:mm:ss" (horário local do motel, sem offset) em
 * milissegundos comparáveis.
 *
 * Tratamos como UTC de propósito: os dois lados da comparação são strings
 * locais ingênuas vindas do PMS, então comparar sem fuso é exato e evita que
 * o fuso do runtime (UTC no Deno) desloque tudo em 3 horas.
 */
function naiveMs(s: string): number {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return NaN
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0))
}

/** "01:13" → 73 minutos. Devolve null se não parsear. */
function permMinutes(perm: unknown): number | null {
  if (typeof perm !== 'string') return null
  const m = perm.match(/^(\d+):(\d{2})$/)
  if (!m) return null
  return +m[1] * 60 + +m[2]
}

interface Bloqueio { ini: number; fim: number }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  let date: string, durationHours: number, slots: string[]
  try {
    const b = await req.json()
    date = b?.date
    durationHours = Number(b?.durationHours)
    slots = Array.isArray(b?.slots) ? b.slots : []
  } catch {
    return json({ error: 'invalid json' }, 400)
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) {
    return json({ error: 'date deve ser YYYY-MM-DD' }, 400)
  }
  if (!Number.isFinite(durationHours) || durationHours <= 0) {
    return json({ error: 'durationHours inválido' }, 400)
  }
  if (!slots.length) return json({ error: 'slots vazio' }, 400)

  // Integração desligada: o front cai na checagem local sem quebrar.
  if (!isConfigured()) return json({ configured: false, slots: {} })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: suites, error } = await supabase
    .from('suites')
    .select('id, pms_suite_id')
    .eq('active', true)
    .not('pms_suite_id', 'is', null)
    .returns<{ id: string; pms_suite_id: number }[]>()

  if (error) {
    console.error('Erro lendo suites:', error)
    return json({ error: 'db read failed' }, 500)
  }
  if (!suites?.length) return json({ configured: true, slots: {} })

  // pms_suite_id → nosso id
  const porPms = new Map(suites.map((s) => [s.pms_suite_id, s.id]))

  const agora = naiveMs(toPmsDateTime(new Date()))
  const bloqueios = new Map<number, Bloqueio[]>()
  const add = (pmsId: number, ini: number, fim: number) => {
    if (!porPms.has(pmsId) || !Number.isFinite(ini) || !Number.isFinite(fim)) return
    const arr = bloqueios.get(pmsId) ?? []
    arr.push({ ini, fim })
    bloqueios.set(pmsId, arr)
  }

  let degradado = false

  // 1. Reservas futuras → intervalo com a interdição do PMS
  try {
    for (const r of await listarReservas()) {
      if (r.cancelada) continue
      const ini = naiveMs(String(r.dataInicio ?? ''))
      const saida = r.saidaNegociado ? naiveMs(String(r.saidaNegociado)) : NaN
      if (!Number.isFinite(ini)) continue
      const interdicaoMs = (Number(r.horasInterdicao) || 0) * 3600_000
      // Sem saída negociada, assume a duração pedida — melhor bloquear demais
      // aqui do que vender em cima; o create-charge confere de novo.
      const fim = Number.isFinite(saida) ? saida : ini + durationHours * 3600_000
      add(Number(r.suiteId), ini - interdicaoMs, fim)
    }
  } catch (e) {
    // PMS fora do ar não pode esconder a grade inteira: seguimos com o que
    // der e sinalizamos degradado para o front não confiar cegamente.
    console.warn('Falha lendo reservas do PMS:', e instanceof Error ? e.message : e)
    degradado = true
  }

  // 2. Status atual (ocupação, faxina, manutenção) — só afeta hoje
  try {
    for (const s of (await suitesStatus()) as Record<string, unknown>[]) {
      if (Number(s.statusId) === 1) continue // Livre
      const pmsId = Number(s.id)
      const restante = permMinutes(s.perm)
      // Para Ocupado, `perm` é o tempo que falta (conferido: entrada 14:11 em
      // modo 2h com perm 01:13 às ~15:00). Nos demais status a semântica varia,
      // então usamos uma janela curta e deixamos o create-charge decidir.
      const minutos = s.isOcupado && restante !== null && restante < 24 * 60
        ? restante
        : STATUS_BLOCK_H * 60
      add(pmsId, agora, agora + minutos * 60_000)
    }
  } catch (e) {
    console.warn('Falha lendo status do PMS:', e instanceof Error ? e.message : e)
    degradado = true
  }

  // 3. Cruza cada slot com os bloqueios
  const out: Record<string, { available: number; suiteIds: string[] }> = {}
  for (const slot of slots) {
    if (!/^\d{2}:\d{2}$/.test(slot)) continue
    const ini = naiveMs(`${date}T${slot}:00`)
    const fim = ini + durationHours * 3600_000

    const livres: string[] = []
    for (const s of suites) {
      const bs = bloqueios.get(s.pms_suite_id) ?? []
      // half-open: encostar na borda não conflita
      const conflita = bs.some((b) => ini < b.fim && fim > b.ini)
      if (!conflita) livres.push(s.id)
    }
    out[slot] = { available: livres.length, suiteIds: livres }
  }

  return json({
    configured: true,
    degradado,
    totalSuites: suites.length,
    slots: out,
  })
})
