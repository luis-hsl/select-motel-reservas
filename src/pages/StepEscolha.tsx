import { useStore } from '../store/useStore'
import type { ReservationMode } from '../types'

/**
 * StepEscolha — direção editorial luxury (referência: revistas de hotelaria
 * tipo Cereal, Monocle). Cormorant italic dominante, dingbats discretos,
 * cards horizontais compactos no mobile (~155px de altura cada).
 */

type Option = {
  id:           ReservationMode
  numeral:      string   // 'I' / 'II' — numeral romano editorial
  label:        string   // 'pacote' (lowercase + serif italic)
  whisper:      string   // tagline curtíssima — uppercase tracking generoso
  hook:         string   // 1 linha de hook (aparece só ≥sm)
  recommended?: boolean  // pacote = recommended (em vez de badge agressivo)
}

const OPTIONS: Option[] = [
  {
    id:          'package',
    numeral:     'I',
    label:       'pacote',
    whisper:     'tudo pronto',
    hook:        'Bronze, Prata ou Ouro — combinação fechada.',
    recommended: true,
  },
  {
    id:      'experience',
    numeral: 'II',
    label:   'experiência',
    whisper: 'a la carte',
    hook:    'Selecione cada detalhe da sua noite.',
  },
]

export default function StepEscolha() {
  const { setMode, nextStep } = useStore()

  function pick(mode: ReservationMode) {
    setMode(mode)
    setTimeout(nextStep, 250)
  }

  return (
    <div className="relative">
      {/* ─── Ornamento de topo ─── */}
      <div className="flex items-center gap-3 mb-6 sm:mb-8">
        <span className="block h-px flex-1 bg-gradient-to-r from-transparent via-gold-700/40 to-gold-700/40" />
        <span className="text-[9px] tracking-[0.5em] uppercase text-gold-600/60">
          Reserva
        </span>
        <span className="block h-px flex-1 bg-gradient-to-l from-transparent via-gold-700/40 to-gold-700/40" />
      </div>

      {/* ─── Título editorial ─── */}
      <h1 className="text-center mb-1 leading-none">
        <span className="block font-serif italic font-light text-gold-200/90"
              style={{ fontSize: 'clamp(2.4rem, 7vw, 3.6rem)', letterSpacing: '-0.02em' }}>
          escolha
        </span>
        <span className="block font-serif italic gold-gradient"
              style={{ fontSize: 'clamp(2.4rem, 7vw, 3.6rem)', letterSpacing: '-0.02em' }}>
          seu caminho
        </span>
      </h1>

      <p className="text-center text-[10px] tracking-[0.4em] uppercase text-gold-700/50 mt-4 mb-7 sm:mb-10">
        — duas formas de viver a noite —
      </p>

      {/* ─── Cards (mobile: horizontais lado a lado / desktop: maiores) ─── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-5 max-w-3xl mx-auto">
        {OPTIONS.map((opt) => (
          <OptionCard key={opt.id} opt={opt} onPick={() => pick(opt.id)} />
        ))}
      </div>

      {/* ─── Rodapé sutil ─── */}
      <p className="text-center text-[10px] tracking-[0.3em] uppercase text-gold-800/40 mt-8">
        Toque em uma das opções
      </p>
    </div>
  )
}

function OptionCard({ opt, onPick }: { opt: Option; onPick: () => void }) {
  const recommended = !!opt.recommended

  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={`Escolher ${opt.label}`}
      className={[
        'group relative overflow-hidden rounded-md border outline-none',
        'transition-all duration-500 active:scale-[0.97] focus-visible:ring-1 focus-visible:ring-gold-500',
        recommended
          ? 'border-gold-600/60 hover:border-gold-400'
          : 'border-gold-900/50 hover:border-gold-700/80',
      ].join(' ')}
      style={{
        background: recommended
          // pacote: fundo levemente mais luminoso (intenção: chamar atenção sem badge)
          ? 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.16) 0%, transparent 65%), linear-gradient(180deg, #0d0a05 0%, #060403 100%)'
          : 'radial-gradient(ellipse at 50% 0%, rgba(154,125,10,0.10) 0%, transparent 65%), linear-gradient(180deg, #0a0805 0%, #050302 100%)',
        boxShadow: recommended
          ? 'inset 0 1px 0 rgba(252,211,77,0.10), 0 1px 30px rgba(201,168,76,0.07)'
          : 'inset 0 1px 0 rgba(255,255,255,0.04)',
        minHeight: '155px',
      }}
    >
      {/* Borda superior cintilante — pacote tem brilho mais forte */}
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

      {/* "Recomendado" — substitui o badge — apenas um asterisco/dingbat discreto */}
      {recommended && (
        <span
          aria-hidden
          className="absolute top-2.5 right-2.5 text-gold-400 text-[11px] leading-none animate-pulse"
          style={{ animationDuration: '3.5s' }}
        >
          ✦
        </span>
      )}

      {/* Conteúdo */}
      <div className="relative flex flex-col items-center justify-center text-center h-full px-3 py-5 sm:py-7">
        {/* Numeral romano — element editorial */}
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

        {/* Divisor fino */}
        <span
          aria-hidden
          className="block h-px w-6 mb-3"
          style={{
            background: recommended
              ? 'linear-gradient(90deg, transparent, rgba(252,211,77,0.6), transparent)'
              : 'linear-gradient(90deg, transparent, rgba(154,125,10,0.5), transparent)',
          }}
        />

        {/* Label — Cormorant italic, lowercase + ponto editorial */}
        <h2
          className={[
            'font-serif italic leading-none mb-3',
            recommended ? 'gold-gradient' : 'text-gold-300/85',
          ].join(' ')}
          style={{
            fontSize: 'clamp(1.6rem, 5.5vw, 2.5rem)',
            letterSpacing: '-0.02em',
            fontWeight: 400,
          }}
        >
          {opt.label}<span className="opacity-60">.</span>
        </h2>

        {/* Whisper — uppercase, tracking generoso */}
        <span
          className="text-[9px] sm:text-[10px] tracking-[0.4em] uppercase"
          style={{ color: recommended ? 'rgba(252,211,77,0.75)' : 'rgba(184,150,12,0.55)' }}
        >
          {opt.whisper}
        </span>

        {/* Hook só em sm+ (mobile economiza espaço) */}
        <p className="hidden sm:block mt-3 text-[11px] text-gold-300/55 leading-relaxed max-w-[18ch]">
          {opt.hook}
        </p>

        {/* Indicador "→" inferior, aparece no hover */}
        <span
          aria-hidden
          className={[
            'absolute bottom-2.5 left-1/2 -translate-x-1/2',
            'text-[10px] tracking-[0.3em] uppercase opacity-0',
            'transition-all duration-500 group-hover:opacity-100 group-active:opacity-100',
            'group-hover:translate-y-0 translate-y-1',
          ].join(' ')}
          style={{ color: recommended ? '#fcd34d' : '#C9A84C' }}
        >
          escolher →
        </span>
      </div>

      {/* Glow inferior sutil (pacote: mais visível) */}
      <span
        aria-hidden
        className="absolute -bottom-12 left-1/2 -translate-x-1/2 w-3/4 h-12 blur-2xl"
        style={{
          background: recommended ? 'rgba(201,168,76,0.35)' : 'rgba(154,125,10,0.18)',
        }}
      />
    </button>
  )
}
