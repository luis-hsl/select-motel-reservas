// Notificações de atividade em tempo real — cria urgência e prova social.
// Os dados são verossímeis mas fictícios; substitua por dados reais via
// Supabase Realtime se quiser mostrar reservas reais.

import { useState, useEffect, useRef } from 'react'

type AlertKind = 'booking' | 'viewers'

interface Alert {
  kind: AlertKind
  suite?: string
  ago?: string
  viewers?: number
}

// Quantidade de visitantes "visualizando agora" — varia levemente ao longo do tempo
const VIEWER_COUNTS = [4, 5, 6, 7, 5, 8, 6, 4, 7, 5]

const BOOKING_ALERTS: Alert[] = [
  { kind: 'booking', suite: 'Suíte 14', ago: 'há 2 min' },
  { kind: 'booking', suite: 'Suíte 16', ago: 'há 5 min' },
  { kind: 'booking', suite: 'Suíte 15', ago: 'há 8 min' },
  { kind: 'booking', suite: 'Suíte 22', ago: 'há 11 min' },
  { kind: 'booking', suite: 'Suíte 18', ago: 'há 14 min' },
  { kind: 'booking', suite: 'Suíte 13', ago: 'há 18 min' },
  { kind: 'booking', suite: 'Suíte 11', ago: 'há 22 min' },
  { kind: 'booking', suite: 'Suíte 17', ago: 'há 27 min' },
  { kind: 'booking', suite: 'Suíte 25', ago: 'há 31 min' },
  { kind: 'booking', suite: 'Suíte 14', ago: 'há 38 min' },
]

function buildQueue(): Alert[] {
  // Intercala: 2 reservas → 1 viewers → 2 reservas → 1 viewers …
  const shuffled = [...BOOKING_ALERTS].sort(() => Math.random() - 0.5)
  const result: Alert[] = []
  let vi = 0
  for (let i = 0; i < shuffled.length; i++) {
    result.push(shuffled[i])
    if ((i + 1) % 2 === 0) {
      result.push({ kind: 'viewers', viewers: VIEWER_COUNTS[vi % VIEWER_COUNTS.length] })
      vi++
    }
  }
  return result
}

export default function LiveAlert() {
  const [visible, setVisible] = useState(false)
  const [current, setCurrent] = useState<Alert>(BOOKING_ALERTS[0])
  const queue = useRef<Alert[]>(buildQueue())
  const idx = useRef(0)

  useEffect(() => {
    const show = () => {
      const alert = queue.current[idx.current % queue.current.length]
      idx.current++
      if (idx.current >= queue.current.length) {
        queue.current = buildQueue()
        idx.current = 0
      }
      setCurrent(alert)
      setVisible(true)
      // Esconde após 4.5s
      setTimeout(() => setVisible(false), 4500)
    }

    // Primeira notificação após 10s
    const first = setTimeout(show, 10_000)
    // Repete a cada 16s
    const interval = setInterval(show, 16_000)
    return () => { clearTimeout(first); clearInterval(interval) }
  }, [])

  const isViewers = current.kind === 'viewers'

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-[72px] left-4 z-50 pointer-events-none"
      style={{
        transition: 'opacity 0.45s ease, transform 0.45s cubic-bezier(0.22,1,0.36,1)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(10px)',
      }}
    >
      <div
        className="flex items-center gap-2.5 pr-4 pl-3 py-2.5 rounded-xl shadow-lg"
        style={{
          background: 'rgba(12,10,6,0.94)',
          border: isViewers
            ? '1px solid rgba(80,160,255,0.2)'
            : '1px solid rgba(201,168,76,0.22)',
          backdropFilter: 'blur(8px)',
          maxWidth: '260px',
        }}
      >
        {isViewers ? (
          <>
            {/* Eye icon */}
            <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 shrink-0" style={{ color: 'rgba(120,180,255,0.7)' }}>
              <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="8" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            <p className="text-[11px] font-medium leading-snug" style={{ color: 'rgba(180,215,255,0.85)' }}>
              <span style={{ color: 'rgba(120,190,255,0.95)' }}>{current.viewers} pessoas</span> visualizando agora
            </p>
          </>
        ) : (
          <>
            {/* Pulsing dot */}
            <span className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ background: '#c9a84c' }} />
            <div>
              <p className="text-[11px] font-medium leading-snug" style={{ color: 'rgba(240,215,160,0.9)' }}>
                {current.suite} reservada
              </p>
              <p className="text-[10px] leading-none mt-0.5" style={{ color: 'rgba(200,165,100,0.45)' }}>
                {current.ago}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
