// ⚠️ Reviews/depoimentos para reforçar confiança na step de pagamento.
//
// IMPORTANTE: substitua estes depoimentos por reviews REAIS com permissão
// dos clientes assim que possível. Reviews fictícios em e-commerce
// configuram publicidade enganosa (CDC Art. 37) com risco de multa pelo
// PROCON / sanção do Ministério da Justiça.

import { useState, useRef } from 'react'

interface Review {
  name:   string
  date:   string
  rating: number
  text:   string
}

const REVIEWS: Review[] = [
  {
    name:   'Mariana S.',
    date:   '2 semanas atrás',
    rating: 5,
    text:   'Suíte impecável, decoração linda e o atendimento foi acima do esperado. Voltaremos com certeza!',
  },
  {
    name:   'Rafael e Carla',
    date:   '1 mês atrás',
    rating: 5,
    text:   'Reservei pra um jantar romântico, chegamos e estava tudo preparado. O fondue surpreendeu. Recomendo demais.',
  },
  {
    name:   'Juliana M.',
    date:   '3 semanas atrás',
    rating: 5,
    text:   'Pagamento por PIX rapidíssimo, confirmação no WhatsApp na hora. Suíte com hidro super limpa.',
  },
  {
    name:   'Bruno A.',
    date:   '2 meses atrás',
    rating: 5,
    text:   'Discreto, organizado e com privacidade. O pacote Ouro vale cada centavo.',
  },
]

const DRAG_THRESHOLD = 50 // px mínimos para mudar de card

function Stars({ n }: { n: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${n} de 5 estrelas`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} viewBox="0 0 20 20" className="w-3.5 h-3.5"
          fill={i < n ? '#e8c060' : 'rgba(201,168,76,0.18)'} aria-hidden>
          <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9 4.8 17.6l1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
        </svg>
      ))}
    </div>
  )
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
}

export default function Reviews() {
  const [current, setCurrent] = useState(0)
  const [dragOffset, setDragOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startX = useRef(0)
  const avg = REVIEWS.reduce((s, r) => s + r.rating, 0) / REVIEWS.length

  function onPointerDown(e: React.PointerEvent) {
    startX.current = e.clientX
    setDragging(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return
    const delta = e.clientX - startX.current
    // limita o arraste nas bordas
    const maxDrag = current === 0 && delta > 0 ? Math.min(delta * 0.3, 40)
                  : current === REVIEWS.length - 1 && delta < 0 ? Math.max(delta * 0.3, -40)
                  : delta
    setDragOffset(maxDrag)
  }

  function onPointerUp() {
    if (!dragging) return
    setDragging(false)
    if (dragOffset < -DRAG_THRESHOLD && current < REVIEWS.length - 1) {
      setCurrent(c => c + 1)
    } else if (dragOffset > DRAG_THRESHOLD && current > 0) {
      setCurrent(c => c - 1)
    }
    setDragOffset(0)
  }

  const translateX = -(current * 100) + (dragOffset / 3)   // /3 = resistência suave em %

  return (
    <section className="rounded-2xl border border-gold-900/30 bg-white/[0.02] p-4 sm:p-5 select-none">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Stars n={5} />
        <div className="text-xs">
          <span className="text-gold-300 font-semibold">{avg.toFixed(1)}</span>
          <span className="text-white/40"> · {REVIEWS.length}+ avaliações</span>
        </div>
        <span className="text-white/15 text-[10px] ml-auto tracking-wide">← arraste →</span>
      </div>

      {/* Track arrastável */}
      <div
        className="overflow-hidden cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div
          className="flex"
          style={{
            transform: `translateX(${translateX}%)`,
            transition: dragging ? 'none' : 'transform 0.4s cubic-bezier(0.25,0.46,0.45,0.94)',
          }}
        >
          {REVIEWS.map((r) => (
            <article
              key={r.name + r.date}
              className="w-full shrink-0 border border-white/5 rounded-xl p-3 bg-white/[0.015] pointer-events-none"
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-[11px] font-semibold text-black"
                  style={{ background: 'linear-gradient(135deg,#c8a035,#e8c060)' }}
                  aria-hidden
                >
                  {initials(r.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <p className="text-white/85 text-sm font-medium truncate">{r.name}</p>
                    <span className="text-white/30 text-[10px] shrink-0">{r.date}</span>
                  </div>
                  <Stars n={r.rating} />
                  <p className="text-white/65 text-xs leading-relaxed mt-1.5">{r.text}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* Dots */}
      <div className="flex justify-center items-center gap-1.5 mt-3">
        {REVIEWS.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            aria-label={`Review ${i + 1}`}
            className="h-1.5 rounded-full transition-all duration-300"
            style={{
              width: i === current ? '1.5rem' : '0.375rem',
              background: i === current ? '#c9a84c' : 'rgba(255,255,255,0.15)',
            }}
          />
        ))}
      </div>
    </section>
  )
}
