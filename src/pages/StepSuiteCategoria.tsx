import { useState, useEffect, useRef } from 'react'
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
    setSelectedType(prev => (prev === t ? null : t))
  }

  function choose(cat: SuiteCategoryDef) {
    if (!selectedType) return // bloqueado sem duração
    setSuiteCategory(cat.dbCategory)
    setType(selectedType)
    nextStep()
  }

  function chooseSuiteFromModal(cat: SuiteCategoryDef, suite: Suite) {
    // selectedType garantido pelo modal antes de chamar esta função
    setSuiteCategory(cat.dbCategory)
    setSuite(suite)
    setType(selectedType!)
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
        Escolha a categoria, selecione a duração e continue.
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
          selectedType={selectedType}
          onSelectType={handleSelectType}
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
  const [showWarning, setShowWarning] = useState(false)

  useEffect(() => {
    if (selectedType) setShowWarning(false)
  }, [selectedType])

  function handleChoose() {
    if (!selectedType) {
      setShowWarning(true)
      return
    }
    onChoose()
  }

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

      {/* Preços — clicáveis para selecionar duração */}
      <div className="px-6 py-5 flex-1 space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider mb-2.5" style={{ color: t.accentBright }}>
          Selecione a duração
        </p>
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
        {/* Aviso: sem duração selecionada */}
        {showWarning && !selectedType && (
          <p
            className="text-[10px] text-center py-1 px-2 rounded-lg"
            style={{
              color: t.accentBright,
              background: `${t.accent}12`,
              border: `1px solid ${t.accent}30`,
            }}
          >
            Selecione 1 hora, período, pernoite ou diária acima
          </p>
        )}

        {/* Dica: duração selecionada — instrui a clicar em continuar */}
        {selectedType && (
          <p
            className="text-[10px] text-center py-1.5 px-2 rounded-lg"
            style={{
              color: t.accentBright,
              background: `${t.accent}10`,
              border: `1px solid ${t.accent}28`,
            }}
          >
            Clique em <strong>continuar reserva</strong> para escolher sua suíte
          </p>
        )}

        <button
          onClick={handleChoose}
          className="w-full py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all duration-200 active:scale-[0.98]"
          style={{
            background: selectedType
              ? `linear-gradient(135deg, ${t.accent}cc, ${t.accentBright}cc, ${t.accent}cc)`
              : `${t.accent}30`,
            color: selectedType ? '#080502' : t.labelColor,
            cursor: selectedType ? 'pointer' : 'default',
          }}
          onMouseEnter={e => {
            if (selectedType) (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.1)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.filter = ''
          }}
        >
          Continuar reserva →
        </button>

        {/* Hint + botão de vídeos */}
        <div>
          <p className="text-xs text-center font-medium mb-1.5" style={{ color: t.accentBright, opacity: 0.65 }}>
            Quer ver como são as suítes por dentro?
          </p>
          <button
            onClick={onViewVideos}
            className="w-full py-2.5 rounded-xl text-xs font-semibold tracking-widest uppercase transition-all duration-200 hover:opacity-100 active:scale-[0.98]"
            style={{
              background: 'transparent',
              border: `1px solid ${t.border}`,
              color: t.accentBright,
              opacity: 0.75,
            }}
          >
            Ver vídeos das suítes
          </button>
        </div>
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
  selectedType,
  onSelectType,
  onClose,
  onSelectSuite,
}: {
  cat: SuiteCategoryDef
  theme: typeof THEMES[number]
  selectedType: ReservationType | null
  onSelectType: (type: ReservationType) => void
  onClose: () => void
  onSelectSuite: (suite: Suite) => void
}) {
  const suites = getSuitesForCategory(cat)
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({})
  const [visible, setVisible] = useState(false)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [showWarning, setShowWarning] = useState(false)
  const touchStartX = useRef<number | null>(null)

  // Animação de entrada (mesmo padrão do SuiteGallery)
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => setTimeout(() => setVisible(true), 10))
    return () => { document.body.style.overflow = '' }
  }, [])

  // Limpa aviso quando tipo é selecionado
  useEffect(() => {
    if (selectedType) setShowWarning(false)
  }, [selectedType])

  // Busca video_url do Supabase
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

  function navigate(dir: 1 | -1) {
    setCurrentIdx(i => Math.min(Math.max(0, i + dir), suites.length - 1))
  }

  // Swipe gesture no vídeo
  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const delta = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(delta) > 45) navigate(delta > 0 ? 1 : -1)
    touchStartX.current = null
  }

  function handleSelect() {
    if (!selectedType) {
      setShowWarning(true)
      return
    }
    if (currentSuite) onSelectSuite(currentSuite)
  }

  const currentSuite = suites[currentIdx] ?? null
  const videoUrl = currentSuite ? videoUrls[currentSuite.id] : undefined
  const hasMultiple = suites.length > 1

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
        className="relative w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl scrollbar-hide"
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
              Ver vídeos das suítes
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

        {/* Vídeo / Placeholder com swipe */}
        <div
          className="relative bg-black select-none"
          style={{ minHeight: '200px', touchAction: 'pan-y' }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
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
              className="block w-full pointer-events-auto"
              style={{ maxHeight: '52vh' }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2" style={{ height: '200px' }}>
              {currentSuite ? (
                <span
                  className="font-serif font-bold text-transparent bg-clip-text select-none"
                  style={{
                    fontSize: 'clamp(4rem, 18vw, 7rem)',
                    backgroundImage: 'linear-gradient(160deg, #fce8a8 0%, #d4a017 35%, #8b6010 70%, #c9a84c 100%)',
                    lineHeight: 1,
                    filter: 'drop-shadow(0 4px 20px rgba(200,150,30,0.5))',
                  }}
                >
                  {currentSuite.room_number}
                </span>
              ) : (
                <p className="text-sm" style={{ color: 'rgba(200,188,168,0.30)' }}>Sem vídeo disponível</p>
              )}
            </div>
          )}

          {/* Botões de navegação laterais sobre o vídeo — grandes */}
          {hasMultiple && (
            <>
              <button
                onClick={() => navigate(-1)}
                disabled={currentIdx === 0}
                className="absolute left-0 top-0 bottom-0 flex items-center justify-center transition-all"
                style={{
                  width: '22%',
                  background: 'linear-gradient(to right, rgba(0,0,0,0.65), transparent)',
                  opacity: currentIdx === 0 ? 0.15 : 1,
                }}
              >
                <span style={{ fontSize: '2.2rem', color: 'rgba(255,255,255,0.95)', textShadow: '0 2px 12px rgba(0,0,0,0.9)' }}>
                  ‹
                </span>
              </button>
              <button
                onClick={() => navigate(1)}
                disabled={currentIdx === suites.length - 1}
                className="absolute right-0 top-0 bottom-0 flex items-center justify-center transition-all"
                style={{
                  width: '22%',
                  background: 'linear-gradient(to left, rgba(0,0,0,0.65), transparent)',
                  opacity: currentIdx === suites.length - 1 ? 0.15 : 1,
                }}
              >
                <span style={{ fontSize: '2.2rem', color: 'rgba(255,255,255,0.95)', textShadow: '0 2px 12px rgba(0,0,0,0.9)' }}>
                  ›
                </span>
              </button>

              {/* Contador de suítes — canto superior direito */}
              <div
                className="absolute top-2.5 right-2.5 z-30 pointer-events-none"
                style={{
                  background: 'rgba(0,0,0,0.62)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: '999px',
                  padding: '3px 9px',
                }}
              >
                <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.82)', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em' }}>
                  {currentIdx + 1} / {suites.length}
                </span>
              </div>

              {/* Banner de swipe — base do vídeo, some na última suíte */}
              {currentIdx < suites.length - 1 && (
                <div
                  className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none flex items-center justify-center gap-2 py-2"
                  style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 100%)' }}
                >
                  <span style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.55)' }}>‹</span>
                  <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.80)', letterSpacing: '0.06em', textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>
                    deslize para ver mais suítes
                  </span>
                  <span style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.55)' }}>›</span>
                </div>
              )}
            </>
          )}

        </div>

        {/* Info da suíte + setas de navegação abaixo do vídeo */}
        <div className="px-6 pt-4 pb-2">
          <div className="flex items-center gap-3 mb-0.5">
            {/* Seta esquerda */}
            {hasMultiple && (
              <button
                onClick={() => navigate(-1)}
                disabled={currentIdx === 0}
                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95"
                style={{
                  background: currentIdx === 0 ? `${t.accent}10` : `${t.accent}22`,
                  border: `1px solid ${currentIdx === 0 ? t.priceBorder : t.accent + '55'}`,
                  color: currentIdx === 0 ? 'rgba(200,188,168,0.2)' : t.accentBright,
                  fontSize: '1.2rem',
                }}
              >
                ‹
              </button>
            )}

            {/* Nome + dots */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: 'rgba(228,218,198,0.88)' }}>
                {currentSuite?.name ?? ''}
              </p>
              {hasMultiple && (
                <div className="flex items-center gap-1 mt-1">
                  {suites.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentIdx(i)}
                      className="rounded-full transition-all duration-200"
                      style={{
                        width: i === currentIdx ? '16px' : '5px',
                        height: '5px',
                        background: i === currentIdx ? t.accentBright : `${t.accent}40`,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Seta direita */}
            {hasMultiple && (
              <button
                onClick={() => navigate(1)}
                disabled={currentIdx === suites.length - 1}
                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95"
                style={{
                  background: currentIdx === suites.length - 1 ? `${t.accent}10` : `${t.accent}22`,
                  border: `1px solid ${currentIdx === suites.length - 1 ? t.priceBorder : t.accent + '55'}`,
                  color: currentIdx === suites.length - 1 ? 'rgba(200,188,168,0.2)' : t.accentBright,
                  fontSize: '1.2rem',
                }}
              >
                ›
              </button>
            )}
          </div>

          <p className="text-[11px] mt-1" style={{ color: t.labelColor }}>
            {currentSuite?.description ?? ''}
          </p>

          {/* Hint deslize */}
          {hasMultiple && (
            <p className="text-[10px] mt-2" style={{ color: 'rgba(200,188,168,0.45)' }}>
              ← toque nas setas ou deslize o vídeo para navegar entre suítes
            </p>
          )}
        </div>

        {/* Divider */}
        <div className="mx-6 mt-2" style={{ height: '1px', background: `${t.accent}15` }} />

        {/* Mini seletor de duração */}
        <div className="px-6 pt-4 pb-2">
          <p className="text-[9px] uppercase tracking-widest mb-2.5" style={{ color: t.labelColor }}>
            Selecione a duração
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PRICE_ROWS.map(row => {
              const price = cat.prices[row.key]
              if (price === undefined) return null
              const isSel = selectedType === row.key
              return (
                <button
                  key={row.key}
                  onClick={() => onSelectType(row.key)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all duration-150 active:scale-[0.97]"
                  style={{
                    background: isSel ? `${t.accent}20` : 'transparent',
                    border: `1px solid ${isSel ? t.accent + '65' : t.priceBorder}`,
                  }}
                >
                  <span
                    className="text-[11px] font-medium"
                    style={{ color: isSel ? 'rgba(235,225,205,0.92)' : 'rgba(200,188,168,0.60)' }}
                  >
                    {row.label}
                  </span>
                  <span
                    className="font-sans font-bold tabular-nums text-[11px]"
                    style={{ color: isSel ? t.accentBright : t.labelColor }}
                  >
                    {fmt(price)}
                  </span>
                  {isSel && (
                    <div
                      className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: t.accent }}
                    >
                      <svg className="w-2 h-2" fill="none" viewBox="0 0 12 12">
                        <path d="M2 6l3 3 5-5" stroke="#080502" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Aviso sem duração */}
        {showWarning && !selectedType && (
          <div className="px-6 pt-1">
            <p
              className="text-[10px] text-center py-1.5 px-3 rounded-lg"
              style={{
                color: t.accentBright,
                background: `${t.accent}12`,
                border: `1px solid ${t.accent}30`,
              }}
            >
              Selecione 1 hora, período, pernoite ou diária acima para continuar
            </p>
          </div>
        )}

        {/* Selecionar esta suíte */}
        <div className="px-6 py-5">
          <button
            onClick={handleSelect}
            className="w-full py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all duration-200 active:scale-[0.98]"
            style={{
              background: selectedType
                ? `linear-gradient(135deg, ${t.accent}cc, ${t.accentBright}cc, ${t.accent}cc)`
                : `${t.accent}30`,
              color: selectedType ? '#080502' : t.labelColor,
              cursor: selectedType ? 'pointer' : 'default',
            }}
            onMouseEnter={e => {
              if (selectedType) (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.1)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.filter = ''
            }}
          >
            {currentSuite ? `Selecionar ${currentSuite.name} →` : 'Selecionar →'}
          </button>
        </div>
      </div>
    </div>
  )
}
