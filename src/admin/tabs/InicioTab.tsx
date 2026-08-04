import { useEffect, useState } from 'react'
import { usePanorama } from '../panoramaContext'
import { fetchDesempenho, type DesempenhoResponse } from '../../lib/plugplayAdmin'

// Início — o resumo do motel, não do site.
//
// Substitui a antiga "Visão Geral", que somava só `reservations` e por isso
// anunciava "Faturamento Total" sobre 3 reservas pagas enquanto o motel fazia
// R$ 210 mil no mesmo período. O site continua tendo sua tela; aqui ele aparece
// como fatia, que é o tamanho real dele.

type Ir = (destino: string) => void

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function pct(v: number): string {
  return `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

function mesCorrente(): [string, string] {
  const agora = new Date()
  const ym = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`
  const dia = String(agora.getDate()).padStart(2, '0')
  return [`${ym}-01`, `${ym}-${dia}`]
}

export default function InicioTab({ ir }: { ir: Ir }) {
  const { dados: pano, carregando, semContato, atualizadoEm } = usePanorama()
  const [des, setDes] = useState<DesempenhoResponse | null>(null)

  useEffect(() => {
    let cancelado = false
    const [inicio, fim] = mesCorrente()
    void fetchDesempenho(inicio, fim).then((r) => { if (!cancelado) setDes(r) })
    return () => { cancelado = true }
  }, [])

  const k = pano?.kpis
  const d = des?.atual?.kpis
  const anterior = des?.mesAnterior?.kpis
  const cobre = !!des?.cobertura?.primeiro_dia && !!des?.mesAnterior &&
    des.mesAnterior.periodo.inicio >= des.cobertura.primeiro_dia

  const deltaReceita = anterior?.receita && d
    ? (d.receita - anterior.receita) / anterior.receita
    : null

  const origem = des?.atual?.por_origem ?? []
  const totalOrigem = origem.reduce((acc, o) => acc + o.receita, 0)
  const doSite = origem.find((o) => o.origem === 'site')?.receita ?? 0

  const pendentes = pano?.pendentes?.length ?? 0
  const emAlerta = k?.emAlerta ?? 0
  const chegadasHoje = (pano?.chegadas?.site.length ?? 0) + (pano?.chegadas?.recepcao.length ?? 0)

  return (
    <div className="space-y-6">
      {/* Agora — o estado do motel neste instante */}
      <section>
        <Cabecalho titulo="Agora" acao={{ rotulo: 'Abrir o mapa', ir: () => ir('motel') }}
          nota={atualizadoEm ? `atualizado ${new Date(atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : undefined}
          alerta={semContato ? 'sem contato com o PMS' : undefined} />

        {carregando ? (
          <p className="text-white/25 text-xs">Lendo o motel...</p>
        ) : !pano?.configured ? (
          <p className="text-white/25 text-xs">Integração com o PMS desligada.</p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Numero rotulo="Ocupação" valor={`${k?.ocupacaoPct ?? 0}%`}
                    nota={`${k?.ocupada ?? 0} de ${k?.total ?? 0} suítes`} forte />
            <Numero rotulo="Livres" valor={String(k?.livre ?? 0)}
                    nota={(k?.preparo ?? 0) > 0 ? `${k?.preparo} em preparo` : 'nenhuma em preparo'} />
            <Numero rotulo="Conta aberta" valor={brl(k?.receitaAberta ?? 0)}
                    nota={(k?.consumoAberto ?? 0) > 0 ? `${brl(k!.consumoAberto)} de consumo` : 'sem consumo lançado'} />
            <Numero rotulo="Chegam hoje" valor={String(chegadasHoje)}
                    nota={`${pano?.chegadas?.recepcao.length ?? 0} pela recepção`} />
          </div>
        )}
      </section>

      {/* Pendências — só aparece quando há o que fazer */}
      {(pendentes > 0 || emAlerta > 0) && (
        <section className="border border-amber-500/25 bg-amber-500/[0.04] rounded-xl p-4">
          <h3 className="text-amber-300/90 text-xs font-medium uppercase tracking-wider mb-2">
            Precisa de você
          </h3>
          <div className="space-y-1.5">
            {pendentes > 0 && (
              <BotaoLinha onClick={() => ir('motel')}
                texto={`${pendentes} reserva${pendentes > 1 ? 's' : ''} paga${pendentes > 1 ? 's' : ''} que a recepção não recebeu`}
                detalhe="O cliente pagou no site e o PMS não confirmou." />
            )}
            {emAlerta > 0 && (
              <BotaoLinha onClick={() => ir('motel')}
                texto={`${emAlerta} suíte${emAlerta > 1 ? 's' : ''} com tempo excedido`}
                detalhe="Passou do previsto e ainda está ocupada." />
            )}
          </div>
        </section>
      )}

      {/* Mês — o desempenho acumulado */}
      <section>
        <Cabecalho titulo="Este mês" acao={{ rotulo: 'Ver desempenho', ir: () => ir('desempenho') }}
          nota={des?.atual ? `${des.atual.periodo.dias} dias corridos` : undefined} />

        {!des?.atual ? (
          <p className="text-white/25 text-xs">
            Sem movimento ingerido ainda. O ingest roda a cada 15 minutos.
          </p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Numero rotulo="Receita" valor={brl(d?.receita ?? 0)}
                    delta={cobre ? deltaReceita : null}
                    nota={cobre ? 'vs. mesmo período do mês passado' : 'sem base anterior'} forte />
            <Numero rotulo="Estadias" valor={(d?.estadias ?? 0).toLocaleString('pt-BR')}
                    nota={`${(d?.taxa_giro ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} por suíte-dia`} />
            <Numero rotulo="Ticket médio" valor={brl(d?.ticket ?? 0)} />
            <Numero rotulo="RevPAR" valor={brl(d?.revpar ?? 0)} nota="por suíte-dia" />
          </div>
        )}
      </section>

      {/* De onde vem — o site no tamanho real */}
      {des?.atual && totalOrigem > 0 && (
        <section>
          <Cabecalho titulo="De onde vem a receita"
                     acao={{ rotulo: 'Ver o funil do site', ir: () => ir('visao-geral') }} />

          <div className="bg-white/[0.03] border border-white/8 rounded-xl p-5">
            <div className="flex h-2 rounded-full overflow-hidden gap-[2px] mb-4">
              {origem.map((o) => (
                <div key={o.origem}
                  style={{
                    width: `${(o.receita / totalOrigem) * 100}%`,
                    background: o.origem === 'site' ? '#C9A84C' : '#3d6b7a',
                  }}
                />
              ))}
            </div>

            <div className="space-y-2">
              {origem.map((o) => (
                <div key={o.origem} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-white/60">
                    {o.origem === 'site' ? 'Site' : o.origem === 'balcao' ? 'Balcão' : 'Reserva da recepção'}
                  </span>
                  <span className="text-white/40 figura">
                    {brl(o.receita)}
                    <span className="text-white/25 ml-2">{pct(o.receita / totalOrigem)}</span>
                  </span>
                </div>
              ))}
            </div>

            {doSite === 0 && (
              <p className="text-white/25 text-[11px] mt-4 pt-3 border-t border-white/5">
                O site ainda não aparece aqui. A integração com o PMS entrou em 29/07 e as
                reservas pagas são anteriores a ela — a atribuição começa na próxima venda.
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

function Cabecalho({ titulo, nota, alerta, acao }: {
  titulo: string; nota?: string; alerta?: string
  acao?: { rotulo: string; ir: () => void }
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
      <div className="flex items-baseline gap-3">
        <h2 className="text-white/80 text-sm font-medium">{titulo}</h2>
        {nota && <span className="text-white/25 text-[11px]">{nota}</span>}
        {alerta && <span className="text-amber-400/70 text-[11px]">{alerta}</span>}
      </div>
      {acao && (
        <button onClick={acao.ir}
          className="text-[11px] text-gold-500 hover:text-gold-400 transition-colors">
          {acao.rotulo} →
        </button>
      )}
    </div>
  )
}

function Numero({ rotulo, valor, nota, delta, forte }: {
  rotulo: string; valor: string; nota?: string; delta?: number | null; forte?: boolean
}) {
  const subiu = (delta ?? 0) >= 0
  return (
    <div className={`rounded-xl p-4 border ${
      forte ? 'bg-white/[0.05] border-white/12' : 'bg-white/[0.03] border-white/8'
    }`}>
      <p className="text-white/35 text-[10px] uppercase tracking-wider">{rotulo}</p>
      <p className="figura text-2xl text-white mt-1.5 leading-none">{valor}</p>
      <div className="flex items-baseline gap-2 mt-2 flex-wrap">
        {delta != null && (
          <span className={`figura text-[11px] ${subiu ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
            {subiu ? '+' : ''}{(delta * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
          </span>
        )}
        {nota && <span className="text-white/25 text-[10px]">{nota}</span>}
      </div>
    </div>
  )
}

function BotaoLinha({ texto, detalhe, onClick }: {
  texto: string; detalhe: string; onClick: () => void
}) {
  return (
    <button onClick={onClick}
      className="w-full text-left group flex items-baseline justify-between gap-3">
      <span className="text-white/75 text-xs group-hover:text-white transition-colors">
        {texto}
        <span className="text-white/30 ml-2 text-[11px]">{detalhe}</span>
      </span>
      <span className="text-amber-400/50 text-[11px] shrink-0 group-hover:text-amber-400/80">→</span>
    </button>
  )
}
