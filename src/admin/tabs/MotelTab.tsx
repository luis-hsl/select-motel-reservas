import { useEffect, useState } from 'react'
import {
  fetchPanorama, fetchCobranca,
  type Panorama, type SuitePainel, type ChegadaHoje,
} from '../../lib/plugplayAdmin'

// Aba "Motel" — o estado real da operação, vindo do PMS da recepção.
//
// É a única tela do painel que enxerga walk-in, reserva por telefone e
// manutenção. O resto do admin só conhece o que o site vendeu, que é a menor
// parte do movimento.
//
// Nada aqui escreve no PMS: o painel observa, a recepção opera.

/** De quanto em quanto tempo o panorama se atualiza sozinho. */
const REFRESH_MS = 45_000

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * O PMS manda datetime em horário local **sem offset**. `new Date()` num
 * string desses assume o fuso do browser, o que já bateria certo aqui, mas
 * cortar o texto é imune a browser configurado em outro fuso.
 */
function hora(dt: string | null): string {
  if (!dt) return '—'
  const m = dt.match(/T(\d{2}:\d{2})/)
  return m ? m[1] : dt.slice(0, 10)
}

function segundosDesde(iso: string | undefined): number {
  if (!iso) return 0
  const m = iso.match(/T(\d{2}):(\d{2}):(\d{2})/)
  if (!m) return 0
  const agora = new Date()
  const geradoSeg = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3])
  const agoraSeg  = agora.getHours() * 3600 + agora.getMinutes() * 60 + agora.getSeconds()
  return Math.max(0, agoraSeg - geradoSeg)
}

export default function MotelTab() {
  const [dados,    setDados]    = useState<Panorama | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [falhou,   setFalhou]   = useState(false)
  const [aberta,   setAberta]   = useState<SuitePainel | null>(null)
  const [recarga,  setRecarga]  = useState(0)   // botão "Atualizar" refaz o efeito
  const [, setTick]             = useState(0)   // re-render para o "atualizado há Xs"

  // Carga inicial e auto-refresh no mesmo efeito: os dois querem exatamente a
  // mesma busca e o mesmo cancelamento na desmontagem. A tela de "carregando"
  // vem de `loading` nascer true — nenhum estado é tocado de forma síncrona
  // aqui, e o refresh troca o conteúdo no lugar em vez de piscar em branco.
  useEffect(() => {
    let cancelado = false

    async function carregar() {
      const p = await fetchPanorama()
      if (cancelado) return
      // Falha de rede mantém o último panorama na tela e marca "sem contato".
      // Piscar a tela em branco a cada instabilidade do ERP é pior que um dado
      // de 45s atrás com o aviso à vista.
      if (p) { setDados(p); setFalhou(false) } else { setFalhou(true) }
      setLoading(false)
    }

    void carregar()
    const t = setInterval(() => { void carregar() }, REFRESH_MS)
    return () => { cancelado = true; clearInterval(t) }
  }, [recarga])

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  if (loading) {
    return <div className="text-white/30 py-16 text-center text-sm">Carregando o motel...</div>
  }

  if (!dados) {
    return (
      <div className="bg-white/[0.03] border border-white/8 rounded-xl p-8 text-center">
        <p className="text-white/50 text-sm">Não foi possível falar com o PMS.</p>
        <button onClick={() => setRecarga((n) => n + 1)}
          className="mt-4 text-xs text-gold-400/90 hover:text-gold-300 px-4 py-2 border border-gold-700/40 rounded-xl">
          Tentar de novo
        </button>
      </div>
    )
  }

  if (!dados.configured) {
    return (
      <div className="bg-white/[0.03] border border-white/8 rounded-xl p-8 text-center">
        <p className="text-white/50 text-sm">Integração com o PMS desligada.</p>
        <p className="text-white/25 text-xs mt-2">{dados.hint}</p>
      </div>
    )
  }

  const k = dados.kpis
  const erroSuites = dados.erros?.suites
  const idade = segundosDesde(dados.geradoEm)

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-serif text-lg text-white font-light">
            O motel <span className="gold-gradient italic font-semibold">agora</span>
          </h2>
          <p className="text-white/25 text-[11px] mt-0.5">
            Direto da recepção — inclui balcão e telefone, que o resto do painel não vê.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-[11px] ${falhou ? 'text-amber-400/70' : 'text-white/30'}`}>
            {falhou ? 'sem contato com o PMS' : `atualizado há ${idade}s`}
          </span>
          <button onClick={() => setRecarga((n) => n + 1)}
            className="text-[11px] text-white/40 hover:text-white/70 transition-colors px-3 py-2 border border-white/8 hover:border-white/20 rounded-xl">
            Atualizar
          </button>
        </div>
      </div>

      {erroSuites && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
          <p className="text-red-300/80 text-xs">O PMS não devolveu o mapa das suítes.</p>
          <p className="text-white/25 text-[11px] mt-1 font-mono break-all">{erroSuites}</p>
        </div>
      )}

      {/* KPIs */}
      {k && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Kpi label="Ocupação" valor={`${k.ocupacaoPct}%`}
               nota={`${k.ocupada} de ${k.total}`} destaque />
          <Kpi label="Livres"      valor={String(k.livre)} />
          <Kpi label="Em preparo"  valor={String(k.preparo)} />
          <Kpi label="Bloqueadas"  valor={String(k.bloqueada)} />
          <Kpi label="Conta aberta" valor={brl(k.receitaAberta)}
               nota={k.consumoAberto > 0 ? `${brl(k.consumoAberto)} em consumo` : undefined} />
          <Kpi label="Em alerta" valor={String(k.emAlerta)}
               nota={k.emAlerta > 0 ? 'tempo excedido' : undefined}
               alerta={k.emAlerta > 0} />
        </div>
      )}

      {/* Disponibilidade por categoria */}
      {(dados.categorias?.length || dados.categoriasDegradado) && (
        <div className="bg-white/[0.03] border border-white/8 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white/70 text-sm font-medium">Livres por categoria</h3>
            {dados.categoriasDegradado && (
              <span className="text-[10px] text-amber-400/70 border border-amber-500/25 rounded-full px-2 py-0.5">
                degradado
              </span>
            )}
          </div>
          {dados.categoriasDegradado ? (
            <p className="text-white/30 text-xs">
              O PMS recusou a consulta — normalmente porque a recepção está mais de 15 min
              defasada. O mapa das suítes abaixo continua válido.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {dados.categorias?.map((c) => (
                <div key={c.categoriaId}
                  className="border border-white/8 rounded-xl px-4 py-2.5 bg-white/[0.02]">
                  <p className="text-white/40 text-[10px] uppercase tracking-wider">{c.categoria}</p>
                  <p className="text-white text-lg font-light mt-0.5">
                    {c.disponiveis}<span className="text-white/25 text-xs">/{c.total}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mapa das suítes */}
      <div className="bg-white/[0.03] border border-white/8 rounded-xl p-5">
        <h3 className="text-white/70 text-sm font-medium mb-1">Mapa das suítes</h3>
        <p className="text-white/25 text-[11px] mb-4">
          As cores são as mesmas que a recepção enxerga no sistema dela.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {dados.suites?.map((s) => (
            <SuiteCard key={s.pmsId} s={s} onClick={() => setAberta(s)} />
          ))}
        </div>
        {!dados.suites?.length && !erroSuites && (
          <p className="text-white/30 text-xs">Nenhuma suíte devolvida pelo PMS.</p>
        )}
      </div>

      {/* Chegando hoje */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Chegadas titulo="Reservas do site hoje"
          nota="Vieram pelo selectreservas.com.br"
          lista={dados.chegadas?.site ?? []} />
        <Chegadas titulo="Balcão e telefone hoje"
          nota="Invisíveis no resto do painel — só a recepção cadastrou"
          lista={dados.chegadas?.recepcao ?? []} destaque />
      </div>

      {/* Saúde da integração */}
      {!!dados.pendentes?.length && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5">
          <h3 className="text-amber-300/90 text-sm font-medium mb-1">
            {dados.pendentes.length} reserva(s) paga(s) que não chegaram na recepção
          </h3>
          <p className="text-white/30 text-[11px] mb-3">
            O cliente pagou no site, mas o PMS não confirmou. A recepção não sabe que elas existem.
          </p>
          <div className="space-y-2">
            {dados.pendentes.map((p) => (
              <div key={p.id} className="flex items-start justify-between gap-3 text-xs border-t border-white/5 pt-2">
                <div className="min-w-0">
                  <p className="text-white/70 truncate">{p.customer_name ?? 'sem nome'}</p>
                  <p className="text-white/30 text-[11px]">
                    {p.suite_nome ?? '—'} · entrada {hora(p.check_in)}
                  </p>
                  {p.pms_last_error && (
                    <p className="text-red-300/60 text-[10px] font-mono mt-0.5 break-all">
                      {p.pms_last_error}
                    </p>
                  )}
                </div>
                <span className="text-white/50 whitespace-nowrap">
                  {p.total_amount != null ? brl(Number(p.total_amount)) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {aberta && <DetalheSuite s={aberta} onClose={() => setAberta(null)} />}
    </div>
  )
}

function Kpi({ label, valor, nota, destaque, alerta }: {
  label: string; valor: string; nota?: string; destaque?: boolean; alerta?: boolean
}) {
  return (
    <div className={`border rounded-xl p-4 ${
      alerta   ? 'bg-amber-500/5 border-amber-500/25'
      : destaque ? 'bg-gold-500/5 border-gold-700/30'
      : 'bg-white/[0.03] border-white/8'
    }`}>
      <p className="text-white/35 text-[10px] uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-light mt-1 ${
        alerta ? 'text-amber-300' : destaque ? 'text-gold-400' : 'text-white'
      }`}>{valor}</p>
      {nota && <p className="text-white/25 text-[10px] mt-0.5">{nota}</p>}
    </div>
  )
}

function SuiteCard({ s, onClick }: { s: SuitePainel; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="text-left border border-white/8 hover:border-white/20 rounded-xl p-3.5 bg-white/[0.02] transition-colors relative overflow-hidden">
      {/* Faixa com a cor que o PMS atribui ao status */}
      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: s.corBackground }} />
      <div className="pl-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-white font-medium">{s.quarto}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: s.corBackground, color: s.corTexto }}>
            {s.status}
          </span>
        </div>
        <p className="text-white/35 text-[11px] mt-0.5 truncate">{s.nome}</p>

        {s.ocupada ? (
          <div className="mt-2 space-y-0.5">
            <p className={`text-[11px] ${s.alertaTempo ? 'text-amber-300/90' : 'text-white/50'}`}>
              {s.perm ? `resta ${s.perm}` : 'sem tempo'}
              {s.emCheckout && ' · checkout'}
            </p>
            <p className="text-white/30 text-[10px]">
              entrou {hora(s.entrada)}
              {s.modo ? ` · ${s.modo}` : ''}
            </p>
            {s.totalPrevisto > 0 && (
              <p className="text-gold-400/70 text-[11px]">{brl(s.totalPrevisto)}</p>
            )}
          </div>
        ) : (
          <p className="text-white/25 text-[10px] mt-2">
            {s.balde === 'preparo' && s.tempoDesdeInicioLimpeza
              ? `em preparo há ${s.tempoDesdeInicioLimpeza}`
              : s.tempoDesdeEncerramento
                ? `livre há ${s.tempoDesdeEncerramento}`
                : '—'}
          </p>
        )}
      </div>
    </button>
  )
}

function Chegadas({ titulo, nota, lista, destaque }: {
  titulo: string; nota: string; lista: ChegadaHoje[]; destaque?: boolean
}) {
  return (
    <div className={`border rounded-xl p-5 ${
      destaque ? 'bg-gold-500/[0.03] border-gold-700/20' : 'bg-white/[0.03] border-white/8'
    }`}>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <h3 className="text-white/70 text-sm font-medium">{titulo}</h3>
        <span className="text-white/40 text-sm">{lista.length}</span>
      </div>
      <p className="text-white/25 text-[11px] mb-3">{nota}</p>

      {lista.length === 0 ? (
        <p className="text-white/20 text-xs">Nada para hoje.</p>
      ) : (
        <div className="space-y-2">
          {lista.map((c) => (
            <div key={c.id} className="flex items-start justify-between gap-3 text-xs border-t border-white/5 pt-2">
              <div className="min-w-0">
                <p className="text-white/70 truncate">
                  {c.nome || 'sem nome'}
                  {c.chegou && <span className="text-emerald-400/60 ml-1.5">· chegou</span>}
                </p>
                <p className="text-white/30 text-[11px]">
                  {hora(c.dataInicio)} → {hora(c.saidaPrevista)}
                  {c.suiteRef ? ` · quarto ${c.suiteRef}` : ''}
                  {c.suiteClasse ? ` · ${c.suiteClasse}` : ''}
                </p>
              </div>
              <div className="text-right whitespace-nowrap">
                <p className="text-white/50">{brl(c.valorPago || c.totalAPagar)}</p>
                {c.formaPagamento && (
                  <p className="text-white/25 text-[10px]">{c.formaPagamento}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Detalhe de uma suíte. A conta aberta só é buscada ao abrir. */
function DetalheSuite({ s, onClose }: { s: SuitePainel; onClose: () => void }) {
  const [cobranca, setCobranca] = useState<unknown>(null)
  const [erro,     setErro]     = useState<string | null>(null)
  // Nasce carregando quando há o que buscar — a suíte livre não tem conta.
  const [carregando, setCarregando] = useState(s.ocupada)

  useEffect(() => {
    if (!s.ocupada) return
    let cancelado = false
    void fetchCobranca(s.ref).then((r) => {
      if (cancelado) return
      if (!r)            setErro('sem resposta do PMS')
      else if (r.erro)   setErro(r.erro)
      else               setCobranca(r.cobranca)
      setCarregando(false)
    })
    return () => { cancelado = true }
  }, [s.ref, s.ocupada])

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-white text-lg font-light">
              Quarto {s.quarto}
              <span className="text-white/30 text-sm ml-2">{s.nome}</span>
            </h3>
            <span className="text-[11px] px-2 py-0.5 rounded inline-block mt-1.5"
              style={{ background: s.corBackground, color: s.corTexto }}>
              {s.status}
            </span>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 text-sm">✕</button>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-xs mb-4">
          <Campo t="Classe"     v={s.classe} />
          <Campo t="Ref no PMS" v={`${s.ref} (id ${s.pmsId})`} />
          {s.ocupada && <>
            <Campo t="Entrada"        v={hora(s.entrada)} />
            <Campo t="Tempo restante" v={s.perm ?? '—'} />
            <Campo t="Modalidade"     v={s.modo ?? '—'} />
            <Campo t="Consumo"        v={brl(s.totalConsumo)} />
            <Campo t="Total previsto" v={brl(s.totalPrevisto)} />
            {s.emPernoite && <Campo t="Pernoite" v="sim" />}
          </>}
          {!s.ocupada && s.tempoDesdeEncerramento && (
            <Campo t="Livre há" v={s.tempoDesdeEncerramento} />
          )}
        </dl>

        {!s.siteId && (
          <p className="text-amber-300/70 text-[11px] mb-3">
            Esta suíte não está mapeada no cadastro do site (`pms_suite_id`).
          </p>
        )}

        {s.ocupada && (
          <div className="border-t border-white/8 pt-4">
            <h4 className="text-white/60 text-xs font-medium mb-2">Conta aberta</h4>
            {carregando && <p className="text-white/30 text-xs">Buscando no PMS...</p>}
            {erro && <p className="text-white/30 text-xs">Não disponível — {erro}</p>}
            {cobranca != null && (
              <pre className="text-[10px] text-white/50 bg-black/40 rounded-lg p-3 overflow-x-auto">
                {JSON.stringify(cobranca, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Campo({ t, v }: { t: string; v: string }) {
  return (
    <div>
      <dt className="text-white/30 text-[10px] uppercase tracking-wider">{t}</dt>
      <dd className="text-white/70 mt-0.5">{v}</dd>
    </div>
  )
}
