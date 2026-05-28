import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import { buildPixPayload } from '../lib/pix'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDt(d: Date) {
  return d.toLocaleString('pt-BR', {
    weekday: 'short', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

type Method = 'pix' | 'card'
type PixSettings = { key: string; merchantName: string; city: string }

export default function StepPagamento() {
  const {
    package: pkg, type, suite, checkIn, checkOut,
    customerName, customerPhone, customerEmail,
    totalAmount, prevStep,
  } = useStore()
  const total = totalAmount()
  const checkout = checkOut()

  const [method, setMethod] = useState<Method | null>(null)
  const [pixSettings, setPixSettings] = useState<PixSettings | null>(null)
  const [pixPayload, setPixPayload] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reservationId, setReservationId] = useState<string | null>(null)
  const [whatsappNum, setWhatsappNum] = useState('5511999999999')

  // Load Pix settings + WhatsApp number
  useEffect(() => {
    supabase
      .from('settings')
      .select('key, value')
      .in('key', ['pix_key', 'pix_merchant_name', 'pix_city', 'whatsapp_number'])
      .then(({ data }) => {
        if (!data) return
        const map = Object.fromEntries(data.map(s => [s.key, s.value]))
        if (map['whatsapp_number']) setWhatsappNum(map['whatsapp_number'])
        if (map['pix_key']) {
          setPixSettings({
            key: map['pix_key'],
            merchantName: map['pix_merchant_name'] ?? 'Select Motel',
            city: map['pix_city'] ?? 'Maringa',
          })
        }
      })
  }, [])

  // Generate Pix payload when method changes
  useEffect(() => {
    if (method !== 'pix' || !pixSettings) return
    try {
      const payload = buildPixPayload({
        pixKey: pixSettings.key,
        amount: total,
        merchantName: pixSettings.merchantName,
        merchantCity: pixSettings.city,
        txId: `RESERVA${Date.now()}`,
      })
      setPixPayload(payload)
    } catch {
      setPixPayload(null)
    }
  }, [method, pixSettings, total])

  async function createReservation() {
    if (!pkg || !type || !suite || !checkIn || !checkout) return
    setLoading(true)
    setError(null)

    const { data, error: sbError } = await supabase
      .from('reservations')
      .insert({
        package_id: pkg.id,
        type,
        suite_id: suite.id,
        check_in: checkIn.toISOString(),
        check_out: checkout.toISOString(),
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        total_amount: total,
        status: 'pending',
      })
      .select('id')
      .single()

    setLoading(false)

    if (sbError) {
      setError(
        sbError.message.includes('não está disponível')
          ? 'Esta suíte já está reservada neste horário. Volte e escolha outro horário ou suíte.'
          : 'Ocorreu um erro ao registrar sua reserva. Tente novamente.',
      )
      return
    }

    setReservationId(data.id)
  }

  function copyPix() {
    if (!pixPayload) return
    navigator.clipboard.writeText(pixPayload).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  function goWhatsApp(reservationId: string) {
    const lines = [
      `✅ *Reserva Confirmada — Select Motel*`,
      ``,
      `📋 *Código:* ${reservationId.slice(0, 8).toUpperCase()}`,
      `👤 *Cliente:* ${customerName}`,
      `📱 *Telefone:* ${customerPhone}`,
      ``,
      `🛏️ *Suíte:* ${suite?.name ?? ''}`,
      `📦 *Pacote:* ${pkg?.label ?? ''}`,
      `⏱️ *Modalidade:* ${type === 'period' ? 'Período' : 'Pernoite'}`,
      ``,
      `🟢 *Check-in:* ${checkIn ? fmtDt(checkIn) : ''}`,
      `🔴 *Check-out:* ${checkout ? fmtDt(checkout) : ''}`,
      ``,
      `💰 *Total:* ${fmt(total)}`,
      `💳 *Pagamento:* ${method === 'pix' ? 'Pix' : 'Cartão'}`,
    ]
    const msg = encodeURIComponent(lines.join('\n'))
    window.open(`https://wa.me/${whatsappNum}?text=${msg}`, '_blank')
  }

  // ── Success screen ──────────────────────────────────────────
  if (reservationId) {
    return (
      <div className="max-w-lg">
        <div className="border border-gold-700/40 rounded-2xl overflow-hidden">
          <div className="bg-gold-900/20 px-6 py-4 border-b border-gold-800/30 text-center">
            <div className="w-10 h-10 rounded-full border border-gold-500/50 flex items-center justify-center mx-auto mb-3"
              style={{ background: 'linear-gradient(135deg,#c8a035,#e8c060)' }}>
              <svg className="w-5 h-5 text-black" fill="none" viewBox="0 0 20 20">
                <path d="M4 10l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="font-serif text-2xl font-light gold-gradient">Reserva registrada!</h2>
          </div>

          <div className="px-6 py-5 space-y-3">
            <SummaryRow label="Código" value={reservationId.slice(0, 8).toUpperCase()} mono />
            <SummaryRow label="Suíte" value={suite?.name ?? ''} />
            <SummaryRow label="Check-in" value={checkIn ? fmtDt(checkIn) : ''} />
            <SummaryRow label="Check-out" value={checkout ? fmtDt(checkout) : ''} />
            <div className="border-t border-gold-900/40 pt-3 flex items-baseline justify-between">
              <span className="text-[10px] tracking-widest uppercase text-gold-600/60">Total</span>
              <span className="font-serif text-2xl font-semibold gold-gradient">{fmt(total)}</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => goWhatsApp(reservationId)}
          className="mt-5 w-full py-4 rounded-xl font-semibold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-3"
          style={{ background: 'linear-gradient(135deg,#128c7e,#25d366)', color: '#fff' }}
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          Ir para o WhatsApp
        </button>

        <p className="mt-3 text-[11px] text-gold-800/50 text-center">
          Enviaremos os detalhes da reserva pelo WhatsApp.
        </p>
      </div>
    )
  }

  // ── Main flow ──────────────────────────────────────────────
  return (
    <div>
      <button
        onClick={prevStep}
        className="flex items-center gap-1 text-gold-700/60 text-sm mb-8 hover:text-gold-500 transition-colors"
      >
        <span>←</span> Voltar
      </button>

      <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-light mb-2 leading-tight">
        Pagamento e<br />
        <span className="gold-gradient font-semibold italic">confirmação</span>
      </h1>
      <p className="text-gold-700/70 text-sm mb-7">
        Revise e escolha a forma de pagamento.
      </p>

      <div className="lg:grid lg:grid-cols-2 lg:gap-10 xl:gap-14 lg:items-start">
        {/* Left col: Summary */}
        <div>
          <div className="border border-gold-800/40 rounded-xl overflow-hidden mb-6 lg:mb-0">
            <div className="bg-gold-900/20 px-5 py-3 border-b border-gold-800/30">
              <p className="text-[10px] tracking-widest uppercase text-gold-500/60">Resumo da reserva</p>
            </div>
            <div className="px-5 py-4 space-y-2.5">
              <SummaryRow label="Cliente" value={customerName} />
              <SummaryRow label="Suíte" value={suite?.name ?? '—'} />
              <SummaryRow label="Pacote" value={pkg?.label ?? '—'} />
              <SummaryRow label="Modalidade" value={type === 'period' ? 'Período' : 'Pernoite'} />
              <SummaryRow label="Check-in" value={checkIn ? fmtDt(checkIn) : '—'} />
              <SummaryRow label="Check-out" value={checkout ? fmtDt(checkout) : '—'} highlight />
              <div className="border-t border-gold-900/40 pt-3 flex items-baseline justify-between">
                <span className="text-[10px] tracking-widest uppercase text-gold-600/60">Total</span>
                <span className="font-serif text-2xl font-semibold gold-gradient">{fmt(total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right col: Payment */}
        <div>
          {/* Payment method */}
          <div className="mb-6">
            <p className="text-[10px] tracking-widest uppercase text-gold-600/60 mb-3">
              Forma de pagamento
            </p>
            <div className="grid grid-cols-2 gap-3">
              <MethodCard
                id="pix"
                selected={method === 'pix'}
                onClick={() => setMethod('pix')}
                icon={
                  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                }
                label="Pix"
                sub="Aprovação imediata"
              />
              <MethodCard
                id="card"
                selected={method === 'card'}
                onClick={() => setMethod('card')}
                icon={
                  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
                    <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M2 10h20" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                }
                label="Cartão"
                sub="Crédito ou débito"
              />
            </div>
          </div>

          {/* Pix panel */}
          {method === 'pix' && (
            <div className="mb-6 space-y-4">
              {!pixSettings ? (
                <div className="p-4 rounded-xl border border-yellow-700/30 bg-yellow-900/10 text-yellow-400/70 text-sm">
                  Chave Pix não configurada. Acesse o painel admin → Configurações e adicione a chave <code className="font-mono text-xs">pix_key</code>.
                </div>
              ) : pixPayload ? (
                <>
                  <div className="flex justify-center">
                    <div className="p-4 bg-white rounded-2xl">
                      <QRCodeSVG value={pixPayload} size={220} level="M" />
                    </div>
                  </div>
                  <button
                    onClick={copyPix}
                    className="w-full py-3 rounded-xl text-sm font-medium border border-gold-700/40 text-gold-400 hover:bg-gold-900/20 transition-colors flex items-center justify-center gap-2"
                  >
                    {copied ? '✓ Copiado!' : 'Copiar código Pix'}
                  </button>
                  <p className="text-[11px] text-gold-800/50 text-center">
                    Escaneie o QR Code ou copie o código no app do seu banco.
                  </p>
                </>
              ) : (
                <div className="p-4 rounded-xl border border-gold-800/30 bg-gold-900/10 text-gold-600/50 text-sm text-center">
                  Gerando QR Code…
                </div>
              )}
            </div>
          )}

          {/* Card panel */}
          {method === 'card' && (
            <div className="mb-6 p-5 rounded-xl border border-gold-800/30 bg-gold-900/10 text-center space-y-3">
              <p className="text-gold-400/80 text-sm font-medium">Pagamento via cartão</p>
              <p className="text-gold-700/60 text-xs leading-relaxed">
                Para pagamentos com cartão, finalize sua reserva abaixo e nosso atendimento entrará em contato pelo WhatsApp para processar o pagamento.
              </p>
            </div>
          )}

          {error && (
            <p className="mb-4 text-red-400 text-sm text-center bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3">
              {error}
            </p>
          )}

          {method && (
            <button
              onClick={createReservation}
              disabled={loading}
              className="w-full py-4 rounded-xl font-semibold text-sm tracking-wide text-black transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #c8a035 0%, #e8c060 50%, #c8a035 100%)' }}
            >
              {loading
                ? 'Registrando…'
                : method === 'pix'
                ? 'Já efetuei o pagamento'
                : `Confirmar reserva — ${fmt(total)}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────

function SummaryRow({ label, value, highlight, mono }: {
  label: string; value: string; highlight?: boolean; mono?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[10px] tracking-widest uppercase text-gold-700/50 shrink-0">{label}</span>
      <span className={[
        'text-sm text-right max-w-[60%]',
        highlight ? 'text-gold-200 font-semibold' : 'text-gold-300 font-medium',
        mono ? 'font-mono' : '',
      ].join(' ')}>
        {value}
      </span>
    </div>
  )
}

function MethodCard({ selected, onClick, icon, label, sub }: {
  id: string; selected: boolean; onClick: () => void
  icon: React.ReactNode; label: string; sub: string
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'relative flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-200 text-center',
        selected
          ? 'border-gold-500 bg-gold-900/20 text-gold-300'
          : 'border-gold-900/40 text-gold-700/60 hover:border-gold-700/50 hover:text-gold-400',
      ].join(' ')}
    >
      {selected && (
        <div className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg,#c8a035,#e8c060)' }}>
          <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 10 10">
            <path d="M2 5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
      {icon}
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-[10px] opacity-60">{sub}</p>
      </div>
    </button>
  )
}
