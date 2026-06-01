import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { SUITES } from '../data'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import type { Suite, SuiteCategory } from '../types'

function toWebP(url: string, width = 600): string {
  if (!url || url.startsWith('/')) return url
  const match = url.match(/\/storage\/v1\/object\/public\/(.+)$/)
  if (!match) return url
  const base = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')
  return `${base}?format=webp&quality=82&width=${width}`
}

function buildSlotLabel(cin: Date, cout: Date): string {
  const fmtDate = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const fmtTime = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const sameDay = cin.toDateString() === cout.toDateString()
  if (sameDay) return `${fmtDate(cin)} · ${fmtTime(cin)} – ${fmtTime(cout)}`
  return `${fmtDate(cin)} ${fmtTime(cin)} – ${fmtDate(cout)} ${fmtTime(cout)}`
}

const WHATSAPP_MSG = encodeURIComponent('Olá! Gostaria de verificar disponibilidade de suítes para o Dia dos Namorados.')

const CATEGORY_LABEL: Record<SuiteCategory, string> = {
  'VIP Piscina': 'VIP · Piscina',
  'Hidro': 'Hidro',
  'Hidro Light': 'Hidro Light',
  'Standard': 'Standard',
}

const GALLERY: Record<string, string[]> = {
  'suite-11': [], 'suite-12': [], 'suite-13': [], 'suite-14': [],
  'suite-15': [], 'suite-16': [], 'suite-17': [], 'suite-18': [],
  'suite-22': [], 'suite-23': [], 'suite-24': [], 'suite-25': [], 'suite-26': [],
}

export default function StepSuite() {
  const { package: pkg, suite: selected, setSuite, nextStep, prevStep, checkIn, checkOut } = useStore()
  const [loading, setLoading] = useState(true)
  const [galleryFor, setGalleryFor] = useState<Suite | null>(null)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [whatsappNum, setWhatsappNum] = useState('5543999999999')
  const [occupiedIds, setOccupiedIds] = useState<Set<string>>(new Set())

  const packageSuites = SUITES.filter(s => pkg && s.packageIds.includes(pkg.id as never))

  const slotLabel = useMemo(() => {
    const cin = checkIn
    const cout = checkOut()
    if (!cin || !cout) return ''
    return buildSlotLabel(cin, cout)
  }, [checkIn, checkOut])

  useEffect(() => {
    const promises: Promise<unknown>[] = []

    promises.push(
      supabase
        .from('suites')
        .select('id, photo_url')
        .not('photo_url', 'is', null)
        .then(({ data }) => {
          if (data) {
            const urls: Record<string, string> = {}
            data.forEach(s => { if (s.photo_url) urls[s.id] = s.photo_url })
            setPhotoUrls(urls)
          }
        }),
    )

    promises.push(
      supabase
        .from('settings')
        .select('value')
        .eq('key', 'whatsapp_number')
        .single()
        .then(({ data }) => { if (data?.value) setWhatsappNum(data.value) }),
    )

    const cin = checkIn
    const cout = checkOut()
    if (cin && cout) {
      const cinIso = cin.toISOString()
      const coutIso = cout.toISOString()

      promises.push(
        supabase
          .rpc('get_occupied_suite_ids', { p_check_in: cinIso, p_check_out: coutIso })
          .then(async ({ data, error }) => {
            if (!error && data) {
              setOccupiedIds(new Set(data.map((r: { suite_id: string }) => r.suite_id)))
              return
            }
            // Fallback: direct query (funciona mesmo se a RPC não existir ainda)
            const { data: rows } = await supabase
              .from('reservations')
              .select('suite_id')
              .in('status', ['paid', 'pending'])
              .lt('check_in', coutIso)
              .gt('check_out', cinIso)
            if (rows) setOccupiedIds(new Set(rows.map(r => r.suite_id as string)))
          }),
      )
    }

    Promise.all(promises).finally(() => setLoading(false))
  }, [checkIn, checkOut])

  const allOccupied = packageSuites.length > 0 && packageSuites.every(s => occupiedIds.has(s.id))

  function choose(suite: Suite) {
    setSuite(suite)
    setTimeout(nextStep, 300)
  }

  const categories = Array.from(new Set(packageSuites.map(s => s.category)))

  return (
    <div>
      <button onClick={prevStep} className="flex items-center gap-1 text-gold-700/60 text-sm mb-8 hover:text-gold-500 transition-colors">
        <span>←</span> Voltar
      </button>

      <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-light mb-2 leading-tight">
        Qual suíte<br />
        <span className="gold-gradient font-semibold italic">você prefere?</span>
      </h1>
      <p className="text-gold-700/70 text-sm mb-6 sm:mb-8">
        Suítes disponíveis para o{' '}
        <strong className="text-gold-500 font-medium">{pkg?.label}</strong>
        {slotLabel && (
          <> · <span className="text-gold-600/70">{slotLabel}</span></>
        )}
      </p>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="aspect-square rounded-2xl border border-gold-900/30 bg-gold-900/10 animate-pulse" />
          ))}
        </div>
      ) : allOccupied ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-red-900/40 bg-red-900/10 px-5 py-4 text-center">
            <p className="text-sm text-red-400/80 mb-1">Todas as suítes do {pkg?.label} estão ocupadas para este período.</p>
            <p className="text-xs text-gold-800/50">Entre em contato com nosso suporte.</p>
          </div>
          <SupportCard highlight whatsappNum={whatsappNum} />
        </div>
      ) : (
        <div className="space-y-8">
          {categories.map(cat => {
            const catSuites = packageSuites.filter(s => s.category === cat)
            return (
              <div key={cat}>
                <div className="flex items-center gap-3 mb-4">
                  <p className="text-[10px] tracking-widest uppercase text-gold-500/60 font-medium shrink-0">
                    {CATEGORY_LABEL[cat]}
                  </p>
                  <div className="h-px flex-1 bg-gradient-to-r from-gold-800/40 to-transparent" />
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
                  {catSuites.map(suite => (
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
                </div>
              </div>
            )
          })}
          <SupportCard highlight={false} whatsappNum={whatsappNum} />
        </div>
      )}

      {galleryFor && createPortal(
        <SuiteGallery
          suite={galleryFor}
          photoUrl={photoUrls[galleryFor.id]}
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
  const coverUrl = photoUrl ?? `/suites/${suite.id}.jpg`

  return (
    <div
      className={[
        'relative rounded-2xl overflow-hidden border transition-all duration-300',
        occupied
          ? 'border-red-950/60'
          : selected
            ? 'border-gold-500 ring-2 ring-gold-500/30'
            : 'border-gold-800/40',
      ].join(' ')}
      style={{ aspectRatio: '1 / 1' }}
    >
      {/* Background: photo + gradient overlay */}
      <div className="absolute inset-0" style={{ backgroundColor: '#120a02' }}>
        <img
          src={toWebP(coverUrl)}
          alt=""
          loading="lazy"
          decoding="async"
          className={['absolute inset-0 w-full h-full object-cover transition-all duration-300', occupied ? 'grayscale-[60%] brightness-[0.55]' : ''].join(' ')}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: [
              'radial-gradient(ellipse at 50% 110%, rgba(180,90,15,0.55) 0%, transparent 55%)',
              'radial-gradient(ellipse at 20% 85%, rgba(130,65,10,0.4) 0%, transparent 45%)',
              'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.65) 100%)',
            ].join(', '),
          }}
        />
      </div>

      {/* Gold frame border inner glow */}
      <div className="absolute inset-0 rounded-2xl" style={{ boxShadow: 'inset 0 0 30px rgba(0,0,0,0.6)' }} />

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col p-4">

        {/* Top: SUÍTE label + line */}
        <div className="text-center">
          <p className="text-[9px] tracking-[0.45em] uppercase font-medium mb-1.5" style={{ color: 'rgba(220,185,100,0.75)' }}>
            S U Í T E
          </p>
          <div
            className="h-px mx-auto w-12"
            style={{ background: 'linear-gradient(to right, transparent, #c9a84c, transparent)', boxShadow: '0 0 6px rgba(200,160,50,0.7)' }}
          />
        </div>

        {/* Center: Room number */}
        <div className="flex-1 flex items-center justify-center">
          <span
            className="font-serif font-bold text-transparent bg-clip-text select-none"
            style={{
              fontSize: 'clamp(3rem, 12vw, 5rem)',
              backgroundImage: occupied
                ? 'linear-gradient(160deg, #a08080 0%, #705050 50%, #503030 100%)'
                : 'linear-gradient(160deg, #fce8a8 0%, #d4a017 35%, #8b6010 70%, #c9a84c 100%)',
              lineHeight: 1,
              filter: occupied ? 'none' : 'drop-shadow(0 2px 16px rgba(200,150,30,0.5))',
            }}
          >
            {suite.room_number}
          </span>
        </div>

        {/* Bottom: category + buttons */}
        <div className="space-y-2">
          <p className="text-[9px] tracking-widest uppercase text-center" style={{ color: 'rgba(200,165,80,0.5)' }}>
            {CATEGORY_LABEL[suite.category]}
          </p>

          {occupied ? (
            <div
              className="w-full text-center py-1.5 rounded-lg text-[9px] tracking-widest uppercase"
              style={{ background: 'rgba(80,10,20,0.6)', border: '1px solid rgba(160,40,60,0.5)', color: 'rgba(210,130,140,0.8)' }}
            >
              Indisponível
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={(e) => { e.stopPropagation(); onViewMore() }}
                className="py-1.5 rounded-lg text-[10px] tracking-wide font-medium transition-all duration-200 hover:opacity-90 active:scale-95"
                style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(201,168,76,0.4)', color: 'rgba(220,185,100,0.8)' }}
              >
                Ver mais
              </button>
              <button
                onClick={onChoose}
                className="py-1.5 rounded-lg text-[10px] tracking-wide font-semibold text-black transition-all duration-200 hover:opacity-90 active:scale-95"
                style={{ background: selected ? 'linear-gradient(135deg,#c9a84c,#f5d87a,#a07820)' : 'rgba(201,168,76,0.85)' }}
              >
                {selected ? '✓ Escolhida' : 'Escolher'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── RESERVADO overlay ── */}
      {occupied && (
        <div className="absolute inset-0 z-20 overflow-hidden rounded-2xl pointer-events-none">
          {/* Diagonal ribbon */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%) rotate(-32deg)',
              width: '160%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '3px',
              padding: '8px 0 7px',
              background: 'linear-gradient(90deg, transparent 0%, rgba(90,8,22,0.97) 18%, rgba(120,12,30,1) 50%, rgba(90,8,22,0.97) 82%, transparent 100%)',
              borderTop: '1px solid rgba(201,100,90,0.55)',
              borderBottom: '1px solid rgba(201,100,90,0.55)',
              boxShadow: '0 4px 32px rgba(0,0,0,0.7)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <svg width="10" height="12" viewBox="0 0 10 12" fill="none">
                <rect x="0.75" y="5" width="8.5" height="6.5" rx="1.5" stroke="rgba(230,180,100,0.95)" strokeWidth="1.2" />
                <path d="M3 5V3.5a2 2 0 014 0V5" stroke="rgba(230,180,100,0.95)" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              <span
                style={{
                  color: '#e8c060',
                  fontSize: 'clamp(0.55rem, 2vw, 0.72rem)',
                  letterSpacing: '0.38em',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  textShadow: '0 0 14px rgba(210,160,50,0.7)',
                  fontFamily: 'inherit',
                }}
              >
                RESERVADO
              </span>
            </div>
            {slotLabel && (
              <span
                style={{
                  color: 'rgba(230,170,100,0.72)',
                  fontSize: 'clamp(0.38rem, 1.4vw, 0.55rem)',
                  letterSpacing: '0.12em',
                  whiteSpace: 'nowrap',
                }}
              >
                {slotLabel}
              </span>
            )}
          </div>
          {/* Corner accent dot */}
          <div
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'rgba(200,80,80,0.7)',
              boxShadow: '0 0 6px rgba(200,80,80,0.6)',
            }}
          />
        </div>
      )}
    </div>
  )
}

// ── Suite Gallery Modal ────────────────────────────────────

function SuiteGallery({ suite, photoUrl, occupied, slotLabel, selected, onChoose, onClose }: {
  suite: Suite; photoUrl?: string; occupied: boolean; slotLabel: string; selected: boolean
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
          border: occupied ? '1px solid rgba(160,40,60,0.4)' : '1px solid rgba(201,168,76,0.3)',
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

        {/* Cover photo */}
        <div
          className="relative w-full overflow-hidden"
          style={{ aspectRatio: '4 / 3', backgroundColor: '#1a0f02' }}
        >
          <img
            src={toWebP(coverUrl, 800)}
            alt=""
            loading="eager"
            decoding="async"
            className={['absolute inset-0 w-full h-full object-cover', occupied ? 'grayscale-[50%] brightness-[0.5]' : ''].join(' ')}
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
          {/* Close button */}
          <button
            onClick={close}
            className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full flex items-center justify-center text-sm transition-opacity hover:opacity-80"
            style={{ background: 'rgba(0,0,0,0.6)', color: 'rgba(220,185,100,0.8)', border: '1px solid rgba(201,168,76,0.3)' }}
          >
            ✕
          </button>

          {/* Suite label overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-[9px] tracking-[0.5em] uppercase mb-2" style={{ color: 'rgba(220,185,100,0.7)' }}>
              S U Í T E
            </p>
            <div className="h-px w-10 mb-3" style={{ background: 'linear-gradient(to right, transparent, #c9a84c, transparent)', boxShadow: '0 0 6px rgba(200,160,50,0.8)' }} />
            <span
              className="font-serif font-bold text-transparent bg-clip-text"
              style={{
                fontSize: 'clamp(5rem, 22vw, 8rem)',
                backgroundImage: occupied
                  ? 'linear-gradient(160deg, #907070 0%, #604040 50%, #402828 100%)'
                  : 'linear-gradient(160deg, #fce8a8 0%, #d4a017 35%, #8b6010 70%, #c9a84c 100%)',
                lineHeight: 1,
                filter: occupied ? 'none' : 'drop-shadow(0 4px 20px rgba(200,150,30,0.6))',
              }}
            >
              {suite.room_number}
            </span>
          </div>

          {/* RESERVADO ribbon on gallery cover */}
          {occupied && (
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%) rotate(-22deg)',
                  width: '150%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '12px 0 10px',
                  background: 'linear-gradient(90deg, transparent 0%, rgba(90,8,22,0.97) 15%, rgba(120,12,30,1) 50%, rgba(90,8,22,0.97) 85%, transparent 100%)',
                  borderTop: '1px solid rgba(201,100,90,0.6)',
                  borderBottom: '1px solid rgba(201,100,90,0.6)',
                  boxShadow: '0 6px 40px rgba(0,0,0,0.8)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="14" height="16" viewBox="0 0 14 16" fill="none">
                    <rect x="1" y="7" width="12" height="8.5" rx="2" stroke="rgba(230,180,100,0.95)" strokeWidth="1.4" />
                    <path d="M4 7V5a3 3 0 016 0v2" stroke="rgba(230,180,100,0.95)" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                  <span
                    style={{
                      color: '#e8c060',
                      fontSize: '0.9rem',
                      letterSpacing: '0.5em',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      textShadow: '0 0 18px rgba(210,160,50,0.8)',
                    }}
                  >
                    RESERVADO
                  </span>
                </div>
                {slotLabel && (
                  <span style={{ color: 'rgba(230,170,100,0.75)', fontSize: '0.7rem', letterSpacing: '0.18em' }}>
                    {slotLabel}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

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
                  alt=""
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
          {/* Name + category */}
          <div>
            <div className="flex items-center gap-3 mb-1">
              <p className="font-serif text-2xl font-semibold text-transparent bg-clip-text"
                style={{ backgroundImage: 'linear-gradient(135deg, #f5e0a0, #d4a017, #8b6010)' }}>
                {suite.name}
              </p>
              <span className="text-[9px] tracking-widest uppercase px-2 py-0.5 rounded-full border border-gold-700/40 text-gold-600/60 shrink-0">
                {CATEGORY_LABEL[suite.category]}
              </span>
            </div>
            <p className="text-sm text-gold-700/60">{suite.description}</p>
          </div>

          {/* Occupied notice */}
          {occupied && (
            <div
              className="rounded-xl px-4 py-3 flex items-center gap-3"
              style={{ background: 'rgba(80,10,20,0.5)', border: '1px solid rgba(160,40,60,0.45)' }}
            >
              <svg width="16" height="19" viewBox="0 0 16 19" fill="none" className="shrink-0">
                <rect x="1" y="8" width="14" height="10" rx="2.5" stroke="rgba(210,120,120,0.9)" strokeWidth="1.5" />
                <path d="M4.5 8V5.5a3.5 3.5 0 017 0V8" stroke="rgba(210,120,120,0.9)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <div>
                <p className="text-sm font-medium" style={{ color: 'rgba(220,140,140,0.9)' }}>Suíte reservada</p>
                {slotLabel && (
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(200,110,110,0.6)' }}>{slotLabel}</p>
                )}
              </div>
            </div>
          )}

          {/* Details */}
          <div className="grid grid-cols-2 gap-3">
            <DetailChip label="Tamanho" value={suite.size === 'large' ? 'Grande' : 'Compacta'} />
            <DetailChip label="Limpeza" value={`+${suite.cleaning_buffer_h}h entre reservas`} />
          </div>

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
            <div className="w-full py-4 rounded-xl text-center text-sm" style={{ border: '1px solid rgba(160,40,60,0.4)', color: 'rgba(210,120,120,0.7)' }}>
              Indisponível para este horário
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────

function DetailChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)' }}>
      <p className="text-[9px] tracking-widest uppercase text-gold-700/50 mb-0.5">{label}</p>
      <p className="text-xs text-gold-400/80 font-medium">{value}</p>
    </div>
  )
}

function SupportCard({ highlight, whatsappNum }: { highlight: boolean; whatsappNum: string }) {
  return (
    <a
      href={`https://wa.me/${whatsappNum}?text=${WHATSAPP_MSG}`}
      target="_blank" rel="noopener noreferrer"
      className={[
        'flex items-center gap-4 w-full rounded-xl border px-5 py-4 transition-all duration-200 hover:opacity-90 active:scale-[0.98]',
        highlight ? 'border-gold-600/60 bg-gold-900/20' : 'border-gold-900/30 bg-black/30',
      ].join(' ')}
    >
      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-lg" style={{ background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.3)' }}>
        💬
      </div>
      <div className="min-w-0">
        <p className={['text-sm font-medium', highlight ? 'text-gold-300' : 'text-gold-400/80'].join(' ')}>
          Falar com o suporte
        </p>
        <p className="text-[11px] text-gold-700/50">Dúvidas sobre disponibilidade? Chamamos no WhatsApp.</p>
      </div>
      <span className="text-gold-700/40 text-sm ml-auto shrink-0">→</span>
    </a>
  )
}
