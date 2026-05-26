import { useState } from 'react'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function calcCheckOut(checkIn: Date, type: 'period' | 'overnight'): Date {
  const out = new Date(checkIn)
  out.setHours(out.getHours() + (type === 'period' ? 2 : 15))
  return out
}

export default function StepPagamento() {
  const { package: pkg, type, suite, checkIn, customerName, customerPhone, customerEmail, totalAmount, prevStep } = useStore()
  const total = totalAmount()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reservationId, setReservationId] = useState<string | null>(null)

  async function handlePay() {
    if (!pkg || !type || !suite || !checkIn) return
    setLoading(true)
    setError(null)

    const checkOut = calcCheckOut(checkIn, type)

    const { data, error: sbError } = await supabase
      .from('reservations')
      .insert({
        package_id: pkg.id,
        type,
        suite_id: suite.id,
        check_in: checkIn.toISOString(),
        check_out: checkOut.toISOString(),
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        total_amount: total,
        status: 'pending',
      })
      .select('id')
      .single()

    setLoading(false)

    if (sbError) {
      const msg = sbError.message.includes('não está disponível')
        ? 'Esta suíte já está reservada neste horário. Por favor, volte e escolha outro horário ou suíte.'
        : 'Ocorreu um erro ao registrar sua reserva. Tente novamente.'
      setError(msg)
      return
    }

    setReservationId(data.id)
  }

  if (reservationId) {
    return (
      <div className="max-w-md">
        <div className="border border-gold-700/40 rounded-xl p-8 text-center space-y-4">
          <div className="text-4xl">✓</div>
          <h2 className="font-serif text-3xl font-light gold-gradient">Reserva registrada!</h2>
          <p className="text-gold-700/70 text-sm">
            Recebemos sua reserva. Em breve entraremos em contato pelo WhatsApp <strong className="text-gold-400">{customerPhone}</strong> para confirmar o pagamento.
          </p>
          <p className="text-[11px] text-gold-800/50 pt-2">
            Código da reserva:<br />
            <span className="font-mono text-gold-600/70 text-xs break-all">{reservationId}</span>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <button onClick={prevStep} className="flex items-center gap-1 text-gold-700/60 text-sm mb-8 hover:text-gold-500 transition-colors">
        <span>←</span> Voltar
      </button>

      <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-light mb-2 leading-tight">
        Confirme sua<br />
        <span className="gold-gradient font-semibold italic">reserva</span>
      </h1>
      <p className="text-gold-700/70 text-sm mb-6 sm:mb-10">
        Revise os detalhes antes de prosseguir para o pagamento.
      </p>

      <div className="max-w-md space-y-4">
        {/* Summary card */}
        <div className="border border-gold-800/40 rounded-xl overflow-hidden">
          <div className="bg-gold-900/20 px-5 py-3 border-b border-gold-800/30">
            <p className="text-[10px] tracking-widest uppercase text-gold-500/60">Resumo da reserva</p>
          </div>
          <div className="px-5 py-4 space-y-3">
            <SummaryRow label="Cliente" value={customerName} />
            <SummaryRow label="Pacote" value={pkg?.label ?? '—'} />
            <SummaryRow label="Modalidade" value={type === 'period' ? 'Período' : 'Pernoite'} />
            <SummaryRow label="Suíte" value={suite?.name ?? '—'} />
            <SummaryRow
              label="Check-in"
              value={checkIn?.toLocaleString('pt-BR', {
                weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
              }) ?? '—'}
            />
            <div className="border-t border-gold-900/40 pt-3 flex items-baseline justify-between">
              <span className="text-[10px] tracking-widest uppercase text-gold-600/60">Total</span>
              <span className="font-serif text-2xl font-semibold gold-gradient">{fmt(total)}</span>
            </div>
          </div>
        </div>

        {error && (
          <p className="text-red-400 text-sm text-center bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        {/* Pay button */}
        <button
          onClick={handlePay}
          disabled={loading}
          className="w-full py-4 rounded-xl bg-gradient-to-r from-gold-700 to-gold-500 text-black font-semibold text-sm hover:from-gold-600 hover:to-gold-400 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Registrando reserva…' : `Confirmar reserva — ${fmt(total)}`}
        </button>

        <p className="text-[11px] text-gold-800/50 text-center">
          Entraremos em contato pelo WhatsApp para finalizar o pagamento.
        </p>
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[10px] tracking-widest uppercase text-gold-700/50">{label}</span>
      <span className="text-sm text-gold-300 font-medium text-right max-w-[60%]">{value}</span>
    </div>
  )
}
