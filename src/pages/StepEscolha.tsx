import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store/useStore'
import LegalModal, { type LegalKind } from '../components/LegalModal'
import { metaEvents } from '../lib/metaPixel'
import { supabase } from '../lib/supabase'
import { getSessionToken } from '../lib/tracking'
import type { ReservationMode } from '../types'
import Reviews from '../components/Reviews'

type Promo = {
  id: string
  title: string
  description: string
  photo_url: string | null
  button_text: string
  button_url: string
  button_step: number | null
}

/* ── helpers ── */
function maskCPF(v: string) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}
function isValidCPF(raw: string): boolean {
  if (raw.length !== 11) return false
  if (/^(\d)\1+$/.test(raw)) return false
  const d = raw.split('').map(Number)
  for (const k of [9, 10] as const) {
    let sum = 0
    for (let i = 0; i < k; i++) sum += d[i] * (k + 1 - i)
    const rest = (sum * 10) % 11
    if ((rest === 10 ? 0 : rest) !== d[k]) return false
  }
  return true
}
function maskPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (!d) return ''
  if (d.length <= 2)  return `(${d}`
  if (d.length <= 7)  return `(${d.slice(0,2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
}

/* ── component ── */
export default function StepEscolha() {
  const {
    mode: storedMode, setMode,
    customerName, customerPhone, customerEmail, customerTaxId, consentAt,
    setCustomer, setConsentAt,
    nextStep,
    package: pkg, type, suite, checkIn, drink, food, totalAmount,
  } = useStore()

  const hasStoredData = !!(customerName && customerPhone && customerTaxId)

  const [picked, setPicked]           = useState<ReservationMode | null>(storedMode)
  const [formVisible, setFormVisible] = useState(!!storedMode && hasStoredData)
  const [showLocation, setShowLocation] = useState(false)

  /* form fields — pré-populados com dados do store se o usuário voltou */
  const [name,             setName]             = useState(customerName  || '')
  const [phone,            setPhone]            = useState(customerPhone || '')
  const [email,            setEmail]            = useState(customerEmail || '')
  const [taxId,            setTaxId]            = useState(customerTaxId ? maskCPF(customerTaxId) : '')
  const [acceptedTerms,    setAcceptedTerms]    = useState(!!consentAt)
  const [whatsappConsent,  setWhatsappConsent]  = useState(false)
  const [legalOpen,        setLegalOpen]        = useState<LegalKind | null>(null)
  const [promosOpen,       setPromosOpen]       = useState(false)
  const [promos,           setPromos]           = useState<Promo[]>([])
  const [promosFetched,    setPromosFetched]    = useState(false)

  const formRef = useRef<HTMLDivElement>(null)
  const ctaRef  = useRef<HTMLButtonElement>(null)

  const rawCPF   = taxId.replace(/\D/g, '')
  const rawPhone = phone.replace(/\D/g, '')
  const cpfValid = isValidCPF(rawCPF)
  const cpfError = rawCPF.length === 11 && !cpfValid
  const canContinue = !!picked && name.trim() && rawPhone.length >= 10 &&
                      email.includes('@') && cpfValid && acceptedTerms

  /* show form with slight delay so card selection animation completes,
     then scroll smoothly into view once the expansion starts */
  useEffect(() => {
    if (picked && !formVisible) {
      const t = setTimeout(() => {
        setFormVisible(true)
        // Aguarda a animação de maxHeight completar (0.65s) antes de scrollar
        // para que o browser calcule a posição final correta
        setTimeout(() => {
          formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 680)
      }, 200)
      return () => clearTimeout(t)
    }
  }, [picked])

  /* scroll CTA into view when form becomes valid */
  useEffect(() => {
    if (!canContinue) return
    requestAnimationFrame(() =>
      ctaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    )
  }, [canContinue])

  async function openPromos() {
    setPromosOpen(true)
    if (!promosFetched) {
      const { data } = await supabase
        .from('promotions')
        .select('id, title, description, photo_url, button_text, button_url, button_step')
        .eq('active', true)
        .order('sort_order')
        .order('created_at')
      setPromos(data ?? [])
      setPromosFetched(true)
    }
  }

  function pick(mode: ReservationMode) {
    setPicked(mode)
  }

  function advance() {
    if (!canContinue || !picked) return
    setMode(picked)
    setCustomer(name.trim(), phone.trim(), email.trim(), rawCPF)
    setConsentAt(new Date().toISOString())

    /* Google Ads — lead */
    const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag
    if (typeof gtag === 'function') {
      gtag('event', 'conversion', {
        send_to: 'AW-18204610844/RO0FCNWRkrgcEJyi0ehD',
        value: 1.0, currency: 'BRL',

      })
    }
    metaEvents.lead()

    /* salva lead */
    supabase.rpc('insert_lead', {
      p_name:         name.trim(),
      p_phone:        phone.trim(),
      p_email:        email.trim(),
      p_package_id:   pkg?.id ?? null,
      p_type:         type ?? null,
      p_suite_id:     suite?.id ?? null,
      p_check_in:     checkIn?.toISOString() ?? null,
      p_drink:        drink ?? null,
      p_food:         food ?? null,
      p_total_amount: totalAmount() || null,
      p_observations:    null,
      p_session_token:   getSessionToken(),
      p_whatsapp_consent: whatsappConsent,
      p_tax_id:          rawCPF || null,
      p_mode:            picked,
    }).then(() => {})

    nextStep()
  }

  return (
    <div className="relative">
      {/* Título */}
      <div className="text-center mb-10 sm:mb-14">
        <h1 className="leading-none mb-3">
          <span className="block font-serif italic font-light text-gold-200/90"
                style={{ fontSize: 'clamp(2.2rem,6.5vw,3.4rem)', letterSpacing: '-0.02em' }}>
            Uma noite que
          </span>
          <span className="block font-serif italic gold-gradient"
                style={{ fontSize: 'clamp(2.2rem,6.5vw,3.4rem)', letterSpacing: '-0.02em' }}>
            vocês nunca vão esquecer.
          </span>
        </h1>
        <p className="text-sm text-gold-600/60 mt-4 max-w-xs mx-auto leading-relaxed">
          Reserve sua suíte ou monte do seu jeito.
        </p>

        {/* Localização */}
        <div className="mt-5 flex flex-col items-center">
          <button
            type="button"
            onClick={() => setShowLocation(v => !v)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all duration-200 active:scale-[0.97]"
            style={{
              background: showLocation ? 'rgba(201,168,76,0.10)' : 'rgba(201,168,76,0.05)',
              border: `1px solid ${showLocation ? 'rgba(201,168,76,0.30)' : 'rgba(201,168,76,0.14)'}`,
            }}
          >
            <svg width="11" height="13" viewBox="0 0 11 13" fill="none">
              <path d="M5.5 0C3.015 0 1 2.015 1 4.5c0 3.375 4.5 8.5 4.5 8.5S10 7.875 10 4.5C10 2.015 7.985 0 5.5 0zm0 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"
                fill="rgba(201,168,76,0.65)" />
            </svg>
            <span style={{ fontSize: '0.7rem', color: 'rgba(201,168,76,0.65)', letterSpacing: '0.06em' }}>
              COMO CHEGAR
            </span>
          </button>

          {/* Card de endereço */}
          <div
            style={{
              maxHeight: showLocation ? '220px' : '0px',
              opacity: showLocation ? 1 : 0,
              overflow: 'hidden',
              transition: 'max-height 0.4s cubic-bezier(0.22,1,0.36,1), opacity 0.3s ease',
            }}
          >
            <div
              className="mt-3 px-5 py-4 rounded-2xl text-center"
              style={{
                background: 'rgba(201,168,76,0.05)',
                border: '1px solid rgba(201,168,76,0.14)',
              }}
            >
              <p className="text-[10px] tracking-widest uppercase mb-1" style={{ color: 'rgba(201,168,76,0.45)' }}>
                Nosso endereço
              </p>
              <p className="text-xs leading-relaxed mb-3" style={{ color: 'rgba(220,205,175,0.75)' }}>
                Rodovia Celso Fumiu Makita<br />
                Parque Industrial, Ivaiporã – PR
              </p>
              <a
                href="https://www.google.com/maps/dir/?api=1&destination=Rodovia+Celso+Fumiu+Makita,+Parque+Industrial,+Ivaip%C3%B3r%C3%A3,+PR"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-[11px] font-semibold transition-all duration-200 hover:brightness-110 active:scale-[0.97]"
                style={{
                  background: 'rgba(201,168,76,0.14)',
                  border: '1px solid rgba(201,168,76,0.28)',
                  color: 'rgba(223,192,122,0.90)',
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                </svg>
                Abrir no Google Maps →
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Botões de escolha */}
      <div className="flex flex-col items-center gap-3 max-w-sm mx-auto">
        {/* Botão principal — Fazer uma reserva */}
        <button
          type="button"
          onClick={() => pick('suite')}
          aria-pressed={picked === 'suite'}
          className={[
            'w-full px-6 py-4 rounded-xl text-sm font-semibold transition-all duration-300 active:scale-[0.98]',
            picked === 'suite'
              ? 'bg-gradient-to-r from-gold-700 to-gold-500 text-black shadow-[0_0_28px_rgba(201,168,76,0.35)]'
              : 'bg-gradient-to-r from-gold-700 to-gold-500 text-black hover:from-gold-600 hover:to-gold-400',
          ].join(' ')}
        >
          {picked === 'suite' && (
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-black/20 mr-2 align-middle">
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 12 12">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          )}
          Fazer uma reserva
        </button>

        {/* Promoções button */}
        <button
          type="button"
          onClick={openPromos}
          className="w-full px-6 py-3.5 rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
          style={{
            background: 'transparent',
            border: '1px solid rgba(201,168,76,0.22)',
            color: 'rgba(201,168,76,0.70)',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(201,168,76,0.40)'
            ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(201,168,76,0.90)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(201,168,76,0.22)'
            ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(201,168,76,0.70)'
          }}
        >
          <span style={{ fontSize: '0.75rem' }}>✦</span>
          Nossas Promoções Exclusivas
        </button>

      </div>

      {/* Social proof */}
      <div className="mt-8">
        <Reviews />
      </div>

      {/* Formulário de dados — aparece ao selecionar */}
      <div
        ref={formRef}
        className="max-w-3xl mx-auto overflow-hidden"
        style={{
          scrollMarginTop: '140px',
          opacity:    formVisible ? 1 : 0,
          transform:  formVisible ? 'translateY(0)' : 'translateY(28px)',
          maxHeight:  formVisible ? '1100px' : '0px',
          pointerEvents: formVisible ? 'auto' : 'none',
          transition: formVisible
            ? 'opacity 0.55s ease-out, transform 0.55s cubic-bezier(0.22,1,0.36,1), max-height 0.65s cubic-bezier(0.22,1,0.36,1)'
            : 'opacity 0.3s ease-in, transform 0.3s ease-in, max-height 0.3s ease-in',
        }}
      >
        <div className="mt-8 pt-7 border-t border-gold-800/25">
          <p className="text-[10px] tracking-[0.45em] uppercase text-gold-600/50 mb-5 text-center">
            Seus dados
          </p>

          <div className="space-y-4 max-w-md mx-auto lg:max-w-none">
            <Field label="Nome completo">
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="Seu nome"
                className="w-full bg-black/60 border border-gold-900/40 rounded-lg px-4 py-3 text-sm text-gold-200 placeholder-gold-900/50 outline-none focus:border-gold-600/60 transition-colors"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="WhatsApp">
                <input
                  type="tel" inputMode="numeric" value={phone}
                  onChange={e => setPhone(maskPhone(e.target.value))}
                  placeholder="(00) 00000-0000"
                  className="w-full bg-black/60 border border-gold-900/40 rounded-lg px-4 py-3 text-sm text-gold-200 placeholder-gold-900/50 outline-none focus:border-gold-600/60 transition-colors"
                />
              </Field>
              <Field label="E-mail">
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full bg-black/60 border border-gold-900/40 rounded-lg px-4 py-3 text-sm text-gold-200 placeholder-gold-900/50 outline-none focus:border-gold-600/60 transition-colors"
                />
              </Field>
            </div>

            <Field label="CPF">
              <input
                type="text" inputMode="numeric" value={taxId}
                onChange={e => setTaxId(maskCPF(e.target.value))}
                placeholder="000.000.000-00"
                className={[
                  'w-full bg-black/60 rounded-lg px-4 py-3 text-sm text-gold-200 placeholder-gold-900/50 outline-none transition-colors border',
                  cpfError ? 'border-red-500/60 focus:border-red-400' : 'border-gold-900/40 focus:border-gold-600/60',
                ].join(' ')}
              />
              {cpfError && <p className="text-[11px] text-red-400/80 mt-1">CPF inválido — confira os números.</p>}
            </Field>

            {/* WhatsApp marketing — opcional */}
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox" checked={whatsappConsent}
                onChange={e => setWhatsappConsent(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-gold-500 cursor-pointer shrink-0"
              />
              <span className="text-[11px] text-gold-700/75 leading-relaxed">
                Aceitar receber novidades e ofertas exclusivas do Select Motel pelo WhatsApp.{' '}
                <span className="text-gold-700/45">(opcional)</span>
              </span>
            </label>

            {/* LGPD — obrigatório */}
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox" checked={acceptedTerms}
                onChange={e => setAcceptedTerms(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-gold-500 cursor-pointer shrink-0"
              />
              <span className="text-[11px] text-gold-700/75 leading-relaxed">
                Li e concordo com os{' '}
                <button type="button" onClick={() => setLegalOpen('terms')}
                        className="text-gold-400 underline underline-offset-2 hover:text-gold-300">
                  Termos de Uso
                </button>{' '}
                e com a{' '}
                <button type="button" onClick={() => setLegalOpen('privacy')}
                        className="text-gold-400 underline underline-offset-2 hover:text-gold-300">
                  Política de Privacidade
                </button>
                . Autorizo o tratamento dos meus dados para fins da reserva, nos termos da LGPD.
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div
        className="max-w-3xl mx-auto transition-all duration-500"
        style={{ marginTop: '1.5rem' }}
      >
        <button
          ref={ctaRef}
          onClick={advance}
          disabled={!canContinue}
          className={[
            'w-full px-6 py-4 rounded-xl text-sm font-semibold transition-all duration-300',
            canContinue
              ? 'bg-gradient-to-r from-gold-700 to-gold-500 text-black hover:from-gold-600 hover:to-gold-400 active:scale-[0.98]'
              : 'bg-gold-900/20 text-gold-800/40 cursor-not-allowed',
          ].join(' ')}
        >
          {!picked
            ? 'Escolha uma opção acima'
            : !formVisible
              ? 'Preencha seus dados para continuar'
              : canContinue
                ? picked === 'suite'
                  ? <>Garantir minha reserva →</>
                  : <>Criar minha experiência →</>
                : 'Preencha seus dados para continuar'}
        </button>
      </div>

      {legalOpen && <LegalModal kind={legalOpen} onClose={() => setLegalOpen(null)} />}

      {promosOpen && createPortal(
        <PromosSheet promos={promos} onClose={() => setPromosOpen(false)} />,
        document.body,
      )}
    </div>
  )
}


function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] tracking-widest uppercase text-gold-600/60 mb-2">{label}</label>
      {children}
    </div>
  )
}

// ── Promos Page (full-screen, desliza da direita) ────────────────────────────

function PromosSheet({ promos, onClose }: { promos: Promo[]; onClose: () => void }) {
  const { setStep, setMode } = useStore()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => setTimeout(() => setVisible(true), 10))
    return () => { document.body.style.overflow = '' }
  }, [])

  function close() {
    setVisible(false)
    setTimeout(onClose, 380)
  }

  function navigateToStep(step: number) {
    setVisible(false)
    setTimeout(() => {
      onClose()
      // Garante o fluxo "Fazer uma reserva" (suite) para etapas > 1
      if (step > 1) setMode('suite')
      setStep(step)
    }, 380)
  }

  return (
    <div
      className="fixed inset-0 z-50"
      style={{
        transform: visible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.38s cubic-bezier(0.4,0,0.2,1)',
        background: '#080602',
      }}
    >
      {/* Linha decorativa top */}
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(201,168,76,0.35), transparent)' }} />

      {/* Header fixo */}
      <header
        className="sticky top-0 z-10 flex items-center gap-4 px-5 py-4"
        style={{ background: 'rgba(8,6,2,0.92)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(201,168,76,0.08)' }}
      >
        <button
          onClick={close}
          className="flex items-center gap-2 transition-opacity hover:opacity-70 active:scale-95"
          style={{ color: 'rgba(201,168,76,0.70)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          <span className="text-sm font-medium">Voltar</span>
        </button>

        <div className="flex-1 text-center">
          <p className="text-[10px] tracking-[0.4em] uppercase" style={{ color: 'rgba(201,168,76,0.45)' }}>Select Motel</p>
          <h2 className="font-serif italic font-light" style={{ fontSize: '1.05rem', color: 'rgba(223,192,122,0.90)', letterSpacing: '-0.01em' }}>
            Promoções Exclusivas
          </h2>
        </div>

        {/* Espaço para centralizar o título */}
        <div style={{ width: 64 }} />
      </header>

      {/* Conteúdo rolável */}
      <div className="h-full overflow-y-auto pb-20" style={{ paddingTop: '0' }}>
        {promos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <span style={{ fontSize: '3rem', opacity: 0.15 }}>✦</span>
            <p style={{ color: 'rgba(200,188,168,0.30)', fontSize: '0.9rem' }}>Nenhuma promoção disponível no momento.</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-4 py-8 space-y-10">
            {promos.map((p, i) => (
              <PromoCard key={p.id} promo={p} index={i} onNavigate={navigateToStep} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PromoCard({ promo, index, onNavigate }: { promo: Promo; index: number; onNavigate: (step: number) => void }) {
  const hasAction = promo.button_step !== null || !!promo.button_url

  return (
    <article
      className="rounded-3xl overflow-hidden"
      style={{
        background: 'linear-gradient(160deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
        border: '1px solid rgba(201,168,76,0.14)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
      }}
    >
      {/* Imagem no tamanho real — sem crop */}
      {promo.photo_url ? (
        <img
          src={promo.photo_url}
          alt={promo.title}
          className="w-full h-auto block"
          style={{ display: 'block' }}
        />
      ) : (
        <div
          className="w-full flex items-center justify-center py-16"
          style={{ background: 'rgba(201,168,76,0.04)' }}
        >
          <span style={{ fontSize: '3.5rem', opacity: 0.12 }}>✦</span>
        </div>
      )}

      {/* Separador dourado */}
      <div style={{ height: '1px', background: 'linear-gradient(to right, transparent, rgba(201,168,76,0.25), transparent)' }} />

      {/* Corpo */}
      <div className="px-6 py-7 space-y-4">
        {/* Índice decorativo */}
        <p className="text-[10px] tracking-[0.45em] uppercase" style={{ color: 'rgba(201,168,76,0.40)' }}>
          Oferta {String(index + 1).padStart(2, '0')}
        </p>

        {/* Título */}
        <h3
          className="font-serif font-light leading-tight"
          style={{
            fontSize: 'clamp(1.35rem, 4vw, 1.75rem)',
            color: 'rgba(240,230,210,0.95)',
            letterSpacing: '-0.02em',
          }}
        >
          {promo.title}
        </h3>

        {/* Descrição */}
        {promo.description && (
          <p
            className="leading-relaxed"
            style={{
              fontSize: '0.95rem',
              color: 'rgba(210,198,178,0.65)',
              lineHeight: 1.7,
            }}
          >
            {promo.description}
          </p>
        )}

        {/* Botão de ação */}
        {hasAction && (
          <div className="pt-2">
            {promo.button_step !== null ? (
              <button
                onClick={() => onNavigate(promo.button_step!)}
                className="w-full py-4 rounded-2xl text-sm font-semibold tracking-wide transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #b8892a, #e8c060, #b8892a)', color: '#080502' }}
              >
                {promo.button_text || 'Aproveitar oferta'}
              </button>
            ) : (
              <a
                href={promo.button_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-4 rounded-2xl text-sm font-semibold tracking-wide text-center transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #b8892a, #e8c060, #b8892a)', color: '#080502' }}
              >
                {promo.button_text || 'Saiba mais'}
              </a>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
