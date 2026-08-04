import { supabase } from './supabase'

// Cliente da aba "Motel" do admin. Tudo passa pela edge function
// `plugplay-admin` (exige JWT) — o token do PMS não pode chegar ao browser.
//
// As formas abaixo espelham o que a função devolve; a origem delas é a
// sondagem versionada em supabase/functions/_shared/PLUGPLAY-SAMPLES.md.

export type Balde = 'ocupada' | 'livre' | 'preparo' | 'bloqueada' | 'outro'

export interface SuitePainel {
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

export interface CategoriaDisponibilidade {
  categoriaId: number
  categoria: string
  disponiveis: number
  total: number
}

export interface ChegadaHoje {
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
  chegou: boolean
}

export interface PendenteSync {
  id: string
  created_at: string
  check_in: string | null
  customer_name: string | null
  total_amount: number | null
  suite_nome: string | null
  pms_last_error: string | null
}

export interface Panorama {
  configured: boolean
  hint?: string
  geradoEm?: string
  hoje?: string
  tookMs?: number
  kpis?: {
    total: number
    ocupada: number
    livre: number
    preparo: number
    bloqueada: number
    outro: number
    ocupacaoPct: number
    receitaAberta: number
    consumoAberto: number
    emAlerta: number
  }
  suites?: SuitePainel[]
  categorias?: CategoriaDisponibilidade[]
  categoriasDegradado?: boolean
  categoriasErro?: string | null
  chegadas?: { site: ChegadaHoje[]; recepcao: ChegadaHoje[] }
  pendentes?: PendenteSync[]
  erros?: Record<string, string | null>
}

/**
 * Estado do motel agora, numa chamada.
 *
 * Devolve `null` só quando a chamada em si falhou — PMS fora do ar chega aqui
 * como `configured: true` com os campos de erro preenchidos, para a tela
 * degradar em pedaços. Tratar `null` como "sem dado", nunca como "motel vazio".
 */
export async function fetchPanorama(): Promise<Panorama | null> {
  try {
    const { data, error } = await supabase.functions.invoke<Panorama>('plugplay-admin', {
      body: { action: 'panorama' },
    })
    if (error || !data) return null
    return data
  } catch {
    return null
  }
}

// ─── Desempenho ──────────────────────────────────────────────────────────────
// Vem do Postgres, não do PMS: o comparativo do relatório deles volta null, o
// relatório mistura venda direta com estadia, e a tela precisa abrir com o PMS
// fora do ar.

export interface DesempenhoKpis {
  estadias: number
  receita: number
  consumo: number
  desconto: number
  cortesia: number
  com_placa: number
  ticket: number
  revpar: number
  /** Ocupações por suíte-dia. Passa de 1,0 legitimamente — motel gira o quarto. */
  taxa_giro: number
  extras_linhas: number
  extras_receita: number
}

export interface Periodo {
  inicio: string
  fim: string
  dias: number
  suites: number
}

export interface Desempenho {
  periodo: Periodo
  kpis: DesempenhoKpis
  diario: Array<{ dia: string; estadias: number; receita: number; consumo: number }>
  por_dia_semana: Array<{ dow: number; estadias: number; receita: number }>
  por_origem: Array<{ origem: string; estadias: number; receita: number }>
  por_categoria: Array<{ categoria: string; estadias: number; receita: number }>
  por_modalidade: Array<{ modo: number; rotulo: string; estadias: number; receita: number }>
}

export interface Cobertura {
  primeiro_dia: string | null
  ultimo_dia: string | null
  estadias: number
  linhas: number
}

export interface DesempenhoResponse {
  configured: boolean
  periodo: { inicio: string; fim: string; granularidade?: string }
  atual: Desempenho | null
  /** O período anterior equivalente — a granularidade define o salto. */
  mesAnterior: Desempenho | null
  anoAnterior: Desempenho | null
  cobertura: Cobertura | null
  tookMs: number
  erro: string | null
}

export async function fetchDesempenho(
  inicio: string,
  fim: string,
  granularidade: 'dia' | 'semana' | 'mes' | 'ano' = 'mes',
): Promise<DesempenhoResponse | null> {
  try {
    const { data, error } = await supabase.functions.invoke<DesempenhoResponse>('plugplay-admin', {
      body: { action: 'desempenho', inicio, fim, granularidade },
    })
    if (error || !data) return null
    return data
  } catch {
    return null
  }
}

export interface CobrancaResponse {
  configured: boolean
  suiteRef?: string
  cobranca?: unknown
  erro?: string
}

/** Conta aberta de uma suíte, buscada só quando o admin abre o detalhe. */
export async function fetchCobranca(suiteRef: string): Promise<CobrancaResponse | null> {
  try {
    const { data, error } = await supabase.functions.invoke<CobrancaResponse>('plugplay-admin', {
      body: { action: 'cobranca', suiteRef },
    })
    if (error || !data) return null
    return data
  } catch {
    return null
  }
}
