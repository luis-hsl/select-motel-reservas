import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { PACKAGES } from '../data'
import { useStore } from '../store/useStore'
import type { Package } from '../types'
import Faq from '../components/Faq'
import { metaEvents } from '../lib/metaPixel'

type PkgId = 'ouro' | 'prata' | 'bronze'

const THEME: Record<PkgId, {
  bg: string; border: string; ring: string; nameCss: string
  accentColor: string; labelColor: string; iconColor: string
  dividerColor: string; priceColor: string; badgeBg: string
}> = {
  ouro: {
    bg: [
      'radial-gradient(ellipse at 18% 88%, rgba(180,100,12,0.45) 0%, transparent 52%)',
      'radial-gradient(ellipse at 82% 72%, rgba(140,75,8,0.3) 0%, transparent 48%)',
      'radial-gradient(ellipse at 50% 108%, rgba(100,55,5,0.5) 0%, transparent 58%)',
      '#060504',
    ].join(', '),
    border: 'rgba(180,140,40,0.5)', ring: 'rgba(200,160,50,0.35)',
    nameCss: 'linear-gradient(180deg,#f5e0a0 0%,#d4a017 40%,#8b6010 100%)',
    accentColor: '#c9a84c', labelColor: 'rgba(201,168,76,0.5)',
    iconColor: '#c9a84c', dividerColor: '#a07820', priceColor: '#d4a850',
    badgeBg: 'linear-gradient(135deg,#c9a84c,#f5d87a,#a07820)',
  },
  prata: {
    bg: [
      'radial-gradient(ellipse at 18% 88%, rgba(100,110,140,0.3) 0%, transparent 52%)',
      'radial-gradient(ellipse at 82% 72%, rgba(80,90,120,0.2) 0%, transparent 48%)',
      'radial-gradient(ellipse at 50% 108%, rgba(60,70,100,0.4) 0%, transparent 58%)',
      '#050507',
    ].join(', '),
    border: 'rgba(160,170,200,0.4)', ring: 'rgba(180,190,220,0.25)',
    nameCss: 'linear-gradient(180deg,#f0f2f8 0%,#b0b8cc 40%,#6a7090 100%)',
    accentColor: '#a8b0c8', labelColor: 'rgba(160,170,200,0.5)',
    iconColor: '#a8b0c8', dividerColor: '#7880a0', priceColor: '#b8c0d8',
    badgeBg: 'linear-gradient(135deg,#9098b0,#d0d8f0,#7880a0)',
  },
  bronze: {
    bg: [
      'radial-gradient(ellipse at 18% 88%, rgba(160,85,22,0.4) 0%, transparent 52%)',
      'radial-gradient(ellipse at 82% 72%, rgba(120,60,14,0.28) 0%, transparent 48%)',
      'radial-gradient(ellipse at 50% 108%, rgba(90,45,8,0.48) 0%, transparent 58%)',
      '#060402',
    ].join(', '),
    border: 'rgba(160,100,40,0.5)', ring: 'rgba(180,120,50,0.3)',
    nameCss: 'linear-gradient(180deg,#e8b880 0%,#c07830 40%,#7a4010 100%)',
    accentColor: '#c07830', labelColor: 'rgba(190,120,50,0.5)',
    iconColor: '#c07830', dividerColor: '#904820', priceColor: '#d09040',
    badgeBg: 'linear-gradient(135deg,#904820,#d09040,#6a3010)',
  },
}

interface FoodOption {
  item: string
  note: string
}

interface PackageDetail {
  headline: string
  includes: { item: string; note?: string }[]
  foodChoice?: { options: FoodOption[] }
  suites: { category: string; rooms: string; desc?: string }[]
  dates: string
  notes: string[]
}

const DETAIL: Record<PkgId, PackageDetail> = {
  ouro: {
    headline: 'A experiência mais completa do Select Motel',
    includes: [
      { item: 'Decoração romântica completa do ambiente' },
      { item: 'Fondue de chocolate' },
      { item: 'Vinho ou Frisante — à escolha do casal' },
    ],
    foodChoice: {
      options: [
        { item: 'Jantar completo', note: 'Inclui entrada (couvert)' },
        { item: 'Sushi premium', note: 'Não inclui entrada' },
      ],
    },
    suites: [
      { category: 'Suíte VIP', rooms: 'Quartos 14 ou 16', desc: 'Suíte exclusiva com estrutura VIP' },
    ],
    dates: '8 a 14 de junho de 2026',
    notes: [
      'A entrada (couvert) está inclusa somente ao escolher o jantar.',
      'Para pernoite: apenas 1 suíte de cada categoria disponível por dia da promoção.',
      'Reservas de período disponíveis apenas durante a semana dos namorados.',
      'Não haverá reservas online fora da promoção na semana dos namorados.',
    ],
  },
  prata: {
    headline: 'Requinte, sabor e romantismo',
    includes: [
      { item: 'Decoração romântica do ambiente' },
      { item: 'Fondue de chocolate' },
      { item: 'Vinho ou Frisante — à escolha do casal' },
      { item: 'Pizza artesanal ou pratos — à escolha do casal' },
    ],
    suites: [
      { category: 'Suíte Hidro', rooms: 'Quartos 15 ou 18', desc: 'Suíte com hidromassagem' },
    ],
    dates: '8 a 14 de junho de 2026',
    notes: [
      'Para pernoite: apenas 1 suíte de cada categoria disponível por dia da promoção.',
      'Reservas de período disponíveis apenas durante a semana dos namorados.',
      'Não haverá reservas online fora da promoção na semana dos namorados.',
    ],
  },
  bronze: {
    headline: 'Clássico, especial e acessível',
    includes: [
      { item: 'Decoração romântica do ambiente' },
      { item: 'Fondue de chocolate' },
      { item: 'Pizza' },
      { item: 'Drink especial' },
    ],
    suites: [
      { category: 'Suíte Hidro Light', rooms: 'Quartos 12 ou 13', desc: 'Suíte com hidromassagem compacta' },
      { category: 'Suíte Standard', rooms: 'Quartos 11, 17, 22, 23, 24, 25 ou 26', desc: 'Suítes confortáveis e aconchegantes' },
    ],
    dates: '8 a 14 de junho de 2026',
    notes: [
      'Para pernoite: apenas 1 suíte de cada categoria disponível por dia da promoção.',
      'Reservas de período disponíveis apenas durante a semana dos namorados.',
      'Não haverá reservas online fora da promoção na semana dos namorados.',
    ],
  },
}

export default function StepPacote() {
  const { package: selected, setPackage, nextStep } = useStore()
  const [detailId, setDetailId] = useState<PkgId | null>(null)
  const [visible, setVisible] = useState(false)
  function choose(pkg: Package) {
    setPackage(pkg)

    // Google Ads — conversion "Selecionou pacote"
    const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag
    if (typeof gtag === 'function') {
      gtag('event', 'conversion', {
        send_to: 'AW-18204610844/rZVECNHc_LccEJyi0ehD',
        value: 1.0,
        currency: 'BRL',
        transaction_id: pkg.id,
      })
    }

    // Meta Pixel — ViewContent
    metaEvents.viewContent({
      id:       pkg.id,
      name:     pkg.label,
      category: 'package',
      value:    pkg.price_period,
    })

    setTimeout(nextStep, 300)
  }

  function openDetail(id: PkgId, e: React.MouseEvent) {
    e.stopPropagation()
    setDetailId(id)
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
  }

  function closeDetail() {
    setVisible(false)
    setTimeout(() => setDetailId(null), 380)
  }

  useEffect(() => {
    if (detailId) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [detailId])

  const detailPkg = detailId ? PACKAGES.find(p => p.id === detailId) : null

  return (
    <div>
      <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-light mb-2 leading-tight">
        Qual pacote<br />
        <span className="gold-gradient font-semibold italic pr-1 lg:pr-3">você prefere?</span>
      </h1>
      <p className="text-gold-700/70 text-sm mb-6 sm:mb-8">
        Cada pacote inclui decoração e experiências exclusivas.
      </p>

      {/*
         No mobile, a ordem visual é Bronze → Prata → Ouro (mais barato primeiro,
         pra não chocar com o preço alto logo de cara). No desktop fica natural
         (Ouro → Prata → Bronze) com Ouro destacado no meio do grid de 3.
         Conseguimos isso via CSS `order` que respeita o array mas reposiciona
         visualmente no mobile.
      */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {PACKAGES.map((pkg) => {
          const id = pkg.id as PkgId
          const th = THEME[id]
          const isSel = selected?.id === pkg.id

          // Ordem visual no mobile: Bronze (1) → Prata (2) → Ouro (3)
          // No desktop (sm+) volta à ordem do array (Ouro → Prata → Bronze).
          const mobileOrder = id === 'bronze' ? 'order-1'
                            : id === 'prata'  ? 'order-2'
                            :                   'order-3'

          return (
            <div
              key={pkg.id}
              className={`${mobileOrder} sm:order-none relative text-left rounded-2xl overflow-hidden transition-all duration-300`}
              style={{
                background: th.bg,
                border: `1px solid ${th.border}`,
                boxShadow: isSel
                  ? `0 0 0 2px ${th.ring}, inset 0 0 40px rgba(0,0,0,0.4)`
                  : 'inset 0 0 40px rgba(0,0,0,0.5)',
              }}
            >
              {pkg.highlighted && (
                <div className="absolute top-0 left-0 right-0 flex justify-center z-10">
                  <span
                    className="text-[9px] tracking-[0.3em] uppercase font-semibold px-4 py-1 rounded-b-xl text-black"
                    style={{ background: th.accentColor }}
                  >
                    Mais escolhido
                  </span>
                </div>
              )}

              {/* Visual hero */}
              <div className="pt-10 pb-5 px-5 text-center">
                <p className="text-[9px] tracking-[0.6em] uppercase mb-4 font-medium" style={{ color: th.labelColor }}>
                  Pacote
                </p>
                <GlowDivider color={th.dividerColor} />
                <h2
                  className="font-serif font-bold tracking-widest my-5 text-transparent bg-clip-text"
                  style={{ fontSize: 'clamp(1.8rem,4vw,2.4rem)', backgroundImage: th.nameCss, lineHeight: 1 }}
                >
                  {id.toUpperCase()}
                </h2>
                <GlowDivider color={th.dividerColor} />
                <p className="text-[11px] mt-3 italic" style={{ color: th.labelColor }}>{pkg.tagline}</p>
              </div>

              {/* Info */}
              <div className="px-5 pb-2">
                <ul className="space-y-1.5 mb-4">
                  {pkg.includes.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-xs" style={{ color: 'rgba(245,224,180,0.75)' }}>
                      <span className="shrink-0 mt-0.5 text-[10px]" style={{ color: th.iconColor }}>✦</span>
                      {item}
                    </li>
                  ))}
                </ul>


                {/* Ações */}
                <div className="border-t pb-4 pt-3 grid grid-cols-2 gap-2" style={{ borderColor: `${th.dividerColor}25` }}>
                  <button
                    onClick={(e) => openDetail(id, e)}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] tracking-widest uppercase font-medium transition-all duration-200 hover:opacity-90 active:scale-95"
                    style={{
                      color: th.accentColor,
                      border: `1px solid ${th.dividerColor}50`,
                      background: `${th.dividerColor}12`,
                    }}
                  >
                    Detalhes
                    <span className="text-[10px]">↗</span>
                  </button>
                  <button
                    onClick={() => choose(pkg)}
                    className="flex items-center justify-center gap-1.5 py-3 rounded-lg text-xs tracking-wide uppercase font-bold text-black transition-all duration-200 hover:opacity-90 active:scale-95"
                    style={{
                      background: th.badgeBg,
                      boxShadow: isSel
                        ? `0 0 18px ${th.accentColor}90`
                        : `0 0 22px ${th.accentColor}55, inset 0 1px 0 rgba(255,255,255,0.15)`,
                    }}
                  >
                    {isSel
                      ? <><span>✓</span> Escolhido</>
                      : <>Escolher <span className="text-sm leading-none">→</span></>
                    }
                  </button>
                </div>
              </div>

              {isSel && (
                <div className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: th.accentColor }}>
                  <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 12 12">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Detail Modal */}
      {detailId && detailPkg && createPortal(
        <PackageModal
          id={detailId}
          pkg={detailPkg}
          detail={DETAIL[detailId]}
          visible={visible}
          onClose={closeDetail}
          onSelect={() => { closeDetail(); choose(detailPkg) }}
        />,
        document.body
      )}

      <Faq />
    </div>
  )
}

// ── Modal ──────────────────────────────────────────────────

interface ModalProps {
  id: PkgId
  pkg: Package
  detail: PackageDetail
  visible: boolean
  onClose: () => void
  onSelect: () => void
}

function PackageModal({ id, pkg: _pkg, detail, visible, onClose, onSelect }: ModalProps) {
  const t = THEME[id]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ pointerEvents: visible ? 'auto' : 'none' }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 transition-opacity duration-350"
        style={{
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(6px)',
          opacity: visible ? 1 : 0,
        }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="relative w-full sm:max-w-2xl lg:max-w-3xl max-h-[92vh] sm:max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl scrollbar-hide transition-all duration-380"
        style={{
          background: t.bg,
          border: `1px solid ${t.border}`,
          boxShadow: `0 -20px 80px rgba(0,0,0,0.8), inset 0 0 60px rgba(0,0,0,0.5)`,
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(40px) scale(0.97)',
          opacity: visible ? 1 : 0,
          willChange: 'transform, opacity',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle bar (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full" style={{ background: `${t.dividerColor}60` }} />
        </div>

        {/* Header */}
        <div className="px-6 pt-4 pb-5 flex items-start justify-between">
          <div>
            <p className="text-[9px] tracking-[0.6em] uppercase mb-1 font-medium" style={{ color: t.labelColor }}>
              Pacote
            </p>
            <h2
              className="font-serif font-bold tracking-widest text-transparent bg-clip-text leading-none"
              style={{ fontSize: 'clamp(2.4rem,10vw,3rem)', backgroundImage: t.nameCss }}
            >
              {id.toUpperCase()}
            </h2>
            <p className="text-xs mt-1.5 italic" style={{ color: t.labelColor }}>{detail.headline}</p>
          </div>
          <button
            onClick={onClose}
            className="mt-1 w-8 h-8 rounded-full flex items-center justify-center transition-opacity hover:opacity-80 shrink-0 ml-4"
            style={{ background: `${t.dividerColor}25`, color: t.labelColor }}
          >
            ✕
          </button>
        </div>

        {/* Divider */}
        <div className="px-6"><GlowDivider color={t.dividerColor} /></div>

        {/* O que está incluído */}
        <Section title="O que está incluído" color={t.accentColor} dividerColor={t.dividerColor}>
          <ul className="space-y-3 mb-4">
            {detail.includes.map((inc, i) => (
              <li key={i} className="flex items-start gap-3">
                <div className="mt-1.5 w-4 shrink-0 flex justify-center">
                  <div className="w-1 h-1 rounded-full" style={{ background: t.accentColor }} />
                </div>
                <div>
                  <p className="text-sm" style={{ color: 'rgba(245,224,180,0.85)' }}>{inc.item}</p>
                  {inc.note && (
                    <p className="text-[11px] mt-0.5 italic" style={{ color: t.labelColor }}>{inc.note}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* Food choice — jantar OU sushi */}
          {detail.foodChoice && (
            <div className="mt-2">
              <p className="text-[9px] tracking-widest uppercase mb-3 font-medium" style={{ color: t.labelColor }}>
                Refeição — escolha uma das opções
              </p>
              <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${t.dividerColor}40` }}>
                {detail.foodChoice.options.map((opt, i) => (
                  <>
                    {i > 0 && (
                      <div
                        key={`sep-${i}`}
                        className="flex items-center gap-3 px-5 py-2"
                        style={{ background: `${t.dividerColor}08`, borderTop: `1px solid ${t.dividerColor}20`, borderBottom: `1px solid ${t.dividerColor}20` }}
                      >
                        <div className="h-px flex-1" style={{ background: `${t.dividerColor}30` }} />
                        <span className="text-[9px] tracking-[0.35em] uppercase font-semibold" style={{ color: t.labelColor }}>ou</span>
                        <div className="h-px flex-1" style={{ background: `${t.dividerColor}30` }} />
                      </div>
                    )}
                    <div
                      key={i}
                      className="px-5 py-4"
                      style={{ background: `${t.dividerColor}${i === 0 ? '12' : '08'}` }}
                    >
                      <p className="text-sm font-medium" style={{ color: 'rgba(245,224,180,0.90)' }}>{opt.item}</p>
                      <p className="text-[11px] mt-0.5 italic" style={{ color: t.labelColor }}>{opt.note}</p>
                    </div>
                  </>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* Suítes disponíveis */}
        <Section title="Suítes disponíveis" color={t.accentColor} dividerColor={t.dividerColor}>
          <div className="space-y-3">
            {detail.suites.map((s, i) => (
              <div
                key={i}
                className="rounded-xl p-4"
                style={{ background: `${t.dividerColor}12`, border: `1px solid ${t.dividerColor}30` }}
              >
                <p className="text-sm font-semibold mb-0.5" style={{ color: t.priceColor }}>{s.category}</p>
                {s.desc && <p className="text-[11px] mb-2 italic" style={{ color: t.labelColor }}>{s.desc}</p>}
                <p className="text-xs" style={{ color: 'rgba(245,224,180,0.55)' }}>{s.rooms}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Datas */}
        <Section title="Datas da promoção" color={t.accentColor} dividerColor={t.dividerColor}>
          <div
            className="rounded-xl p-4 text-center"
            style={{ background: `${t.dividerColor}12`, border: `1px solid ${t.dividerColor}30` }}
          >
            <p className="text-[9px] tracking-widest uppercase mb-1" style={{ color: t.labelColor }}>
              Semana dos Namorados
            </p>
            <p className="text-sm font-medium" style={{ color: 'rgba(245,224,180,0.85)' }}>
              {detail.dates}
            </p>
          </div>
        </Section>

        {/* Observações */}
        <Section title="Observações importantes" color={t.accentColor} dividerColor={t.dividerColor}>
          <ul className="space-y-2.5">
            {detail.notes.map((note, i) => (
              <li key={i} className="flex items-start gap-3">
                <div className="mt-1.5 shrink-0">
                  <div className="w-1 h-1 rounded-full" style={{ background: `${t.accentColor}60` }} />
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'rgba(245,224,180,0.55)' }}>{note}</p>
              </li>
            ))}
          </ul>
        </Section>

        {/* CTA */}
        <div className="px-6 pb-8 pt-2">
          <button
            onClick={onSelect}
            className="w-full py-4 rounded-xl font-semibold text-sm tracking-wider uppercase transition-all duration-200 hover:opacity-90 active:scale-95 text-black"
            style={{ background: t.badgeBg }}
          >
            Escolher Pacote {id.charAt(0).toUpperCase() + id.slice(1)}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────

function Section({ title, color, dividerColor, children }: {
  title: string; color: string; dividerColor: string; children: React.ReactNode
}) {
  return (
    <div className="px-6 pb-5">
      <div className="flex items-center gap-3 mb-4">
        <p className="text-[10px] tracking-widest uppercase font-semibold shrink-0" style={{ color }}>{title}</p>
        <div className="h-px flex-1" style={{ background: `linear-gradient(to right, ${dividerColor}50, transparent)` }} />
      </div>
      {children}
    </div>
  )
}

function GlowDivider({ color }: { color: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-4">
      <div className="h-px flex-1" style={{ background: `linear-gradient(to right, transparent, ${color}60)` }} />
      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 8px 3px ${color}70` }} />
      <div className="h-px flex-1" style={{ background: `linear-gradient(to left, transparent, ${color}60)` }} />
    </div>
  )
}

