import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { downloadCsv, downloadCsvSections, type CsvSection } from '../utils/exportCsv'

type Res = {
  id: string
  suite_id: string
  type: string
  total_amount: number
  status: string
  created_at: string
}

type Suite = { id: string; name: string }

// Subconjunto de onboarding_sessions usado pelo panorama (funil + atribuição).
type SessionRow = {
  started_at: string
  max_step: number | null
  mode: 'package' | 'experience' | null
  converted: boolean
  reservation_id: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  referrer: string | null
  device: string | null
}

// Funil — Pacote tem 7 steps, Experiência 6 (sem StepPacote). Igual à aba Ao Vivo.
const STEP_NAMES_PKG = ['Escolha', 'Pacote', 'Tipo', 'Data', 'Suíte', 'Extras', 'Pagamento']
const STEP_NAMES_EXP = ['Escolha', 'Tipo', 'Data', 'Suíte', 'Extras', 'Pagamento']
const MAX_STEPS_PKG  = STEP_NAMES_PKG.length

const RES_STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente', confirmed: 'Confirmada', paid: 'Paga', cancelled: 'Cancelada',
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function pct(n: number) {
  return `${n.toFixed(1)}%`
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function inMonth(date: Date, ref: Date, offset: number) {
  const d = new Date(ref.getFullYear(), ref.getMonth() + offset)
  return date.getMonth() === d.getMonth() && date.getFullYear() === d.getFullYear()
}

// Modo da sessão (com heurística pra sessões antigas sem mode: max_step ≥ 7 só é pacote).
function sessionMode(s: SessionRow): 'package' | 'experience' | 'unknown' {
  if (s.mode === 'package' || s.mode === 'experience') return s.mode
  if ((s.max_step ?? 0) >= MAX_STEPS_PKG) return 'package'
  return 'unknown'
}

// "Quem veio de onde": normaliza utm_source + referrer num canal legível.
function classifySource(s: { utm_source: string | null; referrer: string | null }): string {
  const src = (s.utm_source ?? '').toLowerCase().trim()
  const ref = (s.referrer ?? '').toLowerCase()
  const hay = `${src} ${ref}`
  if (/instagram|igshid|\big\b/.test(hay)) return 'Instagram'
  if (/facebook|fbclid|\bfb\b|\bmeta\b/.test(hay)) return 'Facebook'
  if (/google|gclid|adwords/.test(hay)) return 'Google'
  if (/tiktok|ttclid/.test(hay)) return 'TikTok'
  if (/youtube|youtu\.be/.test(hay)) return 'YouTube'
  if (/whatsapp|wa\.me|whats/.test(hay)) return 'WhatsApp'
  if (/bing/.test(hay)) return 'Bing'
  if (src) return capitalize(src)
  if (ref) {
    try { return new URL(s.referrer!).hostname.replace('www.', '') } catch { return ref }
  }
  return '(direto / sem origem)'
}

// onboarding_sessions pode passar de 1000 linhas — PostgREST limita por request, então paginamos.
async function fetchAllSessions(): Promise<SessionRow[]> {
  const all: SessionRow[] = []
  const CHUNK = 1000
  let from = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supa = supabase as any
  const cols = 'started_at,max_step,mode,converted,reservation_id,utm_source,utm_medium,utm_campaign,utm_content,referrer,device'
  while (true) {
    const { data, error } = await supa
      .from('onboarding_sessions')
      .select(cols)
      .order('started_at', { ascending: false })
      .range(from, from + CHUNK - 1)
    if (error || !data || data.length === 0) break
    all.push(...(data as SessionRow[]))
    if (data.length < CHUNK) break
    from += CHUNK
  }
  return all
}

export default function DashboardTab() {
  const [reservations, setReservations] = useState<Res[]>([])
  const [suites, setSuites] = useState<Suite[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('reservations').select('id,suite_id,type,total_amount,status,created_at'),
      supabase.from('suites').select('id,name'),
    ]).then(([r, s]) => {
      setReservations(r.data ?? [])
      setSuites(s.data ?? [])
      setLoading(false)
    })
  }, [])

  // Panorama completo: 1 CSV com várias seções analíticas (funil, atribuição,
  // campanhas, dispositivos, reservas, linha do tempo). É o "raio-x" do negócio.
  async function exportPanorama() {
    setExporting(true)
    try {
      const now = new Date()
      const stamp = now.toISOString().slice(0, 10)
      const nowMs = now.getTime()
      const DAY = 86_400_000
      const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [sessions, resRows, leadsRows] = await Promise.all([
        fetchAllSessions(),
        supabase
          .from('reservations')
          .select('id,total_amount,status,type,suite_id,created_at')
          .order('created_at', { ascending: false })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .then(r => (r.data as any[]) ?? []),
        supabase.rpc('get_leads').then(r => (r.data as Record<string, unknown>[]) ?? []),
      ])

      const resById = new Map(resRows.map(r => [r.id, r]))
      const paid      = resRows.filter(r => r.status === 'paid')
      const confirmed = resRows.filter(r => r.status === 'confirmed')
      const revenue   = paid.reduce((s, r) => s + (r.total_amount || 0), 0)

      const startedWithin = (days: number) =>
        sessions.filter(s => nowMs - new Date(s.started_at).getTime() <= days * DAY).length
      const startedToday = sessions.filter(s => new Date(s.started_at).getTime() >= todayStart.getTime()).length
      const convSessions = sessions.filter(s => s.converted)
      const convRate = sessions.length ? (convSessions.length / sessions.length) * 100 : 0

      // ───── 1. Visão geral ─────
      const visaoGeral: CsvSection = {
        title: 'VISÃO GERAL',
        notes: [`Relatório gerado em ${now.toLocaleString('pt-BR')}`],
        rows: [
          { Métrica: 'Sessões rastreadas (total)', Valor: sessions.length },
          { Métrica: 'Sessões hoje', Valor: startedToday },
          { Métrica: 'Sessões — últimos 7 dias', Valor: startedWithin(7) },
          { Métrica: 'Sessões — últimos 30 dias', Valor: startedWithin(30) },
          { Métrica: 'Sessões convertidas', Valor: convSessions.length },
          { Métrica: 'Taxa de conversão geral', Valor: pct(convRate) },
          { Métrica: 'Reservas concluídas (pagas)', Valor: paid.length },
          { Métrica: 'Reservas confirmadas (aguardando pgto)', Valor: confirmed.length },
          { Métrica: 'Reservas (todas)', Valor: resRows.length },
          { Métrica: 'Faturamento (reservas pagas)', Valor: fmtBRL(revenue) },
          { Métrica: 'Ticket médio', Valor: fmtBRL(paid.length ? revenue / paid.length : 0) },
          { Métrica: 'Leads capturados', Valor: leadsRows.length },
        ],
      }

      // ───── 2 e 3. Funis por modo ─────
      function funnelSection(title: string, steps: string[], mode: 'package' | 'experience'): CsvSection {
        const subset = sessions.filter(s => sessionMode(s) === mode)
        const total = subset.length
        const conv = subset.filter(s => s.converted).length
        const counts = new Array(steps.length).fill(0)
        subset.forEach(s => {
          const cap = Math.min(Math.max(1, s.max_step ?? 1), steps.length)
          for (let i = 0; i < cap; i++) counts[i]++
        })
        return {
          title,
          notes: [`${total} sessões · ${conv} convertidas · taxa ${total ? pct((conv / total) * 100) : '0%'}`],
          rows: steps.map((name, i) => {
            const count = counts[i]
            const prev = i === 0 ? count : counts[i - 1]
            return {
              Step: `${i + 1}. ${name}`,
              Sessões: count,
              '% do topo': total ? pct((count / total) * 100) : '0%',
              'Queda vs etapa anterior': i === 0 ? '—' : pct(prev ? (1 - count / prev) * 100 : 0),
            }
          }),
        }
      }
      const funilPkg = funnelSection('FUNIL — PACOTE', STEP_NAMES_PKG, 'package')
      const funilExp = funnelSection('FUNIL — EXPERIÊNCIA', STEP_NAMES_EXP, 'experience')

      // ───── 4. Origem do tráfego (quem veio de onde) ─────
      const bySource = new Map<string, { sessions: number; converted: number; revenue: number }>()
      sessions.forEach(s => {
        const key = classifySource(s)
        const e = bySource.get(key) ?? { sessions: 0, converted: 0, revenue: 0 }
        e.sessions++
        if (s.converted) {
          e.converted++
          const r = s.reservation_id ? resById.get(s.reservation_id) : null
          if (r && r.status === 'paid') e.revenue += r.total_amount || 0
        }
        bySource.set(key, e)
      })
      const origem: CsvSection = {
        title: 'ORIGEM DO TRÁFEGO (quem veio de onde)',
        rows: [...bySource.entries()]
          .sort((a, b) => b[1].sessions - a[1].sessions)
          .map(([src, e]) => ({
            Origem: src,
            Sessões: e.sessions,
            '% das sessões': sessions.length ? pct((e.sessions / sessions.length) * 100) : '0%',
            Convertidas: e.converted,
            'Taxa de conversão': e.sessions ? pct((e.converted / e.sessions) * 100) : '0%',
            'Faturamento atribuído': fmtBRL(e.revenue),
          })),
      }

      // ───── 5. Campanhas detalhadas (UTM completo) ─────
      const byCampaign = new Map<string, { source: string; medium: string; campaign: string; content: string; sessions: number; converted: number }>()
      sessions
        .filter(s => s.utm_source || s.utm_medium || s.utm_campaign || s.utm_content)
        .forEach(s => {
          const source = s.utm_source ?? '—', medium = s.utm_medium ?? '—'
          const campaign = s.utm_campaign ?? '—', content = s.utm_content ?? '—'
          const key = `${source}|${medium}|${campaign}|${content}`
          const e = byCampaign.get(key) ?? { source, medium, campaign, content, sessions: 0, converted: 0 }
          e.sessions++
          if (s.converted) e.converted++
          byCampaign.set(key, e)
        })
      const campanhas: CsvSection = {
        title: 'CAMPANHAS (parâmetros UTM)',
        notes: byCampaign.size === 0 ? ['Nenhuma sessão com UTM rastreada ainda.'] : undefined,
        rows: [...byCampaign.values()]
          .sort((a, b) => b.sessions - a.sessions)
          .map(e => ({
            Origem: e.source, Mídia: e.medium, Campanha: e.campaign, Conteúdo: e.content,
            Sessões: e.sessions, Convertidas: e.converted,
            'Taxa de conversão': e.sessions ? pct((e.converted / e.sessions) * 100) : '0%',
          })),
      }

      // ───── 6. Dispositivos ─────
      const byDevice = new Map<string, { sessions: number; converted: number }>()
      sessions.forEach(s => {
        const key = s.device || 'desconhecido'
        const e = byDevice.get(key) ?? { sessions: 0, converted: 0 }
        e.sessions++
        if (s.converted) e.converted++
        byDevice.set(key, e)
      })
      const dispositivos: CsvSection = {
        title: 'DISPOSITIVOS',
        rows: [...byDevice.entries()]
          .sort((a, b) => b[1].sessions - a[1].sessions)
          .map(([device, e]) => ({
            Dispositivo: device,
            Sessões: e.sessions,
            Convertidas: e.converted,
            'Taxa de conversão': e.sessions ? pct((e.converted / e.sessions) * 100) : '0%',
          })),
      }

      // ───── 7. Reservas por status ─────
      const reservasStatus: CsvSection = {
        title: 'RESERVAS POR STATUS',
        rows: ['paid', 'confirmed', 'pending', 'cancelled'].map(st => {
          const rs = resRows.filter(r => r.status === st)
          return {
            Status: RES_STATUS_LABEL[st] ?? st,
            Quantidade: rs.length,
            Faturamento: fmtBRL(rs.reduce((s, r) => s + (r.total_amount || 0), 0)),
          }
        }),
      }

      // ───── 8. Linha do tempo (últimos 30 dias) ─────
      const timelineRows: Record<string, unknown>[] = []
      for (let i = 29; i >= 0; i--) {
        const d0 = new Date(todayStart); d0.setDate(d0.getDate() - i)
        const d1 = new Date(d0); d1.setDate(d1.getDate() + 1)
        const inDay = (iso: string) => {
          const t = new Date(iso).getTime()
          return t >= d0.getTime() && t < d1.getTime()
        }
        const sess = sessions.filter(s => inDay(s.started_at))
        const dayPaid = paid.filter(r => inDay(r.created_at))
        timelineRows.push({
          Data: d0.toLocaleDateString('pt-BR'),
          Sessões: sess.length,
          Convertidas: sess.filter(s => s.converted).length,
          'Reservas pagas': dayPaid.length,
          Faturamento: fmtBRL(dayPaid.reduce((s, r) => s + (r.total_amount || 0), 0)),
        })
      }
      const linhaTempo: CsvSection = { title: 'LINHA DO TEMPO — ÚLTIMOS 30 DIAS', rows: timelineRows }

      downloadCsvSections(
        [visaoGeral, funilPkg, funilExp, origem, campanhas, dispositivos, reservasStatus, linhaTempo],
        `panorama-select-motel-${stamp}.csv`,
      )
    } finally {
      setExporting(false)
    }
  }

  // Exports de detalhe (linha-a-linha) — úteis pra cruzar dados num outro sistema.
  async function exportReservasDetail() {
    const { data } = await supabase
      .from('reservations')
      .select('*')
      .order('created_at', { ascending: false })
    if (!data?.length) { alert('Nenhuma reserva pra exportar.'); return }
    const now = new Date().toISOString().slice(0, 10)
    downloadCsv(data.map(r => ({
      ID: r.id,
      Cliente: r.customer_name,
      Telefone: r.customer_phone,
      Email: r.customer_email,
      Pacote: r.package_id,
      Tipo: r.type === 'period' ? 'Período' : 'Pernoite',
      Suite: r.suite_id?.replace('suite-', '') ?? '',
      'Check-in': r.check_in ? new Date(r.check_in).toLocaleString('pt-BR') : '',
      Valor: r.total_amount?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? '',
      Status: RES_STATUS_LABEL[r.status] ?? r.status,
      'Criado em': new Date(r.created_at).toLocaleString('pt-BR'),
    })), `reservas-${now}.csv`)
  }

  async function exportLeadsDetail() {
    const { data } = await supabase.rpc('get_leads')
    const leads = (data as Record<string, unknown>[]) ?? []
    if (!leads.length) { alert('Nenhum lead pra exportar.'); return }
    const now = new Date().toISOString().slice(0, 10)
    downloadCsv(leads.map(l => ({
      ID: l.id,
      Nome: l.name,
      Telefone: l.phone,
      Email: l.email,
      CPF: l.tax_id ?? '',
      Modo: l.mode ?? '',
      Pacote: l.package_id ?? '',
      Tipo: l.type === 'period' ? 'Período' : l.type === 'overnight' ? 'Pernoite' : '',
      Suite: String(l.suite_id ?? '').replace('suite-', ''),
      'Check-in': l.check_in ? new Date(l.check_in as string).toLocaleString('pt-BR') : '',
      Bebida: l.drink ?? '',
      Comida: l.food ?? '',
      Valor: l.total_amount ? Number(l.total_amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '',
      Status: l.status,
      'Aceite WhatsApp': l.whatsapp_consent ? 'Sim' : 'Não',
      Origem: l.utm_source ?? '',
      Mídia: l.utm_medium ?? '',
      Campanha: l.utm_campaign ?? '',
      Referrer: l.referrer ?? '',
      Dispositivo: l.device ?? '',
      'Criado em': new Date(l.created_at as string).toLocaleString('pt-BR'),
    })), `leads-${now}.csv`)
  }

  const suiteMap = useMemo(
    () => Object.fromEntries(suites.map(s => [s.id, s.name])),
    [suites],
  )

  if (loading) return <div className="text-white/30 py-16 text-center text-sm">Carregando...</div>

  const now = new Date()
  const paid = reservations.filter(r => r.status === 'paid')
  const totalRevenue = paid.reduce((s, r) => s + r.total_amount, 0)
  const avgTicket = paid.length > 0 ? totalRevenue / paid.length : 0

  const thisMonthPaid = paid.filter(r => inMonth(new Date(r.created_at), now, 0))
  const lastMonthPaid = paid.filter(r => inMonth(new Date(r.created_at), now, -1))
  const thisMonthRev = thisMonthPaid.reduce((s, r) => s + r.total_amount, 0)
  const lastMonthRev = lastMonthPaid.reduce((s, r) => s + r.total_amount, 0)
  const growth = lastMonthRev > 0 ? ((thisMonthRev - lastMonthRev) / lastMonthRev) * 100 : null

  const months = Array.from({ length: 6 }, (_, i) => {
    const offset = -(5 - i)
    const d = new Date(now.getFullYear(), now.getMonth() + offset)
    const label = d.toLocaleDateString('pt-BR', { month: 'short' })
    const rev = paid
      .filter(r => inMonth(new Date(r.created_at), now, offset))
      .reduce((s, r) => s + r.total_amount, 0)
    const cnt = reservations.filter(r => inMonth(new Date(r.created_at), now, offset)).length
    return { label, rev, cnt, isCurrent: i === 5 }
  })
  const maxRev = Math.max(...months.map(m => m.rev), 1)

  const suiteCounts = reservations.reduce((acc, r) => {
    acc[r.suite_id] = (acc[r.suite_id] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  const topSuites = Object.entries(suiteCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)

  const statusCounts = reservations.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const periodCount = reservations.filter(r => r.type === 'period').length
  const overnightCount = reservations.filter(r => r.type === 'overnight').length
  const total = reservations.length || 1

  return (
    <div className="space-y-5">
      {/* Exports */}
      <div className="flex flex-wrap justify-end items-center gap-2">
        <button
          onClick={exportReservasDetail}
          className="text-[11px] text-white/40 hover:text-white/70 transition-colors px-3 py-2 border border-white/8 hover:border-white/20 rounded-xl"
        >
          Reservas (detalhe)
        </button>
        <button
          onClick={exportLeadsDetail}
          className="text-[11px] text-white/40 hover:text-white/70 transition-colors px-3 py-2 border border-white/8 hover:border-white/20 rounded-xl"
        >
          Leads (detalhe)
        </button>
        <button
          onClick={exportPanorama}
          disabled={exporting}
          className="flex items-center gap-2 text-xs text-gold-400/90 hover:text-gold-300 transition-colors px-4 py-2.5 border border-gold-700/40 hover:border-gold-600/60 bg-gold-500/5 rounded-xl disabled:opacity-40"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.6">
            <path d="M8 2v8M4 7l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1" strokeLinecap="round" />
          </svg>
          {exporting ? 'Gerando panorama...' : 'Exportar panorama completo'}
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Total de Reservas"
          value={String(reservations.length)}
          note={`${paid.length} pagas`}
        />
        <KpiCard
          label="Faturamento Total"
          value={fmtBRL(totalRevenue)}
          note="reservas pagas"
          gold
        />
        <KpiCard
          label="Ticket Médio"
          value={fmtBRL(avgTicket)}
          note="por reserva paga"
        />
        <KpiCard
          label="Faturamento do Mês"
          value={fmtBRL(thisMonthRev)}
          note={
            growth !== null
              ? `${growth >= 0 ? '+' : ''}${growth.toFixed(1)}% vs mês anterior`
              : 'sem dados do mês anterior'
          }
          trend={growth}
        />
      </div>

      {/* Bar chart */}
      <div className="bg-white/[0.03] border border-white/8 rounded-xl p-5">
        <h3 className="text-white/50 text-[11px] uppercase tracking-widest mb-5">
          Faturamento — últimos 6 meses
        </h3>
        <div className="flex items-end gap-2 h-32">
          {months.map((m, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full">
              <div className="flex-1 w-full flex flex-col justify-end">
                {m.rev > 0 && (
                  <p className="text-[9px] text-center text-white/30 mb-1 leading-none">
                    {fmtBRL(m.rev).replace('R$ ', 'R$').replace(',00', '')}
                  </p>
                )}
                <div
                  className="w-full rounded-t transition-all"
                  style={{
                    height: `${Math.max((m.rev / maxRev) * 100, m.rev > 0 ? 4 : 0)}%`,
                    background: m.isCurrent
                      ? 'linear-gradient(to top, #c8a035, #e8c060)'
                      : 'rgba(255,255,255,0.07)',
                  }}
                />
              </div>
              <span className="text-white/30 text-[10px] capitalize">{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top suites */}
        <div className="bg-white/[0.03] border border-white/8 rounded-xl p-5">
          <h3 className="text-white/50 text-[11px] uppercase tracking-widest mb-4">
            Suítes mais reservadas
          </h3>
          {topSuites.length === 0 ? (
            <p className="text-white/20 text-sm py-4 text-center">Nenhuma reserva ainda</p>
          ) : (
            <div className="space-y-3.5">
              {topSuites.map(([id, count], i) => (
                <div key={id} className="flex items-center gap-3">
                  <span className="text-white/20 text-xs w-3.5 text-right shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-white/70 text-sm truncate">{suiteMap[id] ?? id}</span>
                      <span className="text-white/35 text-xs ml-2 shrink-0">{count}x</span>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(count / topSuites[0][1]) * 100}%`,
                          background: 'linear-gradient(to right, #c8a035, #e8c060)',
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* Status */}
          <div className="bg-white/[0.03] border border-white/8 rounded-xl p-5">
            <h3 className="text-white/50 text-[11px] uppercase tracking-widest mb-4">Por status</h3>
            <div className="space-y-2.5">
              {[
                { key: 'pending', label: 'Pendente', dot: 'bg-yellow-400' },
                { key: 'confirmed', label: 'Confirmada', dot: 'bg-blue-400' },
                { key: 'paid', label: 'Paga', dot: 'bg-green-400' },
                { key: 'cancelled', label: 'Cancelada', dot: 'bg-red-400' },
              ].map(({ key, label, dot }) => (
                <div key={key} className="flex items-center gap-2.5">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                  <span className="text-white/50 text-sm flex-1">{label}</span>
                  <span className="text-white/60 text-sm font-medium tabular-nums">
                    {statusCounts[key] ?? 0}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Type split */}
          <div className="bg-white/[0.03] border border-white/8 rounded-xl p-5">
            <h3 className="text-white/50 text-[11px] uppercase tracking-widest mb-4">Tipo de reserva</h3>
            <div className="space-y-3">
              {[
                { label: 'Período', count: periodCount },
                { label: 'Pernoite', count: overnightCount },
              ].map(({ label, count }) => (
                <div key={label}>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-white/50 text-xs">{label}</span>
                    <span className="text-white/35 text-xs">
                      {count} · {Math.round((count / total) * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-white/20"
                      style={{ width: `${(count / total) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function KpiCard({
  label, value, note, gold, trend,
}: {
  label: string
  value: string
  note: string
  gold?: boolean
  trend?: number | null
}) {
  const noteColor =
    trend == null
      ? 'text-white/30'
      : trend > 0
      ? 'text-green-400'
      : trend < 0
      ? 'text-red-400'
      : 'text-white/30'

  return (
    <div className="bg-white/[0.03] border border-white/8 rounded-xl p-4">
      <p className="text-white/40 text-[10px] uppercase tracking-widest mb-2">{label}</p>
      <p className={`text-lg font-semibold mb-1 leading-none ${gold ? 'gold-gradient' : 'text-white'}`}>
        {value}
      </p>
      <p className={`text-[11px] ${trend !== undefined ? noteColor : 'text-white/30'}`}>{note}</p>
    </div>
  )
}
