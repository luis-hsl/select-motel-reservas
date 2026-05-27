import { useState } from 'react'
import { getAvailableDates, calcCheckOut, PERIOD_SLOTS, OVERNIGHT_CHECKIN } from '../data'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'

const AVAILABLE_DATES = getAvailableDates(60)


export default function StepData() {
  const { type, suite, setCheckIn, nextStep, prevStep } = useStore()
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  const slots = type === 'period' ? PERIOD_SLOTS : [OVERNIGHT_CHECKIN]

  const selectedCheckOut =
    selectedDate && selectedSlot && type
      ? (() => {
          const [h, m] = selectedSlot.split(':').map(Number)
          const ci = new Date(selectedDate)
          ci.setHours(h, m, 0, 0)
          return calcCheckOut(ci, type)
        })()
      : null

  async function handleSlotClick(slot: string) {
    if (!selectedDate || !suite || !type) {
      setSelectedSlot(slot)
      setUnavailable(false)
      return
    }

    setChecking(true)
    setUnavailable(false)

    const [h, m] = slot.split(':').map(Number)
    const checkIn = new Date(selectedDate)
    checkIn.setHours(h, m, 0, 0)
    const checkOut = calcCheckOut(checkIn, type)

    const { data } = await supabase
      .from('reservations')
      .select('id')
      .eq('suite_id', suite.id)
      .in('status', ['pending', 'confirmed', 'paid'])
      .lt('check_in', checkOut.toISOString())
      .gt('check_out', checkIn.toISOString())

    setChecking(false)

    if ((data?.length ?? 0) > 0) {
      setUnavailable(true)
      setSelectedSlot(null)
    } else {
      setUnavailable(false)
      setSelectedSlot(slot)
    }
  }

  function confirm() {
    if (!selectedDate || !selectedSlot) return
    const [h, m] = selectedSlot.split(':').map(Number)
    const dt = new Date(selectedDate)
    dt.setHours(h, m, 0, 0)
    setCheckIn(dt)
    nextStep()
  }

  const canContinue = selectedDate && selectedSlot && !checking

  return (
    <div>
      <button
        onClick={prevStep}
        className="flex items-center gap-1 text-gold-700/60 text-sm mb-8 hover:text-gold-500 transition-colors"
      >
        <span>←</span> Voltar
      </button>

      <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-light mb-2 leading-tight">
        Escolha a data<br />
        <span className="gold-gradient font-semibold italic">e o horário</span>
      </h1>
      <p className="text-gold-700/70 text-sm mb-6 sm:mb-10">
        Selecione quando você quer chegar.
      </p>

      {/* Date picker */}
      <div className="mb-8">
        <p className="text-[10px] tracking-widest uppercase text-gold-600/60 mb-3">Data</p>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_DATES.map((d) => {
            const sel = selectedDate?.toDateString() === d.toDateString()
            return (
              <button
                key={d.toISOString()}
                onClick={() => { setSelectedDate(d); setSelectedSlot(null); setUnavailable(false) }}
                className={[
                  'px-4 py-2 rounded-lg border text-sm transition-all duration-200 outline-none',
                  sel
                    ? 'border-gold-500 bg-gold-900/20 text-gold-300'
                    : 'border-gold-900/40 text-gold-700/60 hover:border-gold-700/50 hover:text-gold-400',
                ].join(' ')}
              >
                {d.toLocaleDateString('pt-BR', {
                  weekday: 'short', day: '2-digit', month: '2-digit',
                })}
              </button>
            )
          })}
        </div>
      </div>

      {/* Time slots */}
      {selectedDate && (
        <div className="mb-8">
          <p className="text-[10px] tracking-widest uppercase text-gold-600/60 mb-3">
            Horário de check-in
          </p>
          <div className="flex flex-wrap gap-2">
            {slots.map((slot) => {
              const sel = selectedSlot === slot
              return (
                <button
                  key={slot}
                  onClick={() => handleSlotClick(slot)}
                  disabled={checking}
                  className={[
                    'px-5 py-2.5 rounded-lg border text-sm font-medium transition-all duration-200 outline-none disabled:opacity-50',
                    sel
                      ? 'border-gold-500 bg-gold-900/20 text-gold-300'
                      : 'border-gold-900/40 text-gold-700/60 hover:border-gold-700/50 hover:text-gold-400',
                  ].join(' ')}
                >
                  {slot}
                </button>
              )
            })}
          </div>

          {/* Unavailable feedback */}
          {unavailable && (
            <p className="mt-3 text-sm text-red-400/80 bg-red-900/10 border border-red-800/30 rounded-lg px-4 py-2.5">
              Este horário já está reservado para a suíte escolhida. Por favor, selecione outro.
            </p>
          )}

          {/* Checkout summary */}
          {selectedCheckOut && selectedSlot && (
            <div className="mt-4 flex items-center gap-3 px-4 py-3 rounded-xl border border-gold-800/30 bg-gold-900/10">
              <div className="flex-1">
                <p className="text-[10px] tracking-widest uppercase text-gold-600/50 mb-1">
                  Resumo do período
                </p>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-gold-400 font-medium">
                    Check-in: {selectedSlot}
                  </span>
                  <span className="text-gold-700/40">→</span>
                  <span className="text-gold-300 font-semibold">
                    Check-out:{' '}
                    {selectedCheckOut.toLocaleString('pt-BR', {
                      weekday: 'short',
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <button
        onClick={confirm}
        disabled={!canContinue}
        className={[
          'flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold transition-all duration-200',
          canContinue
            ? 'bg-gradient-to-r from-gold-700 to-gold-500 text-black hover:from-gold-600 hover:to-gold-400'
            : 'bg-gold-900/20 text-gold-800/40 cursor-not-allowed',
        ].join(' ')}
      >
        {checking ? 'Verificando disponibilidade…' : 'Continuar'} {!checking && <span>→</span>}
      </button>
    </div>
  )
}

