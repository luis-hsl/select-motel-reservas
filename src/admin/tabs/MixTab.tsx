import { useEffect, useState } from 'react'
import { fetchAnalytics } from '../../lib/plugplayAdmin'
import PeriodoSeletor from '../PeriodoSeletor'
import { faixa, hoje, recortar, type Granularidade } from '../periodo'

// Aba "Mix" — a resposta para "o ticket médio caiu 19%, o que aconteceu?".
//
// Ticket médio é média ponderada, e média ponderada desce por dois caminhos
// que pedem reações opostas:
//
//   mix   — as mesmas suítes pelos mesmos preços, só que a barata passou a
//           pesar mais no total. Reagir com desconto aprofunda o buraco.
//   preço — a mesma célula passou a render menos (tarifa, desconto, frigobar).
//
// A tela existe porque olhar só a linha do ticket confunde os dois. Toda a
// conta vem pronta da RPC `pms_mix_periodo`; aqui só se decide o que mostrar.
//
// Abre em "todo o histórico" de propósito: mix é tendência de meses, e um
// recorte de mês único não tem série nenhuma para mostrar.

/** Cor das marcas de dado. Fria: o ouro fica reservado para marca e ação. */
const MARCA = '#4d94a8'
const MARCA_FRACA = '#2b5563'
const MARCA_CLARA = '#9fd6e4'

/**
 * Rampa de uma cor só para as barras empilhadas.
 *
 * Fatia de participação precisa de paleta categórica, e paleta categórica com
 * matizes soltos brigaria com o ouro da marca. Uma rampa monocromática separa
 * as fatias por luminância e continua sendo o mesmo sistema visual.
 */
const RAMPA = ['#7fc3d6', '#4d94a8', '#376f80', '#2b5563', '#1c3a44', '#13272e']

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const DIM_ROTULO: Record<string, string> = {
  modalidade: 'Só por modalidade',
  categoria:  'Só por categoria',
  celula:     'Categoria × modalidade',
}

const DIM_NOTA: Record<string, string> = {
  modalidade: 'trocou pernoite por período curto?',
  categoria:  'trocou VIP e Hidro por Standard?',
  celula:     'as duas trocas juntas — a leitura que vale',
}

// ─── Formas devolvidas por pms_mix_periodo ───────────────────────────────────

interface FatiaModalidade {
  modo: number; rotulo: string; estadias: number
  share: number; ticket: number; receita: number
}

interface FatiaCategoria {
  categoria: string; estadias: number
  share: number; ticket: number; receita: number
}

interface MesMix {
  mes: string
  /** Mês cortado pelo recorte. Fica na série, mas não vira conclusão. */
  parcial: boolean
  estadias: number
  receita: number
  consumo: number
  ticket: number
  ticket_hospedagem: number
  ticket_consumo: number
  /** Ticket com o mix congelado no mês base — sobra só o efeito de preço. */
  ticket_mix_base: number | null
  /** Ticket com os preços congelados no mês base — sobra só o efeito de mix. */
  ticket_precos_base: number | null
  modalidades: FatiaModalidade[]
  categorias: FatiaCategoria[]
}

interface Ponta {
  mes: string; estadias: number
  ticket: number; ticket_hospedagem: number; ticket_consumo: number
}

interface EfeitoDim { dim: string; mix: number; preco: number; interacao: number }

interface Celula {
  chave: string
  estadias_base: number; estadias_atual: number
  share_base: number; share_atual: number
  ticket_base: number; ticket_atual: number
  efeito_mix: number; efeito_preco: number; efeito_total: number
}

interface Decomposicao {
  base: Ponta
  atual: Ponta
  variacao: number
  variacao_pct: number
  variacao_hospedagem: number
  variacao_consumo: number
  dimensoes: EfeitoDim[]
  celulas: Celula[]
}

interface MixResposta {
  periodo: { inicio: string; fim: string; meses: number }
  cobertura: { primeiro_dia: string | null; ultimo_dia: string | null }
  rotulos_modalidade: string[]
  rotulos_categoria: string[]
  mensal: MesMix[]
  decomposicao: Decomposicao | null
  erro?: string
}

// ─── Formatação ──────────────────────────────────────────────────────────────

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function brlExato(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function comSinal(v: number): string {
  return `${v >= 0 ? '+' : '−'}${brlExato(Math.abs(v))}`
}

function pct(v: number, casas = 1): string {
  return `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: casas })}%`
}

function pctSinal(v: number): string {
  return `${v >= 0 ? '+' : '−'}${pct(Math.abs(v))}`
}

/** '2026-07' → 'jul/26'. Nove colunas de gráfico não cabem por extenso. */
function mesRotulo(m: string): string {
  return `${MES_CURTO[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`
}

export default function MixTab() {
  const [dados,   setDados]   = useState<MixResposta | null>(null)
  const [loading, setLoading] = useState(true)
  const [falhou,  setFalhou]  = useState(false)
  const [tudo,    setTudo]    = useState(true)
  const [gran,    setGran]    = useState<Granularidade>('ano')
  const [ancora,  setAncora]  = useState<string>(() => hoje())

  // Vem da própria resposta: na primeira carga é null e o seletor fica
  // permissivo, corrigindo sozinho no primeiro retorno.
  const primeiroDia = dados?.cobertura?.primeiro_dia ?? null

  useEffect(() => {
    let cancelado = false

    async function carregar() {
      // Nulos = todo o histórico ingerido. A RPC resolve as pontas sozinha.
      let params: Record<string, string | null> = { p_inicio: null, p_fim: null }
      if (!tudo) {
        const [bruto, brutoFim] = faixa(gran, ancora)
        const [inicio, fim] = recortar(bruto, brutoFim, primeiroDia)
        params = { p_inicio: inicio, p_fim: fim }
      }
      const r = await fetchAnalytics<MixResposta>('pms_mix_periodo', params)
      if (cancelado) return
      if (r) { setDados(r); setFalhou(false) } else { setFalhou(true) }
      setLoading(false)
    }

    void carregar()
    return () => { cancelado = true }
  }, [tudo, gran, ancora, primeiroDia])

  if (loading) {
    return <div className="text-white/30 py-16 text-center text-sm">Separando mix de preço...</div>
  }

  if (!dados || dados.mensal.length === 0) {
    return (
      <div className="bg-white/[0.03] border border-white/8 rounded-xl p-8 text-center">
        <p className="text-white/50 text-sm">
          {falhou ? 'Não foi possível carregar o mix.' : 'Ainda não há movimento ingerido.'}
        </p>
        <p className="text-white/25 text-xs mt-2">
          O mix precisa de pelo menos dois meses fechados para ter o que comparar.
        </p>
      </div>
    )
  }

  // Recorte de um mês só tem base igual a atual: a decomposição existe, mas é
  // toda zero. Mostrá-la diria "não mudou nada", que é o oposto de "não há o
  // que comparar".
  const d = dados.decomposicao && dados.decomposicao.base.mes !== dados.decomposicao.atual.mes
    ? dados.decomposicao
    : null
  const serie = dados.mensal
  // A abertura fina é a leitura que vale: separar categoria de modalidade faz
  // uma virar "preço" da outra.
  const fino = d?.dimensoes.find((x) => x.dim === 'celula') ?? null

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-serif text-lg text-white font-light">
            Mix <span className="gold-gradient italic font-semibold">do movimento</span>
          </h2>
          <p className="text-white/25 text-[11px] mt-0.5">
            {dados.periodo.meses} {dados.periodo.meses === 1 ? 'mês' : 'meses'} ·
            {' '}o ticket caiu porque o motel vendeu outra coisa, ou porque vendeu mais barato?
          </p>
          <p className="text-white/20 text-[10px] mt-0.5">
            Só estadia com quarto. Venda direta fica fora — ela não tem suíte nem modalidade.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setTudo((v) => !v)}
            aria-pressed={tudo}
            className={`text-[11px] px-3 py-1.5 rounded-lg border transition-colors ${
              tudo
                ? 'text-gold-500 bg-gold-500/[0.09] border-gold-700/30'
                : 'text-white/40 border-white/8 hover:text-white/75 hover:bg-white/[0.03]'
            }`}
          >
            Todo o histórico
          </button>
          {!tudo && (
            <PeriodoSeletor
              granularidade={gran}
              ancora={ancora}
              primeiroDia={primeiroDia}
              onChange={(g, nova) => { setGran(g); setAncora(nova) }}
            />
          )}
        </div>
      </div>

      {d && fino ? <Veredito d={d} fino={fino} /> : (
        <div className="bg-white/[0.03] border border-white/8 rounded-xl p-5">
          <p className="text-white/50 text-sm">Um mês só não separa mix de preço.</p>
          <p className="text-white/25 text-[11px] mt-1">
            A conta compara duas pontas. Amplie o recorte ou use "Todo o histórico".
          </p>
        </div>
      )}

      <Painel
        titulo="Ticket médio, mês a mês"
        nota={d
          ? `Barra = o que aconteceu. As duas linhas refazem a conta congelando um lado em ${mesRotulo(d.base.mes)}.`
          : 'Ticket médio por mês.'}
      >
        <BarrasTicket serie={serie} base={d?.base.mes ?? null} />
      </Painel>

      {d && (
        <Painel
          titulo="Mix ou preço"
          nota={`Quanto dos ${brlExato(Math.abs(d.variacao))} de ${mesRotulo(d.base.mes)} a ${mesRotulo(d.atual.mes)} cada explicação carrega. As três aberturas somam o mesmo total.`}
        >
          <TabelaDimensoes dimensoes={d.dimensoes} variacao={d.variacao} />
          <p className="text-white/25 text-[10px] mt-4 leading-relaxed">
            A abertura grossa subestima o mix: quando "Período de 2h" fica mais barato,
            parte disso é o Período de 2h ter migrado de Hidro para Standard — vira "preço"
            por falta de detalhe. Por isso a linha de baixo é a que vale.
            {' '}<span className="text-white/20">
              Interação = o quanto encolheu justamente o que também barateou.
            </span>
          </p>
        </Painel>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Painel titulo="Participação por categoria" nota="Que classe de suíte o hóspede levou">
          <Empilhadas
            serie={serie}
            chaves={dados.rotulos_categoria}
            extrair={(m) => m.categorias.map((c) => ({
              chave: c.categoria, share: c.share, estadias: c.estadias, ticket: c.ticket,
            }))}
          />
        </Painel>

        <Painel titulo="Participação por modalidade" nota="Como o hóspede comprou o tempo">
          <Empilhadas
            serie={serie}
            chaves={dados.rotulos_modalidade}
            extrair={(m) => m.modalidades.map((x) => ({
              chave: x.rotulo, share: x.share, estadias: x.estadias, ticket: x.ticket,
            }))}
          />
        </Painel>
      </div>

      {d && d.celulas.length > 0 && (
        <Painel
          titulo="Quem puxou o ticket"
          nota={`Reais por estadia que cada célula tirou (ou pôs) no ticket entre ${mesRotulo(d.base.mes)} e ${mesRotulo(d.atual.mes)}`}
        >
          <Celulas celulas={d.celulas} />
        </Painel>
      )}

      {d && (
        <Painel titulo="Quarto ou frigobar" nota="O ticket é a soma dos dois; caem por motivos diferentes">
          <div className="grid grid-cols-2 gap-4">
            <Fatia
              rotulo="Hospedagem por estadia"
              de={d.base.ticket_hospedagem} para={d.atual.ticket_hospedagem}
              variacao={d.variacao_hospedagem}
            />
            <Fatia
              rotulo="Consumo por estadia"
              de={d.base.ticket_consumo} para={d.atual.ticket_consumo}
              variacao={d.variacao_consumo}
            />
          </div>
        </Painel>
      )}

      <p className="text-white/20 text-[10px]">
        Mês cortado ao meio aparece esmaecido: o ticket dele oscila com o dia da semana que
        calhou de entrar e não serve de ponta da comparação.
      </p>
    </div>
  )
}

/** O veredito em uma linha, antes de qualquer gráfico. */
function Veredito({ d, fino }: { d: Decomposicao; fino: EfeitoDim }) {
  const queda = Math.abs(d.variacao)
  // Participação de cada explicação no movimento total. Em módulo de propósito:
  // quando mix e preço andam em sentidos opostos, a fração assinada passaria de
  // 100% e não teria leitura.
  const soma = Math.abs(fino.mix) + Math.abs(fino.preco) + Math.abs(fino.interacao)
  const parte = (v: number) => (soma > 0 ? Math.abs(v) / soma : 0)
  const mixManda = Math.abs(fino.mix) > Math.abs(fino.preco)

  return (
    <div className="bg-white/[0.03] border border-white/8 rounded-xl p-5">
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="figura text-2xl font-light text-white">{comSinal(d.variacao)}</span>
        <span className={`figura text-sm ${d.variacao >= 0 ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
          {pctSinal(d.variacao_pct)}
        </span>
        <span className="text-white/40 text-xs">
          no ticket médio, de <span className="figura">{mesRotulo(d.base.mes)}</span>
          {' '}a <span className="figura">{mesRotulo(d.atual.mes)}</span>
        </span>
      </div>

      <p className="text-white/60 text-[13px] mt-3 leading-relaxed">
        {mixManda ? (
          <>
            <span className="text-white/85">Mudou o que se vende, não o preço.</span>{' '}
            <span className="figura">{brlExato(Math.abs(fino.mix))}</span> dos{' '}
            <span className="figura">{brlExato(queda)}</span> vêm de mix — a mesma suíte pela mesma
            tarifa, só que pesando menos no total. Preço responde por apenas{' '}
            <span className="figura">{brlExato(Math.abs(fino.preco))}</span>.
          </>
        ) : (
          <>
            <span className="text-white/85">Mudou o preço, não o que se vende.</span>{' '}
            <span className="figura">{brlExato(Math.abs(fino.preco))}</span> dos{' '}
            <span className="figura">{brlExato(queda)}</span> vêm da própria célula rendendo menos.
            Mix responde por <span className="figura">{brlExato(Math.abs(fino.mix))}</span>.
          </>
        )}
      </p>

      {/* Uma barra só, três segmentos: a proporção é a mensagem. */}
      <div className="flex h-2 rounded-full overflow-hidden mt-4 bg-white/5">
        <div style={{ width: `${parte(fino.mix) * 100}%`, background: MARCA_CLARA }} />
        <div style={{ width: `${parte(fino.preco) * 100}%`, background: MARCA }} />
        <div style={{ width: `${parte(fino.interacao) * 100}%`, background: MARCA_FRACA }} />
      </div>
      <div className="flex gap-4 mt-2 flex-wrap">
        <Chave cor={MARCA_CLARA} texto="Mix" valor={`${comSinal(fino.mix)} · ${pct(parte(fino.mix), 0)}`} />
        <Chave cor={MARCA} texto="Preço" valor={`${comSinal(fino.preco)} · ${pct(parte(fino.preco), 0)}`} />
        <Chave cor={MARCA_FRACA} texto="Interação" valor={comSinal(fino.interacao)} />
      </div>

      <p className="text-white/25 text-[10px] mt-3">
        Base <span className="figura">{d.base.estadias}</span> estadias a{' '}
        <span className="figura">{brlExato(d.base.ticket)}</span> ·{' '}
        atual <span className="figura">{d.atual.estadias}</span> a{' '}
        <span className="figura">{brlExato(d.atual.ticket)}</span>
      </p>
    </div>
  )
}

function Chave({ cor, texto, valor }: { cor: string; texto: string; valor: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: cor }} />
      <span className="text-white/45 text-[11px]">{texto}</span>
      <span className="figura text-white/60 text-[11px]">{valor}</span>
    </span>
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
 * Ticket real em barra, com os dois contrafactuais como linhas por cima.
 *
 * A linha que acompanhar a barra é a resposta: se "preços congelados" desce
 * junto, foi mix; se "mix congelado" desce junto, foi preço. É a leitura que a
 * decomposição faz em números, aqui em forma.
 */
function BarrasTicket({ serie, base }: { serie: MesMix[]; base: string | null }) {
  const [ativo, setAtivo] = useState<number | null>(null)

  const valores = serie.flatMap((m) => [
    m.ticket, m.ticket_mix_base ?? 0, m.ticket_precos_base ?? 0,
  ])
  const max = Math.max(...valores, 1)
  const m = ativo != null ? serie[ativo] : null

  return (
    <div>
      <div className="h-9 mb-1">
        {m ? (
          <div className="text-[11px] flex items-baseline gap-3 flex-wrap">
            <span className="figura text-white/70">{mesRotulo(m.mes)}</span>
            <span className="figura text-white/45">{brlExato(m.ticket)}</span>
            <span className="figura text-white/25">{m.estadias} estadias</span>
            {m.ticket_precos_base != null && (
              <span className="text-[10px]" style={{ color: MARCA_CLARA }}>
                só o mix: <span className="figura">{brlExato(m.ticket_precos_base)}</span>
              </span>
            )}
            {m.ticket_mix_base != null && (
              <span className="text-white/40 text-[10px]">
                só o preço: <span className="figura">{brlExato(m.ticket_mix_base)}</span>
              </span>
            )}
          </div>
        ) : (
          <div className="text-[11px] text-white/20">Passe o mouse para ver o mês.</div>
        )}
      </div>

      <div className="flex items-end gap-1 h-44">
        {serie.map((d, i) => (
          <button key={d.mes}
            onMouseEnter={() => setAtivo(i)} onFocus={() => setAtivo(i)}
            onMouseLeave={() => setAtivo(null)} onBlur={() => setAtivo(null)}
            className="flex-1 h-full relative focus:outline-none"
            style={{ opacity: d.parcial ? 0.45 : 1 }}
            aria-label={`${d.mes}: ticket ${brlExato(d.ticket)}`}>
            <div className="absolute inset-x-0 bottom-0 rounded-t transition-colors"
              style={{
                height: `${Math.max(2, (d.ticket / max) * 100)}%`,
                background: ativo === i ? MARCA : MARCA_FRACA,
              }} />
            {/* Contrafactual do mix: preços congelados no mês base. */}
            {d.ticket_precos_base != null && (
              <div className="absolute inset-x-0 h-[2px] rounded-full"
                style={{
                  bottom: `${(d.ticket_precos_base / max) * 100}%`,
                  background: MARCA_CLARA,
                }} />
            )}
            {/* Contrafactual do preço: mix congelado. Tracejado para não virar
                uma segunda série sólida disputando leitura com a primeira. */}
            {d.ticket_mix_base != null && (
              <div className="absolute inset-x-0 h-[2px]"
                style={{
                  bottom: `${(d.ticket_mix_base / max) * 100}%`,
                  backgroundImage:
                    'repeating-linear-gradient(90deg, rgba(255,255,255,.55) 0 4px, transparent 4px 8px)',
                }} />
            )}
          </button>
        ))}
      </div>

      <div className="flex gap-1 mt-1.5">
        {serie.map((d) => (
          <span key={d.mes}
            className="figura flex-1 text-center text-[9px] text-white/25"
            style={{ opacity: d.parcial ? 0.5 : 1 }}>
            {mesRotulo(d.mes)}
          </span>
        ))}
      </div>

      <div className="flex gap-4 mt-3 flex-wrap">
        <Chave cor={MARCA_FRACA} texto="Ticket real" valor="" />
        <Chave cor={MARCA_CLARA} texto="Só o mix mudou" valor={base ? `preços de ${mesRotulo(base)}` : ''} />
        <Chave cor="rgba(255,255,255,.55)" texto="Só o preço mudou" valor={base ? `mix de ${mesRotulo(base)}` : ''} />
      </div>
    </div>
  )
}

/** As três aberturas lado a lado — a barra mostra o peso do mix em cada uma. */
function TabelaDimensoes({ dimensoes, variacao }: { dimensoes: EfeitoDim[]; variacao: number }) {
  const total = Math.abs(variacao) || 1

  return (
    <div className="space-y-4">
      {dimensoes.map((e) => {
        const fracaoMix = Math.min(1, Math.abs(e.mix) / total)
        return (
          <div key={e.dim}>
            <div className="flex items-baseline justify-between gap-3 mb-1.5 flex-wrap">
              <span className="text-white/70 text-xs">
                {DIM_ROTULO[e.dim] ?? e.dim}
                <span className="text-white/25 ml-2 text-[10px]">{DIM_NOTA[e.dim] ?? ''}</span>
              </span>
              <span className="text-[11px]">
                <span className="text-white/30">mix </span>
                <span className="figura" style={{ color: MARCA_CLARA }}>{comSinal(e.mix)}</span>
                <span className="text-white/30 ml-3">preço </span>
                <span className="figura text-white/60">{comSinal(e.preco)}</span>
                <span className="text-white/25 ml-3">inter. </span>
                <span className="figura text-white/35">{comSinal(e.interacao)}</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full rounded-full"
                style={{ width: `${Math.max(1, fracaoMix * 100)}%`, background: MARCA_CLARA }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Participação empilhada, um mês por coluna.
 *
 * Empilhada e não agrupada porque a pergunta é sobre proporção: o que importa
 * é a fatia crescer, não o número absoluto — que cai junto com o movimento.
 */
function Empilhadas({ serie, chaves, extrair }: {
  serie: MesMix[]
  chaves: string[]
  extrair: (m: MesMix) => Array<{ chave: string; share: number; estadias: number; ticket: number }>
}) {
  const [ativo, setAtivo] = useState<number | null>(null)
  if (serie.length === 0 || chaves.length === 0) {
    return <p className="text-white/20 text-xs">Sem estadia no período.</p>
  }

  const cor = (chave: string) => RAMPA[Math.max(0, chaves.indexOf(chave)) % RAMPA.length]
  const detalhe = ativo != null ? extrair(serie[ativo]) : null

  return (
    <div>
      <div className="h-9 mb-1">
        {detalhe && ativo != null ? (
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="figura text-white/70 text-[11px]">{mesRotulo(serie[ativo].mes)}</span>
            {detalhe.map((f) => (
              <span key={f.chave} className="text-[10px] text-white/40">
                {f.chave}{' '}
                <span className="figura text-white/65">{pct(f.share)}</span>
                <span className="figura text-white/25 ml-1">{brl(f.ticket)}</span>
              </span>
            ))}
          </div>
        ) : (
          <div className="text-[11px] text-white/20">Passe o mouse para ver as fatias do mês.</div>
        )}
      </div>

      <div className="flex items-end gap-1 h-40">
        {serie.map((m, i) => {
          const fatias = extrair(m)
          const porChave = new Map(fatias.map((f) => [f.chave, f]))
          return (
            <button key={m.mes}
              onMouseEnter={() => setAtivo(i)} onFocus={() => setAtivo(i)}
              onMouseLeave={() => setAtivo(null)} onBlur={() => setAtivo(null)}
              className="flex-1 h-full flex flex-col-reverse rounded-t overflow-hidden
                         focus:outline-none focus:ring-1 focus:ring-white/20"
              style={{ opacity: m.parcial ? 0.45 : ativo == null || ativo === i ? 1 : 0.55 }}
              aria-label={`${m.mes}: ${fatias.map((f) => `${f.chave} ${pct(f.share)}`).join(', ')}`}>
              {chaves.map((c) => {
                const f = porChave.get(c)
                if (!f || f.share <= 0) return null
                return (
                  <div key={c} style={{ height: `${f.share * 100}%`, background: cor(c) }} />
                )
              })}
            </button>
          )
        })}
      </div>

      <div className="flex gap-1 mt-1.5">
        {serie.map((m) => (
          <span key={m.mes}
            className="figura flex-1 text-center text-[9px] text-white/25"
            style={{ opacity: m.parcial ? 0.5 : 1 }}>
            {mesRotulo(m.mes)}
          </span>
        ))}
      </div>

      <div className="flex gap-3 mt-3 flex-wrap">
        {chaves.map((c) => {
          const inicio = serie[0].parcial && serie.length > 1 ? serie[1] : serie[0]
          const fim = serie[serie.length - 1]
          const a = extrair(inicio).find((f) => f.chave === c)?.share ?? 0
          const b = extrair(fim).find((f) => f.chave === c)?.share ?? 0
          return (
            <Chave key={c} cor={cor(c)} texto={c}
                   valor={`${pct(a, 0)} → ${pct(b, 0)}`} />
          )
        })}
      </div>
    </div>
  )
}

/**
 * Efeito de cada célula em reais por estadia, divergindo de zero.
 *
 * Positivo e negativo em vermelho/verde porque aqui o sinal é o assunto — não
 * é série categórica, é ganho e perda.
 */
function Celulas({ celulas }: { celulas: Celula[] }) {
  const max = Math.max(...celulas.map((c) => Math.abs(c.efeito_total)), 1)

  return (
    <div className="space-y-3">
      {celulas.map((c) => {
        const neg = c.efeito_total < 0
        const largura = (Math.abs(c.efeito_total) / max) * 50
        return (
          <div key={c.chave}>
            <div className="flex items-baseline justify-between gap-3 mb-1 flex-wrap">
              <span className="text-white/70 text-xs">{c.chave}</span>
              <span className="text-[10px] text-white/25">
                <span className="figura">{pct(c.share_base)}</span> →{' '}
                <span className="figura">{pct(c.share_atual)}</span> das estadias ·{' '}
                <span className="figura">{brl(c.ticket_base)}</span> →{' '}
                <span className="figura">{brl(c.ticket_atual)}</span>
              </span>
            </div>
            <div className="relative h-1.5 rounded-full bg-white/5">
              <div className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
              <div className="absolute inset-y-0 rounded-full"
                style={{
                  width: `${Math.max(0.6, largura)}%`,
                  [neg ? 'right' : 'left']: '50%',
                  background: neg ? 'rgba(248,113,113,.7)' : 'rgba(52,211,153,.7)',
                }} />
            </div>
            <div className="flex justify-end gap-3 mt-1">
              <span className="text-[10px] text-white/25">
                mix <span className="figura" style={{ color: MARCA_CLARA }}>{comSinal(c.efeito_mix)}</span>
              </span>
              <span className="text-[10px] text-white/25">
                preço <span className="figura text-white/50">{comSinal(c.efeito_preco)}</span>
              </span>
              <span className={`figura text-[11px] ${neg ? 'text-red-400/80' : 'text-emerald-400/80'}`}>
                {comSinal(c.efeito_total)}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Fatia({ rotulo, de, para, variacao }: {
  rotulo: string; de: number; para: number; variacao: number
}) {
  const relativo = de > 0 ? variacao / de : 0
  return (
    <div>
      <p className="text-white/35 text-[10px] uppercase tracking-wider">{rotulo}</p>
      <p className="figura text-xl font-light text-white mt-1">{brlExato(para)}</p>
      <div className="flex items-baseline gap-2 mt-0.5 flex-wrap">
        <span className={`figura text-[11px] ${variacao >= 0 ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
          {comSinal(variacao)}
        </span>
        <span className="text-white/25 text-[10px]">
          <span className="figura">{pctSinal(relativo)}</span> ante{' '}
          <span className="figura">{brlExato(de)}</span>
        </span>
      </div>
    </div>
  )
}
