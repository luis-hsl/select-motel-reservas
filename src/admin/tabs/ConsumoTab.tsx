import { useEffect, useState } from 'react'
import { fetchAnalytics } from '../../lib/plugplayAdmin'
import PeriodoSeletor from '../PeriodoSeletor'
import { faixa, hoje, recortar, type Granularidade } from '../periodo'

// Aba "Consumo" — frigobar, cardápio e sexshop: o que vende, o que sobra.
//
// **Por que esta tela existe apesar do 401.** A Oxpi não liberou
// `RelVendaProdutos` nem `RelCurvaAbc`, então os dois relatórios prontos deles
// estão fechados para nós. Não importa: cada estadia já chega com os itens
// consumidos trazendo preço de venda E preço de custo, item a item. Margem e
// curva ABC são conta nossa, feita em `pms_consumo_margem`, e não dependem de
// permissão que talvez nunca venha.
//
// **O que a tela precisa admitir.** Metade do faturamento de consumo vem de
// linhas com `precoCusto: 0` — custo não cadastrado, não custo zero. A margem
// mostrada cobre só a parte com custo conhecido, e isso aparece em cima, não
// numa nota de rodapé: uma "margem de 100%" silenciosa é o tipo de número que
// faz alguém decidir errado.

/** Cor das marcas de dado. Fria de propósito: o ouro é da marca e da ação. */
const MARCA = '#4d94a8'
const MARCA_MEDIA = '#3a7288'
const MARCA_FRACA = '#2b5563'

/** Rampa da curva ABC — mesma matiz em três forças, não uma paleta categórica. */
const COR_ABC: Record<string, string> = { A: MARCA, B: MARCA_MEDIA, C: MARCA_FRACA }

const NOTA_ABC: Record<string, string> = {
  A: 'os primeiros 80% do faturamento',
  B: 'os 15% seguintes',
  C: 'a cauda — os últimos 5%',
}

/**
 * Abaixo disto o item deixou de pagar o trabalho de manter estoque parado num
 * frigobar. Não é regra contábil: é o corte que separa, nestes dados, os itens
 * de markup normal (água a 78%, sexshop a 65%) do punhado que sai a preço de
 * custo por erro de cadastro.
 */
const LIMIAR_RUIM = 0.3

/** Abaixo disto a margem total é indicativa, e a tela diz isso em voz alta. */
const LIMIAR_COBERTURA = 0.9

interface Kpis {
  estadias: number
  estadias_com_consumo: number
  taxa_anexacao: number
  receita_estadias: number
  consumo: number
  consumo_pms: number
  divergencia: number
  participacao: number
  ticket_consumo: number
  consumo_por_estadia: number
  linhas: number
  unidades: number
  produtos: number
  produtos_fora_catalogo: number
  custo: number
  margem: number
  margem_pct: number | null
  receita_com_custo: number
  receita_sem_custo: number
  cobertura_custo: number
}

interface Produto {
  produto_id: number
  nome: string
  grupo: string
  /** Falso = consumido mas ausente de `pms_produtos`; o nome vira "Produto <id>". */
  no_catalogo: boolean
  classe: 'A' | 'B' | 'C'
  unidades: number
  linhas: number
  estadias: number
  preco_medio: number | null
  receita: number
  custo: number
  receita_com_custo: number
  linhas_sem_custo: number
  /** Linhas onde o custo veio igual (ou maior) ao preço — cheiro de cadastro. */
  linhas_custo_cobre_preco: number
  margem: number | null
  margem_pct: number | null
  participacao: number
  acumulado: number
}

interface Grupo {
  grupo: string
  produtos: number
  unidades: number
  receita: number
  custo: number
  receita_com_custo: number
  margem: number | null
  margem_pct: number | null
  cobertura_custo: number | null
}

interface Consumo {
  periodo: { inicio: string; fim: string; dias: number }
  kpis?: Kpis
  abc?: Array<{ classe: string; produtos: number; receita: number; participacao: number; margem: number }>
  produtos?: Produto[]
  grupos?: Grupo[]
  erro?: string
}

interface Cobertura { primeiro_dia: string | null }

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function brlExato(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function pct(v: number, casas = 1): string {
  return `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: casas })}%`
}

function num(v: number): string {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

/** Cor de estado da margem. Não é marca de dado — é semáforo. */
function corMargem(m: number | null): string {
  if (m == null) return 'text-white/25'
  if (m < 0) return 'text-red-400'
  if (m < LIMIAR_RUIM) return 'text-amber-400'
  return 'text-white/60'
}

export default function ConsumoTab() {
  const [dados, setDados] = useState<Consumo | null>(null)
  const [primeiroDia, setPrimeiroDia] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [falhou, setFalhou] = useState(false)
  const [gran, setGran] = useState<Granularidade>('mes')
  const [ancora, setAncora] = useState<string>(() => hoje())

  // Cobertura é do histórico inteiro, não do período — buscar junto com os
  // dados a re-buscaria a cada clique de seta sem que a resposta mudasse.
  useEffect(() => {
    let cancelado = false
    async function carregar() {
      const c = await fetchAnalytics<Cobertura>('pms_cobertura')
      if (!cancelado && c) setPrimeiroDia(c.primeiro_dia)
    }
    void carregar()
    return () => { cancelado = true }
  }, [])

  useEffect(() => {
    let cancelado = false

    async function carregar() {
      const [bruto, brutoFim] = faixa(gran, ancora)
      const [p_inicio, p_fim] = recortar(bruto, brutoFim, primeiroDia)
      const r = await fetchAnalytics<Consumo>('pms_consumo_margem', { p_inicio, p_fim })
      if (cancelado) return
      if (r?.kpis) { setDados(r); setFalhou(false) } else { setFalhou(true) }
      setLoading(false)
    }

    void carregar()
    return () => { cancelado = true }
  }, [gran, ancora, primeiroDia])

  if (loading) {
    return <div className="text-white/30 py-16 text-center text-sm">Somando o frigobar...</div>
  }

  const k = dados?.kpis
  if (!k) {
    return (
      <div className="space-y-5">
        <Cabecalho gran={gran} ancora={ancora} primeiroDia={primeiroDia}
                   onChange={(g, n) => { setGran(g); setAncora(n) }} nota={null} />
        <div className="bg-white/[0.03] border border-white/8 rounded-xl p-8 text-center">
          <p className="text-white/50 text-sm">
            {falhou ? 'Não foi possível carregar o consumo.' : 'Sem consumo ingerido no período.'}
          </p>
          <p className="text-white/25 text-xs mt-2">
            O ingest roda a cada 15 minutos. Um backfill traz o histórico de uma vez.
          </p>
        </div>
      </div>
    )
  }

  const produtos = dados?.produtos ?? []
  const grupos = dados?.grupos ?? []
  const abc = dados?.abc ?? []
  const margemGeral = k.margem_pct ?? 0

  // Só entra na análise de margem quem tem custo conhecido em toda a venda:
  // um produto meio coberto teria a margem calculada sobre metade do giro e
  // apareceria melhor do que é.
  const comCusto = produtos.filter((p) => p.margem_pct != null && p.linhas_sem_custo === 0)

  // "Vende muito e rende pouco" ordenado pelo dinheiro que está na mesa, não
  // pela margem crua: 22% num item de R$ 2 mil dói mais que 5% num de R$ 50.
  // A conta é quanto sobraria a mais se o item rendesse a média da casa.
  const gargalos = comCusto
    .filter((p) => (p.margem_pct as number) < margemGeral)
    .map((p) => ({ p, perda: p.receita_com_custo * (margemGeral - (p.margem_pct as number)) }))
    .sort((a, b) => b.perda - a.perda)
    .slice(0, 8)

  // Custo estampado igual ao preço em toda linha é cadastro, não precificação —
  // ninguém vende 133 unidades de propósito a preço de custo.
  const cadastroSuspeito = produtos
    .filter((p) => p.linhas_custo_cobre_preco > 0 && p.linhas_custo_cobre_preco === p.linhas)
    .sort((a, b) => b.receita - a.receita)
    .slice(0, 6)

  const semCusto = produtos
    .filter((p) => p.receita_com_custo === 0 && p.receita > 0)
    .sort((a, b) => b.receita - a.receita)
    .slice(0, 8)

  const coberturaBaixa = k.cobertura_custo < LIMIAR_COBERTURA

  return (
    <div className="space-y-5">
      <Cabecalho
        gran={gran} ancora={ancora} primeiroDia={primeiroDia}
        onChange={(g, n) => { setGran(g); setAncora(n) }}
        nota={`${dados?.periodo.dias ?? 0} dias · ${num(k.linhas)} lançamentos · ${k.produtos} produtos`}
      />

      {/* O aviso vem antes dos números porque qualifica todos eles. Âmbar é
          cor de estado — não disputa com o ouro da marca. */}
      {coberturaBaixa && (
        <div className="bg-amber-500/[0.06] border border-amber-500/25 rounded-xl p-4">
          <p className="text-amber-300/90 text-xs">
            Custo cadastrado em apenas{' '}
            <span className="figura">{pct(k.cobertura_custo)}</span> do faturamento de consumo
          </p>
          <p className="text-white/35 text-[11px] mt-1">
            <span className="figura">{brl(k.receita_sem_custo)}</span> vendidos sem custo no PMS ficam
            fora do cálculo de margem. Tratar esse custo como zero produziria margem de 100%
            e uma decisão errada — a margem abaixo cobre só{' '}
            <span className="figura">{brl(k.receita_com_custo)}</span>.
          </p>
        </div>
      )}

      {/* KPIs — o quanto o consumo pesa e o quanto sobra */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi rotulo="Consumo" valor={brl(k.consumo)} destaque
             nota={`${pct(k.participacao)} da receita das estadias`} />
        <Kpi rotulo="Margem" valor={brl(k.margem)}
             nota={`sobre ${brl(k.receita_com_custo)} com custo`} />
        <Kpi rotulo="Margem %" valor={k.margem_pct != null ? pct(k.margem_pct) : '—'}
             nota={`custo de ${brl(k.custo)}`} />
        <Kpi rotulo="Taxa de anexação" valor={pct(k.taxa_anexacao)}
             nota={`${num(k.estadias_com_consumo)} de ${num(k.estadias)} estadias consomem algo`} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi rotulo="Ticket de consumo" valor={brlExato(k.ticket_consumo)}
             nota="média de quem consome" />
        <Kpi rotulo="Por estadia" valor={brlExato(k.consumo_por_estadia)}
             nota="diluído em todas as estadias" />
        <Kpi rotulo="Unidades" valor={num(k.unidades)}
             nota={`${num(k.linhas)} lançamentos`} />
        <Kpi rotulo="Produtos" valor={num(k.produtos)}
             nota={k.produtos_fora_catalogo > 0
               ? `${k.produtos_fora_catalogo} fora do catálogo`
               : 'todos no catálogo'} />
      </div>

      {/* Curva ABC */}
      <Painel titulo="Curva ABC"
              nota="Onde o faturamento de consumo se concentra — o que a permissão RelCurvaAbc daria, calculado aqui">
        {abc.length === 0 ? (
          <p className="text-white/20 text-xs">Sem consumo no período.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex h-2.5 rounded-full overflow-hidden bg-white/5">
              {abc.map((f) => (
                <div key={f.classe} style={{
                  width: `${Math.max(0.5, f.participacao * 100)}%`,
                  background: COR_ABC[f.classe] ?? MARCA_FRACA,
                }} />
              ))}
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              {abc.map((f) => (
                <div key={f.classe} className="flex items-start gap-2.5">
                  <span className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                        style={{ background: COR_ABC[f.classe] ?? MARCA_FRACA }} />
                  <div>
                    <p className="text-white/70 text-xs">
                      Classe {f.classe}
                      <span className="figura text-white/40 ml-2">{f.produtos} produtos</span>
                    </p>
                    <p className="figura text-white/50 text-xs mt-0.5">
                      {brl(f.receita)}
                      <span className="text-white/30 ml-2">{pct(f.participacao)}</span>
                    </p>
                    <p className="text-white/25 text-[10px] mt-0.5">{NOTA_ABC[f.classe] ?? ''}</p>
                  </div>
                </div>
              ))}
            </div>
            {/* A leitura acionável da curva: quantos itens carregam a operação. */}
            {abc[0] && (
              <p className="text-white/25 text-[11px]">
                <span className="figura">{abc[0].produtos}</span> produtos de{' '}
                <span className="figura">{k.produtos}</span> fazem{' '}
                <span className="figura">{pct(abc[0].participacao)}</span> do consumo. A cauda
                custa espaço de frigobar e capital parado.
              </p>
            )}
          </div>
        )}
      </Painel>

      <div className="grid lg:grid-cols-2 gap-4">
        <Painel titulo="Quem faz o faturamento" nota="Top 12 por receita de consumo, com a margem de cada um">
          <ListaProdutos itens={produtos.slice(0, 12)} vazio="Sem consumo no período." />
        </Painel>

        <Painel titulo="Por grupo" nota="Receita e margem por categoria do catálogo">
          <ListaGrupos itens={grupos.slice(0, 12)} />
        </Painel>
      </div>

      {/* O achado acionável: giro alto × margem baixa */}
      <Painel titulo="Vende muito e rende pouco"
              nota={`Ordenado pelo que deixa de sobrar em relação à média da casa (${pct(margemGeral)}) — só produtos com custo cadastrado em todas as vendas`}>
        {gargalos.length === 0 ? (
          <p className="text-white/20 text-xs">
            Nenhum produto com custo conhecido rende abaixo da média. Com{' '}
            <span className="figura">{pct(k.cobertura_custo)}</span> de cobertura de custo,
            isso diz mais sobre o cadastro do que sobre o frigobar.
          </p>
        ) : (
          <div className="space-y-2.5">
            {gargalos.map(({ p, perda }) => (
              <div key={p.produto_id}
                   className="flex items-baseline justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <span className="text-white/70 text-xs">{p.nome}</span>
                  <span className="text-white/25 text-[10px] ml-2">
                    {p.grupo} · classe {p.classe}
                  </span>
                </div>
                <div className="flex items-baseline gap-3 shrink-0">
                  <span className="figura text-white/40 text-[11px]">{num(p.unidades)} un</span>
                  <span className="figura text-white/50 text-[11px]">{brl(p.receita)}</span>
                  <span className={`figura text-[11px] ${corMargem(p.margem_pct)}`}>
                    {pct(p.margem_pct as number)}
                  </span>
                  <span className="figura text-amber-400/70 text-[11px] w-20 text-right"
                        title="Quanto sobraria a mais se rendesse a média da casa">
                    −{brl(perda)}
                  </span>
                </div>
              </div>
            ))}
            <p className="text-white/25 text-[10px] pt-1">
              A última coluna é o que esses itens custam de margem contra a média —
              somados, <span className="figura">{brl(gargalos.reduce((s, g) => s + g.perda, 0))}</span>{' '}
              no período. Repreçar ou trocar de fornecedor age exatamente aqui.
            </p>
          </div>
        )}
      </Painel>

      <div className="grid lg:grid-cols-2 gap-4">
        <Painel titulo="Custo igual ao preço de venda"
                nota="Margem exatamente zero em todo lançamento — é cadastro copiado, não precificação">
          {cadastroSuspeito.length === 0 ? (
            <p className="text-white/20 text-xs">Nenhum produto nessa situação. Bom sinal.</p>
          ) : (
            <div className="space-y-2">
              {cadastroSuspeito.map((p) => (
                <div key={p.produto_id} className="flex items-baseline justify-between gap-3">
                  <span className="text-white/70 text-xs truncate">{p.nome}</span>
                  <span className="shrink-0">
                    <span className="figura text-white/40 text-[11px]">{num(p.unidades)} un</span>
                    <span className="figura text-white/50 text-[11px] ml-3">{brl(p.receita)}</span>
                    <span className="figura text-amber-400 text-[11px] ml-3">
                      {p.margem_pct != null ? pct(p.margem_pct) : '—'}
                    </span>
                  </span>
                </div>
              ))}
              <p className="text-white/25 text-[10px] pt-1">
                Enquanto o custo estiver estampado com o preço, a margem real desses itens
                é desconhecida — não zero.
              </p>
            </div>
          )}
        </Painel>

        <Painel titulo="Sem custo cadastrado"
                nota="Faturam, mas não entram em nenhuma conta de margem">
          {semCusto.length === 0 ? (
            <p className="text-white/20 text-xs">Todo produto vendido tem custo. Raro e ótimo.</p>
          ) : (
            <div className="space-y-2">
              {semCusto.map((p) => (
                <div key={p.produto_id} className="flex items-baseline justify-between gap-3">
                  <span className="text-white/70 text-xs truncate">
                    {p.nome}
                    {!p.no_catalogo && (
                      <span className="text-white/25 text-[10px] ml-2">fora do catálogo</span>
                    )}
                  </span>
                  <span className="shrink-0">
                    <span className="figura text-white/40 text-[11px]">{num(p.unidades)} un</span>
                    <span className="figura text-white/50 text-[11px] ml-3">{brl(p.receita)}</span>
                  </span>
                </div>
              ))}
              <p className="text-white/25 text-[10px] pt-1">
                Cadastrar o custo desses itens no PMS é o que faz a margem acima virar
                a margem de verdade.
              </p>
            </div>
          )}
        </Painel>
      </div>

      <div className="text-white/20 text-[10px] space-y-1">
        <p>
          Preço e custo vêm unitários em <code className="text-white/30">consumos[]</code>: a nossa
          soma dá <span className="figura">{brlExato(k.consumo)}</span> contra os{' '}
          <span className="figura">{brlExato(k.consumo_pms)}</span> que o PMS carimba na estadia
          {Math.abs(k.divergencia) >= 0.01
            ? <> — diferença de <span className="figura">{brlExato(k.divergencia)}</span>, que é
              cortesia e lançamento digitado direto no caixa, não erro de fórmula.</>
            : <>, sem diferença.</>}
        </p>
        <p>
          Curva ABC e margem por produto são calculadas aqui porque as permissões
          RelVendaProdutos e RelCurvaAbc do PMS respondem 401 para o nosso integrador.
        </p>
      </div>
    </div>
  )
}

function Cabecalho({ gran, ancora, primeiroDia, onChange, nota }: {
  gran: Granularidade; ancora: string; primeiroDia: string | null
  onChange: (g: Granularidade, ancora: string) => void
  nota: string | null
}) {
  return (
    <div className="flex items-start justify-between flex-wrap gap-3">
      <div>
        <h2 className="font-serif text-lg text-white font-light">
          Consumo <span className="gold-gradient italic font-semibold">e margem</span>
        </h2>
        <p className="text-white/25 text-[11px] mt-0.5">
          Frigobar, cardápio e sexshop — venda, custo e o que sobra
        </p>
        {nota && <p className="figura text-white/20 text-[10px] mt-0.5">{nota}</p>}
      </div>
      <PeriodoSeletor
        granularidade={gran} ancora={ancora} primeiroDia={primeiroDia} onChange={onChange}
      />
    </div>
  )
}

function Kpi({ rotulo, valor, nota, destaque }: {
  rotulo: string; valor: string; nota?: string; destaque?: boolean
}) {
  return (
    <div className={`border rounded-xl p-4 ${
      destaque ? 'bg-gold-500/5 border-gold-700/30' : 'bg-white/[0.03] border-white/8'
    }`}>
      <p className="text-white/35 text-[10px] uppercase tracking-wider">{rotulo}</p>
      <p className={`figura text-2xl font-light mt-1 ${
        destaque ? 'text-gold-400' : 'text-white'
      }`}>{valor}</p>
      {nota && <p className="text-white/25 text-[10px] mt-0.5">{nota}</p>}
    </div>
  )
}

function Painel({ titulo, nota, children }: {
  titulo: string; nota?: string; children: React.ReactNode
}) {
  return (
    <div className="bg-white/[0.03] border border-white/8 rounded-xl p-5">
      <h3 className="text-white/70 text-sm font-medium">{titulo}</h3>
      {nota && <p className="text-white/25 text-[11px] mt-0.5 mb-4">{nota}</p>}
      {children}
    </div>
  )
}

/**
 * Produtos com barra de receita e margem ao lado.
 *
 * A barra carrega só a receita — uma série, sem paleta categórica. A margem
 * fica no número, colorida por estado, porque o olho precisa achar o item que
 * fatura alto e rende mal sem cruzar duas escalas visuais.
 */
function ListaProdutos({ itens, vazio }: { itens: Produto[]; vazio: string }) {
  if (itens.length === 0) return <p className="text-white/20 text-xs">{vazio}</p>
  const max = Math.max(...itens.map((i) => i.receita), 1)

  return (
    <div className="space-y-3">
      {itens.map((p) => (
        <div key={p.produto_id}>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <span className="text-white/70 text-xs truncate">
              {p.nome}
              {!p.no_catalogo && (
                <span className="text-white/25 text-[10px] ml-2">sem cadastro</span>
              )}
            </span>
            <span className="shrink-0">
              <span className="figura text-white/50 text-xs">{brl(p.receita)}</span>
              <span className={`figura text-xs ml-2 ${corMargem(p.margem_pct)}`}>
                {p.margem_pct != null ? pct(p.margem_pct) : 'sem custo'}
              </span>
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full rounded-full"
                 style={{ width: `${Math.max(1, (p.receita / max) * 100)}%`, background: MARCA }} />
          </div>
          <p className="figura text-white/25 text-[10px] mt-1">
            {num(p.unidades)} un · {num(p.estadias)} estadias
            {p.preco_medio != null && <> · {brlExato(p.preco_medio)} médio</>}
          </p>
        </div>
      ))}
    </div>
  )
}

/** Grupos: barra de receita e margem. Cobertura parcial vira nota, não asterisco. */
function ListaGrupos({ itens }: { itens: Grupo[] }) {
  if (itens.length === 0) return <p className="text-white/20 text-xs">Sem consumo no período.</p>
  const max = Math.max(...itens.map((i) => i.receita), 1)

  return (
    <div className="space-y-3">
      {itens.map((g) => (
        <div key={g.grupo}>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <span className="text-white/70 text-xs truncate">{g.grupo}</span>
            <span className="shrink-0">
              <span className="figura text-white/50 text-xs">{brl(g.receita)}</span>
              <span className={`figura text-xs ml-2 ${corMargem(g.margem_pct)}`}>
                {g.margem_pct != null ? pct(g.margem_pct) : 'sem custo'}
              </span>
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full rounded-full"
                 style={{ width: `${Math.max(1, (g.receita / max) * 100)}%`, background: MARCA }} />
          </div>
          <p className="figura text-white/25 text-[10px] mt-1">
            {num(g.unidades)} un · {g.produtos} produtos
            {g.cobertura_custo != null && g.cobertura_custo < LIMIAR_COBERTURA && (
              <span className="text-amber-400/50"> · margem sobre {pct(g.cobertura_custo)} das vendas</span>
            )}
          </p>
        </div>
      ))}
    </div>
  )
}
