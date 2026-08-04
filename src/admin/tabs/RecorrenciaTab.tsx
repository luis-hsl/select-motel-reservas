import { useEffect, useState } from 'react'
import { fetchAnalytics } from '../../lib/plugplayAdmin'
import PeriodoSeletor from '../PeriodoSeletor'
import { faixa, hoje, recortar, type Granularidade } from '../periodo'

// Aba "Recorrência" — quem volta, de quanto em quanto tempo, e quanto vale.
//
// O hóspede de balcão é 97% do movimento e não tem cadastro: o objeto de
// ocupação do PMS não traz nome, CPF, telefone nem e-mail. Sobra a placa do
// carro, que a recepção já digita por operação própria. É o único identificador
// que existe hoje — e o join natural com um futuro cadastro no site, onde a
// placa pode ser pedida na reserva. Esta tela é a base do fidelidade.
//
// **Privacidade.** Placa é dado pessoal. A `pms_recorrencia_placa` devolve a
// placa JÁ MASCARADA (`ABC1***`) e só das 10 melhores — a lista completa não
// sai do banco. Não há aqui, e não deve haver, botão de exportar: um CSV com
// 1.878 placas identificáveis é um vazamento esperando acontecer, e nenhuma
// decisão desta tela precisa da placa inteira. Quando o programa existir, o
// casamento placa↔cadastro se faz em SQL, server-side.
//
// **Normalização.** O agrupamento é por placa normalizada (upper, sem espaço
// nem hífen) — feito no SQL. Placa é campo livre: sem isso, cada erro de
// digitação viraria um "cliente novo" e a recorrência sairia subestimada
// justamente no cliente frequente, que tem mais chances de ser digitado errado.

/** Cor das marcas de dado. Fria de propósito: não disputa com o ouro da marca. */
const MARCA = '#4d94a8'
const MARCA_FRACA = '#2b5563'

interface Kpis {
  estadias: number
  estadias_com_placa: number
  cobertura_placa: number
  hospedes: number
  uma_visita: number
  recorrentes: number
  taxa_recorrencia: number
  estadias_recorrentes: number
  fatia_movimento: number
  receita_recorrentes: number
  fatia_receita: number
  visitas_por_hospede: number
  novos_sem_historico: number
}

interface Ticket {
  estadias_unico: number
  estadias_rec_primeira: number
  estadias_retorno: number
  unico: number
  rec_primeira: number
  retorno: number
  consumo_unico: number
  consumo_retorno: number
  delta_intra: number | null
  delta_vs_unico: number | null
  valor_uma_visita: number
  valor_recorrente: number
  multiplo_valor: number | null
}

interface Intervalo {
  pares: number
  mediana: number | null
  p25: number | null
  p75: number | null
  media: number | null
  faixas: Array<{ faixa: string; pares: number }>
}

/** `placa` já chega mascarada do banco — nunca é a placa inteira. */
interface Cliente {
  placa: string
  visitas: number
  receita: number
  ticket: number
  primeira: string
  ultima: string
}

interface Recorrencia {
  erro?: string
  periodo: { inicio: string; fim: string; dias: number }
  cobertura: { primeiro_dia: string | null; ultimo_dia: string | null } | null
  kpis: Kpis
  ticket: Ticket
  distribuicao: Array<{ faixa: string; hospedes: number; estadias: number; receita: number }>
  intervalo: Intervalo
  top_receita: Cliente[]
  top_frequencia: Cliente[]
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

function num(v: number): string {
  return v.toLocaleString('pt-BR')
}

function ddmm(iso: string): string {
  return `${iso.slice(8)}/${iso.slice(5, 7)}`
}

export default function RecorrenciaTab() {
  const [dados,   setDados]   = useState<Recorrencia | null>(null)
  const [loading, setLoading] = useState(true)
  const [falhou,  setFalhou]  = useState(false)
  // Abre no ano, não no mês. Recorrência é a única métrica do painel que a
  // janela curta destrói: em julho/2026 a taxa dá 20%, no histórico inteiro dá
  // 33% — a diferença não é o motel mudando, é o filtro cortando a visita
  // anterior. Mês continua disponível para olhar um período específico.
  const [gran,    setGran]    = useState<Granularidade>('ano')
  const [ancora,  setAncora]  = useState<string>(() => hoje())

  const primeiroDia = dados?.cobertura?.primeiro_dia ?? null

  useEffect(() => {
    let cancelado = false

    async function carregar() {
      const [bruto, brutoFim] = faixa(gran, ancora)
      const [inicio, fim] = recortar(bruto, brutoFim, primeiroDia)
      const r = await fetchAnalytics<Recorrencia>('pms_recorrencia_placa', {
        p_inicio: inicio, p_fim: fim,
      })
      if (cancelado) return
      if (r && !r.erro) { setDados(r); setFalhou(false) } else { setFalhou(true) }
      setLoading(false)
    }

    void carregar()
    return () => { cancelado = true }
  }, [gran, ancora, primeiroDia])

  if (loading) {
    return <div className="text-white/30 py-16 text-center text-sm">Cruzando as placas...</div>
  }

  if (!dados || !dados.kpis) {
    return (
      <div className="bg-white/[0.03] border border-white/8 rounded-xl p-8 text-center">
        <p className="text-white/50 text-sm">
          {falhou ? 'Não foi possível carregar a recorrência.' : 'Ainda não há movimento ingerido.'}
        </p>
        <p className="text-white/25 text-xs mt-2">
          A análise depende da placa digitada na recepção. Sem estadia ingerida, não há o que cruzar.
        </p>
      </div>
    )
  }

  const k = dados.kpis
  const t = dados.ticket
  const iv = dados.intervalo

  // Quantos dos "uma visita" na verdade já tinham vindo antes da janela. É a
  // medida da censura à esquerda: se for alta, a taxa de recorrência da tela
  // está subestimada e o texto abaixo avisa em vez de deixar o número mentir.
  const censurados = k.uma_visita - k.novos_sem_historico
  const topo = dados.distribuicao.find((d) => d.faixa === '6 ou mais')

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-serif text-lg text-white font-light">
            Quem <span className="gold-gradient italic font-semibold">volta</span>
          </h2>
          <p className="text-white/25 text-[11px] mt-0.5">
            Identificação por placa do carro — o hóspede de balcão não tem cadastro ·
            {' '}<span className="figura">{num(k.estadias_com_placa)}</span> de{' '}
            <span className="figura">{num(k.estadias)}</span> estadias com placa
          </p>
          <p className="text-white/20 text-[10px] mt-0.5">
            {censurados > 0
              ? `${num(censurados)} de quem aparece com 1 visita já tinha vindo antes do período — a taxa real é maior`
              : 'Nenhuma visita anterior ao período foi cortada do cálculo'}
          </p>
        </div>
        <PeriodoSeletor
          granularidade={gran}
          ancora={ancora}
          primeiroDia={primeiroDia}
          onChange={(g, nova) => { setGran(g); setAncora(nova) }}
        />
      </div>

      {/* Quantos são, e quanto do movimento é deles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi rotulo="Movimento de quem volta" valor={pct(k.fatia_movimento)}
             nota={`${num(k.estadias_recorrentes)} de ${num(k.estadias_com_placa)} estadias`}
             destaque />
        <Kpi rotulo="Hóspedes identificados" valor={num(k.hospedes)}
             nota={`${pct(k.cobertura_placa)} das estadias têm placa`} />
        <Kpi rotulo="Voltaram ao menos 1x" valor={pct(k.taxa_recorrencia)}
             nota={`${num(k.recorrentes)} de ${num(k.hospedes)} placas`} />
        <Kpi rotulo="Visitas por hóspede"
             valor={k.visitas_por_hospede.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
             nota="no período" />
      </div>

      {/* Quanto valem, e de quanto em quanto tempo aparecem */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi rotulo="Receita de quem volta" valor={brl(k.receita_recorrentes)}
             nota={`${pct(k.fatia_receita)} da receita com placa`} />
        <Kpi rotulo="Valor do recorrente" valor={brlExato(t.valor_recorrente)}
             nota={t.multiplo_valor
               ? `${t.multiplo_valor.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}× o de quem vem uma vez`
               : 'acumulado no período'} />
        <Kpi rotulo="Intervalo típico"
             valor={iv.mediana != null ? `${num(iv.mediana)} dias` : '—'}
             nota={iv.p25 != null && iv.p75 != null
               ? `metade dos retornos entre ${num(iv.p25)} e ${num(iv.p75)} dias`
               : 'sem retorno no período'} />
        <Kpi rotulo="Nunca tinham vindo" valor={num(k.novos_sem_historico)}
             nota="sem estadia anterior em todo o histórico" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Painel titulo="Distribuição de visitas"
                nota="Quantos hóspedes em cada faixa de frequência">
          <BarrasRotuladas
            itens={dados.distribuicao.map((d) => ({
              rotulo: d.faixa,
              valor: d.hospedes,
              principal: num(d.hospedes),
              sub: `${num(d.estadias)} estadias · ${brl(d.receita)}`,
            }))}
            vazio="Sem estadia com placa no período."
          />
          {/* A desproporção é a notícia, e ela é calculada — não afirmada. Um
              texto fixo do tipo "poucos clientes trazem a maior parte" viraria
              mentira no primeiro mês em que a cauda mudar de formato. */}
          {topo && k.hospedes > 0 && k.estadias_com_placa > 0 && (
            <p className="text-white/25 text-[11px] mt-4">
              Quem vem 6 vezes ou mais é{' '}
              <span className="figura text-white/50">{pct(topo.hospedes / k.hospedes)}</span>{' '}
              dos hóspedes e{' '}
              <span className="figura text-white/50">{pct(topo.estadias / k.estadias_com_placa)}</span>{' '}
              das estadias com placa. É a faixa que um programa de fidelidade não pode perder.
            </p>
          )}
        </Painel>

        <Painel titulo="Intervalo entre visitas"
                nota="Dias entre uma estadia e a seguinte do mesmo carro">
          <BarrasRotuladas
            itens={iv.faixas.map((f) => ({
              rotulo: f.faixa,
              valor: f.pares,
              principal: num(f.pares),
              sub: iv.pares > 0 ? pct(f.pares / iv.pares) : '',
            }))}
            vazio="Ninguém voltou dentro do período."
          />
          {/* Mediana e não média: um retorno de 250 dias distorce a média e faria
              o motel achar que o ciclo do cliente é mensal quando é quinzenal. */}
          <p className="text-white/25 text-[11px] mt-4">
            {iv.mediana != null && iv.media != null
              ? `Mediana de ${num(iv.mediana)} dias (média ${num(iv.media)}, puxada por quem sumiu e voltou).
                 É a janela em que vale acionar antes de o hóspede esfriar.`
              : 'Sem par de visitas suficiente para estimar o ciclo.'}
          </p>
        </Painel>
      </div>

      {/* A pergunta do ticket, respondida sem a armadilha de mistura */}
      <Painel titulo="O recorrente gasta mais?"
              nota="Ticket médio por estadia, separando as três populações">
        <BarrasRotuladas
          itens={[
            { rotulo: 'Veio uma vez só', valor: t.unico,
              principal: brlExato(t.unico), sub: `${num(t.estadias_unico)} estadias` },
            { rotulo: '1ª visita de quem voltou', valor: t.rec_primeira,
              principal: brlExato(t.rec_primeira), sub: `${num(t.estadias_rec_primeira)} estadias` },
            { rotulo: 'Estadias de retorno', valor: t.retorno,
              principal: brlExato(t.retorno), sub: `${num(t.estadias_retorno)} estadias` },
          ]}
          vazio="Sem estadia com placa no período."
        />
        {/* Comparar "retorno" contra "primeira visita" sem separar populações
            jogaria o hóspede de uma vez só — o de ticket mais alto do motel —
            dentro do grupo "primeira", e o resultado leria como queda no
            retorno. As duas leituras ficam explícitas para não confundir. */}
        <div className="grid sm:grid-cols-2 gap-3 mt-5">
          <Leitura
            titulo="Mesma gente, antes e depois"
            valor={t.delta_intra}
            nota="1ª visita do recorrente vs. suas voltas — sem mistura de população"
          />
          <Leitura
            titulo="Retorno vs. quem nunca voltou"
            valor={t.delta_vs_unico}
            nota="populações diferentes: quem volta compra mais barato por vez"
          />
        </div>
        <p className="text-white/25 text-[11px] mt-4">
          O recorrente paga menos por estadia e vale{' '}
          <span className="figura text-white/50">
            {t.multiplo_valor
              ? `${t.multiplo_valor.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}×`
              : 'mais'}
          </span>{' '}
          no período (<span className="figura">{brlExato(t.valor_recorrente)}</span> contra{' '}
          <span className="figura">{brlExato(t.valor_uma_visita)}</span>). O ganho está na
          frequência, não no ticket — fidelidade que só empurra valor por noite mira errado.
        </p>
      </Painel>

      <div className="grid lg:grid-cols-2 gap-4">
        <Painel titulo="Melhores clientes por receita"
                nota="Top 10 no período · placa parcial, por privacidade">
          <ListaClientes clientes={dados.top_receita} destaque="receita" />
        </Painel>

        <Painel titulo="Melhores clientes por frequência"
                nota="Top 10 no período · placa parcial, por privacidade">
          <ListaClientes clientes={dados.top_frequencia} destaque="visitas" />
        </Painel>
      </div>

      <p className="text-white/20 text-[10px]">
        A placa chega aqui já mascarada e só das 10 primeiras — a lista completa não sai do
        banco. Placa é dado pessoal, e a tela não precisa dela inteira para reconhecer o
        cliente. Quem não deixou placa (<span className="figura">{pct(1 - k.cobertura_placa)}</span>{' '}
        das estadias) é invisível para esta análise: pode estar voltando sem que a gente veja.
      </p>
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

/** Barras horizontais com rótulo e valor — poucas categorias, leitura direta. */
function BarrasRotuladas({ itens, vazio }: {
  itens: Array<{ rotulo: string; valor: number; principal: string; sub: string }>
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
            <span className="figura text-white/50 text-xs">
              {i.principal}
              {i.sub && <span className="text-white/25 ml-2">{i.sub}</span>}
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

/**
 * Uma variação percentual com o sinal explicado.
 *
 * Verde/vermelho aqui é semântica de direção, não paleta de dado — a barra de
 * dado continua sendo a fria. Nulo vira "—": sem base, "0%" mentiria.
 */
function Leitura({ titulo, valor, nota }: {
  titulo: string; valor: number | null; nota: string
}) {
  const subiu = (valor ?? 0) >= 0
  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3">
      <p className="text-white/45 text-[11px]">{titulo}</p>
      <p className={`figura text-lg font-light mt-0.5 ${
        valor == null ? 'text-white/30' : subiu ? 'text-emerald-400/80' : 'text-red-400/80'
      }`}>
        {valor == null
          ? '—'
          : `${subiu ? '+' : ''}${(valor * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
      </p>
      <p className="text-white/25 text-[10px] mt-0.5">{nota}</p>
    </div>
  )
}

/**
 * Top 10 de clientes. A placa vem parcial do banco (`ABC1***`) — o suficiente
 * para a recepção reconhecer o carro que ela já conhece, e insuficiente para
 * virar lista de gente.
 */
function ListaClientes({ clientes, destaque }: {
  clientes: Cliente[]; destaque: 'receita' | 'visitas'
}) {
  if (clientes.length === 0) {
    return <p className="text-white/20 text-xs">Sem cliente identificado no período.</p>
  }
  const max = Math.max(...clientes.map((c) => (destaque === 'receita' ? c.receita : c.visitas)), 1)

  return (
    <div className="space-y-2.5">
      {clientes.map((c, i) => {
        const valor = destaque === 'receita' ? c.receita : c.visitas
        return (
          <div key={`${c.placa}-${i}`} className="flex items-center gap-3">
            <span className="figura text-white/20 text-[10px] w-4 shrink-0">{i + 1}</span>
            <span className="figura text-white/70 text-xs w-[68px] shrink-0">{c.placa}</span>
            <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full rounded-full"
                style={{
                  width: `${Math.max(1, (valor / max) * 100)}%`,
                  background: destaque === 'receita' ? MARCA : MARCA_FRACA,
                }} />
            </div>
            <span className="figura text-white/50 text-[11px] w-[64px] text-right shrink-0">
              {destaque === 'receita' ? brl(c.receita) : `${num(c.visitas)}×`}
            </span>
            <span className="figura text-white/25 text-[10px] w-[74px] text-right shrink-0">
              {destaque === 'receita' ? `${num(c.visitas)}×` : brl(c.receita)}
            </span>
            {/* Última visita é o gatilho de acionamento: cliente de topo parado
                há mais que o intervalo típico é quem se perde em silêncio. */}
            <span className="figura text-white/25 text-[10px] w-[38px] text-right shrink-0">
              {ddmm(c.ultima)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
