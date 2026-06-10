import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { downloadCsv } from '../utils/exportCsv'

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
  pending: 'Pendente', confirmed: 'Confirmada', paid: 'Paga', cancelled: 'Cancelada',
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

const TEST_NAMES = ['luis lima', 'igor beccari', 'luis henrique santos lima', 'luis henrique']

function isTestRecord(name: string) {
  const n = name.toLowerCase()
  return TEST_NAMES.some(t => n.includes(t))
}

export default function ReservasTab() {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [deleting, setDeleting] = useState(false)

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

  function exportCsv() {
    const rows = reservations.map(r => ({
      ID: r.id,
      Cliente: r.customer_name,
      Telefone: r.customer_phone,
      Email: r.customer_email,
      Pacote: r.package_id,
      Tipo: r.type === 'period' ? 'Período' : 'Pernoite',
      Suite: r.suite_id.replace('suite-', ''),
      'Check-in': fmtDate(r.check_in),
      Valor: fmtBRL(r.total_amount),
      Status: STATUS_LABEL[r.status] ?? r.status,
      'Criado em': fmtDate(r.created_at),
    }))
    const now = new Date().toISOString().slice(0, 10)
    downloadCsv(rows, `reservas-${now}.csv`)
  }

  async function deleteTestRecords() {
    const toDelete = reservations.filter(
      r => isTestRecord(r.customer_name) && ['pending', 'confirmed'].includes(r.status)
    )
    if (toDelete.length === 0) {
      alert('Nenhuma reserva de teste encontrada.')
      return
    }
    if (!confirm(`Apagar ${toDelete.length} reserva(s) de teste?\n\n${toDelete.map(r => r.customer_name).join('\n')}`)) return
    setDeleting(true)
    const ids = toDelete.map(r => r.id)
    const { error } = await supabase.from('reservations').delete().in('id', ids)
    if (error) {
      alert('Erro ao deletar: ' + error.message)
    } else {
      setReservations(prev => prev.filter(r => !ids.includes(r.id)))
    }
    setDeleting(false)
  }

  const filtered = useMemo(() => {
    return reservations.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          r.customer_name.toLowerCase().includes(q) ||
          r.customer_phone.includes(q) ||
          r.customer_email.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [reservations, search, statusFilter])

  const paidTotal = filtered
    .filter(r => r.status === 'paid')
    .reduce((s, r) => s + r.total_amount, 0)

  const pendingTotal = filtered
    .filter(r => r.status === 'pending' || r.status === 'confirmed')
    .reduce((s, r) => s + r.total_amount, 0)

  if (loading) return <div className="text-white/30 py-16 text-center text-sm">Carregando...</div>

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          placeholder="Buscar por nome, telefone ou e-mail..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-gold-500/40 transition-colors"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-gold-500/40 cursor-pointer"
        >
          <option value="all">Todos os status</option>
          <option value="pending">Pendente</option>
          <option value="confirmed">Confirmada</option>
          <option value="paid">Paga</option>
          <option value="cancelled">Cancelada</option>
        </select>
        <button
          onClick={load}
          className="text-xs text-white/30 hover:text-white/60 transition-colors px-4 py-2.5 border border-white/8 rounded-xl whitespace-nowrap"
        >
          ↺ Atualizar
        </button>
        <button
          onClick={exportCsv}
          className="text-xs text-gold-400/70 hover:text-gold-300 transition-colors px-4 py-2.5 border border-gold-800/30 hover:border-gold-600/40 rounded-xl whitespace-nowrap"
        >
          ↓ Exportar CSV
        </button>
        <button
          onClick={deleteTestRecords}
          disabled={deleting}
          className="text-xs text-red-400/60 hover:text-red-400 transition-colors px-4 py-2.5 border border-red-900/30 hover:border-red-700/40 rounded-xl whitespace-nowrap disabled:opacity-40"
        >
          {deleting ? 'Apagando...' : '✕ Apagar testes'}
        </button>
      </div>

      {/* Summary */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 mb-5 text-xs">
        <span className="text-white/35">
          {filtered.length} reserva{filtered.length !== 1 ? 's' : ''}
        </span>
        <span className="text-white/35">
          Recebido: <span className="text-green-400/80">{fmtBRL(paidTotal)}</span>
        </span>
        {pendingTotal > 0 && (
          <span className="text-white/35">
            Em aberto: <span className="text-yellow-400/70">{fmtBRL(pendingTotal)}</span>
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-white/30 text-lg mb-1">
            {search || statusFilter !== 'all' ? 'Nenhuma reserva encontrada' : 'Nenhuma reserva ainda'}
          </p>
          <p className="text-white/20 text-sm">
            {search || statusFilter !== 'all'
              ? 'Tente ajustar os filtros.'
              : 'Aparecerão aqui quando os clientes reservarem.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => (
            <div key={r.id} className="bg-white/[0.03] border border-white/8 rounded-xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-white font-medium">{r.customer_name}</span>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full border ${
                        STATUS_STYLE[r.status] ?? STATUS_STYLE.pending
                      }`}
                    >
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
                    <p>
                      Check-in: {fmtDate(r.check_in)} ·{' '}
                      <span className="text-white/60 font-medium">{fmtBRL(r.total_amount)}</span>
                    </p>
                  </div>
                </div>
                <select
                  value={r.status}
                  onChange={e => updateStatus(r.id, e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-gold-500/50 cursor-pointer shrink-0"
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
      )}
    </div>
  )
}
