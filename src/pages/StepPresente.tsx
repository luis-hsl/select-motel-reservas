import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'

const GOLD_BORDER = 'rgba(180,140,40,0.5)'
const GOLD_RING   = 'rgba(200,160,50,0.35)'
const GOLD_GLOW   = 'rgba(160,120,30,0.35)'
const GOLD_GRAD   = 'linear-gradient(180deg,#f5e0a0 0%,#d4a017 45%,#8b6010 100%)'

export default function StepPresente() {
  const { nextStep, prevStep } = useStore()
  const [phase, setPhase]         = useState<'closed' | 'opening' | 'open'>('closed')
  const [photoUrl, setPhotoUrl]   = useState<string | null>(null)
  const [itemName, setItemName]   = useState('Fondue de Chocolate')
  const [resgatado, setResgatado] = useState(false)
  const ctaRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    supabase.from('settings')
      .select('key, value')
      .in('key', ['fundir_photo_url', 'fundir_name'])
      .then(({ data }) => {
        data?.forEach(r => {
          if (r.key === 'fundir_photo_url' && r.value) setPhotoUrl(r.value)
          if (r.key === 'fundir_name' && r.value) setItemName(r.value)
        })
      })
  }, [])

  useEffect(() => {
    if (!resgatado) return
    requestAnimationFrame(() => {
      ctaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [resgatado])

  function handleOpen() {
    if (phase !== 'closed') return
    setPhase('opening')
    setTimeout(() => setPhase('open'), 950)
  }

  const lidOpen = phase === 'opening' || phase === 'open'

  return (
    <div>
      <button
        onClick={prevStep}
        className="flex items-center gap-1 text-gold-700/60 text-sm mb-8 hover:text-gold-500 transition-colors"
      >
        <span>←</span> Voltar
      </button>

      {phase !== 'open' ? (
        /* ── Caixa fechada ── */
        <div className="flex flex-col items-center gap-10 py-4">
          <div className="text-center space-y-1 w-full">
            <p className="text-[9px] tracking-[0.55em] uppercase" style={{ color: 'rgba(201,168,76,0.45)' }}>
              incluído na sua experiência
            </p>
            <h1 className="font-serif text-3xl sm:text-4xl font-light leading-tight" style={{ color: 'rgba(245,216,122,0.88)' }}>
              Um presente<br />
              <em className="not-italic font-semibold" style={{
                backgroundImage: 'linear-gradient(135deg,#f5e0a0,#d4a017,#8b6010)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>especial para você</em>
            </h1>
          </div>

          {/* 3D Box */}
          <button
            onClick={handleOpen}
            disabled={phase === 'opening'}
            className="focus:outline-none"
            style={{ perspective: '900px', perspectiveOrigin: '50% 40%' }}
            aria-label="Abrir presente"
          >
            <div style={{ position: 'relative', width: 170, transformStyle: 'preserve-3d' }}>
              {/* Lid */}
              <div style={{
                width: 170, height: 52, position: 'relative', zIndex: 3,
                transformOrigin: 'top center',
                transform: lidOpen ? 'rotateX(-165deg)' : 'rotateX(0deg)',
                transition: 'transform 0.85s cubic-bezier(0.22, 1, 0.36, 1)',
              }}>
                <div style={{
                  position: 'absolute', inset: 0,
                  borderRadius: '10px 10px 3px 3px',
                  background: 'linear-gradient(160deg, #3d2508 0%, #5c3810 40%, #2d1a04 100%)',
                  border: '1px solid rgba(201,168,76,0.65)',
                  borderBottom: '1px solid rgba(201,168,76,0.25)',
                  boxShadow: lidOpen ? 'none' : '0 6px 20px rgba(0,0,0,0.6)',
                }} />
                <div style={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: '50%', transform: 'translateX(-50%)', width: 18,
                  background: 'linear-gradient(180deg, rgba(245,216,122,0.35) 0%, rgba(201,168,76,0.25) 100%)',
                }} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ position: 'relative', width: 52, height: 34 }}>
                    <div style={{
                      position: 'absolute', left: 0, top: 2, width: 22, height: 22,
                      borderRadius: '50%', border: '2.5px solid #c9a84c',
                      transform: 'rotate(-28deg)', transformOrigin: 'bottom right',
                    }} />
                    <div style={{
                      position: 'absolute', right: 0, top: 2, width: 22, height: 22,
                      borderRadius: '50%', border: '2.5px solid #c9a84c',
                      transform: 'rotate(28deg)', transformOrigin: 'bottom left',
                    }} />
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 2 }}>
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'linear-gradient(135deg,#f5d87a,#c9a84c)', boxShadow: '0 0 6px rgba(245,216,122,0.5)' }} />
                    </div>
                  </div>
                </div>
                <div style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', background: 'linear-gradient(to bottom, #120800, #0a0400)', transform: 'translateZ(-1px)' }} />
              </div>

              {/* Box body */}
              <div style={{
                width: 170, height: 165,
                borderRadius: '3px 3px 14px 14px',
                background: 'linear-gradient(160deg, #1c0f02 0%, #150c01 60%, #1c0f02 100%)',
                border: '1px solid rgba(201,168,76,0.45)', borderTop: 'none',
                position: 'relative', overflow: 'hidden',
                boxShadow: '6px 6px 0 rgba(0,0,0,0.35), 0 24px 70px rgba(0,0,0,0.9), inset 0 0 50px rgba(0,0,0,0.4)',
              }}>
                <div style={{ position: 'absolute', top: '48%', left: 0, right: 0, height: 18, background: 'linear-gradient(90deg, transparent 0%, rgba(201,168,76,0.28) 10%, rgba(245,216,122,0.38) 50%, rgba(201,168,76,0.28) 90%, transparent 100%)' }} />
                <div style={{ position: 'absolute', inset: '0 auto 0 50%', transform: 'translateX(-50%)', width: 18, background: 'linear-gradient(180deg, rgba(245,216,122,0.3) 0%, rgba(201,168,76,0.2) 100%)' }} />
                <div style={{ position: 'absolute', top: 0, right: -6, bottom: 6, width: 6, background: 'linear-gradient(90deg,rgba(0,0,0,0.2),rgba(0,0,0,0.5))', borderRadius: '0 4px 4px 0' }} />
                <div style={{ position: 'absolute', bottom: -6, left: 6, right: 0, height: 6, background: 'linear-gradient(180deg,rgba(0,0,0,0.3),rgba(0,0,0,0.6))', borderRadius: '0 0 4px 4px' }} />
              </div>
            </div>
          </button>

          <p style={{
            fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase',
            color: 'rgba(201,168,76,0.38)',
            opacity: phase === 'opening' ? 0 : 1,
            transition: 'opacity 0.3s',
          }}>
            toque para abrir
          </p>
        </div>
      ) : (
        /* ── Revelado: card estilo seleção ── */
        <div style={{ animation: 'presReveal 0.55s cubic-bezier(0.34,1.56,0.64,1) both' }}>
          <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-light mb-2 leading-tight">
            Você ganhou um<br />
            <span className="gold-gradient font-semibold italic">fondue especial</span>
          </h1>
          <p className="text-gold-700/70 text-sm mb-8 sm:mb-10">
            Uma surpresa exclusiva do seu Dia dos Namorados no Select.
          </p>

          {/* Card selecionável */}
          <div className="max-w-xs">
            <button
              onClick={() => setResgatado(true)}
              className="relative w-full text-left rounded-2xl overflow-hidden outline-none transition-all duration-300 active:scale-[0.98]"
              style={{
                border: `1px solid ${resgatado ? 'rgba(200,160,50,0.85)' : GOLD_BORDER}`,
                boxShadow: resgatado
                  ? `0 0 0 2px ${GOLD_RING}, 0 4px 40px ${GOLD_GLOW}, inset 0 0 40px rgba(0,0,0,0.3)`
                  : `inset 0 0 40px rgba(0,0,0,0.5)`,
                minHeight: 280,
              }}
            >
              {/* Imagem de fundo */}
              {photoUrl ? (
                <div className="absolute inset-0">
                  <img src={photoUrl} alt={itemName} className="w-full h-full object-cover" draggable={false} />
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.15) 55%, rgba(0,0,0,0) 100%)' }} />
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#2d1a04,#1a0f02)' }}>
                  <span className="text-6xl">🎁</span>
                </div>
              )}

              {/* Checkmark ao resgatar */}
              {resgatado && (
                <div
                  className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center z-10"
                  style={{ background: '#c9a84c', boxShadow: `0 0 12px ${GOLD_GLOW}` }}
                >
                  <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 12 12">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}

              {/* Label inferior */}
              <div className="relative z-10 flex flex-col justify-end p-4" style={{ minHeight: 280 }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-px w-6" style={{ background: '#c9a84c', boxShadow: '0 0 6px #c9a84c' }} />
                </div>
                <h2
                  className="font-serif font-bold tracking-widest text-transparent bg-clip-text leading-none"
                  style={{ fontSize: 'clamp(0.95rem,3vw,1.25rem)', backgroundImage: GOLD_GRAD }}
                >
                  {resgatado ? 'PRESENTE RESGATADO' : itemName.toUpperCase()}
                </h2>
              </div>
            </button>
          </div>

          {/* Botão CTA */}
          <div className="mt-6">
            <button
              ref={ctaRef}
              onClick={() => { if (resgatado) nextStep() }}
              disabled={!resgatado}
              className={[
                'flex items-center gap-2 px-8 py-3.5 rounded-lg text-sm font-semibold transition-all duration-200',
                resgatado
                  ? 'bg-gradient-to-r from-gold-700 to-gold-500 text-black hover:from-gold-600 hover:to-gold-400'
                  : 'bg-gold-900/20 text-gold-800/40 cursor-not-allowed',
              ].join(' ')}
            >
              {resgatado ? 'Resgatar meu fondue →' : 'Clique no presente para resgatar'}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes presReveal {
          from { opacity:0; transform:scale(0.88) translateY(22px); }
          to   { opacity:1; transform:scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}
