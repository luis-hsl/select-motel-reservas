// Notificações de atividade em tempo real — cria urgência e prova social.
// Os dados são verossímeis mas fictícios; substitua por dados reais via
// Supabase Realtime se quiser mostrar reservas reais.

import { useState, useEffect, useRef } from 'react'

type AlertKind = 'booking' | 'viewers'

interface Alert {
  kind: AlertKind
  suite?: string
  viewers?: number
  ago?: string // gerado dinamicamente no momento do show
}

const SUITES = ['Suíte 11', 'Suíte 13', 'Suíte 14', 'Suíte 15', 'Suíte 16', 'Suíte 17', 'Suíte 18', 'Suíte 22', 'Suíte 25']
// Visualizadores: aleatório entre 3 e 30 a cada exibição

/** Gera um texto de tempo aleatório entre 1 min e 3 h */
function randomAgo(): string {
  const mins = Math.floor(Math.random() * 180) + 1
  if (mins < 60) return `há ${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (m === 0) return `há ${h}h`
  return `há ${h}h ${m}min`
}

/** Escolhe uma suíte aleatória diferente da anterior */
function randomSuite(last: string | undefined): string {
  const pool = last ? SUITES.filter(s => s !== last) : SUITES
  return pool[Math.floor(Math.random() * pool.length)]
}

function buildQueue(): Alert[] {
  // Embaralha suítes e intercala notif de viewers a cada 2 reservas
  const shuffledSuites = [...SUITES].sort(() => Math.random() - 0.5)
  const result: Alert[] = []
  for (let i = 0; i < shuffledSuites.length; i++) {
    result.push({ kind: 'booking', suite: shuffledSuites[i] })
    if ((i + 1) % 2 === 0) {
      result.push({ kind: 'viewers' })
    }
  }
  return result
}

export default function LiveAlert() {
  const [visible, setVisible] = useState(false)
  const [current, setCurrent] = useState<Alert>({ kind: 'booking', suite: SUITES[0] })
  const queue = useRef<Alert[]>(buildQueue())
  const idx = useRef(0)
  const lastSuite = useRef<string | undefined>(undefined)

  useEffect(() => {
    const show = () => {
      let alert = queue.current[idx.current % queue.current.length]
      idx.current++
      if (idx.current >= queue.current.length) {
        queue.current = buildQueue()
        idx.current = 0
      }

      // Gera tempo aleatório no momento do show e evita repetir a mesma suíte seguida
      if (alert.kind === 'booking') {
        const suite = randomSuite(lastSuite.current)
        lastSuite.current = suite
        alert = { kind: 'booking', suite, ago: randomAgo() }
      } else {
        // Viewers: aleatório entre 3 e 30
        const viewers = Math.floor(Math.random() * 28) + 3
        alert = { kind: 'viewers', viewers }
      }

      setCurrent(alert)
      setVisible(true)
      setTimeout(() => setVisible(false), 4500)
    }

    const first = setTimeout(show, 10_000)
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
