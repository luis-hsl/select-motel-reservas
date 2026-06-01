import { useState } from 'react'
import { useStore } from '../store/useStore'

function maskCPF(v: string) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

export default function StepDados() {
  const { setCustomer, nextStep, prevStep } = useStore()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [taxId, setTaxId] = useState('')

  const rawCPF = taxId.replace(/\D/g, '')
  const canContinue = name.trim() && phone.trim() && email.includes('@') && rawCPF.length === 11

  function confirm() {
    if (!canContinue) return
    setCustomer(name.trim(), phone.trim(), email.trim(), rawCPF)
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
              className="w-full bg-black/60 border border-gold-900/40 rounded-lg px-4 py-3 text-sm text-gold-200 placeholder-gold-900/50 outline-none focus:border-gold-600/60 transition-colors"
            />
          </Field>

          <Field label="WhatsApp">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
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
