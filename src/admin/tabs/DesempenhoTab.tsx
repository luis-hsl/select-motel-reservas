import { useEffect, useState } from 'react'
import {
  fetchDesempenho,
  type DesempenhoResponse, type Desempenho, type DesempenhoKpis,
} from '../../lib/plugplayAdmin'
import PeriodoSeletor from '../PeriodoSeletor'
import { faixa, hoje, recortar, type Granularidade } from '../periodo'

// Aba "Desempenho" — o movimento do motel agregado por período.
//
// Lê `pms_ocupacoes`, não o PMS: o comparativo do relatório deles volta null, o
// relatório soma venda direta junto com estadia, e assim a tela abre com o PMS
// fora do ar. Os números batem com o relatório deles até o centavo (conferido
// em julho/2026: 482 estadias, R$ 63.734, RevPAR 158,148).
//
// Cada gráfico tem uma série só, então a barra carrega o valor pelo comprimento
// e não há paleta categórica — o ouro fica reservado para marca e ação.

/** Cor das marcas de dado. Fria de propósito: não disputa com o ouro da marca. */
const MARCA = '#4d94a8'
const MARCA_FRACA = '#2b5563'

const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const ORIGEM_ROTULO: Record<string, string> = {
  site: 'Site',
  balcao: 'Balcão',
  reserva_recepcao: 'Reserva da recepção',
}

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function brlExato(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function pct(v: number): string {
  return `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

/** Como o comparativo se chama em cada granularidade. */
const ANTERIOR: Record<Granularidade, string> = {
  dia:    'vs. dia anterior',
  semana: 'vs. semana anterior',
  mes:    'vs. mesmo período do mês passado',
  ano:    'vs. mesmo período do ano passado',
}

export default function DesempenhoTab() {
  const [dados,   setDados]   = useState<DesempenhoResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [falhou,  setFalhou]  = useState(false)
  const [gran,    setGran]    = useState<Granularidade>('mes')
  const [ancora,  setAncora]  = useState<string>(() => hoje())

  // Primeiro dia ingerido: limita as setas e distingue "sem movimento" de
  // "antes do backfill". Vem da própria resposta, então na primeira carga é
  // null e o seletor fica permissivo — corrige sozinho no primeiro retorno.
  const primeiroDia = dados?.cobertura?.primeiro_dia ?? null

  useEffect(() => {
    let cancelado = false

    async function carregar() {
      const [bruto, brutoFim] = faixa(gran, ancora)
      const [inicio, fim] = recortar(bruto, brutoFim, primeiroDia)
      const r = await fetchDesempenho(inicio, fim, gran)
      if (cancelado) return
      if (r) { setDados(r); setFalhou(false) } else { setFalhou(true) }
      setLoading(false)
    }

    void carregar()
    return () => { cancelado = true }
  }, [gran, ancora, primeiroDia])

  if (loading) {
    return <div className="text-white/30 py-16 text-center text-sm">Somando o movimento...</div>
  }

  if (!dados || !dados.atual) {
    return (
      <div className="bg-white/[0.03] border border-white/8 rounded-xl p-8 text-center">
        <p className="text-white/50 text-sm">
          {falhou ? 'Não foi possível carregar o desempenho.' : 'Ainda não há movimento ingerido.'}
        </p>
        <p className="text-white/25 text-xs mt-2">
          O ingest roda a cada 15 minutos. Um backfill traz o histórico de uma vez.
        </p>
      </div>
    )
  }

  const a = dados.atual
  const k = a.kpis
  const cobreAnterior =
    !!dados.cobertura?.primeiro_dia && !!dados.mesAnterior &&
    dados.mesAnterior.periodo.inicio >= dados.cobertura.primeiro_dia
  // Um único dia não rende série diária nem corte por dia da semana — seria
  // uma barra sozinha, que não informa nada.
  const temSerie = gran !== 'dia'

  return (
    <div className="space-y-5">
      {/* Cabeçalho + seletor de mês */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-serif text-lg text-white font-light">
            Desempenho <span className="gold-gradient italic font-semibold">do motel</span>
          </h2>
          <p className="text-white/25 text-[11px] mt-0.5">
            {a.periodo.dias} {a.periodo.dias === 1 ? 'dia' : 'dias'} · {a.periodo.suites} suítes ·
            {' '}inclui balcão e telefone
          </p>
          {/* A base da comparação fica dita uma vez, e não repetida em cada tile.
              Quando não há base, explicar o motivo evita que a ausência de
              comparativo seja lida como bug — o PMS simplesmente não guarda
              nada antes de nov/2025. */}
          <p className="text-white/20 text-[10px] mt-0.5">
            {cobreAnterior
              ? `Variações ${ANTERIOR[gran]}`
              : `Sem comparativo: o PMS não tem movimento antes de ${
                  dados.cobertura?.primeiro_dia
                    ? new Date(`${dados.cobertura.primeiro_dia}T12:00:00`)
                        .toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
                    : 'o início do histórico'
                }`}
          </p>
        </div>
        <PeriodoSeletor
          granularidade={gran}
          ancora={ancora}
          primeiroDia={primeiroDia}
          onChange={(g, nova) => { setGran(g); setAncora(nova) }}
        />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi rotulo="Receita" valor={brl(k.receita)}
             delta={delta(k, dados.mesAnterior, 'receita')} cobre={cobreAnterior} destaque />
        <Kpi rotulo="Estadias" valor={k.estadias.toLocaleString('pt-BR')}
             delta={delta(k, dados.mesAnterior, 'estadias')} cobre={cobreAnterior} />
        <Kpi rotulo="Ticket médio" valor={brlExato(k.ticket)}
             delta={delta(k, dados.mesAnterior, 'ticket')} cobre={cobreAnterior} />
        <Kpi rotulo="RevPAR" valor={brlExato(k.revpar)}
             nota="por suíte-dia"
             delta={delta(k, dados.mesAnterior, 'revpar')} cobre={cobreAnterior} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi rotulo="Giro" valor={k.taxa_giro.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
             nota="estadias por suíte-dia"
             delta={delta(k, dados.mesAnterior, 'taxa_giro')} cobre={cobreAnterior} />
        <Kpi rotulo="Consumo" valor={brl(k.consumo)}
             nota={k.receita > 0 ? `${pct(k.consumo / k.receita)} da receita` : undefined} />
        <Kpi rotulo="Com placa" valor={pct(k.estadias > 0 ? k.com_placa / k.estadias : 0)}
             nota={`${k.com_placa} de ${k.estadias}`} />
        <Kpi rotulo="Venda direta" valor={brl(k.extras_receita)}
             nota={`${k.extras_linhas} lançamentos, fora da ocupação`} />
      </div>

      {/* Movimento diário */}
      {temSerie && (
        <Painel titulo="Movimento por dia" nota="Estadias fechadas em cada dia-base de caixa">
          <BarrasDiarias serie={a.diario} />
        </Painel>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {temSerie && (
          <Painel titulo="Por dia da semana"
                  nota="Onde o movimento se concentra na semana">
            <BarrasDow serie={a.por_dia_semana} />
          </Painel>
        )}

        <Painel titulo="De onde vem"
                nota="Site, reserva por telefone e quem chega sem avisar">
          <BarrasRotuladas
            itens={a.por_origem.map((o) => ({
              rotulo: ORIGEM_ROTULO[o.origem] ?? o.origem,
              valor: o.receita, sub: `${o.estadias} estadias`,
            }))}
            vazio="Sem estadia no período."
          />
        </Painel>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Painel titulo="Por categoria" nota="Receita por classe de suíte">
          <BarrasRotuladas
            itens={a.por_categoria.map((c) => ({
              rotulo: c.categoria, valor: c.receita, sub: `${c.estadias} estadias`,
            }))}
            vazio="Sem estadia no período."
          />
        </Painel>

        <Painel titulo="Por modalidade" nota="Como o hóspede compra o tempo">
          <BarrasRotuladas
            itens={a.por_modalidade.map((m) => ({
              rotulo: m.rotulo, valor: m.receita, sub: `${m.estadias} estadias`,
            }))}
            vazio="Sem estadia no período."
          />
        </Painel>
      </div>

      <p className="text-white/20 text-[10px]">
        Que horas o motel enche não entra aqui: o PMS devolve a ocupação com o horário
        zerado e o relatório de mapa de calor vem vazio para o nosso integrador.
      </p>
    </div>
  )
}

/** Variação contra o mesmo pedaço do mês anterior. */
function delta(
  atual: DesempenhoKpis,
  anterior: Desempenho | null,
  campo: keyof DesempenhoKpis,
): number | null {
  const base = anterior?.kpis?.[campo]
  if (typeof base !== 'number' || base === 0) return null
  return (Number(atual[campo]) - base) / base
}

function Kpi({ rotulo, valor, nota, delta, cobre, destaque }: {
  rotulo: string; valor: string; nota?: string
  delta?: number | null; cobre?: boolean; destaque?: boolean
}) {
  // Sem cobertura no período anterior, "0%" mentiria: não houve queda, não
  // houve dado. A tela diz isso em vez de inventar uma variação.
  const mostraDelta = delta != null && cobre !== false
  const subiu = (delta ?? 0) >= 0

  return (
    <div className={`border rounded-xl p-4 ${
      destaque ? 'bg-gold-500/5 border-gold-700/30' : 'bg-white/[0.03] border-white/8'
    }`}>
      <p className="text-white/35 text-[10px] uppercase tracking-wider">{rotulo}</p>
      <p className={`text-2xl font-light mt-1 tabular-nums ${
        destaque ? 'text-gold-400' : 'text-white'
      }`}>{valor}</p>
      <div className="flex items-baseline gap-2 mt-0.5 flex-wrap">
        {mostraDelta && (
          <span className={`text-[11px] tabular-nums ${
            subiu ? 'text-emerald-400/80' : 'text-red-400/80'
          }`}>
            {subiu ? '+' : ''}{(delta! * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
          </span>
        )}
        {delta != null && cobre === false && (
          <span className="text-white/20 text-[10px]">sem base anterior</span>
        )}
        {nota && <span className="text-white/25 text-[10px]">{nota}</span>}
      </div>
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
 * Barras diárias. Uma série só, então a cor não codifica nada — quem informa é
 * a altura. O rótulo de data aparece a cada 5 dias para não colidir.
 */
function BarrasDiarias({ serie }: {
  serie: Array<{ dia: string; estadias: number; receita: number }>
}) {
  const [ativo, setAtivo] = useState<number | null>(null)
  if (serie.length === 0) {
    return <p className="text-white/20 text-xs">Sem movimento no período.</p>
  }

  const max = Math.max(...serie.map((d) => d.receita), 1)
  const item = ativo != null ? serie[ativo] : null

  return (
    <div>
      <div className="h-8 mb-1">
        {item ? (
          <div className="text-[11px]">
            <span className="text-white/70 tabular-nums">
              {new Date(`${item.dia}T12:00:00`).toLocaleDateString('pt-BR', {
                day: '2-digit', month: '2-digit', weekday: 'short',
              })}
            </span>
            <span className="text-white/40 tabular-nums ml-2">{brlExato(item.receita)}</span>
            <span className="text-white/25 tabular-nums ml-2">{item.estadias} estadias</span>
          </div>
        ) : (
          <div className="text-[11px] text-white/20">Passe o mouse para ver o dia.</div>
        )}
      </div>

      {/* gap-0.5 = o espaçador de 2px entre barras vizinhas */}
      <div className="flex items-end gap-0.5 h-40">
        {serie.map((d, i) => (
          <button key={d.dia}
            onMouseEnter={() => setAtivo(i)} onFocus={() => setAtivo(i)}
            onMouseLeave={() => setAtivo(null)} onBlur={() => setAtivo(null)}
            className="flex-1 h-full flex items-end group focus:outline-none"
            aria-label={`${d.dia}: ${d.estadias} estadias, ${brlExato(d.receita)}`}>
            <div className="w-full rounded-t transition-colors"
              style={{
                height: `${Math.max(2, (d.receita / max) * 100)}%`,
                background: ativo === i ? MARCA : MARCA_FRACA,
              }}
            />
          </button>
        ))}
      </div>

      <div className="flex justify-between mt-1.5 text-[10px] text-white/25 tabular-nums">
        <span>{serie[0].dia.slice(8)}/{serie[0].dia.slice(5, 7)}</span>
        <span>{serie[serie.length - 1].dia.slice(8)}/{serie[serie.length - 1].dia.slice(5, 7)}</span>
      </div>
    </div>
  )
}

/** Sete barras, então rótulo direto em todas — tooltip aqui seria atrito à toa. */
function BarrasDow({ serie }: {
  serie: Array<{ dow: number; estadias: number; receita: number }>
}) {
  if (serie.length === 0) {
    return <p className="text-white/20 text-xs">Sem movimento no período.</p>
  }
  const porDow = new Map(serie.map((d) => [d.dow, d]))
  const max = Math.max(...serie.map((d) => d.receita), 1)

  return (
    <div className="flex items-end gap-2 h-40">
      {DOW.map((nome, dow) => {
        const d = porDow.get(dow)
        const receita = d?.receita ?? 0
        return (
          <div key={dow} className="flex-1 h-full flex flex-col justify-end items-center gap-1.5">
            <span className="text-[10px] text-white/40 tabular-nums">
              {receita > 0 ? brl(receita) : '—'}
            </span>
            <div className="w-full rounded-t"
              style={{ height: `${Math.max(2, (receita / max) * 100)}%`, background: MARCA }} />
            <span className="text-[10px] text-white/35">{nome}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Barras horizontais com rótulo e valor — poucas categorias, leitura direta. */
function BarrasRotuladas({ itens, vazio }: {
  itens: Array<{ rotulo: string; valor: number; sub: string }>
  vazio: string
}) {
  if (itens.length === 0) return <p className="text-white/20 text-xs">{vazio}</p>
  const max = Math.max(...itens.map((i) => i.valor), 1)

  return (
    <div className="space-y-3">
      {itens.map((i) => (
        <div key={i.rotulo}>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <span className="text-white/70 text-xs">{i.rotulo}</span>
            <span className="text-white/50 text-xs tabular-nums">
              {brl(i.valor)}
              <span className="text-white/25 ml-2">{i.sub}</span>
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full rounded-full"
              style={{ width: `${Math.max(1, (i.valor / max) * 100)}%`, background: MARCA }} />
          </div>
        </div>
      ))}
    </div>
  )
}
