import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'

const GOLD_BORDER = 'rgba(180,140,40,0.5)'
const GOLD_RING   = 'rgba(200,160,50,0.35)'
const GOLD_GLOW   = 'rgba(160,120,30,0.35)'
const GOLD_GRAD   = 'linear-gradient(180deg,#f5e0a0 0%,#d4a017 45%,#8b6010 100%)'

export default function StepPresente() {
  const { nextStep, prevStep } = useStore()
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

  return (
    <div>
      <button
        onClick={prevStep}
        className="flex items-center gap-1 text-gold-700/60 text-sm mb-8 hover:text-gold-500 transition-colors"
      >
        <span>←</span> Voltar
      </button>

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
            minHeight: 300,
          }}
        >
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

          <div className="relative z-10 flex flex-col justify-end p-4" style={{ minHeight: 300 }}>
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
  )
}
