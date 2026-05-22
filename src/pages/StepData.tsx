import { useState } from 'react'
import { PROMO_START, PROMO_END, PERIOD_SLOTS, OVERNIGHT_CHECKIN } from '../data'
import { useStore } from '../store/useStore'

function datesBetween(start: Date, end: Date): Date[] {
  const dates: Date[] = []
  const cur = new Date(start)
  while (cur <= end) { dates.push(new Date(cur)); cur.setDate(cur.getDate() + 1) }
  return dates
}

const AVAILABLE_DATES = datesBetween(PROMO_START, PROMO_END)

export default function StepData() {
  const { type, setCheckIn, nextStep, prevStep } = useStore()
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)

  const slots = type === 'period' ? PERIOD_SLOTS : [OVERNIGHT_CHECKIN]
  const canContinue = selectedDate && selectedSlot

  function confirm() {
    if (!selectedDate || !selectedSlot) return
    const [h, m] = selectedSlot.split(':').map(Number)
    const dt = new Date(selectedDate)
    dt.setHours(h, m, 0, 0)
    setCheckIn(dt)
    nextStep()
  }

  return (
    <div>
      <button onClick={prevStep} className="flex items-center gap-1 text-gold-700/60 text-sm mb-8 hover:text-gold-500 transition-colors">
        <span>←</span> Voltar
      </button>

      <h1 className="font-serif text-4xl sm:text-5xl font-light mb-2 leading-tight">
        Quando será<br />
        <span className="gold-gradient font-semibold italic">o grande dia?</span>
      </h1>
      <p className="text-gold-700/70 text-sm mb-10">
        Reservas disponíveis de {PROMO_START.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })} a {PROMO_END.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}.
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
                onClick={() => { setSelectedDate(d); setSelectedSlot(null) }}
                className={[
                  'px-4 py-2 rounded-lg border text-sm transition-all duration-200 outline-none',
                  sel
                    ? 'border-gold-500 bg-gold-900/20 text-gold-300'
                    : 'border-gold-900/40 text-gold-700/60 hover:border-gold-700/50 hover:text-gold-400',
                ].join(' ')}
              >
                <span className="font-medium">{d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Time slot picker */}
      {selectedDate && (
        <div className="mb-10">
          <p className="text-[10px] tracking-widest uppercase text-gold-600/60 mb-3">Horário de check-in</p>
          <div className="flex flex-wrap gap-2">
            {slots.map((slot) => {
              const sel = selectedSlot === slot
              return (
                <button
                  key={slot}
                  onClick={() => setSelectedSlot(slot)}
                  className={[
                    'px-5 py-2.5 rounded-lg border text-sm font-medium transition-all duration-200 outline-none',
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
