import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store/useStore'
import { SUITE_CATEGORIES } from '../data/suiteCategories'
import { SUITES } from '../data/index'
import { supabase } from '../lib/supabase'
import type { SuiteCategoryDef } from '../data/suiteCategories'
import type { Suite, ReservationType } from '../types'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })
}

const THEMES = [
  {
    // Suíte Tradicional — âmbar dourado
    accent:      '#b8975a',
    accentBright:'#dfc07a',
    bg:          'linear-gradient(160deg, #0d0b08 0%, #080602 100%)',
    border:      'rgba(184,151,90,0.18)',
    glow:        '0 2px 20px rgba(184,151,90,0.04)',
    priceBg:     'rgba(184,151,90,0.05)',
    priceBorder: 'rgba(184,151,90,0.13)',
    labelColor:  'rgba(223,192,122,0.38)',
    tag:         null,
  },
  {
    // Hidro Light — teal gelado
    accent:      '#4aafc0',
    accentBright:'#78d0e4',
    bg:          'linear-gradient(160deg, #050c11 0%, #030810 100%)',
    border:      'rgba(74,175,192,0.18)',
    glow:        '0 2px 20px rgba(74,175,192,0.04)',
    priceBg:     'rgba(74,175,192,0.05)',
    priceBorder: 'rgba(74,175,192,0.13)',
    labelColor:  'rgba(120,208,228,0.38)',
    tag:         null,
  },
  {
    // VIP Piscina — cobre terracotta
    accent:      '#c07260',
    accentBright:'#e49a84',
    bg:          'linear-gradient(160deg, #100807 0%, #0c0503 100%)',
    border:      'rgba(192,114,96,0.18)',
    glow:        '0 2px 20px rgba(192,114,96,0.04)',
    priceBg:     'rgba(192,114,96,0.05)',
    priceBorder: 'rgba(192,114,96,0.13)',
    labelColor:  'rgba(228,154,132,0.38)',
    tag:         'Premium',
  },
]

const PRICE_ROWS: { key: ReservationType; label: string; sublabel: string }[] = [
  { key: 'oneHour',   label: '1 Hora',   sublabel: '1h' },
  { key: 'period',    label: 'Período',  sublabel: '2h' },
  { key: 'overnight', label: 'Pernoite', sublabel: '~12h' },
  { key: 'diaria',    label: 'Diária',   sublabel: '24h' },
]

function getSuitesForCategory(cat: SuiteCategoryDef): Suite[] {
  return SUITES.filter(s => s.category === cat.dbCategory)
}

export default function StepSuiteCategoria() {
  const { setSuiteCategory, setSuite, setType, setStep, nextStep, prevStep } = useStore()
  const [modalCat, setModalCat] = useState<{ cat: SuiteCategoryDef; themeIdx: number } | null>(null)
  const [selectedType, setSelectedType] = useState<ReservationType | null>(null)

  function handleSelectType(t: ReservationType) {
    setSelectedType(prev => (prev === t ? null : t)) // toggle on re-click
  }

  function choose(cat: SuiteCategoryDef) {
    setSuiteCategory(cat.dbCategory)
    if (selectedType) setType(selectedType)
    nextStep()
  }

  function chooseSuiteFromModal(cat: SuiteCategoryDef, suite: Suite) {
    setSuiteCategory(cat.dbCategory)
    setSuite(suite)
    if (selectedType) setType(selectedType)
    setStep(4) // pula StepSuite — suíte já escolhida no modal
    setModalCat(null)
  }

  return (
    <div>
      <button
        onClick={prevStep}
        className="flex items-center gap-1 text-gold-700/60 text-sm mb-8 hover:text-gold-500 transition-colors"
      >
        <span>←</span> Voltar
      </button>

      <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-light mb-2 leading-tight">
        Qual suíte<br />
        <span className="gold-gradient font-semibold italic pr-1 lg:pr-3">vocês preferem?</span>
      </h1>
      <p className="text-gold-700/70 text-sm mb-8 sm:mb-10">
        Escolha a categoria e veja os preços por duração.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-3xl xl:max-w-4xl">
        {SUITE_CATEGORIES.map((cat, i) => (
          <Card
            key={cat.id}
            cat={cat}
            theme={THEMES[i]}
            selectedType={selectedType}
            onSelectType={handleSelectType}
            onChoose={() => choose(cat)}
            onViewVideos={() => setModalCat({ cat, themeIdx: i })}
          />
        ))}
      </div>

      {modalCat && createPortal(
        <SuiteVideoModal
          cat={modalCat.cat}
          theme={THEMES[modalCat.themeIdx]}
          onClose={() => setModalCat(null)}
          onSelectSuite={(suite) => chooseSuiteFromModal(modalCat.cat, suite)}
        />,
        document.body,
      )}
    </div>
  )
}

// ── Card ─────────────────────────────────────────────────────────────────────

function Card({
  cat,
  theme: t,
  selectedType,
  onSelectType,
  onChoose,
  onViewVideos,
}: {
  cat: SuiteCategoryDef
  theme: typeof THEMES[number]
  selectedType: ReservationType | null
  onSelectType: (type: ReservationType) => void
  onChoose: () => void
  onViewVideos: () => void
}) {
  return (
    <div
      className="relative flex flex-col rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.012]"
      style={{
        background: t.bg,
        border: `1px solid ${t.border}`,
        boxShadow: t.glow,
      }}
    >
      {/* Tag Premium */}
      {t.tag && (
        <div className="absolute top-4 right-4">
          <span
            className="text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full"
            style={{
              background: `${t.accent}15`,
              border: `1px solid ${t.accent}40`,
              color: t.accentBright,
            }}
          >
            {t.tag}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="px-6 pt-7 pb-5">
        <div className="w-6 h-px mb-5" style={{ background: t.accent }} />
        <h2
          className="font-serif font-semibold uppercase leading-tight mb-3"
          style={{
            fontSize: 'clamp(1rem, 2.8vw, 1.3rem)',
            letterSpacing: '0.06em',
            color: t.accentBright,
          }}
        >
          {cat.label}
        </h2>
        <p className="text-xs leading-relaxed" style={{ color: 'rgba(205,195,178,0.5)' }}>
          {cat.description}
        </p>
      </div>

      {/* Divider */}
      <div className="mx-6" style={{ height: '1px', background: `${t.accent}15` }} />

      {/* Prices — clicáveis para pré-selecionar duração */}
      <div className="px-6 py-5 flex-1 space-y-1.5">
        {PRICE_ROWS.map(row => {
          const price = cat.prices[row.key]
          if (price === undefined) return null
          const isSel = selectedType === row.key
          return (
            <button
              key={row.key}
              onClick={() => onSelectType(row.key)}
              className="w-full flex items-center justify-between rounded-lg px-3.5 py-2.5 text-left transition-all duration-150 active:scale-[0.98]"
              style={{
                background: isSel ? `${t.accent}18` : t.priceBg,
                border: `1px solid ${isSel ? t.accent + '70' : t.priceBorder}`,
              }}
            >
              <div>
                <p
                  className="text-[13px] font-medium"
                  style={{ color: isSel ? 'rgba(235,225,205,0.92)' : 'rgba(228,218,198,0.75)' }}
                >
                  {row.label}
                </p>
                <p className="text-[10px]" style={{ color: t.labelColor }}>
                  {row.sublabel}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isSel && (
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: t.accent }}
                  >
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" stroke="#080502" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
                <p
                  className="font-sans font-bold tabular-nums text-lg tracking-tight"
                  style={{ color: t.accentBright }}
                >
                  {fmt(price)}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      {/* CTAs */}
      <div className="px-6 pb-6 pt-1 space-y-2">
        <button
          onClick={onChoose}
          className="w-full py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
          style={{
            background: `linear-gradient(135deg, ${t.accent}cc, ${t.accentBright}cc, ${t.accent}cc)`,
            color: '#080502',
          }}
        >
          Continuar reserva →
        </button>

        <button
          onClick={onViewVideos}
          className="w-full py-2.5 rounded-xl text-[11px] font-medium tracking-widest uppercase transition-all duration-200 hover:opacity-100 active:scale-[0.98]"
          style={{
            background: 'transparent',
            border: `1px solid ${t.border}`,
            color: t.labelColor,
          }}
        >
          Ver vídeos
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

// ── Suite Video Modal ─────────────────────────────────────────────────────────

function SuiteVideoModal({
  cat,
  theme: t,
  onClose,
  onSelectSuite,
}: {
  cat: SuiteCategoryDef
  theme: typeof THEMES[number]
  onClose: () => void
  onSelectSuite: (suite: Suite) => void
}) {
  const suites = getSuitesForCategory(cat)
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({})
  const [visible, setVisible] = useState(false)
  const [currentIdx, setCurrentIdx] = useState(0)

  // Animação de entrada (mesmo padrão do SuiteGallery em StepSuite)
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => setTimeout(() => setVisible(true), 10))
    return () => { document.body.style.overflow = '' }
  }, [])

  // Busca video_url de cada suíte no Supabase
  useEffect(() => {
    if (suites.length === 0) return
    const ids = suites.map(s => s.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase as any)
      .from('suites')
      .select('id, video_url')
      .in('id', ids)
      .then(({ data }: { data: { id: string; video_url: string | null }[] | null }) => {
        if (!data) return
        const vids: Record<string, string> = {}
        data.forEach(s => { if (s.video_url) vids[s.id] = s.video_url })
        setVideoUrls(vids)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function close() {
    setVisible(false)
    setTimeout(onClose, 360)
  }

  const currentSuite = suites[currentIdx] ?? null
  const videoUrl = currentSuite ? videoUrls[currentSuite.id] : undefined

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ pointerEvents: visible ? 'auto' : 'none' }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 transition-opacity duration-350"
        style={{
          background: 'rgba(0,0,0,0.90)',
          backdropFilter: 'blur(8px)',
          opacity: visible ? 1 : 0,
        }}
        onClick={close}
      />

      {/* Sheet */}
      <div
        className="relative w-full sm:max-w-md max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl scrollbar-hide"
        style={{
          backgroundColor: '#0c0702',
          border: `1px solid ${t.border}`,
          boxShadow: '0 -24px 80px rgba(0,0,0,0.9)',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          opacity: visible ? 1 : 0,
          transition: 'transform 0.38s cubic-bezier(0.4,0,0.2,1), opacity 0.38s ease',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle mobile */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full" style={{ background: `${t.accent}30` }} />
        </div>

        {/* Header */}
        <div className="px-6 pt-4 pb-3 flex items-start justify-between">
          <div>
            <div className="w-5 h-px mb-3" style={{ background: t.accent }} />
            <h3
              className="font-serif font-semibold uppercase tracking-wider"
              style={{ fontSize: '1.1rem', color: t.accentBright, letterSpacing: '0.06em' }}
            >
              {cat.label}
            </h3>
            <p className="text-[11px] mt-0.5" style={{ color: 'rgba(200,188,168,0.42)' }}>
              Ver vídeos
            </p>
          </div>
          <button
            onClick={close}
            className="text-[11px] px-3 py-1.5 rounded-lg hover:opacity-80 opacity-40"
            style={{ color: 'rgba(200,188,168,0.9)', border: '1px solid rgba(200,188,168,0.12)' }}
          >
            ✕
          </button>
        </div>

        {/* Vídeo / Placeholder */}
        <div className="relative bg-black" style={{ minHeight: '200px' }}>
          {videoUrl ? (
            <video
              key={videoUrl}
              src={videoUrl}
              autoPlay
              loop
              playsInline
              controls
              ref={(el) => {
                if (!el) return
                el.muted = false
                el.volume = 1
                el.play().catch(() => {
                  el.muted = true
                  el.play().catch(() => {})
                })
              }}
              className="block w-full"
              style={{ maxHeight: '55vh' }}
            />
          ) : (
            <div
              className="flex items-center justify-center"
              style={{ height: '200px' }}
            >
              {currentSuite ? (
                <span
                  className="font-serif font-bold text-transparent bg-clip-text select-none"
                  style={{
                    fontSize: 'clamp(5rem, 22vw, 8rem)',
                    backgroundImage: 'linear-gradient(160deg, #fce8a8 0%, #d4a017 35%, #8b6010 70%, #c9a84c 100%)',
                    lineHeight: 1,
                    filter: 'drop-shadow(0 4px 20px rgba(200,150,30,0.5))',
                  }}
                >
                  {currentSuite.room_number}
                </span>
              ) : (
                <p className="text-sm" style={{ color: 'rgba(200,188,168,0.30)' }}>
                  Sem vídeo disponível
                </p>
              )}
            </div>
          )}

          {/* Fechar sobre o vídeo */}
          <button
            onClick={close}
            aria-label="Fechar"
            className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full flex items-center justify-center text-sm hover:opacity-80"
            style={{
              background: 'rgba(0,0,0,0.6)',
              color: 'rgba(220,185,100,0.8)',
              border: '1px solid rgba(201,168,76,0.3)',
            }}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        {/* Info + navegação entre suítes */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold" style={{ color: 'rgba(228,218,198,0.88)' }}>
              {currentSuite?.name ?? ''}
            </p>

            {suites.length > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
                  disabled={currentIdx === 0}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs transition-all"
                  style={{
                    background: `${t.accent}15`,
                    border: `1px solid ${t.border}`,
                    color: currentIdx === 0 ? 'rgba(200,188,168,0.2)' : t.accentBright,
                    opacity: currentIdx === 0 ? 0.35 : 1,
                  }}
                >
                  ←
                </button>
                <span className="text-[10px] tabular-nums" style={{ color: 'rgba(200,188,168,0.32)' }}>
                  {currentIdx + 1} / {suites.length}
                </span>
                <button
                  onClick={() => setCurrentIdx(i => Math.min(suites.length - 1, i + 1))}
                  disabled={currentIdx === suites.length - 1}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs transition-all"
                  style={{
                    background: `${t.accent}15`,
                    border: `1px solid ${t.border}`,
                    color: currentIdx === suites.length - 1 ? 'rgba(200,188,168,0.2)' : t.accentBright,
                    opacity: currentIdx === suites.length - 1 ? 0.35 : 1,
                  }}
                >
                  →
                </button>
              </div>
            )}
          </div>

          <p className="text-[11px]" style={{ color: t.labelColor }}>
            {currentSuite?.description ?? ''}
          </p>
        </div>

        {/* Divider */}
        <div className="mx-6" style={{ height: '1px', background: `${t.accent}15` }} />

        {/* Selecionar esta suíte */}
        <div className="px-6 py-5">
          <button
            onClick={() => currentSuite && onSelectSuite(currentSuite)}
            className="w-full py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
            style={{
              background: `linear-gradient(135deg, ${t.accent}cc, ${t.accentBright}cc, ${t.accent}cc)`,
              color: '#080502',
            }}
          >
            {currentSuite ? `Selecionar ${currentSuite.name} →` : 'Selecionar →'}
          </button>
          <p className="text-center text-[10px] mt-3" style={{ color: 'rgba(200,188,168,0.22)' }}>
            Ao selecionar você avança para escolher o tipo de estadia.
          </p>
        </div>
      </div>
    </div>
  )
}
