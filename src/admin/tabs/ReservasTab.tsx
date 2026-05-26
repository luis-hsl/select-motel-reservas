import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

type Reservation = {
  id: string
  package_id: string
  type: string
  suite_id: string
  check_in: string
  customer_name: string
  customer_phone: string
  customer_email: string
  total_amount: number
  status: string
  created_at: string
}

const STATUS_STYLE: Record<string, string> = {
  pending:   'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  confirmed: 'text-blue-400  bg-blue-400/10  border-blue-400/30',
  paid:      'text-green-400 bg-green-400/10 border-green-400/30',
  cancelled: 'text-red-400   bg-red-400/10   border-red-400/30',
}
const STATUS_LABEL: Record<string, string> = {
  pending:   'Pendente',
  confirmed: 'Confirmada',
  paid:      'Paga',
  cancelled: 'Cancelada',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function ReservasTab() {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('reservations')
      .select('*')
      .order('created_at', { ascending: false })
    setReservations(data ?? [])
    setLoading(false)
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('reservations').update({ status }).eq('id', id)
    setReservations(prev => prev.map(r => r.id === id ? { ...r, status } : r))
  }

  if (loading) return <div className="text-white/30 py-16 text-center text-sm">Carregando...</div>

  if (reservations.length === 0) return (
    <div className="text-center py-20">
      <p className="text-white/30 text-lg mb-1">Nenhuma reserva ainda</p>
      <p className="text-white/20 text-sm">Aparecerão aqui quando os clientes reservarem.</p>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-white/80 text-sm">
          {reservations.length} reserva{reservations.length !== 1 ? 's' : ''}
        </h2>
        <button onClick={load} className="text-xs text-white/30 hover:text-white/60 transition-colors">
          ↺ Atualizar
        </button>
      </div>

      <div className="space-y-3">
        {reservations.map(r => (
          <div key={r.id} className="bg-white/[0.03] border border-white/8 rounded-xl p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-white font-medium">{r.customer_name}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border ${STATUS_STYLE[r.status] ?? STATUS_STYLE.pending}`}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>
                <div className="text-white/40 text-xs space-y-0.5">
                  <p>{r.customer_phone} · {r.customer_email}</p>
                  <p>
                    Suíte {r.suite_id.replace('suite-', '')} ·{' '}
                    Pacote {r.package_id.charAt(0).toUpperCase() + r.package_id.slice(1)} ·{' '}
                    {r.type === 'period' ? 'Período' : 'Pernoite'}
                  </p>
                  <p>Check-in: {fmtDate(r.check_in)} · {fmtBRL(r.total_amount)}</p>
                </div>
              </div>
              <select
                value={r.status}
                onChange={e => updateStatus(r.id, e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-gold-500/50 cursor-pointer"
              >
                <option value="pending">Pendente</option>
                <option value="confirmed">Confirmada</option>
                <option value="paid">Paga</option>
                <option value="cancelled">Cancelada</option>
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
