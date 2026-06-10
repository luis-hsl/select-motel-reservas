import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { SUITES } from '../data'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import type { Suite, SuiteCategory } from '../types'
import { metaEvents } from '../lib/metaPixel'

function toWebP(url: string, width = 600): string {
  if (!url || url.startsWith('/')) return url
  const match = url.match(/\/storage\/v1\/object\/public\/(.+)$/)
  if (!match) return url
  const base = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')
  return `${base}?format=webp&quality=82&width=${width}`
}

function buildSlotLabel(cin: Date, cout: Date): string {
  const fmt = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${fmt(cin)} – ${fmt(cout)}`
}

const CATEGORY_LABEL: Record<SuiteCategory, string> = {
  'VIP Piscina': 'VIP · Piscina',
  'Hidro': 'Hidro',
  'Hidro Light': 'Hidro Light',
  'Standard': 'Standard',
}

// Galeria de cada suíte — adicione mais URLs conforme disponível
const GALLERY: Record<string, string[]> = {
  'suite-11': [], 'suite-12': [], 'suite-13': [], 'suite-14': [],
  'suite-15': [], 'suite-16': [], 'suite-17': [], 'suite-18': [],
  'suite-19': [], 'suite-20': [], 'suite-21': [],
  'suite-22': [], 'suite-23': [], 'suite-24': [], 'suite-25': [], 'suite-26': [],
}

// Suítes decorativas — aparecem sempre como reservadas para criar escassez percebida
const RESERVED_SUITES: Suite[] = [
  { id: 'suite-19', name: 'Suíte 19', category: 'Hidro', description: 'Suíte com banheira de hidromassagem', room_number: 19, size: 'large', cleaning_buffer_h: 2, packageIds: [] },
  { id: 'suite-20', name: 'Suíte 20', category: 'Standard', description: 'Suíte confortável e aconchegante', room_number: 20, size: 'small', cleaning_buffer_h: 1, packageIds: [] },
  { id: 'suite-21', name: 'Suíte 21', category: 'Standard', description: 'Suíte confortável e aconchegante', room_number: 21, size: 'small', cleaning_buffer_h: 1, packageIds: [] },
]

export default function StepSuite() {
  const { mode, package: pkg, suite: selected, setSuite, nextStep, prevStep, checkIn, checkOut } = useStore()
  const [loading, setLoading] = useState(true)
  const [occupiedIds, setOccupiedIds] = useState<Set<string>>(new Set())
  const [galleryFor, setGalleryFor] = useState<Suite | null>(null)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({})
  const [alacarteMap, setAlacarteMap] = useState<Record<string, { period: number | null; overnight: number | null }>>({})

  // Modo pacote: só suítes daquele pacote.
  // Modo experiência: todas as suítes ativas (cliente escolhe livre).
  const packageSuites = mode === 'experience' || !pkg
    ? SUITES
    : SUITES.filter(s => s.packageIds.includes(pkg.id as never))

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
        .select('id, photo_url, video_url, price_period_alacarte, price_overnight_alacarte')
        .then(({ data }: { data: { id: string; photo_url: string | null; video_url: string | null; price_period_alacarte: number | null; price_overnight_alacarte: number | null }[] | null }) => {
          if (data) {
            const urls: Record<string, string> = {}
            const vids: Record<string, string> = {}
            const alacarte: Record<string, { period: number | null; overnight: number | null }> = {}
            data.forEach(s => {
              if (s.photo_url) urls[s.id] = s.photo_url
              if (s.video_url) vids[s.id] = s.video_url
              alacarte[s.id] = {
                period:    s.price_period_alacarte    ?? null,
                overnight: s.price_overnight_alacarte ?? null,
              }
            })
            setPhotoUrls(urls)
            setVideoUrls(vids)
            setAlacarteMap(alacarte)
          }
        })
    )

    const cin = checkIn
    const cout = checkOut()
    if (cin && cout) {
      const cinIso = cin.toISOString()
      const coutIso = cout.toISOString()
      promises.push(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .rpc('get_occupied_suite_ids', { p_check_in: cinIso, p_check_out: coutIso })
          .then(async ({ data, error }: { data: { suite_id: string }[] | null; error: unknown }) => {
            if (!error && data) {
              setOccupiedIds(new Set(data.map((r: { suite_id: string }) => r.suite_id)))
              return
            }
            // Fallback: direct query se a função RPC ainda não existir no banco
            const { data: rows } = await supabase
              .from('reservations')
              .select('suite_id')
              .in('status', ['paid', 'pending'])
              .lt('check_in', coutIso)
              .gt('check_out', cinIso)
            if (rows) setOccupiedIds(new Set(rows.map(r => r.suite_id as string)))
          })
      )
    }

    Promise.all(promises).finally(() => setLoading(false))
  }, [checkIn, checkOut])

  const allOccupied = packageSuites.length > 0 && packageSuites.every(s => occupiedIds.has(s.id))

  function choose(suite: Suite) {
    const prices = alacarteMap[suite.id]
    const suiteWithPrices: Suite = prices
      ? { ...suite, price_period_alacarte: prices.period, price_overnight_alacarte: prices.overnight }
      : suite
    setSuite(suiteWithPrices)

    // Google Ads — conversion "Selecionou suíte"
    const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag
    if (typeof gtag === 'function') {
      gtag('event', 'conversion', {
        send_to: 'AW-18204610844/RBcCCJH5krgcEJyi0ehD',
        value: 1.0,
        currency: 'BRL',
        transaction_id: suite.id,
      })
    }

    // Meta Pixel — AddToCart (sinal mais forte que ViewContent)
    metaEvents.addToCart({ id: suite.id, name: suite.name })

    setTimeout(nextStep, 300)
  }

  return (
    <div>
      <button onClick={prevStep} className="flex items-center gap-1 text-gold-700/60 text-sm mb-8 hover:text-gold-500 transition-colors">
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
          style={{
            background: 'rgba(180,60,20,0.12)',
            border: '1px solid rgba(220,100,40,0.35)',
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
            style={{ background: '#e06030' }}
          />
          <span className="text-[11px] font-medium tracking-wide" style={{ color: 'rgba(240,150,80,0.9)' }}>
            {availableCount === 1
              ? 'Última suíte disponível para este horário'
              : `Apenas ${availableCount} suítes disponíveis`}
          </span>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
          {[1, 2].map(i => (
            <div key={i} className="aspect-square rounded-2xl border border-gold-900/30 bg-gold-900/10 animate-pulse" />
          ))}
        </div>
      ) : allOccupied ? (
        <div className="rounded-xl border border-red-900/40 bg-red-900/10 px-5 py-4 text-center">
          <p className="text-sm text-red-400/80 mb-1">
            {mode === 'experience' || !pkg
              ? 'Todas as suítes estão ocupadas para este período.'
              : `Todas as suítes do ${pkg.label} estão ocupadas para este período.`}
          </p>
          <p className="text-xs text-gold-800/50">Por favor, escolha outro horário ou data.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
          {packageSuites.map(suite => (
            <SuiteCard
              key={suite.id}
              suite={suite}
              photoUrl={photoUrls[suite.id]}
              occupied={occupiedIds.has(suite.id)}
              slotLabel={slotLabel}
              selected={selected?.id === suite.id}
              onChoose={() => choose(suite)}
              onViewMore={() => setGalleryFor(suite)}
            />
          ))}
          {RESERVED_SUITES.map(suite => (
            <SuiteCard
              key={suite.id}
              suite={suite}
              photoUrl={undefined}
              occupied={true}
              slotLabel={slotLabel}
              selected={false}
              onChoose={() => {}}
              onViewMore={() => {}}
            />
          ))}
        </div>
      )}

      {galleryFor && createPortal(
        <SuiteGallery
          suite={galleryFor}
          photoUrl={photoUrls[galleryFor.id]}
          videoUrl={videoUrls[galleryFor.id]}
          occupied={occupiedIds.has(galleryFor.id)}
          slotLabel={slotLabel}
          selected={selected?.id === galleryFor.id}
          onChoose={() => { choose(galleryFor); setGalleryFor(null) }}
          onClose={() => setGalleryFor(null)}
        />,
        document.body
      )}
    </div>
  )
}

// ── Suite Card ─────────────────────────────────────────────

function SuiteCard({ suite, photoUrl, occupied, slotLabel, selected, onChoose, onViewMore }: {
  suite: Suite; photoUrl?: string; occupied: boolean; slotLabel: string; selected: boolean
  onChoose: () => void; onViewMore: () => void
}) {
  const [imgLoaded, setImgLoaded] = useState(false)
  const showPlaceholder = !photoUrl

  return (
    <div
      className={[
        'relative rounded-2xl overflow-hidden border transition-all duration-300',
        occupied
          ? 'border-red-900/40 cursor-not-allowed select-none'
          : selected
          ? 'border-gold-500 ring-2 ring-gold-500/30'
          : 'border-gold-800/40',
      ].join(' ')}
      style={{ aspectRatio: '1 / 1' }}
    >
      {/* Background: photo + gradient overlay */}
      <div className="absolute inset-0" style={{ backgroundColor: '#120a02' }}>
        {photoUrl && (
          <img
            src={photoUrl}
            alt={`${suite.name} ${suite.category} no Select Motel Ivaiporã`}
            loading="eager"
            decoding="sync"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgLoaded(false)}
            className={[
              'absolute inset-0 w-full h-full object-cover transition-opacity duration-500',
              imgLoaded ? 'opacity-100' : 'opacity-0',
              occupied ? 'grayscale-[60%] brightness-[0.55]' : '',
            ].join(' ')}
          />
        )}
        {/* shimmer while photo loads */}
        {photoUrl && !imgLoaded && (
          <div className="absolute inset-0 animate-pulse" style={{ background: 'linear-gradient(135deg, #1a1008 0%, #0e0804 100%)' }} />
        )}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: showPlaceholder ? [
              'radial-gradient(ellipse at 50% 110%, rgba(180,90,15,0.55) 0%, transparent 55%)',
              'radial-gradient(ellipse at 20% 85%, rgba(130,65,10,0.4) 0%, transparent 45%)',
              'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.65) 100%)',
            ].join(', ') : 'linear-gradient(to bottom, rgba(0,0,0,0) 50%, rgba(0,0,0,0.55) 100%)',
          }}
        />
      </div>

      {/* Gold frame border inner glow */}
      <div className="absolute inset-0 rounded-2xl" style={{ boxShadow: 'inset 0 0 30px rgba(0,0,0,0.6)' }} />

      {/* RESERVADO diagonal ribbon */}
      {occupied && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
          style={{ transform: 'rotate(-35deg)' }}
        >
          <div
            className="flex flex-col items-center gap-0.5 px-8 py-2 select-none"
            style={{
              background: 'linear-gradient(135deg, rgba(90,8,22,0.97) 0%, rgba(120,12,30,1) 100%)',
              border: '1px solid rgba(200,150,60,0.5)',
              borderLeft: 'none',
              borderRight: 'none',
              boxShadow: '0 0 24px rgba(120,0,20,0.6), inset 0 1px 0 rgba(255,200,100,0.15)',
              width: '180%',
            }}
          >
            <div className="flex items-center gap-2">
              {/* Lock icon */}
              <svg width="10" height="12" viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0 opacity-80">
                <rect x="1" y="5" width="8" height="7" rx="1.2" fill="rgba(200,150,60,0.9)" />
                <path d="M2.5 5V3.5a2.5 2.5 0 0 1 5 0V5" stroke="rgba(200,150,60,0.9)" strokeWidth="1.2" strokeLinecap="round" fill="none" />
              </svg>
              <span
                className="font-bold tracking-[0.3em] uppercase"
                style={{ fontSize: '0.6rem', color: 'rgba(240,200,100,0.95)', textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}
              >
                Reservado
              </span>
            </div>
            {slotLabel && (
              <span
                className="tracking-widest"
                style={{ fontSize: '0.5rem', color: 'rgba(200,150,80,0.7)' }}
              >
                {slotLabel}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col p-4">

        {/* Top: SUÍTE label + line — only when no uploaded cover photo */}
        {showPlaceholder && (
          <div className="text-center">
            <p className="text-[9px] tracking-[0.45em] uppercase font-medium mb-1.5" style={{ color: occupied ? 'rgba(180,150,100,0.5)' : 'rgba(220,185,100,0.75)' }}>
              S U Í T E
            </p>
            <div
              className="h-px mx-auto w-12"
              style={{
                background: occupied
                  ? 'linear-gradient(to right, transparent, rgba(150,100,60,0.6), transparent)'
                  : 'linear-gradient(to right, transparent, #c9a84c, transparent)',
                boxShadow: occupied ? 'none' : '0 0 6px rgba(200,160,50,0.7)',
              }}
            />
          </div>
        )}

        {/* Center: Room number — only when no uploaded cover photo */}
        <div className="flex-1 flex items-center justify-center">
          {showPlaceholder && (
            <span
              className="font-serif font-bold text-transparent bg-clip-text select-none"
              style={{
                fontSize: 'clamp(4rem, 16vw, 6rem)',
                backgroundImage: occupied
                  ? 'linear-gradient(160deg, #a08060 0%, #7a5a30 35%, #5a3a10 70%, #8a6030 100%)'
                  : 'linear-gradient(160deg, #fce8a8 0%, #d4a017 35%, #8b6010 70%, #c9a84c 100%)',
                lineHeight: 1,
                filter: occupied
                  ? 'drop-shadow(0 2px 8px rgba(80,50,20,0.3))'
                  : 'drop-shadow(0 2px 16px rgba(200,150,30,0.5))',
              }}
            >
              {suite.room_number}
            </span>
          )}
        </div>

        {/* Bottom: category + buttons */}
        <div className="space-y-2">
          {showPlaceholder && (
            <p className="text-[9px] tracking-widest uppercase text-center" style={{ color: occupied ? 'rgba(160,120,60,0.4)' : 'rgba(200,165,80,0.5)' }}>
              {CATEGORY_LABEL[suite.category]}
            </p>
          )}

          {occupied ? (
            <div className="w-full text-center py-1.5 rounded-lg border border-red-900/50 text-[10px] tracking-widest uppercase text-red-400/60">
              Reservado
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); onViewMore() }}
                className="py-1 rounded-lg text-[9px] tracking-widest uppercase font-medium transition-all duration-200 active:scale-95"
                style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(201,168,76,0.35)', color: 'rgba(220,185,100,0.75)' }}
              >
                Ver Suíte
              </button>
              <button
                onClick={onChoose}
                className="py-1 rounded-lg text-[9px] tracking-wide font-semibold text-black transition-all duration-200 active:scale-95"
                style={{ background: selected ? 'linear-gradient(135deg,#c9a84c,#f5d87a,#a07820)' : 'rgba(201,168,76,0.85)' }}
              >
                {selected ? '✓ Escolhida' : 'Escolher'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Corner accent dot */}
      {occupied && (
        <div
          className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full z-30"
          style={{ background: 'rgba(180,30,50,0.9)', boxShadow: '0 0 6px rgba(200,20,40,0.7)' }}
        />
      )}
    </div>
  )
}

// ── Suite Gallery Modal ────────────────────────────────────

function SuiteGallery({ suite, photoUrl, videoUrl, occupied, slotLabel, selected, onChoose, onClose }: {
  suite: Suite; photoUrl?: string; videoUrl?: string; occupied: boolean; slotLabel: string; selected: boolean
  onChoose: () => void; onClose: () => void
}) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => setTimeout(() => setVisible(true), 10))
    return () => { document.body.style.overflow = '' }
  }, [])

  function close() {
    setVisible(false)
    setTimeout(onClose, 360)
  }

  const coverUrl = photoUrl ?? `/suites/${suite.id}.jpg`
  const extraPhotos = GALLERY[suite.id] ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ pointerEvents: visible ? 'auto' : 'none' }}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 transition-opacity duration-350"
        style={{ background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(8px)', opacity: visible ? 1 : 0 }}
        onClick={close}
      />

      {/* Sheet */}
      <div
        className="relative w-full sm:max-w-md max-h-[82vh] sm:max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl scrollbar-hide transition-all duration-380"
        style={{
          backgroundColor: '#0c0702',
          border: '1px solid rgba(201,168,76,0.3)',
          boxShadow: '0 -24px 80px rgba(0,0,0,0.9)',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          opacity: visible ? 1 : 0,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gold-800/40" />
        </div>

        {/* Video — shown when available */}
        {videoUrl && (
          <div className="relative bg-black">
            <video
              src={videoUrl}
              autoPlay
              loop
              playsInline
              controls
              // tenta iniciar com áudio; se o browser bloquear autoplay com som,
              // re-tenta mutado pra ao menos rodar o vídeo (user clica no alto-falante depois).
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
              style={{ maxHeight: '60vh' }}
            />
            <button
              onClick={close}
              aria-label="Fechar"
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full flex items-center justify-center text-sm transition-opacity hover:opacity-80"
              style={{ background: 'rgba(0,0,0,0.6)', color: 'rgba(220,185,100,0.8)', border: '1px solid rgba(201,168,76,0.3)' }}
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        )}

        {/* Cover photo — shown only when there is no video */}
        {!videoUrl && <div
          className="relative w-full overflow-hidden"
          style={{ aspectRatio: '4 / 3', backgroundColor: '#1a0f02' }}
        >
          <img
            src={toWebP(coverUrl, 800)}
            alt={`Foto da ${suite.name} — ${suite.category} no Select Motel Ivaiporã`}
            loading="eager"
            decoding="async"
            className={[
              'absolute inset-0 w-full h-full object-cover transition-all duration-300',
              occupied ? 'grayscale-[60%] brightness-[0.5]' : '',
            ].join(' ')}
          />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: [
                'radial-gradient(ellipse at 50% 110%, rgba(180,90,15,0.6) 0%, transparent 55%)',
                'radial-gradient(ellipse at 15% 85%, rgba(130,65,10,0.45) 0%, transparent 48%)',
                'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.6) 100%)',
              ].join(', '),
            }}
          />
          {/* Close button — only when no video (video section has its own close) */}
          {!videoUrl && (
            <button
              onClick={close}
              aria-label="Fechar"
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full flex items-center justify-center text-sm transition-opacity hover:opacity-80"
              style={{ background: 'rgba(0,0,0,0.6)', color: 'rgba(220,185,100,0.8)', border: '1px solid rgba(201,168,76,0.3)' }}
            >
              <span aria-hidden="true">✕</span>
            </button>
          )}

          {/* Suite label overlay — only when no uploaded photo */}
          {!photoUrl && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-[9px] tracking-[0.5em] uppercase mb-2" style={{ color: occupied ? 'rgba(180,150,100,0.5)' : 'rgba(220,185,100,0.7)' }}>
              S U Í T E
            </p>
            <div className="h-px w-10 mb-3" style={{
              background: occupied
                ? 'linear-gradient(to right, transparent, rgba(150,100,60,0.5), transparent)'
                : 'linear-gradient(to right, transparent, #c9a84c, transparent)',
              boxShadow: occupied ? 'none' : '0 0 6px rgba(200,160,50,0.8)',
            }} />
            <span
              className="font-serif font-bold text-transparent bg-clip-text"
              style={{
                fontSize: 'clamp(5rem, 22vw, 8rem)',
                backgroundImage: occupied
                  ? 'linear-gradient(160deg, #a08060 0%, #7a5a30 35%, #5a3a10 70%, #8a6030 100%)'
                  : 'linear-gradient(160deg, #fce8a8 0%, #d4a017 35%, #8b6010 70%, #c9a84c 100%)',
                lineHeight: 1,
                filter: occupied
                  ? 'drop-shadow(0 2px 8px rgba(80,50,20,0.3))'
                  : 'drop-shadow(0 4px 20px rgba(200,150,30,0.6))',
              }}
            >
              {suite.room_number}
            </span>
          </div>
          )}

          {/* RESERVADO ribbon over gallery cover */}
          {occupied && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
              style={{ transform: 'rotate(-20deg)' }}
            >
              <div
                className="flex flex-col items-center gap-1 px-12 py-3 select-none"
                style={{
                  background: 'linear-gradient(135deg, rgba(90,8,22,0.97) 0%, rgba(120,12,30,1) 100%)',
                  border: '1px solid rgba(200,150,60,0.5)',
                  borderLeft: 'none',
                  borderRight: 'none',
                  boxShadow: '0 0 32px rgba(120,0,20,0.7), inset 0 1px 0 rgba(255,200,100,0.15)',
                  width: '120%',
                }}
              >
                <div className="flex items-center gap-2.5">
                  <svg width="12" height="14" viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0 opacity-80">
                    <rect x="1" y="5" width="8" height="7" rx="1.2" fill="rgba(200,150,60,0.9)" />
                    <path d="M2.5 5V3.5a2.5 2.5 0 0 1 5 0V5" stroke="rgba(200,150,60,0.9)" strokeWidth="1.2" strokeLinecap="round" fill="none" />
                  </svg>
                  <span
                    className="font-bold tracking-[0.35em] uppercase"
                    style={{ fontSize: '0.75rem', color: 'rgba(240,200,100,0.95)', textShadow: '0 1px 8px rgba(0,0,0,0.8)' }}
                  >
                    Reservado
                  </span>
                </div>
                {slotLabel && (
                  <span
                    className="tracking-widest"
                    style={{ fontSize: '0.6rem', color: 'rgba(200,150,80,0.75)' }}
                  >
                    {slotLabel}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>}

        {/* Extra photos grid */}
        {extraPhotos.length > 0 && (
          <div className="grid grid-cols-3 gap-1 p-1">
            {extraPhotos.map((url, i) => (
              <div
                key={i}
                className="rounded-lg overflow-hidden"
                style={{ aspectRatio: '1 / 1', backgroundColor: '#1a0f02' }}
              >
                <img
                  src={toWebP(url, 400)}
                  alt={`${suite.name} ${suite.category} — foto ${i + 1} no Select Motel Ivaiporã`}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        )}

        {/* Suite info */}
        <div className="px-6 py-5 space-y-5">
          {/* Occupied notice */}
          {occupied && (
            <div
              className="rounded-xl px-4 py-3 flex items-center gap-3"
              style={{ background: 'rgba(90,8,22,0.35)', border: '1px solid rgba(180,30,50,0.4)' }}
            >
              <svg width="16" height="18" viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
                <rect x="1" y="5" width="8" height="7" rx="1.2" fill="rgba(200,100,100,0.9)" />
                <path d="M2.5 5V3.5a2.5 2.5 0 0 1 5 0V5" stroke="rgba(200,100,100,0.9)" strokeWidth="1.2" strokeLinecap="round" fill="none" />
              </svg>
              <div>
                <p className="text-xs font-semibold text-red-400/90">Suíte reservada para este período</p>
                {slotLabel && (
                  <p className="text-[10px] text-red-500/60 mt-0.5">{slotLabel}</p>
                )}
              </div>
            </div>
          )}

          {/* CTA */}
          {!occupied ? (
            <button
              onClick={onChoose}
              className="w-full py-4 rounded-xl font-semibold text-sm tracking-wider text-black transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
              style={{ background: selected ? 'linear-gradient(135deg,#c9a84c,#f5d87a,#a07820)' : 'linear-gradient(135deg,#a07820,#d4a017,#8b6010)' }}
            >
              {selected ? '✓ Suíte selecionada' : `Escolher Suíte ${suite.room_number}`}
            </button>
          ) : (
            <div className="w-full py-4 rounded-xl text-center text-sm border border-red-900/40 text-red-400/60">
              Suíte reservada para este período
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


