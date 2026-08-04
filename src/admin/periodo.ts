// Cálculo de período para os filtros do painel.
//
// Tudo em string YYYY-MM-DD e aritmética em UTC de propósito: as datas do PMS
// são locais e sem fuso, então converter para Date local abriria espaço para a
// virada de horário de verão mover um dia inteiro de faturamento.

export type Granularidade = 'dia' | 'semana' | 'mes' | 'ano'

export const GRANULARIDADES: { id: Granularidade; label: string }[] = [
  { id: 'dia',    label: 'Dia' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes',    label: 'Mês' },
  { id: 'ano',    label: 'Ano' },
]

function paraDate(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d))
}

function paraIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function somarDias(iso: string, n: number): string {
  const d = paraDate(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return paraIso(d)
}

function somarMeses(iso: string, n: number): string {
  const d = paraDate(iso)
  const dia = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + n)
  // Limita ao último dia do mês alvo: 31/mar − 1 mês vira 28/fev, não 03/mar.
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(dia, ultimo))
  return paraIso(d)
}

/** Hoje no fuso da recepção — o mesmo que o backend usa para fechar o dia. */
export function hoje(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/**
 * Faixa completa do período que contém a âncora.
 *
 * Semana começa na segunda (ISO). Para um motel isso importa: sexta e sábado
 * concentram o movimento, e a semana ISO mantém os dois juntos no fim da linha
 * em vez de partir o fim de semana entre duas semanas.
 */
export function faixa(g: Granularidade, ancora: string): [string, string] {
  const d = paraDate(ancora)

  if (g === 'dia') return [ancora, ancora]

  if (g === 'semana') {
    const dow = d.getUTCDay()               // 0 = domingo
    const desdeSegunda = (dow + 6) % 7      // segunda = 0
    const inicio = somarDias(ancora, -desdeSegunda)
    return [inicio, somarDias(inicio, 6)]
  }

  if (g === 'mes') {
    const a = d.getUTCFullYear()
    const m = d.getUTCMonth()
    const ultimo = new Date(Date.UTC(a, m + 1, 0)).getUTCDate()
    const mm = String(m + 1).padStart(2, '0')
    return [`${a}-${mm}-01`, `${a}-${mm}-${String(ultimo).padStart(2, '0')}`]
  }

  const a = d.getUTCFullYear()
  return [`${a}-01-01`, `${a}-12-31`]
}

/** Move a âncora um período inteiro para trás (-1) ou para frente (+1). */
export function navegar(g: Granularidade, ancora: string, passo: number): string {
  if (g === 'dia')    return somarDias(ancora, passo)
  if (g === 'semana') return somarDias(ancora, passo * 7)
  if (g === 'mes')    return somarMeses(ancora, passo)
  return somarMeses(ancora, passo * 12)
}

/**
 * De quanto o comparativo anda para trás.
 *
 * Cada granularidade compara com a anterior equivalente — dia com ontem, mês
 * com o mesmo pedaço do mês passado. Comparar sempre com "os N dias
 * anteriores" faria a semana ser medida contra um intervalo que atravessa o
 * fim de semana, e num motel isso inverte o resultado.
 */
export function faixaAnterior(g: Granularidade, inicio: string, fim: string): [string, string] {
  return [navegar(g, inicio, -1), navegar(g, fim, -1)]
}

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function ddmm(iso: string): string {
  return `${iso.slice(8)}/${iso.slice(5, 7)}`
}

/** Rótulo humano do período — o que aparece entre as setas. */
export function rotulo(g: Granularidade, inicio: string, fim: string): string {
  const [a, m, d] = inicio.split('-').map(Number)

  if (g === 'dia') {
    const nome = paraDate(inicio).toLocaleDateString('pt-BR', {
      weekday: 'short', timeZone: 'UTC',
    }).replace('.', '')
    return `${nome}, ${d} de ${MES_CURTO[m - 1]}`
  }

  if (g === 'semana') return `${ddmm(inicio)} a ${ddmm(fim)}`

  if (g === 'mes') {
    const nome = paraDate(inicio).toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' })
    return `${nome[0].toUpperCase()}${nome.slice(1)} ${a}`
  }

  return String(a)
}

/**
 * Recorta o período ao que existe: nunca antes do primeiro dia ingerido, nunca
 * depois de hoje. Mês corrente vira "até hoje", que é o comportamento certo
 * para acumulado.
 */
export function recortar(
  inicio: string,
  fim: string,
  primeiroDia: string | null,
): [string, string] {
  const h = hoje()
  const i = primeiroDia && inicio < primeiroDia ? primeiroDia : inicio
  const f = fim > h ? h : fim
  return [i, f < i ? i : f]
}

/** Há período seguinte, ou já estamos no atual? */
export function temProximo(g: Granularidade, ancora: string): boolean {
  const [inicio] = faixa(g, navegar(g, ancora, 1))
  return inicio <= hoje()
}

/** Há período anterior dentro do que foi ingerido? */
export function temAnterior(g: Granularidade, ancora: string, primeiroDia: string | null): boolean {
  if (!primeiroDia) return true
  const [, fim] = faixa(g, navegar(g, ancora, -1))
  return fim >= primeiroDia
}
