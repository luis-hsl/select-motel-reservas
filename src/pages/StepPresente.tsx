import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'

export default function StepPresente() {
  const { nextStep } = useStore()
  const [phase, setPhase] = useState<'closed' | 'opening' | 'open'>('closed')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [itemName, setItemName] = useState('')

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

  function handleOpen() {
    if (phase !== 'closed') return
    setPhase('opening')
    setTimeout(() => setPhase('open'), 950)
  }

  const lidOpen = phase === 'opening' || phase === 'open'

  return (
    <div className="flex flex-col items-center justify-center py-10 min-h-[65vh]">

      {phase !== 'open' ? (
        <div className="flex flex-col items-center gap-10">

          {/* Header */}
          <div className="text-center space-y-1">
            <p className="text-[9px] tracking-[0.55em] uppercase" style={{ color: 'rgba(201,168,76,0.45)' }}>
              incluído na sua experiência
            </p>
            <h1 className="font-serif text-3xl sm:text-4xl font-light" style={{ color: 'rgba(245,216,122,0.88)' }}>
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

              {/* ── Lid ── */}
              <div style={{
                width: 170,
                height: 52,
                position: 'relative',
                zIndex: 3,
                transformOrigin: 'top center',
                transform: lidOpen ? 'rotateX(-165deg)' : 'rotateX(0deg)',
                transition: 'transform 0.85s cubic-bezier(0.22, 1, 0.36, 1)',
              }}>
                {/* Lid face */}
                <div style={{
                  position: 'absolute', inset: 0,
                  borderRadius: '10px 10px 3px 3px',
                  background: 'linear-gradient(160deg, #3d2508 0%, #5c3810 40%, #2d1a04 100%)',
                  border: '1px solid rgba(201,168,76,0.65)',
                  borderBottom: '1px solid rgba(201,168,76,0.25)',
                  boxShadow: lidOpen ? 'none' : '0 6px 20px rgba(0,0,0,0.6)',
                }} />
                {/* Lid ribbon vertical */}
                <div style={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: '50%', transform: 'translateX(-50%)', width: 18,
                  background: 'linear-gradient(180deg, rgba(245,216,122,0.35) 0%, rgba(201,168,76,0.25) 100%)',
                }} />
                {/* Bow loops */}
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
                    <div style={{
                      position: 'absolute', inset: 0, display: 'flex',
                      alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 2,
                    }}>
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'linear-gradient(135deg,#f5d87a,#c9a84c)', boxShadow: '0 0 6px rgba(245,216,122,0.5)' }} />
                    </div>
                  </div>
                </div>
                {/* Lid inner back face (3D depth) */}
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: 'inherit',
                  background: 'linear-gradient(to bottom, #120800, #0a0400)',
                  transform: 'translateZ(-1px)',
                }} />
              </div>

              {/* ── Box body ── */}
              <div style={{
                width: 170,
                height: 165,
                borderRadius: '3px 3px 14px 14px',
                background: 'linear-gradient(160deg, #1c0f02 0%, #150c01 60%, #1c0f02 100%)',
                border: '1px solid rgba(201,168,76,0.45)',
                borderTop: 'none',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: '6px 6px 0 rgba(0,0,0,0.35), 0 24px 70px rgba(0,0,0,0.9), inset 0 0 50px rgba(0,0,0,0.4)',
              }}>
                {/* Horizontal ribbon */}
                <div style={{
                  position: 'absolute', top: '48%', left: 0, right: 0, height: 18,
                  background: 'linear-gradient(90deg, transparent 0%, rgba(201,168,76,0.28) 10%, rgba(245,216,122,0.38) 50%, rgba(201,168,76,0.28) 90%, transparent 100%)',
                }} />
                {/* Vertical ribbon */}
                <div style={{
                  position: 'absolute', inset: '0 auto 0 50%',
                  transform: 'translateX(-50%)', width: 18,
                  background: 'linear-gradient(180deg, rgba(245,216,122,0.3) 0%, rgba(201,168,76,0.2) 100%)',
                }} />
                {/* 3D right side sliver */}
                <div style={{
                  position: 'absolute', top: 0, right: -6, bottom: 6, width: 6,
                  background: 'linear-gradient(90deg,rgba(0,0,0,0.2),rgba(0,0,0,0.5))',
                  borderRadius: '0 4px 4px 0',
                }} />
                {/* 3D bottom sliver */}
                <div style={{
                  position: 'absolute', bottom: -6, left: 6, right: 0, height: 6,
                  background: 'linear-gradient(180deg,rgba(0,0,0,0.3),rgba(0,0,0,0.6))',
                  borderRadius: '0 0 4px 4px',
                }} />
              </div>

            </div>
          </button>

          {/* Hint */}
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
        /* ── Revelado: só a imagem ── */
        <div
          className="flex flex-col items-center gap-5 w-full max-w-xs sm:max-w-sm"
          style={{ animation: 'presReveal 0.55s cubic-bezier(0.34,1.56,0.64,1) both' }}
        >
          {photoUrl ? (
            <div className="w-full rounded-2xl overflow-hidden" style={{
              border: '1px solid rgba(201,168,76,0.3)',
              boxShadow: '0 0 60px rgba(201,168,76,0.12), 0 24px 80px rgba(0,0,0,0.85)',
            }}>
              <img src={photoUrl} alt={itemName} className="w-full block" />
            </div>
          ) : (
            <div className="w-full aspect-square rounded-2xl flex items-center justify-center" style={{
              background: 'linear-gradient(135deg,#2d1a04,#1a0f02)',
              border: '1px solid rgba(201,168,76,0.3)',
            }}>
              <span className="text-8xl">🎁</span>
            </div>
          )}

          <button
            onClick={nextStep}
            className="w-full py-4 rounded-xl text-black transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg,#c9a84c,#f5d87a,#a07820)',
              fontSize: 12, letterSpacing: '0.3em', fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            Desfrutar
          </button>
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
