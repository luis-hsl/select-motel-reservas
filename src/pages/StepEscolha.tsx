import { useStore } from '../store/useStore'
import type { ReservationMode } from '../types'

const OPTIONS: Array<{
  id:        ReservationMode
  label:     string
  tagline:   string
  hook:      string
  bullets:   string[]
  badge?:    string
  gradient:  string
  accent:    string
}> = [
  {
    id:       'package',
    label:    'PACOTE',
    tagline:  'Tudo pronto, melhor preço',
    hook:     'Você escolhe Bronze, Prata ou Ouro — já vem com tudo combinado.',
    bullets: [
      'Suíte + decoração + refeição + bebida',
      'Preço fechado e mais vantajoso',
      'Pronto em poucos cliques',
    ],
    badge:    'Mais escolhido',
    gradient: 'linear-gradient(135deg, rgba(232,192,96,0.10) 0%, rgba(200,160,53,0.18) 100%)',
    accent:   '#e8c060',
  },
  {
    id:       'experience',
    label:    'EXPERIÊNCIA',
    tagline:  'Monte do seu jeito',
    hook:     'Escolha cada detalhe — a suíte e os itens que combinam com vocês.',
    bullets: [
      'Selecione comidas, bebidas e extras à parte',
      'Personalização total',
      'Pague só o que escolher',
    ],
    gradient: 'linear-gradient(135deg, rgba(160,100,40,0.12) 0%, rgba(120,70,20,0.18) 100%)',
    accent:   '#d4a020',
  },
]

export default function StepEscolha() {
  const { setMode, nextStep } = useStore()

  function pick(mode: ReservationMode) {
    setMode(mode)
    // Modo experiência pula a step de Pacote (vai direto pra Tipo).
    // Esse "pulo" é gerenciado em App.tsx que troca o STEPS dict por mode.
    setTimeout(nextStep, 250)
  }

  return (
    <div>
      <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-light mb-2 leading-tight">
        Como você quer<br />
        <span className="gold-gradient font-semibold italic pr-1">reservar?</span>
      </h1>
      <p className="text-gold-700/70 text-sm mb-6 sm:mb-8">
        Escolha um dos nossos pacotes ou monte sua própria experiência.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl">
        {OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => pick(opt.id)}
            className="group relative text-left rounded-2xl overflow-hidden border border-gold-800/40 outline-none transition-all duration-300 active:scale-[0.98] hover:border-gold-600/60"
            style={{
              background: opt.gradient,
              minHeight: '260px',
              boxShadow: 'inset 0 0 60px rgba(0,0,0,0.5)',
            }}
          >
            {opt.badge && (
              <div className="absolute top-0 left-0 right-0 flex justify-center z-10">
                <span
                  className="text-[9px] tracking-[0.3em] uppercase font-semibold px-4 py-1 rounded-b-xl text-black"
                  style={{ background: opt.accent }}
                >
                  {opt.badge}
                </span>
              </div>
            )}

            <div className="flex flex-col h-full justify-between p-6 sm:p-7" style={{ minHeight: '260px' }}>
              <div>
                <p className="text-[10px] tracking-[0.4em] uppercase mb-3" style={{ color: opt.accent }}>
                  {opt.tagline}
                </p>
                <h2
                  className="font-serif font-bold tracking-widest mb-3 text-transparent bg-clip-text leading-none"
                  style={{
                    fontSize: 'clamp(2rem, 5vw, 2.6rem)',
                    backgroundImage: `linear-gradient(180deg, ${opt.accent} 0%, #8a6010 100%)`,
                  }}
                >
                  {opt.label}
                </h2>
                <p className="text-sm text-gold-300/70 leading-relaxed">{opt.hook}</p>
              </div>

              <ul className="mt-5 space-y-1.5">
                {opt.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-xs text-gold-300/70">
                    <span className="shrink-0 mt-0.5 text-[10px]" style={{ color: opt.accent }}>✦</span>
                    {b}
                  </li>
                ))}
              </ul>

              <div className="mt-5 flex items-center justify-between text-[11px] tracking-widest uppercase">
                <span className="text-gold-700/60">Toque pra continuar</span>
                <span className="transition-transform group-hover:translate-x-1" style={{ color: opt.accent }}>→</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
