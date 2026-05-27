import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'

type Res = {
  id: string
  suite_id: string
  type: string
  total_amount: number
  status: string
  created_at: string
}

type Suite = { id: string; name: string }

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function inMonth(date: Date, ref: Date, offset: number) {
  const d = new Date(ref.getFullYear(), ref.getMonth() + offset)
  return date.getMonth() === d.getMonth() && date.getFullYear() === d.getFullYear()
}

export default function DashboardTab() {
  const [reservations, setReservations] = useState<Res[]>([])
  const [suites, setSuites] = useState<Suite[]>([])
  const [loading, setLoading] = useState(true)

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
