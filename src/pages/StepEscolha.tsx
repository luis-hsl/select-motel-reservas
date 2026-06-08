import { useState } from 'react'
import { useStore } from '../store/useStore'
import type { ReservationMode } from '../types'

type Option = {
  id:          ReservationMode
  numeral:     string
  label:       string
  whisper:     string
  desc:        string
  bullets:     string[]
  recommended?: boolean
}

const OPTIONS: Option[] = [
  {
    id:          'package',
    numeral:     'I',
    label:       'pacote',
    whisper:     'experiência completa',
    desc:        'Tudo incluso, sem escolher peça a peça.',
    bullets:     ['Gastronomia', 'Bebida', 'Fondue', 'Decoração'],
    recommended: true,
  },
  {
    id:      'experience',
    numeral: 'II',
    label:   'monte sua experiência',
    whisper: 'do seu jeito',
    desc:    'Você decide o que entra. Pode ser só a suíte decorada — ou adicionar fondue, bebida e refeição conforme quiser.',
    bullets:  [],
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
      {/* Ornamento de topo */}
      <div className="flex items-center gap-3 mb-6 sm:mb-8">
        <span className="block h-px flex-1 bg-gradient-to-r from-transparent via-gold-700/40 to-gold-700/40" />
        <span className="text-[9px] tracking-[0.5em] uppercase text-gold-600/60">Reserva</span>
        <span className="block h-px flex-1 bg-gradient-to-l from-transparent via-gold-700/40 to-gold-700/40" />
      </div>

      {/* Título */}
      <h1 className="text-center mb-1 leading-none">
        <span className="block font-serif italic font-light text-gold-200/90"
              style={{ fontSize: 'clamp(2.4rem, 7vw, 3.6rem)', letterSpacing: '-0.02em' }}>
          como você
        </span>
        <span className="block font-serif italic gold-gradient"
              style={{ fontSize: 'clamp(2.4rem, 7vw, 3.6rem)', letterSpacing: '-0.02em' }}>
          prefere reservar?
        </span>
      </h1>

      <p className="text-center text-[10px] tracking-[0.4em] uppercase text-gold-700/50 mt-4 mb-7 sm:mb-10">
        — duas formas de viver a noite —
      </p>

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

      {/* Botão continuar */}
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
            ? <>Continuar com {picked === 'package' ? 'pacote' : 'experiência'} <span>→</span></>
            : 'Escolha uma opção acima'}
        </button>
      </div>
    </div>
  )
}

function OptionCard({ opt, selected, onPick }: { opt: Option; selected: boolean; onPick: () => void }) {
  const recommended = !!opt.recommended

  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className={[
        'group relative overflow-hidden rounded-xl border outline-none text-left',
        'transition-all duration-500 active:scale-[0.97] focus-visible:ring-1 focus-visible:ring-gold-500',
        selected
          ? 'border-gold-400 shadow-lg shadow-gold-500/25'
          : recommended
            ? 'border-gold-600/60 hover:border-gold-400'
            : 'border-gold-900/50 hover:border-gold-700/80',
      ].join(' ')}
      style={{
        background: recommended
          ? 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.16) 0%, transparent 65%), linear-gradient(180deg, #0d0a05 0%, #060403 100%)'
          : 'radial-gradient(ellipse at 50% 0%, rgba(154,125,10,0.10) 0%, transparent 65%), linear-gradient(180deg, #0a0805 0%, #050302 100%)',
        boxShadow: selected
          ? `0 0 0 2px rgba(200,160,50,0.35), 0 4px 30px rgba(201,168,76,0.18), inset 0 1px 0 rgba(252,211,77,0.12)`
          : recommended
            ? 'inset 0 1px 0 rgba(252,211,77,0.10), 0 1px 30px rgba(201,168,76,0.07)'
            : 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      {/* Borda superior cintilante */}
      <span
        aria-hidden
        className="absolute top-0 left-1/2 -translate-x-1/2 h-px"
        style={{
          width: recommended ? '70%' : '50%',
          background: recommended
            ? 'linear-gradient(90deg, transparent, #fcd34d, transparent)'
            : 'linear-gradient(90deg, transparent, rgba(201,168,76,0.5), transparent)',
        }}
      />

      {/* Dingbat recomendado */}
      {recommended && (
        <span
          aria-hidden
          className="absolute top-2.5 right-2.5 text-gold-400 text-[11px] leading-none animate-pulse"
          style={{ animationDuration: '3.5s' }}
        >
          ✦
        </span>
      )}

      {/* Checkmark quando selecionado */}
      {selected && (
        <span className="absolute top-2.5 left-2.5 w-4 h-4 rounded-full flex items-center justify-center z-10"
              style={{ background: '#c9a84c' }}>
          <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 12 12">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}

      {/* Conteúdo */}
      <div className="relative flex flex-col items-center text-center h-full px-3 py-5 sm:py-7">
        {/* Numeral romano */}
        <span
          className="block font-serif font-light leading-none mb-1.5"
          style={{
            fontSize: 'clamp(0.85rem, 2vw, 1rem)',
            color: recommended ? 'rgba(252,211,77,0.65)' : 'rgba(184,150,12,0.55)',
            letterSpacing: '0.15em',
          }}
        >
          {opt.numeral}.
        </span>

        {/* Divisor */}
        <span
          aria-hidden
          className="block h-px w-6 mb-3"
          style={{
            background: recommended
              ? 'linear-gradient(90deg, transparent, rgba(252,211,77,0.6), transparent)'
              : 'linear-gradient(90deg, transparent, rgba(154,125,10,0.5), transparent)',
          }}
        />

        {/* Label principal */}
        <h2
          className={['font-serif italic mb-2', recommended ? 'gold-gradient' : 'text-gold-300/85'].join(' ')}
          style={{
            fontSize: 'clamp(1.05rem, 3.8vw, 2.2rem)',
            letterSpacing: '-0.02em',
            fontWeight: 400,
            lineHeight: '1.05',
          }}
        >
          {opt.label}<span className="opacity-60">.</span>
        </h2>

        {/* Whisper */}
        <span
          className="text-[9px] sm:text-[10px] tracking-[0.4em] uppercase mb-3"
          style={{ color: recommended ? 'rgba(252,211,77,0.75)' : 'rgba(184,150,12,0.55)' }}
        >
          {opt.whisper}
        </span>

        {/* Descrição — visível em todos os tamanhos */}
        <p className="text-[10px] sm:text-[11px] leading-relaxed max-w-[20ch]"
           style={{ color: recommended ? 'rgba(220,185,110,0.65)' : 'rgba(180,150,80,0.55)' }}>
          {opt.desc}
        </p>

        {/* Bullets do pacote (Ouro/Prata/Bronze lista de inclusos) */}
        {opt.bullets.length > 0 && (
          <div className="flex flex-wrap justify-center gap-x-2 gap-y-1 mt-3">
            {opt.bullets.map(b => (
              <span key={b}
                    className="text-[9px] tracking-wide uppercase"
                    style={{ color: 'rgba(201,168,76,0.5)' }}>
                · {b}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Glow inferior */}
      <span
        aria-hidden
        className="absolute -bottom-12 left-1/2 -translate-x-1/2 w-3/4 h-12 blur-2xl"
        style={{ background: recommended ? 'rgba(201,168,76,0.35)' : 'rgba(154,125,10,0.18)' }}
      />
    </button>
  )
}
