import { useState } from 'react'
import { getAvailableDates, calcCheckOut, PERIOD_SLOTS, OVERNIGHT_CHECKIN } from '../data'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'

const AVAILABLE_DATES = getAvailableDates(60)

type OccupiedInterval = { slot_start: string; slot_end: string }

function localDateStr(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

export default function StepData() {
  const { type, suite, setCheckIn, nextStep, prevStep } = useStore()
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [occupied, setOccupied] = useState<OccupiedInterval[]>([])
  const [showUnavailable, setShowUnavailable] = useState(false)

  const slots = type === 'period' ? PERIOD_SLOTS : [OVERNIGHT_CHECKIN]

  function slotTimes(slot: string, date: Date) {
    const [h, m] = slot.split(':').map(Number)
    const checkIn = new Date(date)
    checkIn.setHours(h, m, 0, 0)
    return { checkIn, checkOut: calcCheckOut(checkIn, type ?? 'period') }
  }

  function isOccupied(slot: string, date: Date): boolean {
    const { checkIn, checkOut } = slotTimes(slot, date)
    return occupied.some(
      (iv) => checkIn < new Date(iv.slot_end) && checkOut > new Date(iv.slot_start)
    )
  }

  async function handleDateSelect(d: Date) {
    setSelectedDate(d)
    setSelectedSlot(null)
    setShowUnavailable(false)
    setOccupied([])

    if (!suite) return

    setLoadingSlots(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).rpc('get_occupied_slots', {
      p_suite_id: suite.id,
      p_date: localDateStr(d),
    })
    setOccupied((data as OccupiedInterval[]) || [])
    setLoadingSlots(false)
  }

  function handleSlotClick(slot: string) {
    if (!selectedDate || loadingSlots) return
    if (isOccupied(slot, selectedDate)) {
      setShowUnavailable(true)
      return
    }
    setShowUnavailable(false)
    setSelectedSlot(slot)
  }

  function confirm() {
    if (!selectedDate || !selectedSlot) return
    setCheckIn(slotTimes(selectedSlot, selectedDate).checkIn)
    nextStep()
  }

  const selectedCheckOut =
    selectedDate && selectedSlot ? slotTimes(selectedSlot, selectedDate).checkOut : null

  const canContinue = selectedDate && selectedSlot && !loadingSlots

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
                onClick={() => handleDateSelect(d)}
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

          {loadingSlots ? (
            <p className="text-gold-700/40 text-sm py-2">Verificando disponibilidade…</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slots.map((slot) => {
                const sel = selectedSlot === slot
                const blocked = isOccupied(slot, selectedDate)
                return (
                  <button
                    key={slot}
                    onClick={() => handleSlotClick(slot)}
                    disabled={blocked}
                    title={blocked ? 'Horário indisponível' : undefined}
                    className={[
                      'px-5 py-2.5 rounded-lg border text-sm font-medium transition-all duration-200 outline-none',
                      blocked
                        ? 'border-red-900/30 bg-red-900/10 text-red-700/40 cursor-not-allowed line-through decoration-red-700/30'
                        : sel
                        ? 'border-gold-500 bg-gold-900/20 text-gold-300'
                        : 'border-gold-900/40 text-gold-700/60 hover:border-gold-700/50 hover:text-gold-400',
                    ].join(' ')}
                  >
                    {slot}
                  </button>
                )
              })}
            </div>
          )}

          {showUnavailable && (
            <p className="mt-3 text-sm text-red-400/80 bg-red-900/10 border border-red-800/30 rounded-lg px-4 py-2.5">
              Este horário já está reservado para a suíte escolhida. Selecione outro.
            </p>
          )}

          {selectedCheckOut && selectedSlot && (
            <div className="mt-4 flex items-center gap-3 px-4 py-3 rounded-xl border border-gold-800/30 bg-gold-900/10">
              <div className="flex-1">
                <p className="text-[10px] tracking-widest uppercase text-gold-600/50 mb-1">
                  Resumo do período
                </p>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-gold-400 font-medium">Check-in: {selectedSlot}</span>
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
        Continuar <span>→</span>
      </button>
    </div>
  )
}
