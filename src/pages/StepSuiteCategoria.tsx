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

const THEME = {
  accent:      '#c9a84c',
  accentBright:'#f0d070',
  bg:          'linear-gradient(160deg, #0d0b07 0%, #080602 100%)',
  border:      'rgba(201,168,76,0.18)',
  glow:        '0 2px 24px rgba(201,168,76,0.04)',
  priceBg:     'rgba(201,168,76,0.05)',
  priceBorder: 'rgba(201,168,76,0.12)',
  labelColor:  'rgba(220,188,110,0.40)',
}

const PRICE_ROWS: { key: ReservationType; label: string; sublabel: string }[] = [
  { key: 'oneHour',   label: '1 Hora',   sublabel: '1h' },
  { key: 'period',    label: 'Período',  sublabel: '2h' },
  { key: 'overnight', label: 'Pernoite', sublabel: '~12h' },
  { key: 'diaria',    label: 'Diária',   sublabel: '24h' },
]

function getSuitesForCategory(cat: SuiteCategoryDef): Suite[] {
  return SUITES.filter(s => s.category === cat.dbCategory)
}

const WEEKEND_DAYS = new Set([0, 5, 6]) // domingo, sexta, sábado

export default function StepSuiteCategoria() {
  const { setSuiteCategory, setSuite, setType, setStep, nextStep, prevStep, checkIn } = useStore()
  const [modalCat, setModalCat] = useState<{ cat: SuiteCategoryDef } | null>(null)
  const [selectedType, setSelectedType] = useState<ReservationType | null>(null)

  const isWeekend = checkIn ? WEEKEND_DAYS.has(checkIn.getDay()) : false

  // Se a duração selecionada virou inválida por mudança de dia, limpa
  const availableRows = PRICE_ROWS.filter(row =>
    !isWeekend || (row.key !== 'period' && row.key !== 'oneHour')
  )

  function handleSelectType(t: ReservationType) {
    setSelectedType(prev => (prev === t ? null : t))
  }

  function choose(cat: SuiteCategoryDef) {
    if (!selectedType) return
    setSuiteCategory(cat.dbCategory)
    setType(selectedType)
    nextStep()
  }

  function chooseSuiteFromModal(cat: SuiteCategoryDef, suite: Suite) {
    setSuiteCategory(cat.dbCategory)
    setSuite(suite)
    setType(selectedType!)
    setStep(5) // pula StepSuite — suíte já escolhida no modal
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
      <p className="text-gold-700/70 text-sm mb-6 sm:mb-8">
        Escolha a categoria, selecione a duração e continue.
      </p>

      {isWeekend && (
        <div
          className="mb-6 flex items-start gap-2.5 px-4 py-3 rounded-xl max-w-2xl xl:max-w-3xl"
          style={{ background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.18)' }}
        >
          <svg className="w-3.5 h-3.5 shrink-0 mt-[2px]" viewBox="0 0 14 14" fill="none" style={{ color: 'rgba(201,168,76,0.55)' }}>
            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1" />
            <path d="M7 4v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="7" cy="10" r="0.65" fill="currentColor" />
          </svg>
          <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(210,195,165,0.60)' }}>
            Em <strong style={{ color: 'rgba(230,205,145,0.80)' }}>sextas, sábados e domingos</strong> apenas Pernoite e Diária estão disponíveis.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl xl:max-w-3xl">
        {SUITE_CATEGORIES.map((cat, i) => (
          <Card
            key={cat.id}
            cat={cat}
            index={i}
            selectedType={selectedType}
            availableRows={availableRows}
            onSelectType={handleSelectType}
            onChoose={() => choose(cat)}
            onViewVideos={() => setModalCat({ cat })}
          />
        ))}
      </div>

      {modalCat && createPortal(
        <SuiteVideoModal
          cat={modalCat.cat}
          selectedType={selectedType}
          availableRows={availableRows}
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

const ORDINALS = ['01', '02', '03', '04', '05']

function Card({
  cat,
  index,
  selectedType,
  availableRows,
  onSelectType,
  onChoose,
  onViewVideos,
}: {
  cat: SuiteCategoryDef
  index: number
  selectedType: ReservationType | null
  availableRows: typeof PRICE_ROWS
  onSelectType: (type: ReservationType) => void
  onChoose: () => void
  onViewVideos: () => void
}) {
  const t = THEME
  const [showWarning, setShowWarning] = useState(false)

  useEffect(() => {
    if (selectedType) setShowWarning(false)
  }, [selectedType])

  function handleChoose() {
    if (!selectedType) { setShowWarning(true); return }
    onChoose()
  }

  return (
    <div
      className="relative flex flex-col rounded-2xl overflow-hidden transition-all duration-300"
      style={{ background: t.bg, border: `1px solid ${t.border}`, boxShadow: t.glow }}
    >
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex items-start gap-4">
        {/* Ordinal number */}
        <span
          className="font-serif font-bold leading-none select-none shrink-0"
          style={{
            fontSize: '2rem',
            color: 'rgba(201,168,76,0.15)',
            letterSpacing: '-0.02em',
            lineHeight: 1,
          }}
        >
          {ORDINALS[index] ?? String(index + 1).padStart(2, '0')}
        </span>
        <div className="pt-1">
          <h2
            className="font-serif font-semibold leading-tight mb-1.5"
            style={{ fontSize: 'clamp(0.95rem, 2.5vw, 1.15rem)', letterSpacing: '0.03em', color: t.accentBright }}
          >
            {cat.label}
          </h2>
          <p className="text-xs leading-relaxed" style={{ color: 'rgba(205,195,178,0.48)' }}>
            {cat.description}
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-6" style={{ height: '1px', background: `${t.accent}14` }} />

      {/* Preços */}
      <div className="px-6 py-4 flex-1 space-y-1.5">
        <p className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: t.labelColor }}>
          Duração
        </p>
        {availableRows.map(row => {
          const price = cat.prices[row.key]
          if (price === undefined) return null
          const isSel = selectedType === row.key
          return (
            <button
              key={row.key}
              onClick={() => onSelectType(row.key)}
              className="w-full flex items-center justify-between rounded-lg px-3.5 py-2.5 text-left transition-all duration-150 active:scale-[0.98]"
              style={{
                background: isSel ? `${t.accent}16` : t.priceBg,
                border: `1px solid ${isSel ? t.accent + '60' : t.priceBorder}`,
              }}
            >
              <div>
                <p className="text-[13px] font-medium" style={{ color: isSel ? 'rgba(240,225,195,0.92)' : 'rgba(220,210,190,0.68)' }}>
                  {row.label}
                </p>
                <p className="text-[10px]" style={{ color: t.labelColor }}>{row.sublabel}</p>
              </div>
              <div className="flex items-center gap-2">
                {isSel && (
                  <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ background: t.accent }}>
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" stroke="#060401" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
                <p className="font-sans font-bold tabular-nums text-base tracking-tight" style={{ color: t.accentBright }}>
                  {fmt(price)}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      {/* CTAs */}
      <div className="px-6 pb-6 pt-1 space-y-2">
        {showWarning && !selectedType && (
          <p className="text-[10px] text-center py-1 px-2 rounded-lg"
             style={{ color: t.accentBright, background: `${t.accent}10`, border: `1px solid ${t.accent}28` }}>
            Selecione uma duração acima
          </p>
        )}

        <button
          onClick={handleChoose}
          className="w-full py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all duration-200 active:scale-[0.98]"
          style={{
            background: selectedType
              ? 'linear-gradient(135deg, #a07820, #d4a017, #8b6010)'
              : `${t.accent}22`,
            color: selectedType ? '#060401' : t.labelColor,
          }}
        >
          Continuar reserva →
        </button>

        <button
          onClick={onViewVideos}
          className="w-full py-2.5 rounded-xl text-xs font-semibold tracking-widest uppercase transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
          style={{ background: 'transparent', border: `1px solid ${t.border}`, color: t.accentBright, opacity: 0.6 }}
        >
          Ver fotos das suítes
        </button>
      </div>

      {/* Bottom accent */}
      <div className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
           style={{ background: `linear-gradient(to right, transparent, ${t.accent}40, transparent)` }} />
    </div>
  )
}

// ── Suite Gallery Modal ───────────────────────────────────────────────────────

function SuiteVideoModal({
  cat,
  selectedType,
  availableRows,
  onSelectType,
  onClose,
  onSelectSuite,
}: {
  cat: SuiteCategoryDef
  selectedType: ReservationType | null
  availableRows: typeof PRICE_ROWS
  onSelectType: (type: ReservationType) => void
  onClose: () => void
  onSelectSuite: (suite: Suite) => void
}) {
  const t = THEME
  const suites = getSuitesForCategory(cat)
  const [photosMap, setPhotosMap]   = useState<Record<string, string[]>>({})
  const [visible, setVisible]       = useState(false)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [photoIdx, setPhotoIdx]     = useState(0)
  const [showWarning, setShowWarning] = useState(false)
  const touchStartX                 = useRef<number | null>(null)

  // Entrada animada
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => setTimeout(() => setVisible(true), 10))
    return () => { document.body.style.overflow = '' }
  }, [])

  // Reset foto ao mudar de suíte
  useEffect(() => { setPhotoIdx(0) }, [currentIdx])

  useEffect(() => {
    if (selectedType) setShowWarning(false)
  }, [selectedType])

  // Busca photos[] do Supabase
  useEffect(() => {
    if (suites.length === 0) return
    const ids = suites.map(s => s.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase as any)
      .from('suites')
      .select('id, photos')
      .in('id', ids)
      .then(({ data }: { data: { id: string; photos: string[] | null }[] | null }) => {
        if (!data) return
        const map: Record<string, string[]> = {}
        data.forEach(s => { if (Array.isArray(s.photos) && s.photos.length > 0) map[s.id] = s.photos })
        setPhotosMap(map)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function close() {
    setVisible(false)
    setTimeout(onClose, 360)
  }

  function navigatePhoto(dir: 1 | -1) {
    setPhotoIdx(i => Math.min(Math.max(0, i + dir), (currentPhotos.length || 1) - 1))
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const delta = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(delta) > 45) navigatePhoto(delta > 0 ? 1 : -1)
    touchStartX.current = null
  }

  function handleSelect() {
    if (!selectedType) { setShowWarning(true); return }
    if (currentSuite) onSelectSuite(currentSuite)
  }

  const currentSuite  = suites[currentIdx] ?? null
  const currentPhotos = currentSuite ? (photosMap[currentSuite.id] ?? []) : []
  const currentPhoto  = currentPhotos[photoIdx] ?? null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ pointerEvents: visible ? 'auto' : 'none' }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 transition-opacity duration-350"
        style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)', opacity: visible ? 1 : 0 }}
        onClick={close}
      />

      {/* Sheet */}
      <div
        className="relative w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl scrollbar-hide"
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
            <h3 className="font-serif font-semibold uppercase tracking-wider"
                style={{ fontSize: '1.1rem', color: t.accentBright, letterSpacing: '0.06em' }}>
              {cat.label}
            </h3>
            <p className="text-[11px] mt-0.5" style={{ color: 'rgba(200,188,168,0.42)' }}>
              Fotos das suítes disponíveis
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

        {/* Suite number chips */}
        {suites.length > 1 && (
          <div className="px-6 pb-3">
            <p className="text-[9px] uppercase tracking-widest mb-2" style={{ color: t.labelColor }}>
              Escolha a suíte
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {suites.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => setCurrentIdx(i)}
                  className="shrink-0 w-11 h-11 rounded-full font-bold text-sm transition-all duration-200 active:scale-95"
                  style={{
                    background: i === currentIdx
                      ? t.accent
                      : `${t.accent}12`,
                    border: `1.5px solid ${i === currentIdx ? t.accent : t.priceBorder}`,
                    color: i === currentIdx ? '#080502' : t.accentBright,
                    transform: i === currentIdx ? 'scale(1.08)' : 'scale(1)',
                  }}
                >
                  {s.room_number ?? '?'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Photo area */}
        <div
          className="relative bg-black select-none overflow-hidden"
          style={{ aspectRatio: '4/3', touchAction: 'pan-y' }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Room number placeholder */}
          <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 0 }}>
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
              <p className="text-sm" style={{ color: 'rgba(200,188,168,0.25)' }}>Sem fotos</p>
            )}
          </div>

          {/* Current photo */}
          {currentPhoto && (
            <img
              key={currentPhoto}
              src={currentPhoto}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              style={{ zIndex: 1 }}
            />
          )}

          {/* Photo counter */}
          {currentPhotos.length > 1 && (
            <div
              className="absolute top-2.5 right-2.5 z-20 pointer-events-none"
              style={{
                background: 'rgba(0,0,0,0.62)',
                border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: '999px',
                padding: '3px 9px',
              }}
            >
              <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.82)', fontVariantNumeric: 'tabular-nums' }}>
                {photoIdx + 1} / {currentPhotos.length}
              </span>
            </div>
          )}

          {/* Photo navigation arrows */}
          {currentPhotos.length > 1 && (
            <>
              <button
                onClick={() => navigatePhoto(-1)}
                disabled={photoIdx === 0}
                className="absolute left-0 top-0 bottom-0 z-20 flex items-center justify-center transition-all"
                style={{
                  width: '20%',
                  background: 'linear-gradient(to right, rgba(0,0,0,0.55), transparent)',
                  opacity: photoIdx === 0 ? 0.15 : 1,
                }}
              >
                <span style={{ fontSize: '2.2rem', color: 'rgba(255,255,255,0.95)', textShadow: '0 2px 12px rgba(0,0,0,0.9)' }}>‹</span>
              </button>
              <button
                onClick={() => navigatePhoto(1)}
                disabled={photoIdx === currentPhotos.length - 1}
                className="absolute right-0 top-0 bottom-0 z-20 flex items-center justify-center transition-all"
                style={{
                  width: '20%',
                  background: 'linear-gradient(to left, rgba(0,0,0,0.55), transparent)',
                  opacity: photoIdx === currentPhotos.length - 1 ? 0.15 : 1,
                }}
              >
                <span style={{ fontSize: '2.2rem', color: 'rgba(255,255,255,0.95)', textShadow: '0 2px 12px rgba(0,0,0,0.9)' }}>›</span>
              </button>
            </>
          )}

          {/* Photo dots */}
          {currentPhotos.length > 1 && (
            <div className="absolute bottom-2.5 left-0 right-0 z-20 flex justify-center gap-1 pointer-events-none">
              {currentPhotos.map((_, i) => (
                <div
                  key={i}
                  className="rounded-full transition-all duration-200"
                  style={{
                    width: i === photoIdx ? '14px' : '5px',
                    height: '5px',
                    background: i === photoIdx ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)',
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Suite info */}
        <div className="px-6 pt-4 pb-2">
          <p className="text-sm font-semibold" style={{ color: 'rgba(228,218,198,0.88)' }}>
            {currentSuite?.name ?? ''}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: t.labelColor }}>
            {currentSuite?.description ?? ''}
          </p>
        </div>

        {/* Divider */}
        <div className="mx-6 mt-2" style={{ height: '1px', background: `${t.accent}15` }} />

        {/* Mini seletor de duração */}
        <div className="px-6 pt-4 pb-2">
          <p className="text-[9px] uppercase tracking-widest mb-2.5" style={{ color: t.labelColor }}>
            Selecione a duração
          </p>
          <div className="flex flex-wrap gap-1.5">
            {availableRows.map(row => {
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
                  <span className="text-[11px] font-medium"
                        style={{ color: isSel ? 'rgba(235,225,205,0.92)' : 'rgba(200,188,168,0.60)' }}>
                    {row.label}
                  </span>
                  <span className="font-sans font-bold tabular-nums text-[11px]"
                        style={{ color: isSel ? t.accentBright : t.labelColor }}>
                    {fmt(price)}
                  </span>
                  {isSel && (
                    <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0"
                         style={{ background: t.accent }}>
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
            <p className="text-[10px] text-center py-1.5 px-3 rounded-lg"
               style={{ color: t.accentBright, background: `${t.accent}12`, border: `1px solid ${t.accent}30` }}>
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
