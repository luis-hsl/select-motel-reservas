import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import LegalModal, { type LegalKind } from '../components/LegalModal'
import { metaEvents } from '../lib/metaPixel'
import { supabase } from '../lib/supabase'
import { getSessionToken } from '../lib/tracking'
import type { ReservationMode } from '../types'
import Reviews from '../components/Reviews'

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

  /* form fields — pré-populados com dados do store se o usuário voltou */
  const [name,             setName]             = useState(customerName  || '')
  const [phone,            setPhone]            = useState(customerPhone || '')
  const [email,            setEmail]            = useState(customerEmail || '')
  const [taxId,            setTaxId]            = useState(customerTaxId ? maskCPF(customerTaxId) : '')
  const [acceptedTerms,    setAcceptedTerms]    = useState(!!consentAt)
  const [whatsappConsent,  setWhatsappConsent]  = useState(false)
  const [legalOpen,        setLegalOpen]        = useState<LegalKind | null>(null)

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

        {/* Botão secundário — Monte sua experiência */}
        <button
          type="button"
          onClick={() => pick('experience')}
          aria-pressed={picked === 'experience'}
          className={[
            'w-full text-center text-sm transition-all duration-300 py-2 rounded-lg',
            picked === 'experience'
              ? 'text-gold-400 underline underline-offset-4'
              : 'text-gold-700/60 hover:text-gold-600/80',
          ].join(' ')}
        >
          {picked === 'experience' && (
            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-gold-500/60 mr-1.5 align-middle">
              <svg className="w-2 h-2" fill="none" viewBox="0 0 12 12">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.8" />
              </svg>
            </span>
          )}
          Monte sua experiência do seu jeito
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

            {/* WhatsApp marketing — opcional, destacado */}
            <label
              className="flex items-start gap-3 cursor-pointer select-none rounded-xl px-4 py-3.5 transition-colors"
              style={{
                background: whatsappConsent ? 'rgba(37,211,102,0.07)' : 'rgba(37,211,102,0.03)',
                border: `1px solid ${whatsappConsent ? 'rgba(37,211,102,0.35)' : 'rgba(37,211,102,0.15)'}`,
              }}
            >
              <input
                type="checkbox" checked={whatsappConsent}
                onChange={e => setWhatsappConsent(e.target.checked)}
                className="mt-0.5 w-4 h-4 cursor-pointer shrink-0"
                style={{ accentColor: '#25d366' }}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="rgba(37,211,102,0.8)" className="shrink-0">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  <span className="text-[12px] font-medium" style={{ color: 'rgba(37,211,102,0.85)' }}>
                    Aceitar receber mensagens no WhatsApp
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" style={{ background: 'rgba(37,211,102,0.1)', color: 'rgba(37,211,102,0.5)', border: '1px solid rgba(37,211,102,0.2)' }}>
                    opcional
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(160,220,170,0.5)' }}>
                  Novidades e ofertas exclusivas do Select Motel.
                </p>
              </div>
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
