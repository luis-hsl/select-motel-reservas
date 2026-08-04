import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  isConfigured,
  suitesStatus,
  categoriaDisponibilidade,
  cobrancaAtual,
  listarReservas,
  toPmsDateTime,
  PlugPlayError,
  type SuiteStatus,
  type CategoriaDisponibilidade,
  type ReservaResult,
} from '../_shared/plugplay.ts'
import { exigirAdmin } from '../_shared/adminAuth.ts'

// Ponte de leitura entre o painel admin e o PMS da recepção.
//
// Por que existe: hoje o admin só enxerga o que o site vendeu. Walk-in,
// reserva por telefone e manutenção são invisíveis, e são a maior parte do
// movimento. Esta função devolve o estado real do motel numa chamada só.
//
// Exige JWT de admin logado via `exigirAdmin`, **não** via config.toml: no
// self-host o `VERIFY_JWT` do edge-runtime é global e está desligado, então
// config.toml não protege nada. Ver _shared/adminAuth.ts. Isto expõe a
// operação interna do motel, e o token do PMS nunca sai do servidor.
//
// **Só leitura.** Nenhuma ação escreve no PMS — o painel observa, a recepção
// opera. Escrita (cupom, check-in) seria outra função, com whitelist própria.
//
// Uso:
//   POST { action: 'panorama' }                 → estado do motel agora
//   POST { action: 'cobranca', suiteRef: '11' }  → conta aberta de uma suíte
//   POST { action: 'desempenho', inicio, fim }   → agregação do período (do banco)

/**
 * Quanto tempo a suíte ocupada pode passar do previsto antes de virar alerta.
 * O PMS já tem `comAlertaTempo` com a régua da recepção; isto é só o fallback
 * para quando o campo não vier.
 */
const ALERTA_EXCEDIDO_MIN = 0

interface SuiteLocal {
  id: string
  name: string
  room_number: number | null
  pms_suite_id: number | null
  active: boolean
  sort_order: number
}

/**
 * Balde de status para os KPIs.
 *
 * A sondagem de 04/08 só pegou o motel vazio — `statusId: 1` (Livre) foi o
 * único código observado, então **não dá para confiar num enum de statusId**.
 * A classificação usa os dois sinais estáveis (`isOcupado` e o `statusId 1`) e
 * cai no rótulo textual do próprio PMS para o resto. Status novo que eles
 * criarem aparece como "outro" com o nome certo, em vez de sumir da conta.
 */
type Balde = 'ocupada' | 'livre' | 'preparo' | 'bloqueada' | 'outro'

function classificar(s: SuiteStatus): Balde {
  if (s.isOcupado === true) return 'ocupada'
  const statusId = Number(s.statusId)
  if (Number.isFinite(statusId) && statusId === 1) return 'livre'

  const label = String(s.status ?? '')
  if (/limp|faxin|sujo|ozon|arrum|prepar/i.test(label)) return 'preparo'
  if (/manut|interdit|bloque|reserv/i.test(label))      return 'bloqueada'
  return 'outro'
}

/** Cada suíte do PMS, já casada com o cadastro do site. */
interface SuitePainel {
  /** `null` quando o PMS tem uma suíte que o site não conhece. */
  siteId: string | null
  nome: string
  quarto: number | string
  pmsId: number
  ref: string
  classe: string
  balde: Balde
  status: string
  corBackground: string
  corTexto: string
  ocupada: boolean
  perm: string | null
  permMinutos: number | null
  modo: string | null
  entrada: string | null
  totalConsumo: number
  totalPrevisto: number
  temObs: boolean
  emCheckout: boolean
  emPernoite: boolean
  alertaTempo: boolean
  tempoDesdeEncerramento: string | null
  tempoDesdeInicioLimpeza: string | null
}

/**
 * Casa o PMS com o cadastro do site **por `pms_suite_id`, nunca pelo número do
 * quarto**: quarto 12 é `id=8` e quarto 14 é `id=12` no PMS. Casar por número
 * mostraria a suíte errada em silêncio — o pior tipo de bug numa tela de
 * operação. Ver PLUGPLAY.md.
 */
function montarSuites(pms: SuiteStatus[], locais: SuiteLocal[]): SuitePainel[] {
  const porPmsId = new Map<number, SuiteLocal>()
  for (const l of locais) {
    if (typeof l.pms_suite_id === 'number') porPmsId.set(l.pms_suite_id, l)
  }

  return pms.map((s) => {
    const local = porPmsId.get(Number(s.id))
    const balde = classificar(s)
    const ocupada = balde === 'ocupada'
    const permMin = Number(s.permMinutos)

    return {
      siteId: local?.id ?? null,
      // Sem cadastro local a tela ainda mostra a suíte, usando o rótulo do PMS.
      // Suíte nova na recepção não pode desaparecer do mapa por falta de join.
      nome: local?.name ?? `Suíte ${s.ref}`,
      quarto: local?.room_number ?? s.ref,
      pmsId: Number(s.id),
      ref: String(s.ref ?? ''),
      classe: String(s.classe ?? ''),
      balde,
      status: String(s.status ?? ''),
      // Cores vêm do PMS: o mapa do painel fica idêntico ao que a recepção vê,
      // e status novo já chega colorido sem precisar de deploy nosso.
      corBackground: String(s.corBackground ?? '#2a2a2a'),
      corTexto: String(s.corTexto ?? '#ffffff'),
      ocupada,
      perm: ocupada ? String(s.perm ?? '') || null : null,
      permMinutos: ocupada && Number.isFinite(permMin) ? permMin : null,
      modo: ocupada ? (s.modo ?? s.modoSigla ?? null) : null,
      // Datas zeradas voltam como 0001-01-01, não null (medido).
      entrada: ocupada && s.entrada && !String(s.entrada).startsWith('0001-')
        ? String(s.entrada)
        : null,
      totalConsumo: Number(s.totalConsumo) || 0,
      totalPrevisto: Number(s.totalPrevisto) || Number(s.valorPrevisto) || 0,
      temObs: s.temObs === true,
      emCheckout: s.emCheckout === true,
      emPernoite: s.emPernoite === true,
      alertaTempo: s.comAlertaTempo === true
        || (ocupada && Number.isFinite(permMin) && permMin < ALERTA_EXCEDIDO_MIN),
      // String vazia é o "sem dado" deles; normalizamos para null.
      tempoDesdeEncerramento: String(s.tempoDesdeEncerramento ?? '') || null,
      tempoDesdeInicioLimpeza: String(s.tempoDesdeInicioLimpeza ?? '') || null,
    }
  })
}

/** Nosso app no PMS. Reserva com outro valor veio de balcão/telefone. */
const APP_ID_SITE = 4

interface ChegadaHoje {
  id: string
  suiteRef: string | null
  suiteClasse: string | null
  dataInicio: string | null
  saidaPrevista: string | null
  nome: string | null
  origem: 'site' | 'recepcao'
  valorPago: number
  totalAPagar: number
  formaPagamento: string | null
  status: number
  ocupacaoId: number | null
  /** Já chegou — a reserva virou estadia. */
  chegou: boolean
}

/**
 * Reservas do PMS que começam hoje.
 *
 * A coluna `recepcao` é o ponto da tela: reserva de telefone e balcão hoje não
 * existe em lugar nenhum do painel, e é o que explica uma suíte "livre no
 * site" que a recepção já prometeu.
 */
function chegadasHoje(reservas: ReservaResult[], hoje: string): ChegadaHoje[] {
  return reservas
    .filter((r) => {
      if (r.cancelada === true) return false
      const inicio = r.dataInicio
      return typeof inicio === 'string' && inicio.slice(0, 10) === hoje
    })
    .map((r) => ({
      id: String(r.id ?? ''),
      suiteRef: (r.suiteRef as string | null) ?? null,
      suiteClasse: (r.suiteClasseNome as string | null) ?? null,
      dataInicio: (r.dataInicio as string | null) ?? null,
      saidaPrevista: (r.saidaPrevista as string | null) ?? null,
      nome: (r.nome as string | null) ?? null,
      origem: Number(r.integracaoAppId) === APP_ID_SITE ? 'site' : 'recepcao',
      valorPago: Number(r.valorPago) || 0,
      totalAPagar: Number(r.totalAPagar) || 0,
      formaPagamento: (r.formaPagamentoDescricao as string | null) ?? null,
      status: Number(r.status) || 0,
      ocupacaoId: r.ocupacaoId == null ? null : Number(r.ocupacaoId),
      chegou: r.ocupacaoId != null,
    }))
    .sort((a, b) => (a.dataInicio ?? '').localeCompare(b.dataInicio ?? ''))
}

/**
 * Roda tudo em paralelo e nunca deixa uma parte derrubar o resto.
 *
 * O painel é de operação: melhor mostrar o mapa das suítes com a
 * disponibilidade por categoria em branco do que uma tela de erro porque um
 * endpoint secundário está defasado.
 */
async function seguro<T>(p: Promise<T>): Promise<{ ok: true; data: T } | { ok: false; erro: string }> {
  try {
    return { ok: true, data: await p }
  } catch (e) {
    const pp = e instanceof PlugPlayError ? e : null
    return {
      ok: false,
      erro: pp ? `HTTP ${pp.status} — ${pp.body.slice(0, 200) || pp.message}` : String(e),
    }
  }
}

/**
 * Mesma faixa de dias, um mês (ou um ano) atrás.
 *
 * Comparar 1–4/ago com o mês de julho inteiro diria que o movimento despencou.
 * Deslocar a faixa preserva o "mesmo pedaço do mês", que é a comparação que a
 * gerência realmente faz. O dia é limitado ao último do mês alvo, então
 * 31/mar → 28/fev em vez de estourar para março.
 */
function deslocar(data: string, meses: number): string {
  const [a, m, d] = data.split('-').map(Number)
  const alvoMes = m - 1 - meses
  const ano = a + Math.floor(alvoMes / 12)
  const mes = ((alvoMes % 12) + 12) % 12
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate()
  const dia = Math.min(d, ultimoDia)
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

function deslocarDias(data: string, dias: number): string {
  const [a, m, d] = data.split('-').map(Number)
  const dt = new Date(Date.UTC(a, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + dias)
  return dt.toISOString().slice(0, 10)
}

type Granularidade = 'dia' | 'semana' | 'mes' | 'ano'

/**
 * O período anterior equivalente, que depende da granularidade escolhida.
 *
 * Comparar sempre com "os N dias anteriores" mediria a semana contra um
 * intervalo que atravessa o fim de semana — e num motel, onde sexta e sábado
 * concentram o movimento, isso inverte o sinal da comparação.
 */
function periodoAnterior(g: Granularidade, inicio: string, fim: string): [string, string] {
  if (g === 'dia')    return [deslocarDias(inicio, -1), deslocarDias(fim, -1)]
  if (g === 'semana') return [deslocarDias(inicio, -7), deslocarDias(fim, -7)]
  if (g === 'ano')    return [deslocar(inicio, 12), deslocar(fim, 12)]
  return [deslocar(inicio, 1), deslocar(fim, 1)]
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const auth = await exigirAdmin(req)
  if (!auth.ok) return auth.response

  const responder = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })

  let corpoJson: Record<string, unknown> = {}
  if (req.method === 'POST') {
    // Corpo vazio ou inválido cai no panorama, que é o default útil.
    try { corpoJson = await req.json() } catch { /* noop */ }
  } else {
    corpoJson = Object.fromEntries(new URL(req.url).searchParams)
  }

  const action = String(corpoJson.action ?? 'panorama')
  const suiteRef = String(corpoJson.suiteRef ?? '')

  if (!isConfigured()) {
    return responder({
      configured: false,
      hint: 'Defina PLUGPLAY_ID e PLUGPLAY_TOKEN no container functions.',
    })
  }

  // ── Conta aberta de uma suíte, sob demanda ────────────────────────────────
  if (action === 'cobranca') {
    if (!suiteRef) return responder({ error: 'suiteRef obrigatório' }, 400)
    const r = await seguro(cobrancaAtual(suiteRef))
    return r.ok
      ? responder({ configured: true, suiteRef, cobranca: r.data })
      : responder({ configured: true, suiteRef, erro: r.erro }, 200)
  }

  if (action !== 'panorama' && action !== 'desempenho' && action !== 'analytics') {
    return responder(
      {
        error: `ação desconhecida: ${action}`,
        disponiveis: ['panorama', 'cobranca', 'desempenho', 'analytics'],
      },
      400,
    )
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const t0 = Date.now()
  const hoje = toPmsDateTime(new Date()).slice(0, 10)

  // ── Analytics ─────────────────────────────────────────────────────────────
  // Proxy para as funções de agregação do banco. Existe para que uma tela nova
  // custe uma migration e um componente, sem precisar abrir esta função de novo
  // a cada corte de dado.
  //
  // A whitelist é fechada **no código**, nunca vinda do cliente: sem ela, quem
  // tivesse um JWT de admin poderia chamar qualquer função do Postgres, e o
  // service_role aqui ignora RLS. Os parâmetros vão nomeados via `rpc()`, que
  // parametriza — não há concatenação de SQL em lugar nenhum.
  if (action === 'analytics') {
    const RPCS = new Set([
      'pms_desempenho',
      'pms_cobertura',
      'pms_mix_periodo',
      'pms_recorrencia_placa',
      'pms_consumo_margem',
      'pms_financeiro',
    ])

    const rpc = String(corpoJson.rpc ?? '')
    if (!RPCS.has(rpc)) {
      return responder({ error: `rpc não liberada: ${rpc}`, disponiveis: [...RPCS] }, 400)
    }

    const params = (corpoJson.params ?? {}) as Record<string, unknown>
    const { data, error } = await supabase.rpc(rpc, params)

    return responder({
      configured: true,
      rpc,
      dados: data ?? null,
      tookMs: Date.now() - t0,
      erro: error?.message ?? null,
    }, error ? 500 : 200)
  }

  // ── Desempenho ────────────────────────────────────────────────────────────
  // Vem inteiro do Postgres, não do PMS: os campos de comparativo do relatório
  // deles voltam null, o relatório mistura venda direta com estadia, e a tela
  // precisa abrir com o PMS fora do ar. Ver a migration 20260804_pms_desempenho.
  if (action === 'desempenho') {
    let inicio = String(corpoJson.inicio ?? '').slice(0, 10)
    let fim    = String(corpoJson.fim ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) inicio = `${hoje.slice(0, 7)}-01`
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fim))    fim = hoje
    if (inicio > fim) return responder({ error: 'inicio depois de fim' }, 400)

    const g = String(corpoJson.granularidade ?? 'mes') as Granularidade
    const [antInicio, antFim] = periodoAnterior(g, inicio, fim)

    const [atual, mesAnterior, anoAnterior, cobertura] = await Promise.all([
      supabase.rpc('pms_desempenho', { p_inicio: inicio, p_fim: fim }),
      supabase.rpc('pms_desempenho', { p_inicio: antInicio, p_fim: antFim }),
      supabase.rpc('pms_desempenho', {
        p_inicio: deslocar(inicio, 12), p_fim: deslocar(fim, 12),
      }),
      supabase.rpc('pms_cobertura'),
    ])

    const erro = atual.error?.message ?? null
    return responder({
      configured: true,
      periodo: { inicio, fim, granularidade: g },
      atual: atual.data ?? null,
      // Nome herdado de quando só havia comparação mensal; hoje é "o período
      // anterior equivalente", que a granularidade define.
      mesAnterior: mesAnterior.data ?? null,
      anoAnterior: anoAnterior.data ?? null,
      // A tela usa para separar "caiu a zero" de "período anterior ao backfill".
      cobertura: cobertura.data ?? null,
      tookMs: Date.now() - t0,
      erro,
    }, erro ? 500 : 200)
  }

  // ── Panorama ──────────────────────────────────────────────────────────────

  const [status, categorias, reservas, suitesLocais, pendentes] = await Promise.all([
    seguro(suitesStatus() as Promise<SuiteStatus[]>),
    seguro(categoriaDisponibilidade()),
    seguro(listarReservas()),
    supabase
      .from('suites')
      .select('id, name, room_number, pms_suite_id, active, sort_order')
      .order('sort_order'),
    supabase
      .from('pms_sync_pendentes')
      .select('id, created_at, check_in, customer_name, total_amount, suite_nome, pms_last_error')
      .limit(20),
  ])

  const locais = (suitesLocais.data ?? []) as SuiteLocal[]
  const pmsSuites = status.ok && Array.isArray(status.data) ? status.data : []
  const suites = montarSuites(pmsSuites, locais)

  const contagem: Record<Balde, number> = {
    ocupada: 0, livre: 0, preparo: 0, bloqueada: 0, outro: 0,
  }
  for (const s of suites) contagem[s.balde]++

  const total = suites.length
  const chegadas = reservas.ok ? chegadasHoje(reservas.data, hoje) : []

  return responder({
    configured: true,
    geradoEm: toPmsDateTime(new Date()),
    hoje,
    tookMs: Date.now() - t0,

    kpis: {
      total,
      ...contagem,
      // Ocupação instantânea: fração de suítes com hóspede dentro. Não confundir
      // com a `taxaOcupacao` do relatório mensal, que é giro por suíte-dia e
      // passa de 100% de propósito. Ver PLUGPLAY-SAMPLES.md.
      ocupacaoPct: total > 0 ? Math.round((contagem.ocupada / total) * 100) : 0,
      receitaAberta: suites.reduce((acc, s) => acc + (s.ocupada ? s.totalPrevisto : 0), 0),
      consumoAberto: suites.reduce((acc, s) => acc + (s.ocupada ? s.totalConsumo : 0), 0),
      emAlerta: suites.filter((s) => s.alertaTempo).length,
    },

    suites,

    // Disponibilidade por categoria é a parte frágil: erra quando a recepção
    // está >15min defasada, e isso é rotina. Vem separada com o erro à vista
    // para a tela marcar "degradado" em vez de sumir com o número.
    categorias: categorias.ok ? categorias.data as CategoriaDisponibilidade[] : [],
    categoriasDegradado: !categorias.ok,
    categoriasErro: categorias.ok ? null : categorias.erro,

    chegadas: {
      site: chegadas.filter((c) => c.origem === 'site'),
      recepcao: chegadas.filter((c) => c.origem === 'recepcao'),
    },

    // Reserva paga no site que não chegou na recepção. A view existe desde
    // 29/07 e nunca tinha aparecido na UI — só num SELECT manual.
    pendentes: pendentes.data ?? [],

    // Falha por fonte, para a tela degradar em pedaços em vez de inteira.
    erros: {
      suites: status.ok ? null : status.erro,
      categorias: categorias.ok ? null : categorias.erro,
      reservas: reservas.ok ? null : reservas.erro,
      suitesLocais: suitesLocais.error?.message ?? null,
      pendentes: pendentes.error?.message ?? null,
    },
  })
})
