import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import {
  isConfigured, plugplayGet, toPmsDateTime, PlugPlayError,
} from '../_shared/plugplay.ts'
import { exigirServicoOuAdmin } from '../_shared/adminAuth.ts'

// Ingest do movimento do PMS para o Postgres do site.
//
// Por que existe: o banco daqui só conhecia o que o site vendeu. A estadia de
// balcão vivia só no PMS e sumia da nossa vista no fechamento da conta. Com
// ela no banco dá pra cruzar site × balcão em SQL, montar histórico que
// sobrevive ao PMS fora do ar, e medir recorrência por placa.
//
// **Só leitura no PMS.** A spec tem um feed de pendentes (`GET /api/Ocupacao`)
// que se consome com `PUT` — e o plano original previa usar os dois. Ficou de
// fora de propósito:
//   - o `PUT` escreve no sistema que a recepção usa, e nada aqui precisa disso;
//   - o feed não é re-lido depois de consumido, então uma falha de gravação
//     nossa depois do PUT perderia a ocupação para sempre;
//   - `PorPeriodo` é re-lível e o upsert é idempotente, então reprocessar é
//     seguro e o pior caso é trabalho repetido.
//
// Autenticação por `exigirServicoOuAdmin`: o cron usa a chave de service_role,
// o admin humano usa o próprio login para disparar backfill na mão.
//
// Uso:
//   POST { action: 'incremental' }                      → últimos DIAS_JANELA dias
//   POST { action: 'backfill', inicio: '2026-05-01' }   → do dia até hoje, por mês
//   POST { action: 'snapshots', ano: 2026, mes: 8 }     → relatórios do mês

/**
 * Janela do incremental. 3 dias e não 1: a recepção reabre conta, corrige
 * pagamento e lança consumo depois do fechamento, então reler os últimos dias
 * captura a edição. O upsert torna a sobreposição barata.
 */
const DIAS_JANELA = 3

/** Teto de linhas por chamada ao PMS. 132 em 7 dias medidos — folga grande. */
const MAX_UPSERT_LOTE = 500

/**
 * Orçamento de tempo por invocação. O edge-runtime derruba worker longo, e o
 * backfill de 3 meses não cabe numa chamada — ao estourar, devolvemos onde
 * paramos e o chamador continua de lá.
 */
const ORCAMENTO_MS = 50_000

interface SuiteMap { [pmsSuiteId: number]: string }

/** Soma os campos cujo nome casa com o padrão. Defensivo a campo novo: o
 *  relatório mensal já tem pernoite5..10 que a ocupação ainda não expõe. */
function somaPor(obj: Record<string, unknown>, teste: (k: string) => boolean): number {
  let t = 0
  for (const [k, v] of Object.entries(obj)) {
    if (teste(k) && typeof v === 'number' && Number.isFinite(v)) t += v
  }
  return t
}

const ehPernoite = (k: string) => /^pernoite(\d+|Executivo)?$/.test(k)
const ehExcesso  = (k: string) => /^excesso/.test(k)

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Datetime do PMS vem local sem offset; guardamos exatamente assim. */
function dt(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null
  // Datas zeradas voltam como 0001-01-01, não null (medido em 04/08/2026).
  if (v.startsWith('0001-')) return null
  return v
}

function linha(o: Record<string, unknown>, suites: SuiteMap) {
  const pmsSuiteId = Number(o.suiteId)
  const placa = typeof o.placa === 'string' ? o.placa.trim() : ''

  return {
    ocupacao_id:             Number(o.ocupacaoId),
    codigo:                  o.codigo == null ? null : Number(o.codigo),
    caixa_id:                o.caixaId == null ? null : Number(o.caixaId),
    caixa_original_id:       o.caixaOriginalId == null ? null : Number(o.caixaOriginalId),

    pms_suite_id:            Number.isFinite(pmsSuiteId) ? pmsSuiteId : null,
    suite_id:                suites[pmsSuiteId] ?? null,

    entrada:                 dt(o.entrada),
    saida:                   dt(o.saida),
    data_base_caixa:         dt(o.dataBaseCaixa)?.slice(0, 10) ?? null,

    modo:                    o.modo == null ? null : Number(o.modo),
    tipo_conducao:           o.tipoConducao == null ? null : Number(o.tipoConducao),
    is_entrada_automatica:   o.isEntradaAutomatica === true,

    placa:                   placa || null,
    reserva_id:              o.reservaId == null ? null : String(o.reservaId),
    cliente_fidelidade_id:   o.clienteFidelidadeId == null ? null : String(o.clienteFidelidadeId),

    quantidade_pessoa_extra: num(o.quantidadePessoaExtra),
    qtd_pernoite_extra:      num(o.qtdPernoiteExtra),

    valor_normal:            num(o.normal),
    valor_pernoite:          somaPor(o, ehPernoite),
    valor_excesso:           somaPor(o, ehExcesso),
    desconto:                num(o.desconto),
    acrescimo:               num(o.acrescimo),
    pessoa_extra:            num(o.pessoaExtra),
    total_cortesia:          num(o.totalCortesia),
    total_consumo:           num(o.totalConsumo),
    total_recebido:          num(o.totalRecebido),

    pagamentos:              Array.isArray(o.pagamentos)  ? o.pagamentos  : [],
    consumos:                Array.isArray(o.consumos)    ? o.consumos    : [],
    observacoes:             Array.isArray(o.observacoes) ? o.observacoes : [],

    raw:                     o,
    atualizado_em:           new Date().toISOString(),
  }
}

/** Um período de ocupações → banco. Devolve quantas linhas vieram e gravaram. */
async function ingerirPeriodo(
  supabase: SupabaseClient,
  suites: SuiteMap,
  inicio: string,
  fim: string,
): Promise<{ lidos: number; gravados: number }> {
  const dados = await plugplayGet<Record<string, unknown>[]>('/api/Ocupacao/PorPeriodo', {
    inicial: `${inicio}T00:00:00`,
    final:   `${fim}T23:59:59`,
    incluirObservacoes: 'true',
    incluirPagamentos:  'true',
    incluirConsumos:    'true',
  })

  if (!Array.isArray(dados) || dados.length === 0) return { lidos: 0, gravados: 0 }

  // Ocupação sem id não tem como ser chave de upsert — descartar é melhor que
  // gravar linha órfã que o próximo ingest duplicaria.
  const linhas = dados
    .filter((o) => Number.isFinite(Number(o?.ocupacaoId)))
    .map((o) => linha(o, suites))

  let gravados = 0
  for (let i = 0; i < linhas.length; i += MAX_UPSERT_LOTE) {
    const lote = linhas.slice(i, i + MAX_UPSERT_LOTE)
    const { error } = await supabase
      .from('pms_ocupacoes')
      .upsert(lote, { onConflict: 'ocupacao_id' })
    if (error) throw new Error(`upsert falhou: ${error.message}`)
    gravados += lote.length
  }

  return { lidos: dados.length, gravados }
}

/** Lista de [inicio, fim] mensais cobrindo o intervalo, do mais antigo ao mais novo. */
function fatiarPorMes(inicio: string, fim: string): Array<[string, string]> {
  const fatias: Array<[string, string]> = []
  let [ano, mes] = [Number(inicio.slice(0, 4)), Number(inicio.slice(5, 7))]
  const limite = fim.slice(0, 7)

  while (`${ano}-${String(mes).padStart(2, '0')}` <= limite) {
    const mm = String(mes).padStart(2, '0')
    const primeiro = `${ano}-${mm}-01`
    // Dia 0 do mês seguinte = último dia deste mês.
    const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
    const ultimo = `${ano}-${mm}-${String(ultimoDia).padStart(2, '0')}`

    fatias.push([
      primeiro < inicio ? inicio : primeiro,
      ultimo > fim ? fim : ultimo,
    ])

    mes++
    if (mes > 12) { mes = 1; ano++ }
  }
  return fatias
}

/** Relatórios mensais → pms_snapshots. Cada um é independente: um 401 de
 *  permissão num deles não pode derrubar os outros. */
async function ingerirSnapshots(
  supabase: SupabaseClient,
  ano: number,
  mes: number,
): Promise<Record<string, string>> {
  const primeiro = `${ano}-${String(mes).padStart(2, '0')}-01`
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  const ultimo = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`

  const alvos: Array<{ chave: string; path: string; query: Record<string, string | number> }> = [
    { chave: 'ocupacao-categoria', path: '/api/Relatorios/PorOcupacaoPorCategoriaMesAno', query: { mes, ano } },
    { chave: 'mapa-calor',         path: '/api/Relatorios/MapaCalorPorMesAno',            query: { mes, ano } },
    { chave: 'caixa',              path: '/api/Caixa/PorMesAno',                          query: { mes, ano } },
    { chave: 'pagamentos',         path: '/api/Relatorios/ListagemPagamentosPorPeriodo',
      query: { inicial: `${primeiro}T00:00:00`, final: `${ultimo}T23:59:59` } },
  ]

  const resultado: Record<string, string> = {}

  for (const a of alvos) {
    try {
      const payload = await plugplayGet(a.path, a.query)
      const { error } = await supabase.from('pms_snapshots').upsert(
        { chave: a.chave, ano, mes, payload, capturado_em: new Date().toISOString() },
        { onConflict: 'chave,ano,mes' },
      )
      resultado[a.chave] = error ? `erro ao gravar: ${error.message}` : 'ok'
    } catch (e) {
      const pp = e instanceof PlugPlayError ? e : null
      // 401 aqui é permissão que a Oxpi não liberou — estado conhecido, não
      // falha do ingest. Ver PLUGPLAY-SAMPLES.md.
      resultado[a.chave] = pp ? `HTTP ${pp.status}` : String(e)
    }
  }

  return resultado
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const auth = await exigirServicoOuAdmin(req)
  if (!auth.ok) return auth.response

  const responder = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { 'Content-Type': 'application/json' },
    })

  if (!isConfigured()) {
    return responder({ configured: false, hint: 'PLUGPLAY_ID/PLUGPLAY_TOKEN ausentes.' })
  }

  let corpo: Record<string, unknown> = {}
  if (req.method === 'POST') {
    try { corpo = await req.json() } catch { /* cron manda sem corpo */ }
  } else {
    corpo = Object.fromEntries(new URL(req.url).searchParams)
  }

  const action = String(corpo.action ?? 'incremental')
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const t0 = Date.now()
  const hoje = toPmsDateTime(new Date()).slice(0, 10)

  // ── snapshots ─────────────────────────────────────────────────────────────
  if (action === 'snapshots') {
    const ano = Number(corpo.ano) || Number(hoje.slice(0, 4))
    const mes = Number(corpo.mes) || Number(hoje.slice(5, 7))
    const resultado = await ingerirSnapshots(supabase, ano, mes)
    const duracao = Date.now() - t0

    await supabase.from('pms_ingest_runs').insert({
      tipo: 'snapshots', inicio: `${ano}-${String(mes).padStart(2, '0')}-01`,
      duracao_ms: duracao,
      erro: Object.values(resultado).every((v) => v === 'ok') ? null : JSON.stringify(resultado),
    })

    return responder({ configured: true, action, ano, mes, resultado, duracao })
  }

  // ── incremental e backfill ────────────────────────────────────────────────
  if (action !== 'incremental' && action !== 'backfill') {
    return responder(
      { error: `ação desconhecida: ${action}`, disponiveis: ['incremental', 'backfill', 'snapshots'] },
      400,
    )
  }

  const { data: suitesRows } = await supabase
    .from('suites')
    .select('id, pms_suite_id')
    .not('pms_suite_id', 'is', null)

  const suites: SuiteMap = {}
  for (const s of suitesRows ?? []) {
    if (typeof s.pms_suite_id === 'number') suites[s.pms_suite_id] = s.id as string
  }

  let inicio: string
  let fim: string
  if (action === 'backfill') {
    inicio = String(corpo.inicio ?? '').slice(0, 10)
    fim = String(corpo.fim ?? hoje).slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) {
      return responder({ error: 'backfill exige inicio (e opcionalmente fim) em YYYY-MM-DD' }, 400)
    }
    if (inicio > fim) return responder({ error: 'inicio depois de fim' }, 400)
  } else {
    const desde = new Date(Date.now() - DIAS_JANELA * 86_400_000)
    inicio = toPmsDateTime(desde).slice(0, 10)
    fim = hoje
  }

  // Incremental é uma janela curta e cabe numa fatia; backfill vai por mês.
  const fatias = action === 'backfill' ? fatiarPorMes(inicio, fim) : [[inicio, fim] as [string, string]]

  let lidos = 0
  let gravados = 0
  let parouEm: string | null = null
  let erro: string | null = null

  for (const [de, ate] of fatias) {
    if (Date.now() - t0 > ORCAMENTO_MS) { parouEm = de; break }
    try {
      const r = await ingerirPeriodo(supabase, suites, de, ate)
      lidos += r.lidos
      gravados += r.gravados
    } catch (e) {
      const pp = e instanceof PlugPlayError ? e : null
      erro = `${de}..${ate}: ${pp ? `HTTP ${pp.status} ${pp.body.slice(0, 200)}` : String(e)}`
      parouEm = de
      break
    }
  }

  const duracao = Date.now() - t0
  await supabase.from('pms_ingest_runs').insert({
    tipo: action, inicio, fim, lidos, gravados, duracao_ms: duracao, erro,
  })

  return responder({
    configured: true,
    action,
    inicio,
    fim,
    fatias: fatias.length,
    lidos,
    gravados,
    duracao,
    // Preenchido = sobrou período. Rodar de novo com inicio = parouEm.
    parouEm,
    erro,
  }, erro ? 500 : 200)
})
