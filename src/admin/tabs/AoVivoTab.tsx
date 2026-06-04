import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

const STEP_NAMES = ['Pacote','Tipo','Data','Suíte','Refeição','Bebida','Surpresa','Dados','Pagamento']
const ACTIVE_WINDOW_MS = 2 * 60 * 1000           // < 2min = "ativo agora"
const HISTORY_PAGE_SIZE = 100

interface Session {
  id:              string
  session_token:   string
  started_at:      string
  last_active_at:  string
  current_step:    number
  max_step:        number
  steps_history:   Array<{ step: number; at: string }> | null
  user_agent:      string | null
  device:          string | null
  referrer:        string | null
  landing_path:    string | null
  utm_source:      string | null
  utm_medium:      string | null
  utm_campaign:    string | null
  utm_content:     string | null
  utm_term:        string | null
  ip_hash:         string | null
  converted:       boolean
  reservation_id:  string | null
}

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 5)    return 'agora'
  if (s < 60)   return `há ${s}s`
  const m = Math.floor(s / 60)
  if (m < 60)   return `há ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24)   return `há ${h}h`
  return new Date(iso).toLocaleDateString('pt-BR')
}

function fmtDt(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function fmtDuration(a: string, b: string): string {
  const ms = Math.max(0, new Date(b).getTime() - new Date(a).getTime())
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60), rs = s % 60
  return `${m}m${rs ? ` ${rs}s` : ''}`
}

export default function AoVivoTab() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState<'all' | 'active' | 'converted' | 'abandoned'>('all')
  const [selected, setSelected] = useState<Session | null>(null)
  const [, setNow]              = useState(Date.now())  // força refresh dos "há X seg"

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data } = await (supabase as unknown as {
        from: (t: string) => {
          select: (s: string) => {
            order: (k: string, o: { ascending: boolean }) => {
              limit: (n: number) => Promise<{ data: Session[] | null }>
            }
          }
        }
      })
        .from('onboarding_sessions')
        .select('*')
        .order('last_active_at', { ascending: false })
        .limit(HISTORY_PAGE_SIZE)
      if (!cancelled && data) setSessions(data)
      setLoading(false)
    }
    load()

    // Realtime: insert e update na tabela
    const channel = supabase
      .channel('onboarding-live')
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'onboarding_sessions' },
          () => { void load() })
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [])

  // Métricas
  const stats = useMemo(() => {
    const nowMs = Date.now()
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const todayMs = today.getTime()

    let active = 0, todayCount = 0, converted = 0
    const funnel = new Array(9).fill(0)
    sessions.forEach(s => {
      if (nowMs - new Date(s.last_active_at).getTime() < ACTIVE_WINDOW_MS) active++
      if (new Date(s.started_at).getTime() >= todayMs) todayCount++
      if (s.converted) converted++
      for (let i = 0; i < (s.max_step ?? 1); i++) funnel[i]++
    })
    return { active, todayCount, converted, funnel }
  }, [sessions])

  const filtered = useMemo(() => {
    const nowMs = Date.now()
    return sessions.filter(s => {
      if (filter === 'active')    return nowMs - new Date(s.last_active_at).getTime() < ACTIVE_WINDOW_MS
      if (filter === 'converted') return s.converted
      if (filter === 'abandoned') return !s.converted && (nowMs - new Date(s.last_active_at).getTime() > ACTIVE_WINDOW_MS)
      return true
    })
  }, [sessions, filter])

  const conversionRate = sessions.length > 0
    ? ((stats.converted / sessions.length) * 100).toFixed(1)
    : '0'

  async function handleWipe() {
    const msg = `Apagar TODAS as ${sessions.length} sessões de onboarding? Essa ação não pode ser desfeita.`
    if (!confirm(msg)) return
    await (supabase as unknown as {
      from: (t: string) => { delete: () => { neq: (k: string, v: string) => Promise<unknown> } }
    })
      .from('onboarding_sessions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')  // delete sem WHERE não passa no PostgREST
    setSessions([])
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-white/80 text-sm">Ao vivo · Onboarding</h2>
        <div className="flex items-center gap-2">
          <a
            href="/?notrack=1"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] tracking-wide uppercase text-white/40 hover:text-white/70 border border-white/10 hover:border-white/30 rounded-lg px-2.5 py-1.5"
            title="Abre o site em uma nova aba marcando este browser como dev (não trackeia)"
          >
            Não trackear este browser
          </a>
          {sessions.length > 0 && (
            <button
              onClick={handleWipe}
              className="text-[10px] tracking-wide uppercase text-red-400/70 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 rounded-lg px-2.5 py-1.5"
            >
              Apagar tudo
            </button>
          )}
        </div>
      </div>

      {/* ───── Métricas ───── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Ativos agora" value={stats.active}      hint="< 2 min sem inatividade" pulse />
        <StatCard label="Hoje"         value={stats.todayCount}  hint="iniciaram o onboarding" />
        <StatCard label="Convertidos"  value={stats.converted}   hint={`taxa ${conversionRate}%`} />
        <StatCard label="Total visto"  value={sessions.length}   hint={`últimas ${HISTORY_PAGE_SIZE}`} />
      </div>

      {/* ───── Funil ───── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <p className="text-white/40 text-[11px] tracking-widest uppercase mb-3">Funil por step</p>
        <div className="space-y-1.5">
          {stats.funnel.map((count, i) => {
            const pct = sessions.length ? Math.round((count / sessions.length) * 100) : 0
            return (
              <div key={i} className="flex items-center gap-3 text-xs">
                <span className="text-white/40 w-32 shrink-0">{i + 1}. {STEP_NAMES[i]}</span>
                <div className="flex-1 h-2 rounded-full bg-white/[0.05] overflow-hidden">
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${pct}%`,
                      background: 'linear-gradient(to right, #c8a035, #e8c060)',
                    }}
                  />
                </div>
                <span className="text-white/60 w-12 text-right tabular-nums">{count}</span>
                <span className="text-white/30 w-10 text-right tabular-nums text-[10px]">{pct}%</span>
              </div>
            )
          })}
        </div>
      </section>

      {/* ───── Filtros ───── */}
      <div className="flex gap-2 flex-wrap">
        {[
          { id: 'all',       label: 'Todas',       count: sessions.length },
          { id: 'active',    label: 'Ativas',      count: stats.active },
          { id: 'converted', label: 'Convertidas', count: stats.converted },
          { id: 'abandoned', label: 'Abandonadas', count: sessions.length - stats.converted - stats.active },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id as typeof filter)}
            className={[
              'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
              filter === t.id
                ? 'border-gold-500/50 text-gold-300 bg-gold-500/10'
                : 'border-white/10 text-white/50 hover:text-white/80',
            ].join(' ')}
          >
            {t.label} <span className="opacity-60">({t.count})</span>
          </button>
        ))}
      </div>

      {/* ───── Lista ───── */}
      {loading ? (
        <div className="text-white/30 py-12 text-center text-sm">Carregando…</div>
      ) : filtered.length === 0 ? (
        <div className="text-white/30 py-12 text-center text-sm">Nenhuma sessão.</div>
      ) : (
        <div className="rounded-2xl border border-white/10 overflow-hidden">
          <table className="w-full text-xs sm:text-sm">
            <thead className="bg-white/[0.03] text-white/40 text-[10px] uppercase tracking-widest">
              <tr>
                <th className="px-3 py-2.5 text-left">Sessão</th>
                <th className="px-3 py-2.5 text-left">Step</th>
                <th className="px-3 py-2.5 text-left hidden sm:table-cell">Origem</th>
                <th className="px-3 py-2.5 text-left">Atividade</th>
                <th className="px-3 py-2.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const isActive  = Date.now() - new Date(s.last_active_at).getTime() < ACTIVE_WINDOW_MS
                const shortId   = s.session_token.slice(0, 8)
                const utmLabel  = s.utm_source ?? s.referrer ?? '(direto)'
                return (
                  <tr
                    key={s.id}
                    onClick={() => setSelected(s)}
                    className="border-t border-white/5 hover:bg-white/[0.03] cursor-pointer"
                  >
                    <td className="px-3 py-2.5 font-mono text-white/70">
                      <div className="flex items-center gap-2">
                        {isActive && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
                        <span>#{shortId}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-white/70">
                      <span className="text-gold-400">{s.current_step}</span>
                      <span className="text-white/30"> · {STEP_NAMES[s.current_step - 1]}</span>
                    </td>
                    <td className="px-3 py-2.5 text-white/50 hidden sm:table-cell truncate max-w-[180px]">
                      {utmLabel}
                    </td>
                    <td className="px-3 py-2.5 text-white/60 tabular-nums">{timeAgo(s.last_active_at)}</td>
                    <td className="px-3 py-2.5 text-right">
                      {s.converted ? (
                        <span className="text-emerald-400/80 text-[10px] px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10">
                          Convertido
                        </span>
                      ) : isActive ? (
                        <span className="text-gold-400/80 text-[10px] px-2 py-0.5 rounded-full border border-gold-500/30 bg-gold-500/10">
                          Ativo
                        </span>
                      ) : (
                        <span className="text-white/30 text-[10px]">abandonado</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ───── Drill-down modal ───── */}
      {selected && <SessionDetailModal session={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function StatCard({ label, value, hint, pulse }: {
  label: string; value: number; hint?: string; pulse?: boolean
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-4">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <p className="text-white/40 text-[10px] tracking-widest uppercase">{label}</p>
        {pulse && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
      </div>
      <p className="text-3xl font-serif text-gold-300 tabular-nums">{value}</p>
      {hint && <p className="text-white/30 text-[10px] mt-1">{hint}</p>}
    </div>
  )
}

function SessionDetailModal({ session, onClose }: { session: Session; onClose: () => void }) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onEsc)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onEsc)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-xl max-h-[90vh] rounded-2xl border border-gold-800/40 bg-[#0a0806] shadow-2xl flex flex-col"
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-gold-900/40 shrink-0">
          <div>
            <p className="text-white/40 text-[10px] tracking-widest uppercase">Sessão</p>
            <p className="font-mono text-gold-300 text-sm">#{session.session_token.slice(0, 16)}</p>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 rounded-full text-gold-400/80 hover:bg-white/5">✕</button>
        </header>

        <div className="overflow-y-auto px-5 py-5 space-y-5 text-sm">
          <Row label="Início"        value={fmtDt(session.started_at)} />
          <Row label="Último ping"   value={`${fmtDt(session.last_active_at)} (${timeAgo(session.last_active_at)})`} />
          <Row label="Duração"       value={fmtDuration(session.started_at, session.last_active_at)} />
          <Row label="Step atual"    value={`${session.current_step} · ${STEP_NAMES[session.current_step - 1]}`} />
          <Row label="Máx atingido"  value={`${session.max_step} · ${STEP_NAMES[session.max_step - 1]}`} />
          <Row label="Dispositivo"   value={session.device ?? '—'} />
          <Row label="Origem"        value={session.utm_source ?? '(direto)'} />
          {session.utm_campaign && <Row label="Campanha" value={session.utm_campaign} />}
          {session.referrer     && <Row label="Referrer" value={session.referrer} small />}
          {session.landing_path && <Row label="Landing"  value={session.landing_path} small />}
          {session.user_agent   && <Row label="UA"       value={session.user_agent} small />}
          <Row label="IP (hash)"     value={(session.ip_hash ?? '').slice(0, 24)} small />
          <Row label="Convertido"
               value={session.converted ? `Sim — reserva ${session.reservation_id?.slice(0, 8) ?? ''}` : 'Não'} />

          <div>
            <p className="text-white/40 text-[10px] tracking-widest uppercase mb-2">Jornada</p>
            <ol className="space-y-1.5">
              {(session.steps_history ?? []).map((s, i) => (
                <li key={i} className="flex items-center gap-3 text-xs">
                  <span className="font-mono text-gold-500 w-6">{s.step}</span>
                  <span className="text-white/70 flex-1">{STEP_NAMES[s.step - 1]}</span>
                  <span className="text-white/40 tabular-nums">{fmtDt(s.at)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-white/40 text-[10px] tracking-widest uppercase shrink-0">{label}</span>
      <span className={[
        'text-right max-w-[65%] break-words',
        small ? 'text-[10px] text-white/50 font-mono' : 'text-white/80',
      ].join(' ')}>{value}</span>
    </div>
  )
}
