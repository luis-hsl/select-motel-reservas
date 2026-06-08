import { useState } from 'react'
import { useStore } from '../store/useStore'
import type { ReservationMode } from '../types'

type Option = {
  id:          ReservationMode
  label:       string
  sublabel:    string
  desc:        string
  bullets?:    string[]
  recommended?: boolean
}

const OPTIONS: Option[] = [
  {
    id:          'package',
    label:       'pacote',
    sublabel:    'experiência completa',
    desc:        'Tudo incluso num único pacote.',
    bullets:     ['Gastronomia', 'Bebida', 'Fondue', 'Decoração'],
    recommended: true,
  },
  {
    id:      'experience',
    label:   'monte sua\nexperiência',
    sublabel: 'do seu jeito',
    desc:    'Só a suíte decorada, ou adicione fondue, bebida e refeição como quiser.',
  },
]

export default function StepEscolha() {
  const { mode: storedMode, setMode, nextStep } = useStore()
  const [picked, setPicked] = useState<ReservationMode | null>(storedMode)

  function pick(mode: ReservationMode) {
    setPicked(mode)
  }

  function advance() {
    if (!picked) return
    setMode(picked)
    setTimeout(nextStep, 200)
  }

  return (
    <div className="relative">
      {/* Título */}
      <div className="text-center mb-8 sm:mb-12">
        <h1 className="leading-none mb-3">
          <span className="block font-serif italic font-light text-gold-200/90"
                style={{ fontSize: 'clamp(2.2rem, 6.5vw, 3.4rem)', letterSpacing: '-0.02em' }}>
            como você
          </span>
          <span className="block font-serif italic gold-gradient"
                style={{ fontSize: 'clamp(2.2rem, 6.5vw, 3.4rem)', letterSpacing: '-0.02em' }}>
            prefere reservar?
          </span>
        </h1>
        <p className="text-[10px] tracking-[0.45em] uppercase text-gold-700/45 mt-4">
          duas formas de viver a noite
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-5 max-w-3xl mx-auto">
        {OPTIONS.map((opt) => (
          <OptionCard
            key={opt.id}
            opt={opt}
            selected={picked === opt.id}
            onPick={() => pick(opt.id)}
          />
        ))}
      </div>

      {/* CTA */}
      <div className="max-w-3xl mx-auto mt-6 sm:mt-8">
        <button
          onClick={advance}
          disabled={!picked}
          className={[
            'w-full px-6 py-3.5 rounded-xl text-sm font-semibold transition-all duration-300',
            picked
              ? 'bg-gradient-to-r from-gold-700 to-gold-500 text-black hover:from-gold-600 hover:to-gold-400 active:scale-[0.98]'
              : 'bg-gold-900/20 text-gold-800/40 cursor-not-allowed',
          ].join(' ')}
        >
          {picked
            ? <>Continuar com {picked === 'package' ? 'pacote' : 'experiência'} →</>
            : 'Escolha uma opção'}
        </button>
      </div>
    </div>
  )
}

function OptionCard({ opt, selected, onPick }: { opt: Option; selected: boolean; onPick: () => void }) {
  const rec = !!opt.recommended

  /* ── Camadas de gradiente para o efeito 3D/iluminação ── */
  const bgBase = rec
    ? [
        'radial-gradient(ellipse at 50% -10%, rgba(252,211,77,0.22) 0%, transparent 55%)',
        'radial-gradient(ellipse at 80% 90%, rgba(201,168,76,0.10) 0%, transparent 50%)',
        'radial-gradient(ellipse at 20% 80%, rgba(160,120,30,0.08) 0%, transparent 45%)',
        'linear-gradient(180deg, #100c04 0%, #060402 100%)',
      ].join(', ')
    : [
        'radial-gradient(ellipse at 50% -10%, rgba(184,150,40,0.14) 0%, transparent 55%)',
        'radial-gradient(ellipse at 75% 85%, rgba(140,110,20,0.07) 0%, transparent 45%)',
        'linear-gradient(180deg, #0b0805 0%, #040302 100%)',
      ].join(', ')

  const borderColor = selected
    ? 'rgba(220,175,60,0.9)'
    : rec
      ? 'rgba(201,168,76,0.45)'
      : 'rgba(140,110,20,0.35)'

  const boxShadow = selected
    ? [
        `0 0 0 1.5px ${rec ? 'rgba(252,211,77,0.5)' : 'rgba(180,145,40,0.45)'}`,
        `0 0 40px ${rec ? 'rgba(201,168,76,0.22)' : 'rgba(140,110,20,0.18)'}`,
        'inset 0 0 60px rgba(0,0,0,0.55)',
        `inset 0 1px 0 ${rec ? 'rgba(252,211,77,0.20)' : 'rgba(201,168,76,0.12)'}`,
      ].join(', ')
    : [
        'inset 0 0 50px rgba(0,0,0,0.6)',
        `inset 0 1px 0 ${rec ? 'rgba(252,211,77,0.10)' : 'rgba(180,150,40,0.06)'}`,
        `0 2px 20px rgba(0,0,0,0.4)`,
      ].join(', ')

  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className="relative overflow-hidden rounded-2xl outline-none text-center transition-all duration-500 active:scale-[0.97] focus-visible:ring-1 focus-visible:ring-gold-500"
      style={{
        background:   bgBase,
        border:       `1px solid ${borderColor}`,
        boxShadow,
        minHeight:    '220px',
        transform:    selected ? 'translateY(-2px)' : 'translateY(0)',
      }}
    >
      {/* Feixe de luz vindo do topo */}
      <span
        aria-hidden
        className="absolute top-0 left-1/2 -translate-x-1/2 pointer-events-none"
        style={{
          width:   rec ? '55%' : '40%',
          height:  '140px',
          background: rec
            ? 'linear-gradient(to bottom, rgba(252,211,77,0.18) 0%, transparent 100%)'
            : 'linear-gradient(to bottom, rgba(201,168,76,0.10) 0%, transparent 100%)',
          filter:  'blur(18px)',
        }}
      />

      {/* Linha de luz no topo */}
      <span
        aria-hidden
        className="absolute top-0 left-1/2 -translate-x-1/2 h-px"
        style={{
          width: rec ? '75%' : '55%',
          background: rec
            ? 'linear-gradient(90deg, transparent, rgba(252,211,77,0.9), transparent)'
            : 'linear-gradient(90deg, transparent, rgba(201,168,76,0.6), transparent)',
        }}
      />

      {/* Glow inferior */}
      <span
        aria-hidden
        className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
        style={{
          background: rec
            ? 'linear-gradient(to top, rgba(201,168,76,0.07) 0%, transparent 100%)'
            : 'linear-gradient(to top, rgba(140,110,20,0.05) 0%, transparent 100%)',
        }}
      />

      {/* Checkmark quando selecionado */}
      {selected && (
        <span
          className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center z-10"
          style={{ background: rec ? '#c9a84c' : '#9a7828', boxShadow: '0 0 10px rgba(201,168,76,0.5)' }}
        >
          <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 12 12">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}

      {/* Conteúdo central */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full px-4 py-6 sm:py-8" style={{ minHeight: '220px' }}>

        {/* Divisor luminoso */}
        <span
          aria-hidden
          className="block h-px mb-4"
          style={{
            width: '2rem',
            background: rec
              ? 'linear-gradient(90deg, transparent, rgba(252,211,77,0.7), transparent)'
              : 'linear-gradient(90deg, transparent, rgba(184,150,12,0.55), transparent)',
            boxShadow: rec ? '0 0 6px rgba(252,211,77,0.4)' : '0 0 4px rgba(184,150,12,0.3)',
          }}
        />

        {/* Label principal */}
        <h2
          className={['font-serif italic whitespace-pre-line mb-2', rec ? 'gold-gradient' : 'text-gold-300/80'].join(' ')}
          style={{
            fontSize:      'clamp(1.05rem, 3.5vw, 2rem)',
            letterSpacing: '-0.01em',
            fontWeight:    400,
            lineHeight:    '1.1',
          }}
        >
          {opt.label}
        </h2>

        {/* Sublabel */}
        <span
          className="block text-[9px] sm:text-[10px] tracking-[0.4em] uppercase mb-3"
          style={{ color: rec ? 'rgba(252,211,77,0.6)' : 'rgba(184,150,12,0.5)' }}
        >
          {opt.sublabel}
        </span>

        {/* Descrição */}
        <p
          className="text-[10px] sm:text-[11px] leading-relaxed"
          style={{ color: rec ? 'rgba(220,185,110,0.6)' : 'rgba(180,150,80,0.5)', maxWidth: '18ch' }}
        >
          {opt.desc}
        </p>

        {/* Bullets */}
        {opt.bullets && opt.bullets.length > 0 && (
          <div className="flex flex-wrap justify-center gap-x-1.5 gap-y-1 mt-3">
            {opt.bullets.map((b, i) => (
              <span key={b} className="text-[9px] uppercase tracking-wide"
                    style={{ color: 'rgba(201,168,76,0.45)' }}>
                {i > 0 && <span className="mr-1.5 opacity-40">·</span>}{b}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  )
}
