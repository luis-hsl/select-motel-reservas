import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface Reservation {
  id: string
  status: string
  customer_name: string
  check_in: string
  check_out: string
  total_amount: number
  suites: { name: string } | null
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDt(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    weekday: 'short', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function CardPaymentReturn({ reservationId }: { reservationId: string }) {
  const [phase, setPhase] = useState<'checking' | 'paid' | 'timeout'>('checking')
  const [reservation, setReservation] = useState<Reservation | null>(null)

  useEffect(() => {
    window.history.replaceState({}, '', window.location.pathname)

    let cancelled = false
    let attempts = 0

    async function check() {
      if (cancelled) return

      const { data } = await supabase
        .from('reservations')
        .select('id, status, customer_name, check_in, check_out, total_amount, suites:suite_id(name)')
        .eq('id', reservationId)
        .single()

      if (cancelled) return

      if (data) {
        setReservation(data as unknown as Reservation)
        if (data.status === 'paid') {
          setPhase('paid')
          return
        }
      }

      attempts++
      if (attempts < 40) {
        setTimeout(check, 3000)
      } else {
        setPhase('timeout')
      }
    }

    check()
    return () => { cancelled = true }
  }, [reservationId])

  const shortId = reservationId.slice(0, 8).toUpperCase()

  if (phase === 'paid' && reservation) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="border border-gold-700/40 rounded-2xl overflow-hidden">
            <div className="bg-gold-900/20 px-6 py-5 border-b border-gold-800/30 text-center">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
                style={{ background: 'linear-gradient(135deg,#c8a035,#e8c060)' }}
              >
                <svg className="w-6 h-6 text-black" fill="none" viewBox="0 0 20 20">
                  <path d="M4 10l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2 className="font-serif text-2xl font-light gold-gradient">Pagamento confirmado!</h2>
              <p className="text-[11px] text-gold-700/50 mt-1">
                Você receberá confirmação pelo WhatsApp em instantes.
              </p>
            </div>

            <div className="px-6 py-5 space-y-3">
              <Row label="Código" value={shortId} mono />
              <Row label="Cliente" value={reservation.customer_name} />
              <Row label="Suíte" value={(reservation.suites as any)?.name ?? '—'} />
              <Row label="Check-in" value={fmtDt(reservation.check_in)} />
              <Row label="Check-out" value={fmtDt(reservation.check_out)} />
              <div className="border-t border-gold-900/40 pt-3 flex items-baseline justify-between">
                <span className="text-[10px] tracking-widests uppercase text-gold-600/60">Total</span>
                <span className="font-serif text-2xl font-semibold gold-gradient">
                  {fmt(Number(reservation.total_amount))}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'timeout') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-5">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto text-2xl"
            style={{ border: '1px solid rgba(201,168,76,0.3)', background: 'rgba(201,168,76,0.08)' }}
          >
            ⏳
          </div>
          <div>
            <h2 className="font-serif text-2xl font-light text-gold-300 mb-2">Pagamento em processamento</h2>
            <p className="text-sm text-gold-700/60 leading-relaxed">
              Se o pagamento foi realizado, você receberá a confirmação pelo WhatsApp em breve.
            </p>
          </div>
          <div
            className="rounded-xl px-4 py-3 text-center"
            style={{ border: '1px solid rgba(201,168,76,0.2)', background: 'rgba(201,168,76,0.06)' }}
          >
            <p className="text-[10px] tracking-widests uppercase text-gold-700/50 mb-1">Código da reserva</p>
            <p className="font-mono text-gold-400 font-semibold">{shortId}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
      <div className="text-center space-y-5">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
          style={{ background: 'radial-gradient(circle, rgba(201,168,76,0.12) 0%, transparent 70%)' }}
        >
          <div
            className="w-9 h-9 rounded-full border-2 animate-spin"
            style={{ borderColor: 'rgba(201,168,76,0.25)', borderTopColor: 'rgba(201,168,76,0.85)' }}
          />
        </div>
        <div>
          <p className="text-gold-300 font-medium mb-1">Verificando pagamento…</p>
          <p className="text-xs text-gold-700/50">Aguarde enquanto confirmamos com o banco.</p>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[10px] tracking-widests uppercase text-gold-700/50 shrink-0">{label}</span>
      <span className={['text-sm text-right max-w-[60%] text-gold-300 font-medium', mono ? 'font-mono' : ''].join(' ')}>
        {value}
      </span>
    </div>
  )
}
