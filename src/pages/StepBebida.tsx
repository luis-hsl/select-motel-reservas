import { useState } from 'react'
import { useStore } from '../store/useStore'

const OPCOES = [
  {
    id: 'vinho' as const,
    label: 'Vinho',
    sub: 'Tinto ou Branco',
    img: '/vinho.webp',
    accent: '#c9a84c',
    border: 'rgba(180,140,40,0.5)',
    ring: 'rgba(200,160,50,0.35)',
    glow: 'rgba(160,120,30,0.35)',
    nameCss: 'linear-gradient(180deg,#f5e0a0 0%,#d4a017 45%,#8b6010 100%)',
  },
  {
    id: 'frisante' as const,
    label: 'Frisante',
    sub: 'Espumante leve',
    img: '/frisante.webp',
    accent: '#c9a84c',
    border: 'rgba(180,140,40,0.5)',
    ring: 'rgba(200,160,50,0.35)',
    glow: 'rgba(160,120,30,0.35)',
    nameCss: 'linear-gradient(180deg,#f5e0a0 0%,#d4a017 45%,#8b6010 100%)',
  },
]

export default function StepBebida() {
  const { setDrink, nextStep, prevStep } = useStore()
  const [selected, setSelected] = useState<'vinho' | 'frisante' | null>(null)

  function confirm() {
    if (!selected) return
    setDrink(selected)
    nextStep()
  }

  return (
    <div>
      <button
        onClick={prevStep}
        className="flex items-center gap-1 text-gold-700/60 text-sm mb-8 hover:text-gold-500 transition-colors"
      >
        <span>←</span> Voltar
      </button>

      <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-light mb-2 leading-tight">
        Qual bebida<br />
        <span className="gold-gradient font-semibold italic">o casal prefere?</span>
      </h1>
      <p className="text-gold-700/70 text-sm mb-8 sm:mb-10">
        Incluída no seu pacote. Escolha a que mais combina com o clima.
      </p>

      <div className="grid grid-cols-2 gap-3 max-w-xl">
        {OPCOES.map((opt) => {
          const isSel = selected === opt.id
          return (
            <button
              key={opt.id}
              onClick={() => setSelected(opt.id)}
              className="relative text-left rounded-2xl overflow-hidden outline-none transition-all duration-300 active:scale-[0.98]"
              style={{
                border: `1px solid ${opt.border}`,
                boxShadow: isSel
                  ? `0 0 0 2px ${opt.ring}, 0 4px 40px ${opt.glow}, inset 0 0 40px rgba(0,0,0,0.3)`
                  : `inset 0 0 40px rgba(0,0,0,0.5)`,
                minHeight: '220px',
              }}
            >
              {/* Foto de fundo */}
              <div className="absolute inset-0">
                <img
                  src={opt.img}
                  alt={opt.label}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
                <div
                  className="absolute inset-0"
                  style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.05) 100%)' }}
                />
              </div>

              {/* Anel de seleção */}
              {isSel && (
                <div
                  className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center z-10"
                  style={{ background: opt.accent, boxShadow: `0 0 12px ${opt.glow}` }}
                >
                  <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 12 12">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}

              {/* Conteúdo sobre a foto */}
              <div className="relative z-10 flex flex-col justify-end h-full p-4" style={{ minHeight: '220px' }}>
                {/* Linha decorativa */}
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="h-px w-6"
                    style={{ background: opt.accent, boxShadow: `0 0 6px ${opt.accent}` }}
                  />
                </div>

                <h2
                  className="font-serif font-bold tracking-widest mb-1 text-transparent bg-clip-text leading-none"
                  style={{ fontSize: 'clamp(1.1rem,3vw,1.5rem)', backgroundImage: opt.nameCss }}
                >
                  {opt.label.toUpperCase()}
                </h2>
                <p
                  className="text-[10px] tracking-wider uppercase"
                  style={{ color: 'rgba(245,220,180,0.55)' }}
                >
                  {opt.sub}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      <div className="mt-8">
        <button
          onClick={confirm}
          disabled={!selected}
          className={[
            'flex items-center gap-2 px-8 py-3.5 rounded-lg text-sm font-semibold transition-all duration-200',
            selected
              ? 'bg-gradient-to-r from-gold-700 to-gold-500 text-black hover:from-gold-600 hover:to-gold-400'
              : 'bg-gold-900/20 text-gold-800/40 cursor-not-allowed',
          ].join(' ')}
        >
          {selected
            ? `Continuar com ${selected === 'vinho' ? 'Vinho' : 'Frisante'} →`
            : 'Escolha uma bebida para continuar'}
        </button>
      </div>
    </div>
  )
}
