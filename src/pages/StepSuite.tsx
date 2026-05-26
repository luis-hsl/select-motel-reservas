import { useState, useEffect } from 'react'
import { SUITES, PROMO_START, PROMO_END } from '../data'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import type { Suite, SuiteCategory } from '../types'

const WHATSAPP_MSG = encodeURIComponent('Olá! Gostaria de verificar disponibilidade de suítes para o Dia dos Namorados.')

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
  'suite-22': [], 'suite-23': [], 'suite-24': [], 'suite-25': [], 'suite-26': [],
}

export default function StepSuite() {
  const { package: pkg, type, suite: selected, setSuite, nextStep, prevStep } = useStore()
  const [occupiedIds, setOccupiedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [galleryFor, setGalleryFor] = useState<Suite | null>(null)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [whatsappNum, setWhatsappNum] = useState('5543999999999')

  const packageSuites = SUITES.filter(s => pkg && s.packageIds.includes(pkg.id as never))
  const maxSlots = type === 'overnight' ? 4 : 16

  // Fetch photo URLs and WhatsApp number from Supabase
  useEffect(() => {
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
      })

    supabase
      .from('settings')
      .select('value')
      .eq('key', 'whatsapp_number')
      .single()
      .then(({ data }) => { if (data?.value) setWhatsappNum(data.value) })
  }, [])

  useEffect(() => {
    if (!pkg || !type || packageSuites.length === 0) { setLoading(false); return }
    const ids = packageSuites.map(s => s.id)
    const promoEnd = new Date(PROMO_END); promoEnd.setHours(23, 59, 59)

    supabase
      .from('reservations').select('suite_id')
      .in('suite_id', ids).eq('type', type)
      .in('status', ['pending', 'confirmed', 'paid'])
      .gte('check_in', PROMO_START.toISOString())
      .lte('check_in', promoEnd.toISOString())
      .then(({ data }) => {
        const count: Record<string, number> = {}
        data?.forEach(r => { count[r.suite_id] = (count[r.suite_id] || 0) + 1 })
        setOccupiedIds(new Set(
          Object.entries(count).filter(([, n]) => n >= maxSlots).map(([id]) => id)
        ))
        setLoading(false)
      })
  }, [pkg?.id, type])

  const allOccupied = packageSuites.length > 0 && packageSuites.every(s => occupiedIds.has(s.id))

  function choose(suite: Suite) {
    if (occupiedIds.has(suite.id)) return
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
        <strong className="text-gold-500 font-medium">{pkg?.label}</strong>.
      </p>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
          {[1, 2].map(i => (
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
                <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
                  {catSuites.map(suite => (
                    <SuiteCard
                      key={suite.id}
                      suite={suite}
                      photoUrl={photoUrls[suite.id]}
                      occupied={occupiedIds.has(suite.id)}
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

      {galleryFor && (
        <SuiteGallery
          suite={galleryFor}
          photoUrl={photoUrls[galleryFor.id]}
          occupied={occupiedIds.has(galleryFor.id)}
          selected={selected?.id === galleryFor.id}
          onChoose={() => { choose(galleryFor); setGalleryFor(null) }}
          onClose={() => setGalleryFor(null)}
        />
      )}
    </div>
  )
}

// ── Suite Card ─────────────────────────────────────────────

function SuiteCard({ suite, photoUrl, occupied, selected, onChoose, onViewMore }: {
  suite: Suite; photoUrl?: string; occupied: boolean; selected: boolean
  onChoose: () => void; onViewMore: () => void
}) {
  const coverUrl = photoUrl ?? `/suites/${suite.id}.jpg`

  return (
    <div
      className={[
        'relative rounded-2xl overflow-hidden border transition-all duration-300',
        occupied ? 'border-gold-900/20 opacity-60' : selected ? 'border-gold-500 ring-2 ring-gold-500/30' : 'border-gold-800/40',
      ].join(' ')}
      style={{ aspectRatio: '1 / 1' }}
    >
      {/* Background: photo + gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: '#120a02',
          backgroundImage: [
            'radial-gradient(ellipse at 50% 110%, rgba(180,90,15,0.55) 0%, transparent 55%)',
            'radial-gradient(ellipse at 20% 85%, rgba(130,65,10,0.4) 0%, transparent 45%)',
            'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.65) 100%)',
            `url(${coverUrl})`,
          ].join(', '),
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />

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
              fontSize: 'clamp(4rem, 16vw, 6rem)',
              backgroundImage: 'linear-gradient(160deg, #fce8a8 0%, #d4a017 35%, #8b6010 70%, #c9a84c 100%)',
              lineHeight: 1,
              filter: 'drop-shadow(0 2px 16px rgba(200,150,30,0.5))',
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
            <div className="w-full text-center py-1.5 rounded-lg border border-red-900/50 text-[10px] tracking-widest uppercase text-red-400/70">
              Esgotado
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
    </div>
  )
}

// ── Suite Gallery Modal ────────────────────────────────────

function SuiteGallery({ suite, photoUrl, occupied, selected, onChoose, onClose }: {
  suite: Suite; photoUrl?: string; occupied: boolean; selected: boolean
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
        className="relative w-full sm:max-w-md max-h-[94vh] sm:max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl scrollbar-hide transition-all duration-380"
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

        {/* Cover photo */}
        <div
          className="relative w-full"
          style={{
            aspectRatio: '4 / 3',
            backgroundColor: '#1a0f02',
            backgroundImage: [
              'radial-gradient(ellipse at 50% 110%, rgba(180,90,15,0.6) 0%, transparent 55%)',
              'radial-gradient(ellipse at 15% 85%, rgba(130,65,10,0.45) 0%, transparent 48%)',
              'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.6) 100%)',
              `url(${coverUrl})`,
            ].join(', '),
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
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
                backgroundImage: 'linear-gradient(160deg, #fce8a8 0%, #d4a017 35%, #8b6010 70%, #c9a84c 100%)',
                lineHeight: 1,
                filter: 'drop-shadow(0 4px 20px rgba(200,150,30,0.6))',
              }}
            >
              {suite.room_number}
            </span>
          </div>
        </div>

        {/* Extra photos grid */}
        {extraPhotos.length > 0 && (
          <div className="grid grid-cols-3 gap-1 p-1">
            {extraPhotos.map((url, i) => (
              <div
                key={i}
                className="rounded-lg overflow-hidden"
                style={{ aspectRatio: '1 / 1', backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: '#1a0f02' }}
              />
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
            <div className="w-full py-4 rounded-xl text-center text-sm border border-red-900/40 text-red-400/60">
              Suíte esgotada para este período
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
