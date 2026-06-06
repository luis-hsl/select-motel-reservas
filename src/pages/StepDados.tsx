import { useState } from 'react'
import { useStore } from '../store/useStore'
import LegalModal, { type LegalKind } from '../components/LegalModal'
import { metaEvents } from '../lib/metaPixel'
import { supabase } from '../lib/supabase'

function maskCPF(v: string) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

// Valida CPF pelos dois dígitos verificadores. Bloqueia 11 chars iguais
// (000…000, 111…111, …) e sequências geradas randomicamente que não passam
// no algoritmo do MOD-11 — o AbacatePay em produção rejeita esses.
function isValidCPF(raw: string): boolean {
  if (raw.length !== 11) return false
  if (/^(\d)\1+$/.test(raw)) return false
  const d = raw.split('').map(Number)
  for (const k of [9, 10] as const) {
    let sum = 0
    for (let i = 0; i < k; i++) sum += d[i] * (k + 1 - i)
    const rest = (sum * 10) % 11
    const check = rest === 10 ? 0 : rest
    if (check !== d[k]) return false
  }
  return true
}

function maskPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (!d) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export default function StepDados() {
  const { setCustomer, setObservations, observations: storedObs, setConsentAt, nextStep, prevStep,
    package: pkg, type, suite, checkIn, drink, food, totalAmount } = useStore()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [taxId, setTaxId] = useState('')
  const [obs, setObs] = useState(storedObs ?? '')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [legalOpen, setLegalOpen] = useState<LegalKind | null>(null)

  const rawCPF = taxId.replace(/\D/g, '')
  const rawPhone = phone.replace(/\D/g, '')
  const cpfValid = isValidCPF(rawCPF)
  const cpfError = rawCPF.length === 11 && !cpfValid
  const canContinue = name.trim() && rawPhone.length >= 10 && email.includes('@') && cpfValid && acceptedTerms

  function confirm() {
    if (!canContinue) return
    setCustomer(name.trim(), phone.trim(), email.trim(), rawCPF)
    setObservations(obs.trim())
    setConsentAt(new Date().toISOString())

    // Google Ads — conversion "Inscrição" (lead): cliente preencheu dados completos.
    // Usa email como transaction_id pra dedupe básico se o lead voltar.
    const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag
    if (typeof gtag === 'function') {
      gtag('event', 'conversion', {
        send_to: 'AW-18204610844/RO0FCNWRkrgcEJyi0ehD',
        value: 1.0,
        currency: 'BRL',
        transaction_id: email.trim().toLowerCase(),
      })
    }

    // Meta Pixel — Lead
    metaEvents.lead()

    // Salva lead no Supabase (checkout abandonado)
    supabase.from('leads').insert({
      name:         name.trim(),
      phone:        phone.trim(),
      email:        email.trim(),
      package_id:   pkg?.id ?? null,
      type:         type ?? null,
      suite_id:     suite?.id ?? null,
      check_in:     checkIn?.toISOString() ?? null,
      drink:        drink ?? null,
      food:         food ?? null,
      total_amount: totalAmount() || null,
      observations: obs.trim() || null,
    }).then(() => {/* silencioso */})

    nextStep()
  }

  return (
    <div>
      <button onClick={prevStep} className="flex items-center gap-1 text-gold-700/60 text-sm mb-8 hover:text-gold-500 transition-colors">
        <span>←</span> Voltar
      </button>

      <div className="lg:grid lg:grid-cols-2 lg:gap-16 lg:items-start">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-light mb-2 leading-tight">
            Seus<br />
            <span className="gold-gradient font-semibold italic">dados</span>
          </h1>
          <p className="text-gold-700/70 text-sm mb-6 sm:mb-10 lg:mb-0 lg:max-w-xs">
            Usaremos seu WhatsApp para enviar a confirmação da reserva.
          </p>
        </div>

        <div className="space-y-4 max-w-md lg:max-w-none mt-6 lg:mt-0">
          <Field label="Nome completo">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
              className="w-full bg-black/60 border border-gold-900/40 rounded-lg px-4 py-3 text-sm text-gold-200 placeholder-gold-900/50 outline-none focus:border-gold-600/60 transition-colors"
            />
          </Field>

          <Field label="CPF">
            <input
              type="text"
              inputMode="numeric"
              value={taxId}
              onChange={(e) => setTaxId(maskCPF(e.target.value))}
              placeholder="000.000.000-00"
              className={[
                'w-full bg-black/60 rounded-lg px-4 py-3 text-sm text-gold-200 placeholder-gold-900/50 outline-none transition-colors border',
                cpfError
                  ? 'border-red-500/60 focus:border-red-400'
                  : 'border-gold-900/40 focus:border-gold-600/60',
              ].join(' ')}
            />
            {cpfError && (
              <p className="text-[11px] text-red-400/80 mt-1">CPF inválido — confira os números.</p>
            )}
          </Field>

          <Field label="WhatsApp">
            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(maskPhone(e.target.value))}
              placeholder="(00) 00000-0000"
              className="w-full bg-black/60 border border-gold-900/40 rounded-lg px-4 py-3 text-sm text-gold-200 placeholder-gold-900/50 outline-none focus:border-gold-600/60 transition-colors"
            />
          </Field>

          <Field label="E-mail">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="w-full bg-black/60 border border-gold-900/40 rounded-lg px-4 py-3 text-sm text-gold-200 placeholder-gold-900/50 outline-none focus:border-gold-600/60 transition-colors"
            />
          </Field>

          <Field label="Observações (opcional)">
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value.slice(0, 500))}
              placeholder="Ex: ligar a hidromassagem, servir os pratos às 21h, alergia a frutos do mar…"
              rows={3}
              className="w-full bg-black/60 border border-gold-900/40 rounded-lg px-4 py-3 text-sm text-gold-200 placeholder-gold-900/50 outline-none focus:border-gold-600/60 transition-colors resize-none"
            />
            <p className="mt-1 text-[10px] text-gold-700/40 text-right">{obs.length}/500</p>
          </Field>

          {/* LGPD — consentimento obrigatório */}
          <label className="flex items-start gap-3 cursor-pointer select-none mt-1">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-gold-500 cursor-pointer shrink-0"
            />
            <span className="text-[12px] sm:text-xs text-gold-700/80 leading-relaxed">
              Li e concordo com os{' '}
              <button
                type="button"
                onClick={() => setLegalOpen('terms')}
                className="text-gold-400 underline underline-offset-2 hover:text-gold-300"
              >
                Termos de Uso
              </button>{' '}
              e com a{' '}
              <button
                type="button"
                onClick={() => setLegalOpen('privacy')}
                className="text-gold-400 underline underline-offset-2 hover:text-gold-300"
              >
                Política de Privacidade
              </button>{' '}
              do Select Motel. Autorizo o tratamento dos meus dados para fins da reserva, nos termos da LGPD.
            </span>
          </label>

          <button
            onClick={confirm}
            disabled={!canContinue}
            className={[
              'w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg text-sm font-semibold transition-all duration-200 mt-2',
              canContinue
                ? 'bg-gradient-to-r from-gold-700 to-gold-500 text-black hover:from-gold-600 hover:to-gold-400'
                : 'bg-gold-900/20 text-gold-800/40 cursor-not-allowed',
            ].join(' ')}
          >
            Ir para pagamento <span>→</span>
          </button>
        </div>
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
