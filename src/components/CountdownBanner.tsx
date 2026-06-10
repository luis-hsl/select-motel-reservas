import { useState, useEffect } from 'react'

const TARGET = new Date('2026-06-12T23:59:59-03:00')

interface TimeLeft {
  days: number
  hours: number
  minutes: number
}

function getTimeLeft(): TimeLeft | null {
  const diff = TARGET.getTime() - Date.now()
  if (diff <= 0) return null
  const days    = Math.floor(diff / 86400000)
  const hours   = Math.floor((diff % 86400000) / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  return { days, hours, minutes }
}

function Block({ value, label, shortLabel }: { value: number; label: string; shortLabel: string }) {
  const padded = String(value).padStart(2, '0')
  return (
    <div className="flex flex-col items-center leading-none">
      <span className="font-mono font-semibold text-[13px] text-gold-300">
        {padded}
        {/* Mobile: inline short label */}
        <span className="sm:hidden text-[9px] text-gold-700/50 uppercase ml-0.5 font-normal tracking-wider">
          {shortLabel}
        </span>
      </span>
      {/* Desktop: label below */}
      <span className="hidden sm:block text-[9px] uppercase text-gold-700/50 tracking-wider mt-0.5">
        {label}
      </span>
    </div>
  )
}

export default function CountdownBanner() {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(getTimeLeft)

  useEffect(() => {
    const id = setInterval(() => {
      setTimeLeft(getTimeLeft())
    }, 30_000)
    return () => clearInterval(id)
  }, [])

  if (!timeLeft) return null
  if (timeLeft.days > 3) return null

  return (
    <div
      className="fixed top-[86px] sm:top-[111px] left-0 right-0 z-40 flex items-center justify-center gap-4 py-2.5 px-4"
      style={{
        background: 'rgba(201,168,76,0.08)',
        borderBottom: '1px solid rgba(201,168,76,0.15)',
      }}
    >
      {/* Left text */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[11px] text-gold-400/70" aria-hidden="true">🌹</span>
        {/* Desktop */}
        <span className="hidden sm:inline text-[11px] text-gold-400/70">
          Dia dos Namorados · Últimas reservas disponíveis
        </span>
        {/* Mobile */}
        <span className="sm:hidden text-[11px] text-gold-400/70">
          Últimas reservas
        </span>
      </div>

      {/* Divider */}
      <div
        className="hidden sm:block h-3 w-px shrink-0"
        style={{ background: 'rgba(201,168,76,0.2)' }}
      />

      {/* Countdown blocks */}
      <div className="flex items-center gap-3 shrink-0" aria-live="polite" aria-label={`${timeLeft.days} dias, ${timeLeft.hours} horas e ${timeLeft.minutes} minutos restantes`}>
        <Block value={timeLeft.days}    label="dias" shortLabel="d" />
        <span className="text-gold-700/40 text-[10px] font-mono -mt-0.5">·</span>
        <Block value={timeLeft.hours}   label="h"    shortLabel="h" />
        <span className="text-gold-700/40 text-[10px] font-mono -mt-0.5">·</span>
        <Block value={timeLeft.minutes} label="min"  shortLabel="m" />
      </div>
    </div>
  )
}
