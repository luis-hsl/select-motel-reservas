import { useEffect, useState } from 'react'
import { fetchAnalytics } from '../../lib/plugplayAdmin'
import PeriodoSeletor from '../PeriodoSeletor'
import { faixa, hoje, recortar, type Granularidade } from '../periodo'

// Aba "Financeiro" — por onde o dinheiro entra e onde ele é conferido.
//
// Os dados já estavam gravados desde o backfill e nenhuma tela lia. São três
// perguntas diferentes, e a tela mantém as três separadas de propósito:
//
//   1. Como o hóspede paga (vem de `pms_ocupacoes.pagamentos[]`, existe sempre).
//   2. Quanto some em taxa de adquirente (vem do snapshot mensal do PMS, que
//      pode não ter sido capturado — e aí a tela DIZ que falta, não mostra zero).
//   3. Se o caixa da recepção fecha (idem, snapshot).
//
// Diferente do Desempenho, aqui entram TODAS as ocupações, inclusive as que
// não são estadia: venda direta é dinheiro que caiu no mesmo caixa, e cortá-la
// faria o total não bater com o fechamento da recepção. O que a tela faz é
// separar as duas em vez de escolher uma.

/** Cor das marcas de dado. Fria de propósito: o ouro é da marca e da ação. */
const MARCA = '#4d94a8'
const MARCA_FRACA = '#2b5563'

interface Forma {
  id: number
  forma: string
  lancamentos: number
  valor: number
  estadia: number
  venda_direta: number
  fora_do_caixa: boolean
  participacao: number | null
}

interface Fechamento {
  id: number
  operador: string
  data_base: string
  inicio: string | null
  fim: string | null
  total: number
  recebido: number
  sangrias: number
  quebra: number
  conferido: boolean
  divergente: boolean
}

interface Financeiro {
  erro?: string
  periodo: { inicio: string; fim: string; dias: number }
  kpis: {
    caixa: number
    recebido: number
    recebido_estadia: number
    recebido_venda_direta: number
    ocupacoes: number
    estadias: number
    vendas_diretas: number
    lancamentos: number
    ticket_pagamento: number
    desconto: number
    acrescimo: number
    cortesia: number
    linhas_desconto: number
    linhas_cortesia: number
    fora_do_caixa: number
    conferencia_divergentes: number
    conferencia_delta: number
  }
  formas: Forma[]
  diario: Array<{ dia: string; valor: number; lancamentos: number }>
  taxa: {
    disponivel: boolean
    meses_ausentes: string[]
    lancamentos: number
    bruto: number
    valor_taxa: number
    liquido: number
    /** false = o PMS não guarda taxa nenhuma. Não confundir com "taxa zero". */
    registrada: boolean
    com_bandeira: number
    antecipados: number
    por_forma: Array<{
      forma: string; lancamentos: number
      bruto: number; valor_taxa: number; liquido: number; taxa_pct: number
    }>
    comissao_guia: number
    comissao_guia_base: number
  }
  caixa: {
    disponivel: boolean
    meses_ausentes: string[]
    fechamentos: number
    conferidos: number
    nao_conferidos: number
    divergentes: number
    quebra: number
    total: number
    recebido: number
    antecipado: number
    sangrias: number
    despesas: number
    ajustes: number
    consumo_funcionario: number
    declarados: number
    atencao: Fechamento[]
    atencao_total: number
    por_operador: Array<{
      operador: string; fechamentos: number; conferidos: number; total: number
    }>
  }
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

function ddmm(iso: string): string {
  return `${iso.slice(8)}/${iso.slice(5, 7)}`
}

/** "2026-03" → "mar/2026". Só aparece em aviso de captura faltando. */
const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
function mesRotulo(ym: string): string {
  const [a, m] = ym.split('-')
  return `${MES_CURTO[Number(m) - 1]}/${a}`
}

export default function FinanceiroTab() {
  const [dados, setDados] = useState<Financeiro | null>(null)
  const [loading, setLoading] = useState(true)
  const [falhou, setFalhou] = useState(false)
  const [gran, setGran] = useState<Granularidade>('mes')
  const [ancora, setAncora] = useState<string>(() => hoje())
  const [primeiroDia, setPrimeiroDia] = useState<string | null>(null)

  // A cobertura é a mesma do Desempenho e não muda com o filtro — buscar uma
  // vez evita uma segunda chamada a cada clique na seta.
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
      const [inicio, fim] = recortar(bruto, brutoFim, primeiroDia)
      const r = await fetchAnalytics<Financeiro>('pms_financeiro', { p_inicio: inicio, p_fim: fim })
      if (cancelado) return
      if (r && !r.erro) { setDados(r); setFalhou(false) } else { setFalhou(true) }
      setLoading(false)
    }
    void carregar()
    return () => { cancelado = true }
  }, [gran, ancora, primeiroDia])

  if (loading) {
    return <div className="text-white/30 py-16 text-center text-sm">Somando o caixa...</div>
  }

  if (!dados) {
    return (
      <div className="bg-white/[0.03] border border-white/8 rounded-xl p-8 text-center">
        <p className="text-white/50 text-sm">
          {falhou ? 'Não foi possível carregar o financeiro.' : 'Ainda não há pagamento ingerido.'}
        </p>
        <p className="text-white/25 text-xs mt-2">
          O ingest roda a cada 15 minutos. Um backfill traz o histórico de uma vez.
        </p>
      </div>
    )
  }

  const k = dados.kpis
  const t = dados.taxa
  const c = dados.caixa
  const temSerie = gran !== 'dia' && dados.diario.length > 1
  const bate = k.conferencia_divergentes === 0

  return (
    <div className="space-y-5">
      {/* Cabeçalho + seletor de período */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-serif text-lg text-white font-light">
            Financeiro <span className="gold-gradient italic font-semibold">do caixa</span>
          </h2>
          <p className="text-white/25 text-[11px] mt-0.5">
            {dados.periodo.dias} {dados.periodo.dias === 1 ? 'dia' : 'dias'} ·
            {' '}<span className="figura">{k.ocupacoes.toLocaleString('pt-BR')}</span> ocupações ·
            {' '}estadia e venda direta somadas
          </p>
          <p className="text-white/20 text-[10px] mt-0.5">
            Cortesia e comissão de guia ficam fora do total: o PMS marca as duas como
            {' '}<i>não soma</i>, e são o que o motel abre mão, não o que recebe.
          </p>
        </div>
        <PeriodoSeletor
          granularidade={gran}
          ancora={ancora}
          primeiroDia={primeiroDia}
          onChange={(g, nova) => { setGran(g); setAncora(nova) }}
        />
      </div>

      {/* Quanto entrou */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi rotulo="Entrou no caixa" valor={brl(k.caixa)}
             nota={`${k.lancamentos.toLocaleString('pt-BR')} pagamentos`} destaque />
        <Kpi rotulo="Estadias" valor={brl(k.recebido_estadia)}
             nota={k.caixa > 0 ? `${pct(k.recebido_estadia / k.caixa)} do caixa` : undefined} />
        <Kpi rotulo="Venda direta" valor={brl(k.recebido_venda_direta)}
             nota={`${k.vendas_diretas} lançamentos, sem suíte`} />
        <Kpi rotulo="Ticket por pagamento" valor={brlExato(k.ticket_pagamento)}
             nota="valor médio de cada lançamento" />
      </div>

      {/* O que o motel abriu mão */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi rotulo="Descontos" valor={brl(k.desconto)}
             nota={k.linhas_desconto > 0
               ? `${k.linhas_desconto} ${k.linhas_desconto === 1 ? 'ocupação' : 'ocupações'}`
               : 'nenhum no período'} />
        <Kpi rotulo="Cortesias" valor={brl(k.cortesia)}
             nota={k.linhas_cortesia > 0
               ? `${k.linhas_cortesia} ${k.linhas_cortesia === 1 ? 'ocupação' : 'ocupações'}`
               : 'nenhuma no período'} />
        <Kpi rotulo="Comissão de guia" valor={brl(t.comissao_guia)}
             nota={t.comissao_guia_base > 0
               ? `${pct(t.comissao_guia / t.comissao_guia_base)} sobre ${brl(t.comissao_guia_base)}`
               : 'sem venda por guia no período'} />
        <Kpi rotulo="Acréscimos" valor={brl(k.acrescimo)} nota="cobrado a mais na conta" />
      </div>

      {/* Conferência entre as duas contas que o PMS mantém. Fica no topo porque,
          se isso não bate, nenhum número abaixo merece confiança. */}
      <div className={`border rounded-xl px-5 py-3 flex items-baseline gap-3 flex-wrap ${
        bate ? 'bg-white/[0.03] border-white/8' : 'bg-amber-500/5 border-amber-500/30'
      }`}>
        <span className={`text-xs ${bate ? 'text-white/50' : 'text-amber-300'}`}>
          {bate
            ? 'Soma dos pagamentos bate com o total das ocupações'
            : `${k.conferencia_divergentes} ocupações com pagamento que não fecha`}
        </span>
        <span className="figura text-[11px] text-white/30">
          {k.ocupacoes.toLocaleString('pt-BR')} linhas · diferença {brlExato(k.conferencia_delta)}
        </span>
      </div>

      {/* Como o hóspede paga */}
      <Painel titulo="Por forma de pagamento"
              nota="Participação sobre o que efetivamente entrou no caixa">
        <Formas itens={dados.formas} total={k.caixa} />
      </Painel>

      {temSerie && (
        <Painel titulo="Entrada por dia"
                nota="Somado pelo dia-base de caixa, o mesmo eixo do Desempenho">
          <BarrasDiarias serie={dados.diario} />
        </Painel>
      )}

      {/* Taxa de adquirente */}
      <Painel titulo="Taxa de adquirente"
              nota="Quanto a maquininha fica antes do dinheiro chegar na conta">
        {!t.disponivel ? (
          <SemCaptura meses={t.meses_ausentes} />
        ) : !t.registrada ? (
          <div className="space-y-3">
            <p className="text-amber-300/90 text-xs leading-relaxed">
              O PMS não registra taxa de adquirente. Nos
              {' '}<span className="figura">{t.lancamentos.toLocaleString('pt-BR')}</span> pagamentos
              do período, <span className="figura">valorTaxa</span> vem zerado e nenhum tem
              código de autorização nem bandeira — a conciliação com a adquirente não está ligada.
            </p>
            <p className="text-white/25 text-[11px] leading-relaxed">
              Isso não quer dizer que a taxa seja zero: quer dizer que o sistema não sabe
              qual é. O líquido real só aparece aqui depois que alguém ligar a conciliação
              no PMS ou cadastrar as taxas por bandeira. Enquanto isso, o único custo de
              canal que existe medido é a comissão de guia, no cartão acima.
            </p>
            <div className="grid grid-cols-3 gap-3 pt-1">
              <Mini rotulo="Bruto capturado" valor={brl(t.bruto)} />
              <Mini rotulo="Taxa registrada" valor="—" atenuado />
              <Mini rotulo="Líquido" valor={brl(t.liquido)} nota="igual ao bruto" atenuado />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Mini rotulo="Bruto" valor={brl(t.bruto)} />
              <Mini rotulo="Taxa" valor={brl(t.valor_taxa)}
                    nota={t.bruto > 0 ? pct(t.valor_taxa / t.bruto, 2) : undefined} />
              <Mini rotulo="Líquido" valor={brl(t.liquido)} />
            </div>
            <BarrasRotuladas
              itens={t.por_forma.map((f) => ({
                chave: f.forma, rotulo: f.forma, valor: f.valor_taxa,
                sub: `${pct(f.taxa_pct, 2)} sobre ${brl(f.bruto)}`,
              }))}
              vazio="Sem pagamento capturado no período."
            />
          </div>
        )}
        {t.disponivel && t.meses_ausentes.length > 0 && (
          <p className="text-amber-300/60 text-[10px] mt-3">
            Parcial: sem relatório capturado para {t.meses_ausentes.map(mesRotulo).join(', ')}.
          </p>
        )}
      </Painel>

      {/* Fechamento de caixa */}
      <Painel titulo="Fechamento de caixa"
              nota="Cada turno da recepção abre e fecha um caixa no PMS">
        {!c.disponivel ? (
          <SemCaptura meses={c.meses_ausentes} />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Mini rotulo="Fechamentos" valor={c.fechamentos.toLocaleString('pt-BR')}
                    nota={brl(c.total)} />
              <Mini rotulo="Conferidos" valor={pct(c.fechamentos > 0 ? c.conferidos / c.fechamentos : 0)}
                    nota={`${c.conferidos} de ${c.fechamentos}`} />
              <Mini rotulo="Sangrias" valor={brl(c.sangrias)}
                    nota={c.sangrias === 0 ? 'nenhuma no período' : undefined} />
              <Mini rotulo="Consumo de funcionário" valor={brl(c.consumo_funcionario)}
                    nota="saiu do estoque sem entrar no caixa" />
            </div>

            {/* Divergência é estado, não dado — por isso âmbar/vermelho aqui. */}
            {c.divergentes > 0 ? (
              <div className="bg-red-500/5 border border-red-500/30 rounded-lg px-4 py-2.5">
                <p className="text-red-300 text-xs">
                  <span className="figura">{c.divergentes}</span>
                  {c.divergentes === 1 ? ' caixa fechou' : ' caixas fecharam'} com valor inicial
                  diferente do final — quebra de <span className="figura">{brlExato(c.quebra)}</span>.
                </p>
              </div>
            ) : (
              <p className="text-white/25 text-[11px] leading-relaxed">
                Nenhum caixa acusou divergência entre abertura e fechamento. Vale ler com
                reserva: <span className="figura">{c.declarados}</span> dos
                {' '}<span className="figura">{c.fechamentos}</span> fechamentos tiveram o valor
                contado fisicamente digitado no PMS. Sem essa contagem, o sistema compara o
                que ele mesmo calculou consigo mesmo, e a divergência nunca aparece.
              </p>
            )}

            {c.atencao.length > 0 && (
              <div>
                <p className="text-white/40 text-[11px] mb-2">
                  Pendências ({c.atencao_total.toLocaleString('pt-BR')}
                  {c.atencao_total > c.atencao.length ? `, mostrando ${c.atencao.length}` : ''})
                </p>
                <div className="space-y-1">
                  {c.atencao.map((f) => (
                    <div key={f.id}
                         className="flex items-baseline justify-between gap-3 px-3 py-1.5
                                    rounded-lg bg-white/[0.02] border border-white/5">
                      <span className="figura text-[11px] text-white/55">{ddmm(f.data_base)}</span>
                      <span className="text-[11px] text-white/35 flex-1 truncate">{f.operador}</span>
                      <span className="figura text-[11px] text-white/45">{brlExato(f.total)}</span>
                      <span className={`text-[10px] ${
                        f.divergente ? 'text-red-400/90' : 'text-amber-300/70'
                      }`}>
                        {f.divergente ? 'divergente' : 'não conferido'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {c.disponivel && c.meses_ausentes.length > 0 && (
          <p className="text-amber-300/60 text-[10px] mt-3">
            Parcial: sem relatório capturado para {c.meses_ausentes.map(mesRotulo).join(', ')}.
          </p>
        )}
      </Painel>

      {/* Por operador — fechado por padrão, de propósito. Ver comentário. */}
      {c.disponivel && c.por_operador.length > 0 && <PorOperador itens={c.por_operador} />}

      <p className="text-white/20 text-[10px]">
        Taxa de adquirente e fechamento de caixa vêm do relatório mensal do PMS, capturado
        sob demanda; forma de pagamento e descontos vêm das ocupações ingeridas, que existem
        para todo o histórico. Por isso os dois blocos podem cobrir períodos diferentes.
      </p>
    </div>
  )
}

/** Aviso de mês não capturado. Zero aqui seria mentira, então nem mostramos. */
function SemCaptura({ meses }: { meses: string[] }) {
  return (
    <div className="text-center py-6">
      <p className="text-white/40 text-xs">
        Sem relatório capturado para {meses.length > 0 ? meses.map(mesRotulo).join(', ') : 'este período'}.
      </p>
      <p className="text-white/25 text-[11px] mt-1.5 max-w-md mx-auto leading-relaxed">
        Não é ausência de movimento: é ausência de captura. O relatório mensal do PMS só
        entra no banco quando alguém o puxa, e esses meses ficaram de fora.
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

/** Número dentro de painel — mesma leitura do Kpi, sem a moldura de card. */
function Mini({ rotulo, valor, nota, atenuado }: {
  rotulo: string; valor: string; nota?: string; atenuado?: boolean
}) {
  return (
    <div>
      <p className="text-white/35 text-[10px] uppercase tracking-wider">{rotulo}</p>
      <p className={`figura text-lg font-light mt-0.5 ${atenuado ? 'text-white/35' : 'text-white'}`}>
        {valor}
      </p>
      {nota && <p className="text-white/25 text-[10px]">{nota}</p>}
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
 * Formas de pagamento. As que o PMS marca como "não soma" (cortesia, comissão
 * de guia) aparecem na mesma lista, mas em tom fraco e sem participação: são
 * dinheiro que não entrou, e dar a elas uma fatia do bolo faria parecer receita.
 */
function Formas({ itens, total }: { itens: Forma[]; total: number }) {
  if (itens.length === 0) {
    return <p className="text-white/20 text-xs">Sem pagamento no período.</p>
  }
  const max = Math.max(...itens.map((i) => i.valor), 1)

  return (
    <div className="space-y-3">
      {itens.map((f) => (
        <div key={f.id}>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <span className={`text-xs ${f.fora_do_caixa ? 'text-white/40' : 'text-white/70'}`}>
              {f.forma}
              {f.fora_do_caixa && (
                <span className="text-white/25 text-[10px] ml-2">não entra no caixa</span>
              )}
            </span>
            <span className="figura text-xs text-white/50">
              {brl(f.valor)}
              <span className="text-white/25 ml-2">
                {f.participacao != null ? pct(f.participacao) : '—'}
              </span>
              <span className="text-white/20 ml-2">{f.lancamentos}×</span>
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full rounded-full"
              style={{
                width: `${Math.max(1, (f.valor / max) * 100)}%`,
                background: f.fora_do_caixa ? MARCA_FRACA : MARCA,
              }} />
          </div>
          {f.venda_direta > 0 && (
            <p className="text-white/20 text-[10px] mt-1">
              {brl(f.estadia)} em estadia · {brl(f.venda_direta)} em venda direta
            </p>
          )}
        </div>
      ))}
      <p className="text-white/25 text-[10px] pt-1">
        Base da participação: <span className="figura">{brlExato(total)}</span> que entraram no caixa.
      </p>
    </div>
  )
}

/** Barras horizontais com rótulo e valor — poucas categorias, leitura direta. */
function BarrasRotuladas({ itens, vazio }: {
  itens: Array<{ chave: string; rotulo: string; valor: number; sub: string }>
  vazio: string
}) {
  if (itens.length === 0) return <p className="text-white/20 text-xs">{vazio}</p>
  const max = Math.max(...itens.map((i) => i.valor), 1)

  return (
    <div className="space-y-3">
      {itens.map((i) => (
        <div key={i.chave}>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <span className="text-white/70 text-xs">{i.rotulo}</span>
            <span className="figura text-xs text-white/50">
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

/**
 * Entrada diária. Série única, então a cor não codifica nada — quem informa é
 * a altura. O dia sob o cursor aparece na linha de cima, para não empilhar
 * rótulo em cima de barra estreita.
 */
function BarrasDiarias({ serie }: {
  serie: Array<{ dia: string; valor: number; lancamentos: number }>
}) {
  const [ativo, setAtivo] = useState<number | null>(null)
  const max = Math.max(...serie.map((d) => d.valor), 1)
  const item = ativo != null ? serie[ativo] : null

  return (
    <div>
      <div className="h-8 mb-1">
        {item ? (
          <div className="text-[11px]">
            <span className="figura text-white/70">
              {new Date(`${item.dia}T12:00:00`).toLocaleDateString('pt-BR', {
                day: '2-digit', month: '2-digit', weekday: 'short',
              })}
            </span>
            <span className="figura text-white/40 ml-2">{brlExato(item.valor)}</span>
            <span className="figura text-white/25 ml-2">{item.lancamentos} pagamentos</span>
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
            aria-label={`${d.dia}: ${brlExato(d.valor)} em ${d.lancamentos} pagamentos`}>
            <div className="w-full rounded-t transition-colors"
              style={{
                height: `${Math.max(2, (d.valor / max) * 100)}%`,
                background: ativo === i ? MARCA : MARCA_FRACA,
              }}
            />
          </button>
        ))}
      </div>

      <div className="flex justify-between mt-1.5 figura text-[10px] text-white/25">
        <span>{ddmm(serie[0].dia)}</span>
        <span>{ddmm(serie[serie.length - 1].dia)}</span>
      </div>
    </div>
  )
}

/**
 * Produtividade por recepcionista.
 *
 * Fica fechado por padrão e o nome vem cortado no primeiro nome (o RPC já
 * devolve assim; o campo cru é o nome completo da funcionária). Ranquear
 * pessoa é uma decisão de gestão que o dono toma, não um default de painel —
 * quem abre o bloco está escolhendo olhar, e a diferença entre as duas coisas
 * é o que separa acompanhar o caixa de vigiar quem está no balcão.
 *
 * O número também engana se lido como desempenho: o total de um caixa depende
 * do turno que a pessoa pegou, não do quanto ela vendeu. O que dá para ler
 * honestamente aqui é a taxa de conferência.
 */
function PorOperador({ itens }: {
  itens: Array<{ operador: string; fechamentos: number; conferidos: number; total: number }>
}) {
  const [aberto, setAberto] = useState(false)

  return (
    <div className="bg-white/[0.03] border border-white/8 rounded-xl p-5">
      <button onClick={() => setAberto((v) => !v)}
        className="flex items-baseline gap-2 text-left w-full">
        <h3 className="text-white/70 text-sm font-medium">Por recepcionista</h3>
        <span className="text-white/25 text-[11px]">{aberto ? 'ocultar' : 'mostrar'}</span>
      </button>
      <p className="text-white/25 text-[11px] mt-0.5">
        Fechado por padrão: o total de um caixa reflete o turno, não a produtividade de
        quem estava nele. O que se lê aqui é quem fecha conferindo.
      </p>

      {aberto && (
        <div className="mt-4">
          <BarrasRotuladas
            itens={itens.map((o) => ({
              chave: o.operador,
              rotulo: o.operador,
              valor: o.total,
              sub: `${o.conferidos}/${o.fechamentos} conferidos`,
            }))}
            vazio="Sem fechamento no período."
          />
          <p className="text-white/20 text-[10px] mt-3">
            Nomes cortados no primeiro nome.
          </p>
        </div>
      )}
    </div>
  )
}
