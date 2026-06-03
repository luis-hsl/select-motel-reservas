import { useStore } from '../store/useStore'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const TIPOS = [
  {
    id: 'overnight' as const,
    label: 'PERNOITE',
    subtitle: 'Uma noite inteira para criar memórias inesquecíveis.',
    detail: 'Check-in às 00h · Check-out às 12h do dia seguinte',
    // Simula LED underglow no rodapé + teto âmbar quente — referência da foto enviada
    bg: [
      'radial-gradient(ellipse at 50% 110%, rgba(210,90,10,0.75) 0%, transparent 50%)',
      'radial-gradient(ellipse at 15% 100%, rgba(190,70,8,0.55) 0%, transparent 42%)',
      'radial-gradient(ellipse at 85% 95%, rgba(170,60,6,0.5) 0%, transparent 40%)',
      'radial-gradient(ellipse at 75% 10%, rgba(90,40,5,0.25) 0%, transparent 45%)',
      'radial-gradient(ellipse at 25% 40%, rgba(60,25,3,0.2) 0%, transparent 40%)',
      '#040201',
    ].join(', '),
    border: 'rgba(200,110,25,0.55)',
    ring: 'rgba(220,130,35,0.4)',
    divider: '#b06020',
    titleColor: 'linear-gradient(180deg,#fce8b0 0%,#e8a830 50%,#a06010 100%)',
    subtitleColor: 'rgba(230,185,110,0.6)',
    detailColor: 'rgba(200,150,80,0.45)',
    priceColor: '#e8b840',
    glowBottom: 'rgba(210,90,10,0.35)',
  },
  {
    id: 'period' as const,
    label: 'PERÍODO',
    subtitle: 'Aproveite algumas horas para vocês dois.',
    detail: 'Horários: a cada 2h, das 00h às 22h',
    // Simula luz natural dourada lateral + velas — referência da foto enviada
    bg: [
      'radial-gradient(ellipse at 80% 25%, rgba(210,160,55,0.45) 0%, transparent 58%)',
      'radial-gradient(ellipse at 90% 60%, rgba(180,120,35,0.35) 0%, transparent 48%)',
      'radial-gradient(ellipse at 30% 85%, rgba(160,95,25,0.4) 0%, transparent 52%)',
      'radial-gradient(ellipse at 60% 105%, rgba(130,75,15,0.5) 0%, transparent 48%)',
      'radial-gradient(ellipse at 10% 30%, rgba(70,45,8,0.2) 0%, transparent 40%)',
      '#060503',
    ].join(', '),
    border: 'rgba(180,140,50,0.5)',
    ring: 'rgba(200,160,60,0.35)',
    divider: '#9a7828',
    titleColor: 'linear-gradient(180deg,#f8e8b0 0%,#d4a020 50%,#8a6010 100%)',
    subtitleColor: 'rgba(215,175,100,0.6)',
    detailColor: 'rgba(190,145,70,0.45)',
    priceColor: '#d8ac40',
    glowBottom: 'rgba(180,120,30,0.2)',
  },
] as const

export default function StepTipo() {
  const { package: pkg, type, setType, nextStep, prevStep } = useStore()
  if (!pkg) return null

  function choose(t: 'period' | 'overnight') {
    setType(t)
    setTimeout(nextStep, 300)
  }

  const price = (id: 'period' | 'overnight') =>
    id === 'period' ? pkg.price_period : pkg.price_overnight

  return (
    <div>
      <button
        onClick={prevStep}
        className="flex items-center gap-1 text-gold-700/60 text-sm mb-8 hover:text-gold-500 transition-colors"
      >
        <span>←</span> Voltar
      </button>

      <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-light mb-2 leading-tight">
        Período ou<br />
        <span className="gold-gradient font-semibold italic pr-1 lg:pr-3">pernoite?</span>
      </h1>
      <p className="text-gold-700/70 text-sm mb-6 sm:mb-8">
        Escolha a duração da sua experiência no{' '}
        <strong className="text-gold-500 font-medium">{pkg.label}</strong>.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl xl:max-w-4xl">
        {TIPOS.map((opt) => {
          const isSel = type === opt.id
          return (
            <button
              key={opt.id}
              onClick={() => choose(opt.id)}
              className="relative text-left rounded-2xl overflow-hidden outline-none transition-all duration-300 active:scale-[0.98]"
              style={{
                background: opt.bg,
                border: `1px solid ${opt.border}`,
                boxShadow: isSel
                  ? `0 0 0 2px ${opt.ring}, 0 0 40px ${opt.glowBottom}, inset 0 0 50px rgba(0,0,0,0.45)`
                  : `inset 0 0 50px rgba(0,0,0,0.55), 0 0 20px ${opt.glowBottom}`,
                minHeight: '280px',
              }}
            >
              {/* Bottom glow strip — simula LED underglow da foto */}
              <div
                className="absolute bottom-0 left-0 right-0 h-1 rounded-b-2xl"
                style={{
                  background: `linear-gradient(to right, transparent, ${opt.divider}90, transparent)`,
                  boxShadow: `0 0 12px 4px ${opt.divider}60`,
                }}
              />

              {/* Content — posicionado em baixo/esquerda como nas fotos */}
              <div className="flex flex-col justify-between h-full p-7 xl:p-9" style={{ minHeight: '280px' }}>

                {/* Top: price chip */}
                <div className="flex justify-end">
                  <div
                    className="rounded-xl px-3 py-1.5 text-right"
                    style={{ background: `${opt.divider}20`, border: `1px solid ${opt.divider}40` }}
                  >
                    <p className="text-[9px] tracking-widest uppercase mb-0.5" style={{ color: opt.detailColor }}>
                      {opt.id === 'period' ? 'Período' : 'Pernoite'}
                    </p>
                    <p className="font-serif text-lg font-semibold" style={{ color: opt.priceColor }}>
                      {fmt(price(opt.id))}
                    </p>
                  </div>
                </div>

                {/* Bottom: title + text */}
                <div>
                  {/* Divider line */}
                  <div className="flex items-center gap-2 mb-4">
                    <div
                      className="h-px w-6"
                      style={{ background: opt.divider, boxShadow: `0 0 6px ${opt.divider}` }}
                    />
                  </div>

                  {/* Title */}
                  <h2
                    className="font-serif font-bold tracking-widest mb-3 text-transparent bg-clip-text leading-none"
                    style={{
                      fontSize: 'clamp(2.2rem, 7vw, 2.8rem)',
                      backgroundImage: opt.titleColor,
                    }}
                  >
                    {opt.label}
                  </h2>

                  {/* Subtitle */}
                  <p
                    className="text-[11px] tracking-wider uppercase leading-relaxed mb-2"
                    style={{ color: opt.subtitleColor }}
                  >
                    {opt.subtitle}
                  </p>

                  {/* Detail */}
                  <p className="text-[10px] tracking-wide" style={{ color: opt.detailColor }}>
                    {opt.detail}
                  </p>
                </div>
              </div>

              {/* Selected ring check */}
              {isSel && (
                <div
                  className="absolute top-4 left-4 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: opt.divider }}
                >
                  <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 12 12">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
