// Cliente da API MotelMais PlugPlay — o PMS do motel.
// Spec: https://oxpi.com.br/api/PlugPlay/openapi/v1.json
//
// Autenticação: dois headers, PLUG-PLAY-ID (identificador do app integrador)
// e PLUG-PLAY-TOKEN. Não há OAuth no caminho que usamos.
//
// Enquanto as credenciais não chegam do motel, isConfigured() devolve false e
// quem chama pula a integração em vez de quebrar — o site continua vendendo.

const DEFAULT_BASE = 'https://oxpi.com.br/api/PlugPlay'
const TIMEOUT_MS   = 15_000

export const PLUGPLAY_BASE =
  Deno.env.get('PLUGPLAY_BASE_URL')?.replace(/\/+$/, '') ?? DEFAULT_BASE

const PLUGPLAY_ID    = Deno.env.get('PLUGPLAY_ID')    ?? ''
const PLUGPLAY_TOKEN = Deno.env.get('PLUGPLAY_TOKEN') ?? ''

/** Fuso da recepção. O PMS trabalha em horário local, sem offset. */
const TZ = Deno.env.get('PLUGPLAY_TZ') ?? 'America/Sao_Paulo'

export function isConfigured(): boolean {
  return PLUGPLAY_ID.length > 0 && PLUGPLAY_TOKEN.length > 0
}

export class PlugPlayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message)
    this.name = 'PlugPlayError'
  }
  /** 4xx não melhora com retry; 5xx e rede sim. */
  get retryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500
  }
}

type Query = Record<string, string | number | undefined | null>

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  opts: { query?: Query; body?: unknown } = {},
): Promise<T> {
  if (!isConfigured()) {
    throw new PlugPlayError('PLUGPLAY_ID/PLUGPLAY_TOKEN não configurados', 0, '')
  }

  const url = new URL(PLUGPLAY_BASE + path)
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(url, {
      method,
      signal: ctrl.signal,
      headers: {
        'PLUG-PLAY-ID':    PLUGPLAY_ID,
        'PLUG-PLAY-TOKEN': PLUGPLAY_TOKEN,
        'Accept':          'application/json',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    })
  } catch (e) {
    // Timeout ou falha de rede — status 0 marca como retryable
    throw new PlugPlayError(
      `PlugPlay ${method} ${path} falhou: ${e instanceof Error ? e.message : String(e)}`,
      0,
      '',
    )
  } finally {
    clearTimeout(timer)
  }

  const text = await res.text()

  if (!res.ok) {
    throw new PlugPlayError(
      `PlugPlay ${method} ${path} → HTTP ${res.status}`,
      res.status,
      text.slice(0, 1000),
    )
  }

  if (!text) return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    // Alguns endpoints devolvem texto puro (ex.: /api/OcupacoesAgora)
    return text as unknown as T
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Datas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converte um instante UTC para "YYYY-MM-DDTHH:mm:ss" no fuso da recepção.
 *
 * O PMS interpreta as datas que recebe como horário local da empresa. Mandar
 * ISO com Z faria a reserva das 22h aparecer às 01h do dia seguinte lá.
 */
export function toPmsDateTime(iso: string | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) throw new Error(`Data inválida para o PMS: ${iso}`)

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(d)

  const g = (t: string) => parts.find((p) => p.type === t)!.value
  // en-CA + hour12:false devolve 24 para meia-noite em alguns runtimes
  const hour = g('hour') === '24' ? '00' : g('hour')

  return `${g('year')}-${g('month')}-${g('day')}T${hour}:${g('minute')}:${g('second')}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoints
// ─────────────────────────────────────────────────────────────────────────────

/** Subconjunto de Reserva que o POST/PUT aceita. A spec expõe ~60 campos. */
export interface ReservaPayload {
  suiteId?: number
  suiteCategoriaIntegracaoId?: number
  dataInicio: string
  saidaNegociado?: string
  modo?: number
  /**
   * Horas que a suíte fica interditada ANTES da entrada, para limpeza.
   * Verificado: uma reserva 18:00–20:00 com 1 bloqueia 17:00–20:00; com 2,
   * 16:00–20:00. Omitir faz o PMS aplicar o default do integrador.
   */
  horasInterdicao?: number
  nome?: string
  telefone?: string
  email?: string
  cpf?: string
  observacoes?: string
  integracaoId?: string
  valorPago?: number
  valorNegociado?: number
  codigoPagamento?: string
}

export interface ReservaResult {
  id?: string
  suiteId?: number | string
  suiteRef?: string | null
  integracaoId?: string | null
  [k: string]: unknown
}

/**
 * POST /api/Reserva — cria a reserva no PMS.
 *
 * Idempotente do lado deles: se `integracaoId` já existir para o mesmo
 * `integracaoAppId`, devolve 400. Mandamos o UUID da nossa reservation, então
 * um retry da fila não duplica — só precisa ser tratado como sucesso.
 *
 * Quando `suiteId` vem vazio mas `suiteCategoriaIntegracaoId` não, o PMS
 * escolhe sozinho uma suíte livre da categoria.
 *
 * Cuidado com o retorno: apesar de a spec tipar Reserva, na prática o corpo é
 * só o uuid entre aspas — `"63c095e6-3b36-498e-aea7-3227d878d38a"`. Verificado
 * contra a API em 29/07/2026. Normalizamos para objeto aqui para quem chama
 * não precisar saber disso.
 */
export async function criarReserva(payload: ReservaPayload): Promise<ReservaResult> {
  const raw = await request<ReservaResult | string>('POST', '/api/Reserva', { body: payload })
  return typeof raw === 'string' ? { id: raw } : (raw ?? {})
}

/** GET /api/Reserva/{id} — usado para reconciliar/conferir o que subiu. */
export function buscarReserva(id: string): Promise<ReservaResult> {
  return request<ReservaResult>('GET', `/api/Reserva/${encodeURIComponent(id)}`)
}

/**
 * DELETE /api/Reserva — cancelamento lógico (marca Cancelada=true).
 * Aceita localizar por `id` do PMS ou pelo nosso `integracaoId`.
 */
export function cancelarReserva(
  args: { id?: string; integracaoId?: string; motivo?: string },
): Promise<void> {
  return request<void>('DELETE', '/api/Reserva', { body: args })
}

export interface DisponibilidadeResult {
  disponivel: boolean
  mensagem: string | null
}

/**
 * GET /api/ReservaDisponibilidade/PorSuiteId — a suíte está livre no intervalo?
 * `entrada` e `saida` em horário local da recepção (use toPmsDateTime).
 */
export function disponibilidadePorSuite(
  suiteId: number,
  entrada: string,
  saida: string,
): Promise<DisponibilidadeResult> {
  return request<DisponibilidadeResult>('GET', '/api/ReservaDisponibilidade/PorSuiteId', {
    query: { suiteId, entrada, saida },
  })
}

/** GET /api/SuitesStatus — status atual de todas as suítes (para diagnóstico/mapeamento). */
export function suitesStatus(): Promise<unknown> {
  return request<unknown>('GET', '/api/SuitesStatus')
}

/**
 * GET /api/Reserva — reservas ativas, 200 por página, DataCadastro desc.
 * Canceladas não aparecem (verificado). Paginamos até esgotar porque a ordem
 * é por cadastro, não por data de entrada: a reserva de daqui a 3 meses pode
 * estar em qualquer página.
 */
export async function listarReservas(maxPaginas = 5): Promise<ReservaResult[]> {
  const todas: ReservaResult[] = []
  for (let p = 1; p <= maxPaginas; p++) {
    const pagina = await request<ReservaResult[]>('GET', '/api/Reserva', {
      query: { pagina: p },
    })
    if (!Array.isArray(pagina) || pagina.length === 0) break
    todas.push(...pagina)
    if (pagina.length < 200) break
  }
  return todas
}
