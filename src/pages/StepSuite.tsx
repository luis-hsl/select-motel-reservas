import { useState, useEffect, useMemo, useRef } from 'react'
import { SUITES } from '../data'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import type { Suite, SuiteCategory } from '../types'
import { metaEvents } from '../lib/metaPixel'

function buildSlotLabel(cin: Date, cout: Date): string {
  const fmt = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${fmt(cin)} – ${fmt(cout)}`
}

const THEMES: Record<SuiteCategory, { accent: string; accentBright: string; bg: string; border: string; priceBorder: string; labelColor: string }> = {
  'Standard': {
    accent:      '#b8975a',
    accentBright:'#dfc07a',
    bg:          'linear-gradient(160deg, #0d0b08 0%, #080602 100%)',
    border:      'rgba(184,151,90,0.18)',
    priceBorder: 'rgba(184,151,90,0.13)',
    labelColor:  'rgba(223,192,122,0.38)',
  },
  'Hidro Light': {
    accent:      '#4aafc0',
    accentBright:'#78d0e4',
    bg:          'linear-gradient(160deg, #050c11 0%, #030810 100%)',
    border:      'rgba(74,175,192,0.18)',
    priceBorder: 'rgba(74,175,192,0.13)',
    labelColor:  'rgba(120,208,228,0.38)',
  },
  'VIP Piscina': {
    accent:      '#c07260',
    accentBright:'#e49a84',
    bg:          'linear-gradient(160deg, #100807 0%, #0c0503 100%)',
    border:      'rgba(192,114,96,0.18)',
    priceBorder: 'rgba(192,114,96,0.13)',
    labelColor:  'rgba(228,154,132,0.38)',
  },
  'Hidro': {
    accent:      '#4aafc0',
    accentBright:'#78d0e4',
    bg:          'linear-gradient(160deg, #050c11 0%, #030810 100%)',
    border:      'rgba(74,175,192,0.18)',
    priceBorder: 'rgba(74,175,192,0.13)',
    labelColor:  'rgba(120,208,228,0.38)',
  },
}

const DEFAULT_THEME = THEMES['Standard']

// Suítes decorativas — aparecem sempre como reservadas para criar escassez percebida
const RESERVED_SUITE_IDS = new Set(['suite-19', 'suite-20', 'suite-21'])
const RESERVED_SUITES: Suite[] = [
  { id: 'suite-19', name: 'Suíte 19', category: 'Hidro',    description: 'Suíte com banheira de hidromassagem', room_number: 19, size: 'large', cleaning_buffer_h: 2, packageIds: [] },
  { id: 'suite-20', name: 'Suíte 20', category: 'Standard', description: 'Suíte confortável e aconchegante',   room_number: 20, size: 'small', cleaning_buffer_h: 1, packageIds: [] },
  { id: 'suite-21', name: 'Suíte 21', category: 'Standard', description: 'Suíte confortável e aconchegante',   room_number: 21, size: 'small', cleaning_buffer_h: 1, packageIds: [] },
]

export default function StepSuite() {
  const { mode, package: pkg, suiteCategory, suite: selected, setSuite, nextStep, prevStep, checkIn, checkOut } = useStore()

  const [loading, setLoading]         = useState(true)
  const [occupiedIds, setOccupiedIds] = useState<Set<string>>(new Set())
  const [photosMap, setPhotosMap]     = useState<Record<string, string[]>>({})
  const [alacarteMap, setAlacarteMap] = useState<Record<string, { period: number | null; overnight: number | null }>>({})
  const [currentIdx, setCurrentIdx]   = useState(0)
  const [photoIdx, setPhotoIdx]       = useState(0)
  const touchStartX                   = useRef<number | null>(null)

  const packageSuites = mode === 'suite' && suiteCategory
    ? SUITES.filter(s => s.category === suiteCategory)
    : mode === 'experience' || !pkg
      ? SUITES
      : SUITES.filter(s => s.packageIds.includes(pkg.id as never))

  // Adiciona suítes reservadas decorativas que ainda não estejam na lista
  const allSuites = [
    ...packageSuites,
    ...RESERVED_SUITES.filter(r => !packageSuites.find(s => s.id === r.id)),
  ]

  const availableCount = packageSuites.filter(s => !occupiedIds.has(s.id)).length

  const slotLabel = useMemo(() => {
    const cin = checkIn
    const cout = checkOut()
    if (!cin || !cout) return ''
    return buildSlotLabel(cin, cout)
  }, [checkIn, checkOut])

  useEffect(() => {
    const promises: PromiseLike<unknown>[] = []

    promises.push(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('suites')
        .select('id, photos, price_period_alacarte, price_overnight_alacarte')
        .then(({ data }: { data: { id: string; photos: string[] | null; price_period_alacarte: number | null; price_overnight_alacarte: number | null }[] | null }) => {
          if (data) {
            const pmap: Record<string, string[]> = {}
            const alacarte: Record<string, { period: number | null; overnight: number | null }> = {}
            data.forEach(s => {
              if (Array.isArray(s.photos) && s.photos.length > 0) pmap[s.id] = s.photos
              alacarte[s.id] = { period: s.price_period_alacarte ?? null, overnight: s.price_overnight_alacarte ?? null }
            })
            setPhotosMap(pmap)
            setAlacarteMap(alacarte)
          }
        })
    )

    const cin = checkIn
    const cout = checkOut()
    if (cin && cout) {
      const coutIso  = cout.toISOString()
      const cinBuf   = new Date(cin.getTime() - 60 * 60 * 1000)
      const cinBufIso = cinBuf.toISOString()
      promises.push(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .rpc('get_occupied_suite_ids', { p_check_in: cinBufIso, p_check_out: coutIso })
          .then(async ({ data, error }: { data: { suite_id: string }[] | null; error: unknown }) => {
            if (!error && data) {
              setOccupiedIds(new Set(data.map((r: { suite_id: string }) => r.suite_id)))
              return
            }
            const { data: rows } = await supabase
              .from('reservations')
              .select('suite_id')
              .in('status', ['paid', 'pending'])
              .lt('check_in', coutIso)
              .gt('check_out', cinBufIso)
            if (rows) setOccupiedIds(new Set(rows.map(r => r.suite_id as string)))
          })
      )
    }

    Promise.all(promises).finally(() => setLoading(false))
  }, [checkIn, checkOut])

  const currentSuite   = allSuites[currentIdx] ?? null
  const currentPhotos  = currentSuite ? (photosMap[currentSuite.id] ?? []) : []
  const currentPhoto   = currentPhotos[photoIdx] ?? null

  // Reset foto ao trocar de suíte
  useEffect(() => { setPhotoIdx(0) }, [currentIdx])

  const isOccupied  = currentSuite
    ? (occupiedIds.has(currentSuite.id) || RESERVED_SUITE_IDS.has(currentSuite.id))
    : false
  const hasMultiple = allSuites.length > 1
  const allRealOccupied = packageSuites.length > 0 && packageSuites.every(s => occupiedIds.has(s.id))

  const t = suiteCategory ? (THEMES[suiteCategory] ?? DEFAULT_THEME) : DEFAULT_THEME

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

  function choose(suite: Suite) {
    const prices = alacarteMap[suite.id]
    const suiteWithPrices: Suite = prices
      ? { ...suite, price_period_alacarte: prices.period, price_overnight_alacarte: prices.overnight }
      : suite
    setSuite(suiteWithPrices)

    const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag
    if (typeof gtag === 'function') {
      gtag('event', 'conversion', {
        send_to: 'AW-18204610844/RBcCCJH5krgcEJyi0ehD',
        value: 1.0,
        currency: 'BRL',
        transaction_id: suite.id,
      })
    }
    metaEvents.addToCart({ id: suite.id, name: suite.name })
    setTimeout(nextStep, 300)
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
        Escolha a suíte<br />
        <span className="gold-gradient font-semibold italic pr-1 lg:pr-3">de vocês.</span>
      </h1>
      <p className="text-gold-700/70 text-sm mb-3 sm:mb-4">
        {mode === 'experience' || !pkg
          ? <>Disponíveis para o horário de vocês.</>
          : <>Suítes disponíveis para o <strong className="text-gold-500 font-medium">{pkg.label}</strong>.</>}
      </p>

      {!loading && availableCount > 0 && availableCount <= 3 && (
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6 sm:mb-8"
          style={{ background: 'rgba(180,60,20,0.12)', border: '1px solid rgba(220,100,40,0.35)' }}
        >
          <span className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ background: '#e06030' }} />
          <span className="text-[11px] font-medium tracking-wide" style={{ color: 'rgba(240,150,80,0.9)' }}>
            {availableCount === 1
              ? 'Última suíte disponível para este horário'
              : `Apenas ${availableCount} suítes disponíveis`}
          </span>
        </div>
      )}

      {loading ? (
        <div
          className="w-full max-w-md rounded-2xl animate-pulse"
          style={{ height: '320px', background: '#0d0b08', border: `1px solid ${t.border}` }}
        />
      ) : allRealOccupied ? (
        <div className="rounded-xl border border-red-900/40 bg-red-900/10 px-5 py-4 text-center">
          <p className="text-sm text-red-400/80 mb-1">
            {mode === 'experience' || !pkg
              ? 'Todas as suítes estão ocupadas para este período.'
              : `Todas as suítes do ${pkg.label} estão ocupadas para este período.`}
          </p>
          <p className="text-xs text-gold-800/50">Por favor, escolha outro horário ou data.</p>
        </div>
      ) : (
        <div
          className="max-w-md rounded-2xl overflow-hidden transition-colors duration-300"
          style={{ background: '#0c0702', border: `1px solid ${t.border}` }}
        >
          {/* Suite number chips */}
          {hasMultiple && (
            <div className="px-5 pt-5 pb-3">
              <p className="text-[9px] uppercase tracking-widest mb-2" style={{ color: t.labelColor }}>
                Suítes disponíveis
              </p>
              <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
                {allSuites.map((s, i) => {
                  const occ = occupiedIds.has(s.id) || RESERVED_SUITE_IDS.has(s.id)
                  const isActive = i === currentIdx
                  return (
                    <button
                      key={s.id}
                      onClick={() => setCurrentIdx(i)}
                      className="shrink-0 w-11 h-11 rounded-full font-bold text-sm transition-all duration-200 active:scale-95 relative"
                      style={{
                        background: isActive
                          ? (occ ? 'rgba(90,8,22,0.9)' : t.accent)
                          : (occ ? 'rgba(80,20,30,0.3)' : `${t.accent}12`),
                        border: `1.5px solid ${isActive
                          ? (occ ? 'rgba(200,80,80,0.6)' : t.accent)
                          : (occ ? 'rgba(180,40,60,0.3)' : t.priceBorder)}`,
                        color: isActive
                          ? (occ ? 'rgba(240,160,160,0.9)' : '#080502')
                          : (occ ? 'rgba(200,80,80,0.5)' : t.accentBright),
                        transform: isActive ? 'scale(1.08)' : 'scale(1)',
                        textDecoration: occ ? 'line-through' : 'none',
                      }}
                    >
                      {s.room_number ?? '?'}
                    </button>
                  )
                })}
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
              {currentSuite && (
                <span
                  className="font-serif font-bold text-transparent bg-clip-text select-none"
                  style={{
                    fontSize: 'clamp(4rem, 18vw, 7rem)',
                    backgroundImage: isOccupied
                      ? 'linear-gradient(160deg, #a08060 0%, #7a5a30 35%, #5a3a10 70%, #8a6030 100%)'
                      : 'linear-gradient(160deg, #fce8a8 0%, #d4a017 35%, #8b6010 70%, #c9a84c 100%)',
                    lineHeight: 1,
                    filter: isOccupied
                      ? 'drop-shadow(0 2px 8px rgba(80,50,20,0.3))'
                      : 'drop-shadow(0 4px 20px rgba(200,150,30,0.5))',
                  }}
                >
                  {currentSuite.room_number}
                </span>
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

            {/* Ribbon reservado */}
            {isOccupied && (
              <div
                className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
                style={{ transform: 'rotate(-25deg)' }}
              >
                <div
                  className="flex flex-col items-center gap-0.5 select-none"
                  style={{
                    background: 'linear-gradient(135deg, rgba(90,8,22,0.97) 0%, rgba(120,12,30,1) 100%)',
                    border: '1px solid rgba(200,150,60,0.5)',
                    borderLeft: 'none',
                    borderRight: 'none',
                    boxShadow: '0 0 24px rgba(120,0,20,0.6)',
                    width: '160%',
                    padding: '6px 0',
                  }}
                >
                  <span className="font-bold tracking-[0.3em] uppercase"
                        style={{ fontSize: '0.65rem', color: 'rgba(240,200,100,0.95)' }}>
                    Reservado
                  </span>
                  {slotLabel && (
                    <span className="tracking-widest" style={{ fontSize: '0.5rem', color: 'rgba(200,150,80,0.7)' }}>
                      {slotLabel}
                    </span>
                  )}
                </div>
              </div>
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

          {/* CTA */}
          <div className="px-6 py-5">
            {isOccupied ? (
              <div
                className="w-full py-3.5 rounded-xl text-center text-sm"
                style={{ border: '1px solid rgba(180,30,50,0.4)', color: 'rgba(200,80,80,0.7)' }}
              >
                Suíte reservada para este período
              </div>
            ) : (
              <button
                onClick={() => currentSuite && choose(currentSuite)}
                className="w-full py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
                style={{
                  background: selected?.id === currentSuite?.id
                    ? 'linear-gradient(135deg, #c9a84c, #f5d87a, #a07820)'
                    : `linear-gradient(135deg, ${t.accent}cc, ${t.accentBright}cc, ${t.accent}cc)`,
                  color: '#080502',
                }}
              >
                {selected?.id === currentSuite?.id
                  ? `✓ Suíte selecionada`
                  : `Escolher ${currentSuite?.name ?? ''} →`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
