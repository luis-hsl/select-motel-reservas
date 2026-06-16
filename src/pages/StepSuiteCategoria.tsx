import { useState, useEffect, useRef } from 'react'
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
    priceBorder: 'rgba(184,151,90,0.13)',
    labelColor:  'rgba(223,192,122,0.38)',
  },
  {
    accent:      '#4aafc0',
    accentBright:'#78d0e4',
    bg:          'linear-gradient(160deg, #050c11 0%, #030810 100%)',
    border:      'rgba(74,175,192,0.18)',
    priceBorder: 'rgba(74,175,192,0.13)',
    labelColor:  'rgba(120,208,228,0.38)',
  },
  {
    accent:      '#c07260',
    accentBright:'#e49a84',
    bg:          'linear-gradient(160deg, #100807 0%, #0c0503 100%)',
    border:      'rgba(192,114,96,0.18)',
    priceBorder: 'rgba(192,114,96,0.13)',
    labelColor:  'rgba(228,154,132,0.38)',
  },
]

const PRICE_ROWS: { key: ReservationType; label: string }[] = [
  { key: 'oneHour',   label: '1 Hora'   },
  { key: 'period',    label: 'Período'  },
  { key: 'overnight', label: 'Pernoite' },
  { key: 'diaria',    label: 'Diária'   },
]

function getSuitesForCategory(cat: SuiteCategoryDef): Suite[] {
  return SUITES.filter(s => s.category === cat.dbCategory)
}

export default function StepSuiteCategoria() {
  const { setSuiteCategory, setSuite, setType, setStep, prevStep } = useStore()

  const [selectedCatIdx, setSelectedCatIdx]   = useState(0)
  const [selectedType, setSelectedType]       = useState<ReservationType | null>(null)
  const [currentSuiteIdx, setCurrentSuiteIdx] = useState(0)
  const [videoUrls, setVideoUrls]             = useState<Record<string, string>>({})
  const [showWarning, setShowWarning]         = useState(false)
  const touchStartX                           = useRef<number | null>(null)

  const cat          = SUITE_CATEGORIES[selectedCatIdx]
  const t            = THEMES[selectedCatIdx]
  const suites       = getSuitesForCategory(cat)
  const currentSuite = suites[currentSuiteIdx] ?? null
  const videoUrl     = currentSuite ? videoUrls[currentSuite.id] : undefined
  const hasMultiple  = suites.length > 1

  /* reset ao trocar categoria */
  useEffect(() => {
    setCurrentSuiteIdx(0)
    setSelectedType(null)
  }, [selectedCatIdx])

  /* limpa aviso quando duração é selecionada */
  useEffect(() => {
    if (selectedType) setShowWarning(false)
  }, [selectedType])

  /* busca URLs de vídeo de todas as suítes */
  useEffect(() => {
    const ids = SUITE_CATEGORIES.flatMap(getSuitesForCategory).map(s => s.id)
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
  }, [])

  function navigate(dir: 1 | -1) {
    setCurrentSuiteIdx(i => Math.min(Math.max(0, i + dir), suites.length - 1))
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const delta = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(delta) > 45) navigate(delta > 0 ? 1 : -1)
    touchStartX.current = null
  }

  function handleContinue() {
    if (!selectedType) { setShowWarning(true); return }
    setSuiteCategory(cat.dbCategory)
    setType(selectedType)
    if (currentSuite) {
      setSuite(currentSuite)
      setStep(4) // já selecionou a suíte → pula StepSuite, vai p/ StepData
    } else {
      setStep(3) // fallback: vai para StepSuite escolher
    }
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
        Qual tipo de<br />
        <span className="gold-gradient font-semibold italic pr-1 lg:pr-3">suíte?</span>
      </h1>
      <p className="text-gold-700/70 text-sm mb-8 sm:mb-10">
        Escolha a categoria e a duração da sua reserva.
      </p>

      {/* Seleção de categoria */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl xl:max-w-4xl mb-8">
        {SUITE_CATEGORIES.map((c, i) => {
          const th       = THEMES[i]
          const isSelected = selectedCatIdx === i
          const minPrice = c.prices.oneHour ?? c.prices.period
          return (
            <button
              key={c.id}
              onClick={() => setSelectedCatIdx(i)}
              className="relative flex flex-col rounded-2xl overflow-hidden transition-all duration-300 text-left hover:scale-[1.012] active:scale-[0.99]"
              style={{
                background:  th.bg,
                border:      `1px solid ${isSelected ? th.accentBright + '55' : th.border}`,
                boxShadow:   isSelected
                  ? `0 0 0 1px ${th.accent}28, 0 2px 20px ${th.accent}08`
                  : `0 2px 12px ${th.accent}04`,
                padding: '1.25rem 1.5rem',
              }}
            >
              {isSelected && (
                <div
                  className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: th.accent }}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12">
                    <path d="M2 6l3 3 5-5" stroke="#080502" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}

              <div className="w-5 h-px mb-4 transition-colors duration-300" style={{ background: th.accent }} />

              <h2
                className="font-serif font-semibold uppercase leading-tight mb-2"
                style={{ fontSize: '1.05rem', letterSpacing: '0.06em', color: th.accentBright }}
              >
                {c.label}
              </h2>
              <p className="text-xs leading-relaxed mb-3" style={{ color: 'rgba(205,195,178,0.50)' }}>
                {c.description}
              </p>
              <div className="text-[10px] font-medium" style={{ color: th.labelColor }}>
                A partir de {fmt(minPrice)}
              </div>
            </button>
          )
        })}
      </div>

      {/* Preview da suíte + seleção de duração */}
      <div
        className="max-w-3xl xl:max-w-4xl rounded-2xl overflow-hidden transition-colors duration-300"
        style={{ background: '#0c0702', border: `1px solid ${t.border}` }}
      >
        {/* Vídeo / placeholder com swipe */}
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

          {/* Setas de navegação sobre o vídeo */}
          {hasMultiple && (
            <>
              <button
                onClick={() => navigate(-1)}
                disabled={currentSuiteIdx === 0}
                className="absolute left-0 top-0 bottom-0 flex items-center justify-center transition-all"
                style={{
                  width: '20%',
                  background: 'linear-gradient(to right, rgba(0,0,0,0.55), transparent)',
                  opacity: currentSuiteIdx === 0 ? 0.2 : 1,
                }}
              >
                <span style={{ fontSize: '2rem', color: 'rgba(255,255,255,0.8)', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>‹</span>
              </button>
              <button
                onClick={() => navigate(1)}
                disabled={currentSuiteIdx === suites.length - 1}
                className="absolute right-0 top-0 bottom-0 flex items-center justify-center transition-all"
                style={{
                  width: '20%',
                  background: 'linear-gradient(to left, rgba(0,0,0,0.55), transparent)',
                  opacity: currentSuiteIdx === suites.length - 1 ? 0.2 : 1,
                }}
              >
                <span style={{ fontSize: '2rem', color: 'rgba(255,255,255,0.8)', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>›</span>
              </button>
            </>
          )}
        </div>

        {/* Info da suíte + paginação */}
        <div className="px-6 pt-4 pb-2">
          <div className="flex items-center gap-3 mb-0.5">
            {hasMultiple && (
              <button
                onClick={() => navigate(-1)}
                disabled={currentSuiteIdx === 0}
                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95"
                style={{
                  background: currentSuiteIdx === 0 ? `${t.accent}10` : `${t.accent}22`,
                  border: `1px solid ${currentSuiteIdx === 0 ? t.priceBorder : t.accent + '55'}`,
                  color: currentSuiteIdx === 0 ? 'rgba(200,188,168,0.2)' : t.accentBright,
                  fontSize: '1.2rem',
                }}
              >‹</button>
            )}

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: 'rgba(228,218,198,0.88)' }}>
                {currentSuite?.name ?? cat.label}
              </p>
              {hasMultiple && (
                <div className="flex items-center gap-1 mt-1">
                  {suites.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentSuiteIdx(i)}
                      className="rounded-full transition-all duration-200"
                      style={{
                        width:  i === currentSuiteIdx ? '16px' : '5px',
                        height: '5px',
                        background: i === currentSuiteIdx ? t.accentBright : `${t.accent}40`,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {hasMultiple && (
              <button
                onClick={() => navigate(1)}
                disabled={currentSuiteIdx === suites.length - 1}
                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95"
                style={{
                  background: currentSuiteIdx === suites.length - 1 ? `${t.accent}10` : `${t.accent}22`,
                  border: `1px solid ${currentSuiteIdx === suites.length - 1 ? t.priceBorder : t.accent + '55'}`,
                  color: currentSuiteIdx === suites.length - 1 ? 'rgba(200,188,168,0.2)' : t.accentBright,
                  fontSize: '1.2rem',
                }}
              >›</button>
            )}
          </div>

          <p className="text-[11px] mt-1" style={{ color: t.labelColor }}>
            {currentSuite?.description ?? cat.description}
          </p>

          {hasMultiple && (
            <p className="text-[9px] mt-2" style={{ color: 'rgba(200,188,168,0.22)' }}>
              ← Deslize no vídeo ou toque nas setas para ver mais suítes →
            </p>
          )}
        </div>

        {/* Divider */}
        <div className="mx-6 mt-2" style={{ height: '1px', background: `${t.accent}15` }} />

        {/* Seletor de duração */}
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
                  onClick={() => setSelectedType(prev => (prev === row.key ? null : row.key))}
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
              Selecione a duração acima para continuar
            </p>
          </div>
        )}

        {/* CTA */}
        <div className="px-6 py-5">
          <button
            onClick={handleContinue}
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
            {currentSuite ? `Reservar ${currentSuite.name} →` : 'Continuar reserva →'}
          </button>
        </div>
      </div>
    </div>
  )
}
