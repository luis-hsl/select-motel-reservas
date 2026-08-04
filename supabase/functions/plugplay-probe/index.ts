import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { isConfigured, plugplayGet, toPmsDateTime, PLUGPLAY_BASE, PlugPlayError } from '../_shared/plugplay.ts'
import { exigirAdmin } from '../_shared/adminAuth.ts'

// Sondagem da API PlugPlay — descobre o FORMATO das respostas.
//
// Por que existe: a spec (openapi/v1.json) não tipa vários endpoints que
// interessam ao painel. `SuitesStatus`, `CategoriaDisponibilidade`, `Ocupacao`
// e `OcupacoesAgora` declaram `responses.200` vazio, ou seja: modelar tela ou
// tabela em cima deles é chute. Esta função bate em todos e devolve a forma
// real + uma amostra, para virar documentação versionada.
//
// É descartável por natureza: depois que as amostras estiverem em
// PLUGPLAY-SAMPLES.md, ela só volta a ser útil quando o PMS mudar de versão.
//
// **Só GET.** A whitelist inteira é de leitura e usa `plugplayGet`, que não
// sabe escrever. Endpoints de leitura que a API expõe como POST
// (`OcorrenciaManutencao/Kanban`, `Estoque/ListagemSaldo`, os `/Busca`) ficaram
// de fora de propósito — nenhuma sondagem deve poder sujar o sistema que a
// recepção usa.
//
// Exige JWT de admin logado via `exigirAdmin` — no self-host o `VERIFY_JWT` do
// edge-runtime é global e está desligado, então config.toml não protege nada.
// Ver _shared/adminAuth.ts. Isto despeja a operação interna do motel.
//
// Uso:
//   curl -H "Authorization: Bearer $JWT" '.../plugplay-probe'
//   ...?only=suites-status,ocupacao-periodo   → subconjunto (evita timeout)
//   ...?raw=1                                 → sem redigir PII (NÃO commitar)

/** Quantas sondagens em paralelo. 15s de timeout cada; 5 mantém o pior caso curto. */
const LOTE = 5

/** Itens de array mantidos na amostra. Dois já mostram o que varia entre eles. */
const AMOSTRA_ITENS = 2

/** Corte de string na amostra — observação de recepção pode ser longa. */
const MAX_STR = 240

/** Profundidade máxima ao descrever a forma. Além disso vira '…'. */
const MAX_DEPTH = 5

/**
 * Campos que carregam identificação de hóspede. As amostras vão para o
 * repositório, então o default é mascarar: a forma é o que interessa
 * documentar, o valor não.
 */
const PII = /nome|cpf|telefone|fone|email|placa|identidade|identificador|observ|endereco|logradouro|operador|camareira|alias|login/i

interface Probe {
  key: string
  path: string
  query?: Record<string, string | number>
  nota: string
}

interface Resultado {
  key: string
  path: string
  query?: Record<string, string | number>
  nota: string
  ok: boolean
  status: number
  ms: number
  tipo?: string
  itens?: number
  forma?: unknown
  amostra?: unknown
  erro?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Descrição da forma
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resume a estrutura de um valor: chaves e tipos, sem os dados.
 *
 * É o que a spec deveria ter e não tem. Arrays viram `{ '[]': n, of: ... }`
 * usando o primeiro item não-nulo — em resposta homogênea (todas são) isso
 * basta, e evita despejar 1.500 ocupações no output.
 */
function forma(v: unknown, depth = 0): unknown {
  if (v === null) return 'null'
  if (depth >= MAX_DEPTH) return '…'

  if (Array.isArray(v)) {
    const primeiro = v.find((x) => x !== null && x !== undefined)
    return { '[]': v.length, of: primeiro === undefined ? 'vazio' : forma(primeiro, depth + 1) }
  }

  if (typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = forma(val, depth + 1)
    }
    return out
  }

  if (typeof v === 'string') {
    // Datas são o detalhe que mais importa reproduzir depois — o PMS trabalha
    // em horário local sem offset, e a amostra precisa deixar isso visível.
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(v)) return 'string(datetime)'
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'string(date)'
    return 'string'
  }

  return typeof v
}

// ─────────────────────────────────────────────────────────────────────────────
// Amostra (truncada, redigida)
// ─────────────────────────────────────────────────────────────────────────────

function mascara(s: string): string {
  return `«${s.length} chars»`
}

function amostra(v: unknown, redigir: boolean, depth = 0, chave = ''): unknown {
  if (v === null || v === undefined) return null
  if (depth >= MAX_DEPTH) return '…'

  if (Array.isArray(v)) {
    const corte = v.slice(0, AMOSTRA_ITENS).map((x) => amostra(x, redigir, depth + 1, chave))
    return v.length > AMOSTRA_ITENS
      ? [...corte, `… +${v.length - AMOSTRA_ITENS} item(ns)`]
      : corte
  }

  if (typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = amostra(val, redigir, depth + 1, k)
    }
    return out
  }

  if (typeof v === 'string') {
    // null continua null mesmo em campo de PII: "sempre vazio" é justamente o
    // tipo de achado que a sondagem existe para registrar.
    if (redigir && PII.test(chave) && v.length > 0) return mascara(v)
    return v.length > MAX_STR ? `${v.slice(0, MAX_STR)}… (+${v.length - MAX_STR})` : v
  }

  return v
}

// ─────────────────────────────────────────────────────────────────────────────
// Whitelist
// ─────────────────────────────────────────────────────────────────────────────

function montarProbes(): Probe[] {
  // Datas no fuso da recepção, não no do runtime (Deno roda em UTC): perto da
  // meia-noite os dois discordam do dia, e mês/ano do relatório sairia errado.
  const agora = toPmsDateTime(new Date())
  const hoje = agora.slice(0, 10)
  const ano = Number(hoje.slice(0, 4))
  const mes = Number(hoje.slice(5, 7))

  const diaAtras = (n: number) =>
    toPmsDateTime(new Date(Date.now() - n * 86_400_000)).slice(0, 10)

  const inicial = `${diaAtras(7)}T00:00:00`
  const final = `${hoje}T23:59:59`

  return [
    // ── Operação agora (o alvo da Fase 1) ──
    { key: 'suites-status', path: '/api/SuitesStatus',
      nota: 'Status atual das 13 suítes. Sem schema na spec — é o principal alvo desta sondagem.' },
    { key: 'categoria-disponibilidade', path: '/api/CategoriaDisponibilidade',
      nota: 'Livres por categoria. Erra se a recepção estiver >15min defasada; esse erro é estado normal, não falha.' },
    { key: 'ocupacoes-agora', path: '/api/OcupacoesAgora',
      nota: 'Contagem de ocupadas como texto puro. A spec pede empresaId/token em query — ver se responde sem eles.' },

    // ── Movimento real (balcão + site) ──
    { key: 'ocupacao-pendentes', path: '/api/Ocupacao',
      query: { incluirObservacoes: 'true', incluirPagamentos: 'true', incluirConsumos: 'true' },
      nota: 'Feed de ocupações pendentes de sync. GET não consome nada — quem marca é o PUT, que não usamos.' },
    { key: 'ocupacao-periodo', path: '/api/Ocupacao/PorPeriodo',
      query: { inicial, final, incluirObservacoes: 'true', incluirPagamentos: 'true', incluirConsumos: 'true' },
      nota: 'Toda estadia dos últimos 7 dias, balcão inclusive. É a base do ingest da Fase 2.' },
    { key: 'reservas', path: '/api/Reserva', query: { pagina: 1 },
      nota: 'Reservas ativas incl. as de telefone/balcão. Confere se integracaoAppId separa as do site.' },

    // ── Desempenho ──
    { key: 'rel-ocupacao-categoria', path: '/api/Relatorios/PorOcupacaoPorCategoriaMesAno',
      query: { mes, ano },
      nota: 'RevPAR, taxa de ocupação, ticket médio, meta, comparativo mês/ano e placaCarroEstatistica.' },
    { key: 'rel-mapa-calor', path: '/api/Relatorios/MapaCalorPorMesAno', query: { mes, ano },
      nota: 'Grade dia-da-semana × 24h com valor, qtd e taxa.' },

    // ── Financeiro ──
    { key: 'caixa-mes', path: '/api/Caixa/PorMesAno', query: { mes, ano },
      nota: 'Fechamentos de caixa do mês. O detalhe (Caixa/ViewModel) exige um id, então fica pra depois.' },
    { key: 'rel-pagamentos', path: '/api/Relatorios/ListagemPagamentosPorPeriodo',
      query: { inicial, final },
      nota: 'Pagamentos com total por forma.' },
    { key: 'formas-pagamento', path: '/api/Entidades/FormaPagamento', query: { exibeInativo: 'false' },
      nota: 'Dicionário das formas — os campos f1..f15 do caixa referenciam esta lista.' },

    // ── Consumo e produtos ──
    { key: 'rel-venda-produtos', path: '/api/Relatorios/VendaProdutosPorPeriodo',
      query: { inicial, final },
      nota: 'Saída de frigobar/cardápio com margem.' },
    { key: 'rel-curva-abc', path: '/api/Relatorios/CurvaAbcPorPeriodo', query: { inicial, final },
      nota: 'Curva ABC de produto.' },
    { key: 'produtos', path: '/api/Entidades/Produto/GetAll',
      nota: 'Catálogo do PMS — para cruzar com o cardápio do site.' },

    // ── Governança / limpeza ──
    { key: 'rel-limpezas', path: '/api/Relatorios/LimpezasPorPeriodo', query: { inicial, final },
      nota: 'Ciclo Sujo→Limpeza→Aguardando. Tempo real de virada de quarto.' },
    { key: 'rel-interdicoes', path: '/api/Relatorios/InterdicoesPorPeriodo', query: { inicial, final },
      nota: 'Interdições — a origem prática das 2h que o site espelha em CLEANING_BUFFER_H.' },

    // ── Preço e cupom ──
    { key: 'preco-regras', path: '/api/ConsultaPreco/Regras',
      nota: 'Tabela de preço completa do balcão, para comparar com a do site.' },
    { key: 'tabela-preco', path: '/api/Entidades/TabelaPreco',
      nota: 'Modalidades com modo/duração/preço — foi daqui que saiu o mapa do OcupacaoModo.' },
    { key: 'datas-especiais', path: '/api/Entidades/TabelaPreco/DatasEspeciais',
      nota: 'Feriados configurados no PMS.' },
    { key: 'cupons', path: '/api/CupomPromocional',
      nota: 'Cupons cadastrados. Leitura só — criar cupom fica fora desta fase.' },
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
// Execução
// ─────────────────────────────────────────────────────────────────────────────

async function sondar(p: Probe, redigir: boolean): Promise<{ res: Resultado; payload?: unknown }> {
  const t0 = Date.now()
  try {
    const payload = await plugplayGet(p.path, p.query)
    return {
      payload,
      res: {
        key: p.key, path: p.path, query: p.query, nota: p.nota,
        ok: true,
        status: 200,
        ms: Date.now() - t0,
        tipo: Array.isArray(payload) ? 'array' : payload === null ? 'null' : typeof payload,
        ...(Array.isArray(payload) ? { itens: payload.length } : {}),
        forma: forma(payload),
        amostra: amostra(payload, redigir),
      },
    }
  } catch (e) {
    const pp = e instanceof PlugPlayError ? e : null
    return {
      res: {
        key: p.key, path: p.path, query: p.query, nota: p.nota,
        ok: false,
        status: pp?.status ?? -1,
        ms: Date.now() - t0,
        // O corpo do erro é onde a API diz "o aplicativo não possui a permissão
        // X" — é informação de sondagem, não ruído.
        erro: pp ? `${pp.message} — ${pp.body.slice(0, 400)}` : String(e),
      },
    }
  }
}

async function emLotes(
  probes: Probe[],
  redigir: boolean,
): Promise<{ resultados: Resultado[]; payloads: Map<string, unknown> }> {
  const resultados: Resultado[] = []
  const payloads = new Map<string, unknown>()

  for (let i = 0; i < probes.length; i += LOTE) {
    const lote = await Promise.all(probes.slice(i, i + LOTE).map((p) => sondar(p, redigir)))
    for (const { res, payload } of lote) {
      resultados.push(res)
      if (payload !== undefined) payloads.set(res.key, payload)
    }
  }
  return { resultados, payloads }
}

/**
 * `CobrancaAtual` é por referência de suíte e só faz sentido em suíte ocupada,
 * então depende do resultado do SuitesStatus — vai numa segunda rodada.
 */
function refOcupada(suitesStatus: unknown): string | null {
  if (!Array.isArray(suitesStatus)) return null
  for (const s of suitesStatus as Record<string, unknown>[]) {
    // Os dois sinais que o plugplay-mapa-dia já usa: statusId 1 é Livre, e
    // isOcupado marca ocupação. Exigir statusId numérico evita que um campo
    // ausente (NaN !== 1) faça uma suíte livre passar por ocupada.
    const statusId = Number(s.statusId)
    const ocupada = s.isOcupado === true || (Number.isFinite(statusId) && statusId !== 1)
    const ref = s.ref ?? s.referencia ?? s.referenciaDisplay
    if (ocupada && ref != null && String(ref).length > 0) return String(ref)
  }
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const auth = await exigirAdmin(req)
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const redigir = url.searchParams.get('raw') !== '1'
  const only = (url.searchParams.get('only') ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean)

  const responder = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body, null, 2), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })

  if (!isConfigured()) {
    return responder({
      configured: false,
      hint: 'Defina PLUGPLAY_ID e PLUGPLAY_TOKEN no container functions.',
    })
  }

  let probes = montarProbes()
  if (only.length) {
    const conhecidas = new Set(probes.map((p) => p.key))
    const invalidas = only.filter((k) => !conhecidas.has(k))
    if (invalidas.length) {
      return responder(
        { error: `keys desconhecidas: ${invalidas.join(', ')}`, disponiveis: [...conhecidas] },
        400,
      )
    }
    probes = probes.filter((p) => only.includes(p.key))
  }

  const t0 = Date.now()
  const { resultados, payloads } = await emLotes(probes, redigir)

  // Segunda rodada: cobrança da primeira suíte ocupada que o status apontar.
  const ref = refOcupada(payloads.get('suites-status'))
  if (ref) {
    const { res } = await sondar({
      key: 'cobranca-atual',
      path: `/api/CobrancaAtual/${encodeURIComponent(ref)}`,
      nota: `Conta aberta da suíte ${ref} (escolhida por estar ocupada agora).`,
    }, redigir)
    resultados.push(res)
  } else if (!only.length || only.includes('suites-status')) {
    resultados.push({
      key: 'cobranca-atual',
      path: '/api/CobrancaAtual/{suiteReferencia}',
      nota: 'Pulado: nenhuma suíte ocupada no momento. Rodar de novo com o motel em movimento.',
      ok: false,
      status: -1,
      ms: 0,
      erro: 'sem suíte ocupada para sondar',
    })
  }

  return responder({
    configured: true,
    baseUrl: PLUGPLAY_BASE,
    geradoEm: toPmsDateTime(new Date()),
    redigido: redigir,
    totalMs: Date.now() - t0,
    resumo: {
      sondados: resultados.length,
      ok: resultados.filter((r) => r.ok).length,
      falhas: resultados.filter((r) => !r.ok).map((r) => `${r.key} (${r.status})`),
    },
    resultados,
  })
})
