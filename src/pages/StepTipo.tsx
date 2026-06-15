import { useState } from 'react'
import { useStore } from '../store/useStore'
import { SUITE_CATEGORIES } from '../data/suiteCategories'
import type { ReservationType } from '../types'

const FAQ_ITEMS = [
  {
    q: 'Quanto tempo dura o período?',
    a: 'O período tem duração de 2 horas, com check-in nos horários disponíveis. Ao reservar, você escolhe o horário de entrada e o check-out é automático.',
  },
  {
    q: 'Posso cancelar ou reagendar?',
    a: 'Sim. Cancelamentos com mais de 24h de antecedência têm reembolso integral. Entre em contato pelo WhatsApp e resolvemos sem burocracia.',
  },
  {
    q: 'Quando recebo a confirmação?',
    a: 'Imediatamente após o pagamento — você recebe uma mensagem no WhatsApp com todos os detalhes da sua reserva.',
  },
] as const

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="rounded-xl border border-gold-900/30 overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.015)' }}
    >
      <button
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className="text-sm text-gold-300/80 font-medium">{question}</span>
        <span
          className="shrink-0 text-gold-600/60 transition-transform duration-200 text-lg leading-none"
          style={{ transform: open ? 'rotate(45deg)' : 'rotate(0deg)' }}
        >
          +
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <p className="text-xs text-gold-700/60 leading-relaxed">{answer}</p>
        </div>
      )}
    </div>
  )
}

const TIPOS = [
  {
    id: 'overnight' as const,
    label: 'PERNOITE',
    subtitle: 'Uma noite inteira para criar memórias inesquecíveis.',
    notice: 'Check-in a partir das 22h',
    noticeIcon: (
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
        <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="0.9" />
        <path d="M5.5 3.2v2.5l1.6 1.1" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
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
    subtitleColor: 'rgba(230,185,110,0.55)',
    detailColor: 'rgba(200,150,80,0.5)',
    glowBottom: 'rgba(210,90,10,0.35)',
    // ─ visual do botão "Escolher" igual ao do StepPacote ─
    accentColor: '#e88840',
    badgeBg:    'linear-gradient(135deg,#b06020,#f0a850,#a06010)',
  },
  {
    id: 'period' as const,
    label: 'PERÍODO',
    subtitle: 'Algumas horas só de vocês dois.',
    notice: 'Duração de 2 horas',
    noticeIcon: (
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
        <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="0.9" />
        <path d="M5.5 3.2v2.5l1.6 1.1" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
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
    subtitleColor: 'rgba(215,175,100,0.55)',
    detailColor: 'rgba(190,145,70,0.5)',
    glowBottom: 'rgba(180,120,30,0.2)',
    // ─ visual do botão "Escolher" igual ao do StepPacote ─
    accentColor: '#d4a020',
    badgeBg:    'linear-gradient(135deg,#9a7828,#f5d87a,#8a6010)',
  },
] as const

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })
}

// ─── Suite mode: 3 durations ───────────────────────────────────────────────

const TIPOS_SUITE = [
  {
    id: 'period' as const,
    label: 'PERÍODO',
    subtitle: 'Algumas horas só de vocês dois.',
    notice: 'Duração de 2 horas',
    bg: TIPOS[1].bg,
    border: TIPOS[1].border,
    ring: TIPOS[1].ring,
    divider: TIPOS[1].divider,
    titleColor: TIPOS[1].titleColor,
    subtitleColor: TIPOS[1].subtitleColor,
    detailColor: TIPOS[1].detailColor,
    glowBottom: TIPOS[1].glowBottom,
    accentColor: TIPOS[1].accentColor,
    badgeBg: TIPOS[1].badgeBg,
    noticeIcon: TIPOS[1].noticeIcon,
  },
  {
    id: 'overnight' as const,
    label: 'PERNOITE',
    subtitle: 'Uma noite inteira para criar memórias.',
    notice: 'Check-in a partir das 22h',
    bg: TIPOS[0].bg,
    border: TIPOS[0].border,
    ring: TIPOS[0].ring,
    divider: TIPOS[0].divider,
    titleColor: TIPOS[0].titleColor,
    subtitleColor: TIPOS[0].subtitleColor,
    detailColor: TIPOS[0].detailColor,
    glowBottom: TIPOS[0].glowBottom,
    accentColor: TIPOS[0].accentColor,
    badgeBg: TIPOS[0].badgeBg,
    noticeIcon: TIPOS[0].noticeIcon,
  },
  {
    id: 'diaria' as const,
    label: 'DIÁRIA',
    subtitle: 'Aproveitem sem pressa o dia todo.',
    notice: 'Duração de 24 horas',
    bg: [
      'radial-gradient(ellipse at 70% 20%, rgba(140,60,200,0.38) 0%, transparent 55%)',
      'radial-gradient(ellipse at 30% 80%, rgba(100,30,160,0.28) 0%, transparent 50%)',
      '#040208',
    ].join(', '),
    border: 'rgba(150,80,210,0.45)',
    ring: 'rgba(170,100,230,0.35)',
    divider: '#7a28a8',
    titleColor: 'linear-gradient(180deg,#e0b0f8 0%,#a040d0 50%,#601090 100%)',
    subtitleColor: 'rgba(200,150,230,0.55)',
    detailColor: 'rgba(170,110,210,0.5)',
    glowBottom: 'rgba(120,40,180,0.22)',
    accentColor: '#a040d0',
    badgeBg: 'linear-gradient(135deg,#601090,#d080f0,#501080)',
    noticeIcon: (
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
        <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="0.9" />
        <path d="M5.5 3.2v2.5l1.6 1.1" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
] as const

export default function StepTipo() {
  const { mode, package: pkg, type, suiteCategory, setType, nextStep, prevStep } = useStore()

  // Sem early-return: no modo experiência o cliente chega aqui sem ter escolhido
  // um pacote (porque pula a step de pacote).

  function choose(t: ReservationType) {
    setType(t)
    nextStep()
  }

  // ─── Suite mode ───────────────────────────────────────────────────────────
  if (mode === 'suite') {
    const catDef = suiteCategory
      ? SUITE_CATEGORIES.find(c => c.dbCategory === suiteCategory)
      : null

    return (
      <div>
        <button
          onClick={prevStep}
          className="flex items-center gap-1 text-gold-700/60 text-sm mb-8 hover:text-gold-500 transition-colors"
        >
          <span>←</span> Voltar
        </button>

        <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-light mb-2 leading-tight">
          Período, pernoite<br />
          <span className="gold-gradient font-semibold italic pr-1 lg:pr-3">ou diária?</span>
        </h1>
        <p className="text-gold-700/70 text-sm mb-6 sm:mb-8">
          {catDef
            ? <>Preços para a suíte <strong className="text-gold-500 font-medium">{catDef.label}</strong>.</>
            : <>Escolha a duração da sua reserva.</>}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl xl:max-w-4xl">
          {TIPOS_SUITE.map((opt) => {
            const isSel = type === opt.id
            const price = catDef
              ? opt.id === 'period' ? catDef.prices.period
                : opt.id === 'overnight' ? catDef.prices.overnight
                : catDef.prices.diaria
              : null
            return (
              <div
                key={opt.id}
                className="relative text-left rounded-2xl overflow-hidden transition-all duration-300 flex flex-col"
                style={{
                  background: opt.bg,
                  border: `1px solid ${isSel ? opt.ring : opt.border}`,
                  boxShadow: isSel
                    ? `0 0 0 2px ${opt.ring}, 0 0 40px ${opt.glowBottom}, inset 0 0 50px rgba(0,0,0,0.45)`
                    : `inset 0 0 50px rgba(0,0,0,0.55), 0 0 20px ${opt.glowBottom}`,
                  minHeight: '260px',
                }}
              >
                <div className="flex-1 flex flex-col justify-end p-6 pb-3">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-px w-8" style={{ background: opt.divider, boxShadow: `0 0 6px ${opt.divider}` }} />
                  </div>
                  <h2
                    className="font-serif font-bold text-transparent bg-clip-text leading-none mb-2"
                    style={{ fontSize: 'clamp(1.8rem, 5vw, 2.4rem)', letterSpacing: '0.06em', backgroundImage: opt.titleColor }}
                  >
                    {opt.label}
                  </h2>
                  <p className="text-xs leading-relaxed mb-3" style={{ color: opt.subtitleColor }}>
                    {opt.subtitle}
                  </p>
                  {price !== null && (
                    <p className="font-serif text-xl font-semibold mb-3" style={{ color: opt.divider }}>
                      {fmt(price)}
                    </p>
                  )}
                  <div
                    className="inline-flex items-center gap-1.5 self-start px-3 py-1.5 rounded-full"
                    style={{ background: `${opt.divider}18`, border: `1px solid ${opt.divider}40`, color: opt.detailColor }}
                  >
                    {opt.noticeIcon}
                    <span className="text-[10px] tracking-widest uppercase font-medium">{opt.notice}</span>
                  </div>
                </div>

                <div className="px-6 pb-5 pt-3 border-t" style={{ borderColor: `${opt.divider}25` }}>
                  <button
                    onClick={() => choose(opt.id)}
                    className="w-full flex items-center justify-center gap-1.5 py-3 rounded-lg text-xs tracking-wide uppercase font-bold text-black transition-all duration-200 hover:opacity-90 active:scale-95"
                    style={{
                      background: opt.badgeBg,
                      boxShadow: isSel
                        ? `0 0 18px ${opt.accentColor}90`
                        : `0 0 22px ${opt.accentColor}55, inset 0 1px 0 rgba(255,255,255,0.15)`,
                    }}
                  >
                    {isSel ? <><span>✓</span> Escolhido</> : <>Escolher <span className="text-sm leading-none">→</span></>}
                  </button>
                </div>

                <div
                  className="absolute bottom-0 left-0 right-0 h-1 rounded-b-2xl pointer-events-none"
                  style={{
                    background: `linear-gradient(to right, transparent, ${opt.divider}90, transparent)`,
                    boxShadow: `0 0 12px 4px ${opt.divider}60`,
                  }}
                />
                {isSel && (
                  <div className="absolute top-4 left-4 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: opt.divider }}>
                    <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-10 max-w-3xl xl:max-w-4xl">
          <p className="text-[10px] tracking-[0.4em] uppercase text-gold-700/55 mb-3">Dúvidas frequentes</p>
          <div className="space-y-2">
            {FAQ_ITEMS.map((item, i) => (
              <FaqItem key={i} question={item.q} answer={item.a} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ─── Package / Experience mode (original) ────────────────────────────────

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
        {mode === 'experience' || !pkg
          ? <>Cada minuto importa — quanto tempo vocês querem ter?</>
          : <>Escolha a duração da experiência no <strong className="text-gold-500 font-medium">{pkg.label}</strong>.</>}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl xl:max-w-4xl">
        {TIPOS.map((opt) => {
          const isSel = type === opt.id
          // No mobile mostra Período primeiro (foco em rotativo 2h), depois Pernoite.
          // No desktop mantém a ordem do array (Pernoite, Período).
          const mobileOrder = opt.id === 'period' ? 'order-1' : 'order-2'
          return (
            <div
              key={opt.id}
              className={`${mobileOrder} sm:order-none relative text-left rounded-2xl overflow-hidden transition-all duration-300 flex flex-col`}
              style={{
                background: opt.bg,
                border: `1px solid ${isSel ? opt.ring : opt.border}`,
                boxShadow: isSel
                  ? `0 0 0 2px ${opt.ring}, 0 0 40px ${opt.glowBottom}, inset 0 0 50px rgba(0,0,0,0.45)`
                  : `inset 0 0 50px rgba(0,0,0,0.55), 0 0 20px ${opt.glowBottom}`,
                minHeight: '300px',
              }}
            >
              {/* Content — cresce e empurra botão para baixo */}
              <div className="flex-1 flex flex-col justify-end p-7 xl:p-9 pb-3">
                {/* Divider line */}
                <div className="flex items-center gap-2 mb-5">
                  <div
                    className="h-px w-8"
                    style={{ background: opt.divider, boxShadow: `0 0 6px ${opt.divider}` }}
                  />
                </div>

                {/* Title */}
                <h2
                  className="font-serif font-bold text-transparent bg-clip-text leading-none mb-3"
                  style={{
                    fontSize: 'clamp(2.6rem, 8vw, 3.4rem)',
                    letterSpacing: '0.08em',
                    backgroundImage: opt.titleColor,
                  }}
                >
                  {opt.label}
                </h2>

                {/* Subtitle */}
                <p
                  className="text-xs tracking-wide leading-relaxed mb-4"
                  style={{ color: opt.subtitleColor }}
                >
                  {opt.subtitle}
                </p>

                {/* Notice badge */}
                <div
                  className="inline-flex items-center gap-1.5 self-start px-3 py-1.5 rounded-full"
                  style={{
                    background: `${opt.divider}18`,
                    border: `1px solid ${opt.divider}40`,
                    color: opt.detailColor,
                  }}
                >
                  {opt.noticeIcon}
                  <span className="text-[10px] tracking-widest uppercase font-medium">
                    {opt.notice}
                  </span>
                </div>
              </div>

              {/* Botão fixo no rodapé */}
              <div
                className="px-7 xl:px-9 pb-5 pt-3 border-t"
                style={{ borderColor: `${opt.divider}25` }}
              >
                <button
                  onClick={() => choose(opt.id)}
                  className="w-full flex items-center justify-center gap-1.5 py-3 rounded-lg text-xs tracking-wide uppercase font-bold text-black transition-all duration-200 hover:opacity-90 active:scale-95"
                  style={{
                    background: opt.badgeBg,
                    boxShadow: isSel
                      ? `0 0 18px ${opt.accentColor}90`
                      : `0 0 22px ${opt.accentColor}55, inset 0 1px 0 rgba(255,255,255,0.15)`,
                  }}
                >
                  {isSel
                    ? <><span>✓</span> Escolhido</>
                    : <>Escolher <span className="text-sm leading-none">→</span></>
                  }
                </button>
              </div>

              {/* Bottom glow strip */}
              <div
                className="absolute bottom-0 left-0 right-0 h-1 rounded-b-2xl pointer-events-none"
                style={{
                  background: `linear-gradient(to right, transparent, ${opt.divider}90, transparent)`,
                  boxShadow: `0 0 12px 4px ${opt.divider}60`,
                }}
              />

              {/* Selected check */}
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
            </div>
          )
        })}
      </div>

      {/* FAQ inline */}
      <div className="mt-10 max-w-3xl xl:max-w-4xl">
        <p className="text-[10px] tracking-[0.4em] uppercase text-gold-700/55 mb-3">Dúvidas frequentes</p>
        <div className="space-y-2">
          {FAQ_ITEMS.map((item, i) => (
            <FaqItem key={i} question={item.q} answer={item.a} />
          ))}
        </div>
      </div>

    </div>
  )
}
