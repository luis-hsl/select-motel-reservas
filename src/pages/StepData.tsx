import { useState, useMemo, useRef, useEffect } from 'react'
import { getAvailableDates, calcCheckOut, PERIOD_SLOTS } from '../data'
import { useStore } from '../store/useStore'

const AVAILABLE_DATES = getAvailableDates()
const AVAILABLE_SET = new Set(AVAILABLE_DATES.map(d => d.toDateString()))

const DAY_LETTERS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

// ── Calendar ────────────────────────────────────────────────

function Calendar({
  selected,
  onSelect,
}: {
  selected: Date | null
  onSelect: (d: Date) => void
}) {
  const today = useMemo(() => {
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    return t
  }, [])

  const [vy, setVy] = useState(AVAILABLE_DATES[0].getFullYear())
  const [vm, setVm] = useState(AVAILABLE_DATES[0].getMonth())

  const cells = useMemo(() => {
    const firstDow = new Date(vy, vm, 1).getDay()
    const daysInMonth = new Date(vy, vm + 1, 0).getDate()
    const arr: (Date | null)[] = Array(firstDow).fill(null)
    for (let d = 1; d <= daysInMonth; d++) arr.push(new Date(vy, vm, d))
    return arr
  }, [vy, vm])

  const minY = AVAILABLE_DATES[0].getFullYear()
  const minM = AVAILABLE_DATES[0].getMonth()
  const maxY = AVAILABLE_DATES[AVAILABLE_DATES.length - 1].getFullYear()
  const maxM = AVAILABLE_DATES[AVAILABLE_DATES.length - 1].getMonth()

  const canPrev = vy > minY || (vy === minY && vm > minM)
  const canNext = vy < maxY || (vy === maxY && vm < maxM)

  function prev() {
    if (vm === 0) { setVy(y => y - 1); setVm(11) } else setVm(m => m - 1)
  }
  function next() {
    if (vm === 11) { setVy(y => y + 1); setVm(0) } else setVm(m => m + 1)
  }

  return (
    <div className="rounded-2xl border border-gold-900/30 bg-gradient-to-b from-gold-950/20 to-transparent p-5">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={prev} disabled={!canPrev}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-lg text-gold-500 hover:text-gold-300 hover:bg-gold-800/30 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
        >
          ‹
        </button>
        <span className="text-sm font-medium text-gold-300/80 tracking-widest uppercase">
          {MONTHS_PT[vm]} {vy}
        </span>
        <button
          onClick={next} disabled={!canNext}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-lg text-gold-500 hover:text-gold-300 hover:bg-gold-800/30 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
        >
          ›
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LETTERS.map((l, i) => (
          <div key={i} className="text-center text-[10px] font-medium tracking-widest text-gold-700/40 pb-2">
            {l}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const avail = AVAILABLE_SET.has(d.toDateString())
          const isSel = selected?.toDateString() === d.toDateString()
          const isToday = d.toDateString() === today.toDateString()
          return (
            <div key={i} className="flex justify-center py-0.5">
              <button
                onClick={() => avail && onSelect(d)}
                disabled={!avail}
                className={[
                  'w-10 h-10 rounded-full text-sm transition-all duration-150 relative select-none',
                  isSel
                    ? 'font-bold text-black scale-105'
                    : avail
                    ? 'text-gold-200/80 hover:bg-gold-800/40 hover:text-gold-100'
                    : 'text-gold-900/40 cursor-not-allowed',
                ].join(' ')}
                style={isSel ? {
                  background: 'linear-gradient(135deg, #c9a84c, #f5d87a, #a07820)',
                  boxShadow: '0 2px 16px rgba(200,160,50,0.35)',
                } : undefined}
              >
                {d.getDate()}
                {isToday && !isSel && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-gold-500/70" />
                )}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main step ───────────────────────────────────────────────

export default function StepData() {
  const { type, setCheckIn, nextStep, prevStep } = useStore()
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const slotsRef = useRef<HTMLDivElement>(null)
  const ctaRef = useRef<HTMLButtonElement>(null)

  // Período, pernoite e diária usam os mesmos horários disponíveis
  const slots = PERIOD_SLOTS

  // Horários do dia atual que já passaram ficam indisponíveis
  const now = new Date()
  const isToday = selectedDate
    ? selectedDate.toDateString() === now.toDateString()
    : false
  const nowTotalMin = now.getHours() * 60 + now.getMinutes()

  function isSlotPast(slot: string): boolean {
    if (!isToday) return false
    const [h, m] = slot.split(':').map(Number)
    return (h * 60 + (m ?? 0)) <= nowTotalMin
  }

  // Sexta (5), sábado (6) e domingo (0) — aviso informativo (bloqueio acontece no StepTipo)
  const isWeekend = selectedDate ? [0, 5, 6].includes(selectedDate.getDay()) : false

  // Todos os horários do dia selecionado já passaram?
  const allSlotsPast = isToday && slots.every(slot => isSlotPast(slot))

  // Próxima data disponível após a selecionada (para o atalho no aviso)
  const nextAvailableDate = allSlotsPast && selectedDate
    ? (AVAILABLE_DATES.find(d => d > selectedDate) ?? null)
    : null

  // Se o slot selecionado já passou (ex: usuário voltou mais tarde), limpa
  useEffect(() => {
    if (selectedSlot && isSlotPast(selectedSlot)) {
      setSelectedSlot(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

  function slotCheckIn(slot: string, date: Date): Date {
    const [h, m] = slot.split(':').map(Number)
    const d = new Date(date)
    d.setHours(h, m, 0, 0)
    return d
  }

  const selectedCheckOut =
    selectedDate && selectedSlot
      ? calcCheckOut(slotCheckIn(selectedSlot, selectedDate), type ?? 'period')
      : null

  function confirm() {
    if (!selectedDate || !selectedSlot) return
    setCheckIn(slotCheckIn(selectedSlot, selectedDate))
    nextStep()
  }

  const canContinue = !!(selectedDate && selectedSlot)

  useEffect(() => {
    if (!selectedDate) return
    const t = setTimeout(() => {
      slotsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
    return () => clearTimeout(t)
  }, [selectedDate])

  useEffect(() => {
    if (!selectedSlot) return
    requestAnimationFrame(() => {
      ctaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [selectedSlot])

  return (
    <>
    <div>
      <button
        onClick={prevStep}
        className="flex items-center gap-1 text-gold-700/60 text-sm mb-8 hover:text-gold-500 transition-colors"
      >
        <span>←</span> Voltar
      </button>

      <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-light mb-2 leading-tight">
        Quando vocês<br />
        <span className="gold-gradient font-semibold italic">vão chegar?</span>
      </h1>
      <p className="text-gold-700/70 text-sm mb-6 sm:mb-10">
        Escolha a data e o horário — sua reserva é confirmada na hora.
      </p>

      <div className="lg:grid lg:grid-cols-2 lg:gap-10 xl:gap-14 lg:items-start">
        {/* Coluna esquerda: Calendário */}
        <div className="mb-8 lg:mb-0">
          <p className="text-[10px] tracking-widest uppercase text-gold-600/60 mb-4">Data</p>
          <Calendar
            selected={selectedDate}
            onSelect={(d) => {
              setSelectedDate(d)
              setSelectedSlot(null)
            }}
          />
        </div>

        {/* Coluna direita: Horários + botão */}
        <div>
          {selectedDate && (
            <div ref={slotsRef} className="mb-8" style={{ scrollMarginTop: '5rem' }}>
              <p className="text-[10px] tracking-widest uppercase text-gold-600/60 mb-3">
                Horário de check-in
              </p>

              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                {slots.map((slot) => {
                  const sel = selectedSlot === slot
                  const [h] = slot.split(':').map(Number)
                  const period = h < 12 ? 'Manhã' : h < 18 ? 'Tarde' : 'Noite'
                  const past = isSlotPast(slot)
                  return (
                    <button
                      key={slot}
                      onClick={() => !past && setSelectedSlot(slot)}
                      disabled={past}
                      className={[
                        'py-3 rounded-xl border text-sm font-medium transition-all duration-200 outline-none flex flex-col items-center gap-0.5',
                        past
                          ? 'border-gold-900/15 text-gold-900/30 cursor-not-allowed'
                          : sel
                          ? 'border-gold-500 bg-gold-900/20 text-gold-300'
                          : 'border-gold-700/50 text-gold-500/80 hover:border-gold-500/70 hover:text-gold-300',
                      ].join(' ')}
                    >
                      <span className={past ? 'line-through' : ''}>{slot}</span>
                      <span className={[
                        'text-[9px] tracking-widests',
                        past ? 'text-gold-900/25' : sel ? 'text-gold-500/60' : 'text-gold-600/80',
                      ].join(' ')}>
                        {past ? 'indisponível' : period}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Aviso: todos os horários do dia já passaram */}
              {allSlotsPast && (
                <div
                  className="mt-4 flex items-start gap-3 px-4 py-3 rounded-xl"
                  style={{ background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.14)' }}
                >
                  <svg className="w-3.5 h-3.5 shrink-0 mt-[1px]" viewBox="0 0 14 14" fill="none"
                       style={{ color: 'rgba(201,168,76,0.45)' }}>
                    <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1" />
                    <path d="M7 4v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    <circle cx="7" cy="10" r="0.65" fill="currentColor" />
                  </svg>
                  <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(210,195,165,0.55)' }}>
                    Todos os horários de hoje já passaram.{' '}
                    {nextAvailableDate ? (
                      <>
                        Avance para{' '}
                        <button
                          onClick={() => { setSelectedDate(nextAvailableDate); setSelectedSlot(null) }}
                          className="underline underline-offset-2 transition-opacity hover:opacity-70"
                          style={{ color: 'rgba(201,168,76,0.80)' }}
                        >
                          {nextAvailableDate.toLocaleDateString('pt-BR', {
                            weekday: 'long', day: 'numeric', month: 'long',
                          })}
                        </button>
                        {' '}para continuar sua reserva.
                      </>
                    ) : (
                      'Escolha outra data disponível no calendário.'
                    )}
                  </p>
                </div>
              )}

              {/* Aviso informativo: fim de semana — período não disponível */}
              {isWeekend && (
                <div
                  className="mt-4 flex items-start gap-2.5 px-4 py-3 rounded-xl"
                  style={{ background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.18)' }}
                >
                  <svg className="w-3.5 h-3.5 shrink-0 mt-[2px]" viewBox="0 0 14 14" fill="none"
                       style={{ color: 'rgba(201,168,76,0.55)' }}>
                    <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1" />
                    <path d="M7 4v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    <circle cx="7" cy="10" r="0.65" fill="currentColor" />
                  </svg>
                  <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(210,195,165,0.60)' }}>
                    <strong style={{ color: 'rgba(230,205,145,0.80)' }}>Período não disponível</strong> em sextas, sábados e domingos.
                    No próximo passo você poderá escolher <strong style={{ color: 'rgba(230,205,145,0.80)' }}>Pernoite</strong> ou <strong style={{ color: 'rgba(230,205,145,0.80)' }}>Diária</strong>.
                  </p>
                </div>
              )}

              {selectedCheckOut && selectedSlot && type && (
                <div className="mt-4 px-4 py-3 rounded-xl border border-gold-800/30 bg-gold-900/10">
                  <p className="text-[10px] tracking-widest uppercase text-gold-600/50 mb-1">
                    Resumo do período
                  </p>
                  <div className="flex items-center gap-3 text-sm flex-wrap">
                    <span className="text-gold-400 font-medium">Check-in: {selectedSlot}</span>
                    <span className="text-gold-700/40">→</span>
                    <span className="text-gold-300 font-semibold">
                      Check-out:{' '}
                      {selectedCheckOut.toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* No mobile o sticky CTA substitui este botão — só mostrar no desktop */}
          <button
            ref={ctaRef}
            onClick={confirm}
            disabled={!canContinue}
            style={{ scrollMarginTop: '5rem' }}
            className={[
              'hidden lg:flex items-center gap-2 px-8 py-3.5 rounded-lg text-sm font-semibold transition-all duration-200',
              canContinue
                ? 'bg-gradient-to-r from-gold-700 to-gold-500 text-black hover:from-gold-600 hover:to-gold-400'
                : 'bg-gold-900/20 text-gold-800/40 cursor-not-allowed',
            ].join(' ')}
          >
            Ver suítes disponíveis <span>→</span>
          </button>
        </div>
      </div>
    </div>

      {/* Mobile sticky CTA — appears when date+slot selected.
          bottom-[52px] to stack above the ReservaSidebar mobile bar (fixed bottom-0 ~48px tall). */}
      {canContinue && (
        <div className="lg:hidden fixed bottom-[52px] left-0 right-0 z-50 px-4 pb-2 pt-3"
          style={{ background: 'linear-gradient(to top, rgba(10,10,10,0.98) 60%, transparent)' }}
        >
          <button
            onClick={confirm}
            className="w-full py-4 rounded-xl text-sm font-semibold text-black transition-all duration-200 active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg,#c9a84c,#f5d87a,#a07820)', boxShadow: '0 4px 24px rgba(200,160,50,0.3)' }}
          >
            Ver suítes disponíveis →
          </button>
        </div>
      )}
    </>
  )
}
