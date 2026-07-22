import { useState } from 'react'
import { useStore } from '../store/useStore'
import { SUITE_CATEGORIES } from '../data/suiteCategories'
import type { ReservationType } from '../types'

// ── FAQ ──────────────────────────────────────────────────────────────────────

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
      className="rounded-xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.012)', border: '1px solid rgba(255,255,255,0.05)' }}
    >
      <button
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className="text-sm text-gold-300/75 font-medium">{question}</span>
        <span
          className="shrink-0 text-gold-600/50 transition-transform duration-200 text-lg leading-none"
          style={{ transform: open ? 'rotate(45deg)' : 'rotate(0deg)' }}
        >
          +
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <p className="text-xs text-gold-700/55 leading-relaxed">{answer}</p>
        </div>
      )}
    </div>
  )
}

function FAQ() {
  return (
    <div className="mt-10 max-w-3xl xl:max-w-4xl">
      <p className="text-[10px] tracking-[0.4em] uppercase text-gold-700/50 mb-3">Dúvidas frequentes</p>
      <div className="space-y-2">
        {FAQ_ITEMS.map((item, i) => (
          <FaqItem key={i} question={item.q} answer={item.a} />
        ))}
      </div>
    </div>
  )
}

// ── Themes ───────────────────────────────────────────────────────────────────

const THEME_1H = {
  accent:      '#b86080',
  accentBright:'#e498b4',
  bg:          'linear-gradient(160deg, #0e080b 0%, #090508 100%)',
  border:      'rgba(184,96,128,0.18)',
  glow:        '0 2px 20px rgba(184,96,128,0.04)',
  priceBg:     'rgba(184,96,128,0.05)',
  priceBorder: 'rgba(184,96,128,0.13)',
  labelColor:  'rgba(228,152,180,0.40)',
}

const THEME_PERIOD = {
  accent:      '#b8975a',
  accentBright:'#dfc07a',
  bg:          'linear-gradient(160deg, #0d0b08 0%, #080602 100%)',
  border:      'rgba(184,151,90,0.18)',
  glow:        '0 2px 20px rgba(184,151,90,0.04)',
  priceBg:     'rgba(184,151,90,0.05)',
  priceBorder: 'rgba(184,151,90,0.13)',
  labelColor:  'rgba(223,192,122,0.38)',
}

const THEME_OVERNIGHT = {
  accent:      '#b87840',
  accentBright:'#e0a060',
  bg:          'linear-gradient(160deg, #0e0a06 0%, #090602 100%)',
  border:      'rgba(184,120,64,0.18)',
  glow:        '0 2px 20px rgba(184,120,64,0.04)',
  priceBg:     'rgba(184,120,64,0.05)',
  priceBorder: 'rgba(184,120,64,0.13)',
  labelColor:  'rgba(224,160,96,0.40)',
}

const THEME_DIARIA = {
  accent:      '#587890',
  accentBright:'#88b0c8',
  bg:          'linear-gradient(160deg, #060a0e 0%, #040810 100%)',
  border:      'rgba(88,120,144,0.18)',
  glow:        '0 2px 20px rgba(88,120,144,0.04)',
  priceBg:     'rgba(88,120,144,0.05)',
  priceBorder: 'rgba(88,120,144,0.13)',
  labelColor:  'rgba(136,176,200,0.40)',
}

type Theme = typeof THEME_1H

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })
}

// ── Card ─────────────────────────────────────────────────────────────────────

function TipoCard({
  label,
  subtitle,
  notice,
  price,
  selected,
  theme: t,
  onChoose,
}: {
  label: string
  subtitle: string
  notice: string
  price?: number | null
  selected: boolean
  theme: Theme
  onChoose: () => void
}) {
  return (
    <div
      className="relative flex flex-col rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.012]"
      style={{
        background: t.bg,
        border: `1px solid ${selected ? t.accentBright + '55' : t.border}`,
        boxShadow: selected ? `0 0 0 1px ${t.accent}28, ${t.glow}` : t.glow,
      }}
    >
      {/* Selected check */}
      {selected && (
        <div
          className="absolute top-4 right-4 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ background: t.accent }}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12">
            <path d="M2 6l3 3 5-5" stroke="#080502" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}

      {/* Content */}
      <div className="px-6 pt-7 pb-5 flex-1">
        <div className="w-6 h-px mb-5" style={{ background: t.accent }} />

        <h2
          className="font-serif font-semibold uppercase leading-tight mb-3"
          style={{
            fontSize: 'clamp(1.2rem, 3vw, 1.6rem)',
            letterSpacing: '0.06em',
            color: t.accentBright,
          }}
        >
          {label}
        </h2>

        <p className="text-xs leading-relaxed mb-4" style={{ color: 'rgba(205,195,178,0.50)' }}>
          {subtitle}
        </p>

        {/* Price */}
        {price != null && (
          <p
            className="font-sans font-bold tabular-nums tracking-tight mb-4"
            style={{ fontSize: 'clamp(1.25rem, 2.8vw, 1.5rem)', color: t.accentBright }}
          >
            {fmt(price)}
          </p>
        )}

        {/* Duration badge */}
        <div
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full"
          style={{
            background: t.priceBg,
            border: `1px solid ${t.priceBorder}`,
            color: t.labelColor,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 11 11" fill="none">
            <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="0.9" />
            <path d="M5.5 3.2v2.5l1.6 1.1" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[10px] tracking-widest uppercase font-medium">{notice}</span>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-6" style={{ height: '1px', background: `${t.accent}15` }} />

      {/* CTA */}
      <div className="px-6 py-4">
        <button
          onClick={onChoose}
          className="w-full py-3 rounded-xl text-sm font-bold tracking-wide transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
          style={{
            background: `linear-gradient(135deg, ${t.accent}cc, ${t.accentBright}cc, ${t.accent}cc)`,
            color: '#080502',
          }}
        >
          {selected ? '✓ Escolhido' : 'Escolher →'}
        </button>
      </div>

      {/* Bottom accent */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: `linear-gradient(to right, transparent, ${t.accent}50, transparent)` }}
      />
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function StepTipo() {
  const { mode, package: pkg, type, suiteCategory, checkIn, setType, nextStep, prevStep } = useStore()

  // Sexta (5), sábado (6), domingo (0) — período e 1h não disponíveis
  const isWeekend = checkIn ? [0, 5, 6].includes(checkIn.getDay()) : false

  function choose(t: ReservationType) {
    setType(t)
    nextStep()
  }

  // ─── Suite mode ───────────────────────────────────────────────────────────
  if (mode === 'suite') {
    const catDef = suiteCategory
      ? SUITE_CATEGORIES.find(c => c.dbCategory === suiteCategory)
      : null

    const tiposSuite = [
      {
        id:       'oneHour'   as const,
        label:    '1 HORA',
        subtitle: 'Uma pausa rápida e especial só de vocês.',
        notice:   '1 hora',
        theme:    THEME_1H,
        price:    catDef?.prices.oneHour ?? null,
      },
      {
        id:       'period'    as const,
        label:    'PERÍODO',
        subtitle: 'Algumas horas só de vocês dois.',
        notice:   '2 horas',
        theme:    THEME_PERIOD,
        price:    catDef?.prices.period ?? null,
      },
      {
        id:       'overnight' as const,
        label:    'PERNOITE',
        subtitle: 'Uma noite inteira para criar memórias inesquecíveis.',
        notice:   '~12 horas',
        theme:    THEME_OVERNIGHT,
        price:    catDef?.prices.overnight ?? null,
      },
      {
        id:       'diaria'    as const,
        label:    'DIÁRIA',
        subtitle: 'Aproveitem sem pressa o dia todo.',
        notice:   '24 horas',
        theme:    THEME_DIARIA,
        price:    catDef?.prices.diaria ?? null,
      },
    ]
      .filter(o => !(o.id === 'oneHour' && o.price === null))
      .filter(o => !isWeekend || (o.id !== 'period' && o.id !== 'oneHour'))

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
        <p className="text-gold-700/70 text-sm mb-8 sm:mb-10">
          {catDef
            ? <>Preços para <strong className="text-gold-500 font-medium">{catDef.label}</strong>.</>
            : <>Escolha a duração da sua reserva.</>}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-3xl xl:max-w-4xl">
          {tiposSuite.map(opt => (
            <TipoCard
              key={opt.id}
              label={opt.label}
              subtitle={opt.subtitle}
              notice={opt.notice}
              price={opt.price}
              selected={type === opt.id}
              theme={opt.theme}
              onChoose={() => choose(opt.id)}
            />
          ))}
        </div>

        <FAQ />
      </div>
    )
  }

  // ─── Package / Experience mode ────────────────────────────────────────────

  const tiposPkg = [
    {
      id:       'overnight' as const,
      label:    'PERNOITE',
      subtitle: 'Uma noite inteira para criar memórias inesquecíveis.',
      notice:   '~12 horas',
      theme:    THEME_OVERNIGHT,
    },
    {
      id:       'period'    as const,
      label:    'PERÍODO',
      subtitle: 'Algumas horas só de vocês dois.',
      notice:   '2 horas',
      theme:    THEME_PERIOD,
    },
  ].filter(o => !isWeekend || o.id !== 'period')

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
      <p className="text-gold-700/70 text-sm mb-8 sm:mb-10">
        {mode === 'experience' || !pkg
          ? <>Cada minuto importa — quanto tempo vocês querem ter?</>
          : <>Escolha a duração da experiência no <strong className="text-gold-500 font-medium">{pkg.label}</strong>.</>}
      </p>
      {isWeekend && (
        <div
          className="mb-6 flex items-start gap-2.5 px-4 py-3 rounded-xl"
          style={{ background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.18)' }}
        >
          <svg className="w-3.5 h-3.5 shrink-0 mt-[2px]" viewBox="0 0 14 14" fill="none" style={{ color: 'rgba(201,168,76,0.55)' }}>
            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1" />
            <path d="M7 4v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="7" cy="10" r="0.65" fill="currentColor" />
          </svg>
          <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(210,195,165,0.60)' }}>
            Em <strong style={{ color: 'rgba(230,205,145,0.80)' }}>sextas, sábados e domingos</strong> apenas Pernoite está disponível.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
        {tiposPkg.map(opt => {
          const mobileOrder = opt.id === 'period' ? 'order-1 sm:order-none' : 'order-2 sm:order-none'
          return (
            <div key={opt.id} className={mobileOrder}>
              <TipoCard
                label={opt.label}
                subtitle={opt.subtitle}
                notice={opt.notice}
                selected={type === opt.id}
                theme={opt.theme}
                onChoose={() => choose(opt.id)}
              />
            </div>
          )
        })}
      </div>

      <FAQ />
    </div>
  )
}
