import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'

export default function StepPresente() {
  const { nextStep } = useStore()
  const [phase, setPhase] = useState<'closed' | 'shaking' | 'open'>('closed')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [itemName, setItemName] = useState('Surpresa Especial')

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
    setPhase('shaking')
    setTimeout(() => setPhase('open'), 700)
  }

  return (
    <div className="flex flex-col items-center text-center">
      <p className="text-[10px] tracking-[0.45em] uppercase mb-3" style={{ color: 'rgba(220,185,100,0.55)' }}>
        É de nós para você
      </p>
      <h1 className="font-serif text-3xl sm:text-4xl font-light mb-2 leading-tight">
        Você tem um<br />
        <span className="gold-gradient font-semibold italic">presente especial!</span>
      </h1>

      {phase !== 'open' ? (
        /* ── Caixa fechada ── */
        <div className="mt-8 flex flex-col items-center gap-6">
          <button
            onClick={handleOpen}
            disabled={phase === 'shaking'}
            className="relative flex flex-col items-center focus:outline-none"
            style={{ animation: phase === 'shaking' ? 'giftShake 0.12s ease-in-out 5' : undefined }}
          >
            {/* Bow */}
            <div className="relative w-20 h-12 flex items-end justify-center mb-0 z-10">
              <div className="relative w-20 h-12">
                <div className="absolute left-1 top-0 w-8 h-10 rounded-full"
                  style={{ border: '4px solid #c9a84c', transform: 'rotate(-25deg)', transformOrigin: 'bottom right' }} />
                <div className="absolute right-1 top-0 w-8 h-10 rounded-full"
                  style={{ border: '4px solid #c9a84c', transform: 'rotate(25deg)', transformOrigin: 'bottom left' }} />
                <div className="absolute inset-x-0 bottom-0 flex justify-center">
                  <div className="w-5 h-5 rounded-full" style={{ background: 'linear-gradient(135deg,#f5d87a,#c9a84c)' }} />
                </div>
              </div>
            </div>

            {/* Lid */}
            <div className="w-52 h-10 rounded-t-xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #3d2508, #5a3510)',
                border: '2px solid rgba(201,168,76,0.7)',
                borderBottom: 'none',
              }}
            >
              <div className="h-full w-7" style={{ background: 'linear-gradient(180deg, rgba(201,168,76,0.6), rgba(245,216,122,0.4))' }} />
            </div>

            {/* Box body */}
            <div className="w-52 h-44 rounded-b-xl relative overflow-hidden"
              style={{
                background: 'linear-gradient(160deg, #2d1a04 0%, #1a0f02 40%, #3d2508 100%)',
                border: '2px solid rgba(201,168,76,0.55)',
                borderTop: 'none',
                boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 40px rgba(201,168,76,0.15)',
              }}
            >
              {/* Horizontal ribbon */}
              <div className="absolute inset-x-0 top-[42%] h-7"
                style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(201,168,76,0.5) 10%, rgba(245,216,122,0.6) 50%, rgba(201,168,76,0.5) 90%, transparent 100%)' }} />
              {/* Vertical ribbon */}
              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-7"
                style={{ background: 'linear-gradient(180deg, rgba(245,216,122,0.5) 0%, rgba(201,168,76,0.4) 50%, rgba(245,216,122,0.5) 100%)' }} />
              {/* Inner glow */}
              <div className="absolute inset-0 rounded-b-xl"
                style={{ boxShadow: 'inset 0 0 40px rgba(0,0,0,0.5)' }} />
            </div>

            {/* Outer glow ring */}
            <div className="absolute inset-0 rounded-xl pointer-events-none"
              style={{ boxShadow: '0 0 30px rgba(201,168,76,0.2)', animation: 'giftPulse 2s ease-in-out infinite' }} />
          </button>

          <div className="flex flex-col items-center gap-1.5">
            <p className="text-sm" style={{ color: 'rgba(220,185,100,0.7)' }}>
              {phase === 'shaking' ? '✨ Abrindo...' : 'Toque para abrir'}
            </p>
            {phase === 'closed' && (
              <div className="w-1.5 h-1.5 rounded-full bg-gold-500/50 animate-bounce" />
            )}
          </div>
        </div>
      ) : (
        /* ── Presente revelado ── */
        <div
          className="mt-6 flex flex-col items-center gap-5 w-full max-w-sm"
          style={{ animation: 'giftReveal 0.5s ease-out both' }}
        >
          {/* Confetti text */}
          <p className="text-lg font-serif" style={{ color: 'rgba(245,216,122,0.9)' }}>
            🎉 Parabéns! Você ganhou!
          </p>

          {/* Photo */}
          {photoUrl ? (
            <div className="w-full rounded-2xl overflow-hidden"
              style={{ border: '1px solid rgba(201,168,76,0.4)', boxShadow: '0 0 40px rgba(201,168,76,0.2)' }}>
              <img src={photoUrl} alt={itemName} className="w-full block" />
            </div>
          ) : (
            <div className="w-40 h-40 rounded-2xl flex items-center justify-center text-7xl"
              style={{ background: 'linear-gradient(135deg,#2d1a04,#1a0f02)', border: '1px solid rgba(201,168,76,0.3)' }}>
              🎁
            </div>
          )}

          {/* Item info */}
          <div>
            <p className="font-serif text-2xl font-semibold text-transparent bg-clip-text"
              style={{ backgroundImage: 'linear-gradient(135deg, #f5e0a0, #d4a017, #8b6010)' }}>
              {itemName}
            </p>
            <p className="text-sm mt-1" style={{ color: 'rgba(201,168,76,0.55)' }}>
              Incluído na sua experiência ❤️
            </p>
          </div>

          {/* Divider */}
          <div className="w-full h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(201,168,76,0.3), transparent)' }} />

          {/* CTA */}
          <button
            onClick={nextStep}
            className="w-full py-4 rounded-xl font-semibold text-sm tracking-wider text-black transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg,#c9a84c,#f5d87a,#a07820)' }}
          >
            Continuar →
          </button>
        </div>
      )}

      <style>{`
        @keyframes giftShake {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-6deg); }
          75% { transform: rotate(6deg); }
        }
        @keyframes giftPulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes giftReveal {
          from { opacity: 0; transform: scale(0.85) translateY(16px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}
