import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import { getSessionToken } from '../lib/tracking'
import Reviews from '../components/Reviews'
import { metaEvents } from '../lib/metaPixel'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDt(d: Date) {
  return d.toLocaleString('pt-BR', {
    weekday: 'short', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function foodLabel(f: string | null): string | null {
  if (f === 'jantar') return 'Jantar'
  if (f === 'sushi')  return 'Sushi'
  if (f === 'pizza')  return 'Pizza'
  return null
}

function drinkLabel(d: string | null): string | null {
  if (d === 'vinho')    return 'Vinho'
  if (d === 'frisante') return 'Frisante'
  if (d === 'drinque')  return 'Drink'
  return null
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function installment(total: number, n: number) {
  return (total / n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

interface PixCharge {
  reservationId: string
  brCode: string
  qrCodeImage?: string | null
  pixUrl?: string | null
}

export default function StepPagamento() {
  const {
    mode, package: pkg, type, suite, checkIn, checkOut,
    customerName, customerPhone, customerEmail, customerTaxId,
    totalAmount, prevStep, drink, food, observations, consentAt, selectedItems,
  } = useStore()
  // Snapshot do que o cliente escolheu — vai na coluna extras (jsonb) da reserva
  // e é usado pra montar a mensagem que o motel recebe quando o pagamento confirma.
  const extras = {
    mode:         mode ?? 'package',
    packageId:    pkg?.id    ?? null,
    packageLabel: pkg?.label ?? null,
    includes:     pkg?.includes ?? [],
    drink,
    food,
    type,
    selectedItems,                            // a la carte (modo experiência)
    observations: observations?.trim() || null,
    lgpdConsentAt: consentAt,
    trackingSessionToken: getSessionToken(),
  }
  const total = totalAmount()
  const checkout = checkOut()

  const [pixCharge, setPixCharge] = useState<PixCharge | null>(null)
  const [pixLoading, setPixLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [cardLoading, setCardLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reservationId, setReservationId] = useState<string | null>(null)
  const [whatsappNum, setWhatsappNum] = useState('5511999999999')
  const [paymentSource, setPaymentSource] = useState<'pix' | 'card' | null>(null)

  useEffect(() => {
    supabase
      .from('settings')
      .select('value')
      .eq('key', 'whatsapp_number')
      .single()
      .then(({ data }) => { if (data?.value) setWhatsappNum(data.value) })
  }, [])

  // Google Ads — conversion "Iniciar finalização de compra"
  // dispara uma vez quando o cliente chega na tela de pagamento, com o valor da reserva.
  useEffect(() => {
    const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag
    if (typeof gtag !== 'function' || !total) return
    gtag('event', 'conversion', {
      send_to: 'AW-18204610844/B1gpCIyhv7ccEJyi0ehD',
      value: total,
      currency: 'BRL',
    })
    // Meta Pixel — InitiateCheckout
    metaEvents.initiateCheckout({ value: total })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Google Ads — conversion "Compra Confirmada" (PIX). Cartão dispara em CardPaymentReturn.
  // transaction_id evita dedupe Ads se o user reabrir a tela.
  useEffect(() => {
    if (!reservationId || paymentSource !== 'pix') return
    const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag
    if (typeof gtag !== 'function') return
    gtag('event', 'conversion', {
      send_to: 'AW-18204610844/tNRrCK-4kbgcEJyi0ehD',
      value: total,
      currency: 'BRL',
      transaction_id: reservationId,
    })
    // Meta Pixel — Purchase (PIX)
    metaEvents.purchase({
      value:       total,
      orderId:     reservationId,
      contentIds:  pkg ? [pkg.id] : [],
    })
  }, [reservationId, paymentSource, total, pkg])

  // Poll DB every 3s for PIX payment confirmation
  useEffect(() => {
    if (!pixCharge?.reservationId) return
    const id = pixCharge.reservationId
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('reservations')
        .select('status')
        .eq('id', id)
        .single()
      if (data?.status === 'paid') {
        clearInterval(interval)
        setPaymentSource('pix')
        setReservationId(id)
        setPixCharge(null)
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [pixCharge?.reservationId])

  async function generatePixCharge() {
    // Modo pacote precisa de pkg; modo experiência não (só suíte + tipo + data).
    const missingPackage = mode === 'package' && !pkg
    if (missingPackage || !type || !suite || !checkIn || !checkout) {
      setError('Dados da reserva incompletos. Volte e preencha novamente.')
      return
    }
    setPixLoading(true)
    setError(null)

    const { data, error: fnError } = await supabase.functions.invoke(
      'abacatepay-create-charge',
      {
        body: {
          packageId: pkg?.id ?? null,
          mode:      mode ?? 'package',
          type,
          suiteId: suite.id,
          checkIn: checkIn.toISOString(),
          checkOut: checkout.toISOString(),
          customerName,
          customerPhone,
          customerEmail,
          customerTaxId,
          totalAmount: total,
          appOrigin: window.location.origin,
          extras,
        },
      },
    )

    setPixLoading(false)

    if (fnError || data?.error) {
      setError(data?.error ?? fnError?.message ?? 'Erro ao gerar QR Code. Tente novamente.')
      return
    }

    setPixCharge({
      reservationId: data.reservationId,
      brCode: data.brCode,
      qrCodeImage: data.qrCodeImage,
      pixUrl: data.pixUrl,
    })
  }

  async function handleCardPayment() {
    // Modo pacote precisa de pkg; modo experiência não (só suíte + tipo + data).
    const missingPackage = mode === 'package' && !pkg
    if (missingPackage || !type || !suite || !checkIn || !checkout) {
      setError('Dados da reserva incompletos. Volte e preencha novamente.')
      return
    }
    setCardLoading(true)
    setError(null)

    const { data, error: fnError } = await supabase.functions.invoke(
      'abacatepay-create-charge',
      {
        body: {
          packageId: pkg?.id ?? null,
          mode:      mode ?? 'package',
          type,
          suiteId: suite.id,
          checkIn: checkIn.toISOString(),
          checkOut: checkout.toISOString(),
          customerName,
          customerPhone,
          customerEmail,
          customerTaxId,
          totalAmount: total,
          appOrigin: window.location.origin,
          paymentMethod: 'card',
          extras,
        },
      },
    )

    setCardLoading(false)

    if (fnError || data?.error) {
      setError(data?.error ?? fnError?.message ?? 'Erro ao processar pagamento. Tente novamente.')
      return
    }

    if (data?.billingUrl) {
      window.location.href = data.billingUrl
    } else {
      setError('Link de pagamento não recebido. Tente novamente.')
    }
  }

  function copyPix() {
    if (!pixCharge?.brCode) return
    navigator.clipboard.writeText(pixCharge.brCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  function goWhatsApp(id: string) {
    const lines = [
      `✅ *Reserva — Select Motel*`,
      ``,
      `📋 *Código:* ${id.slice(0, 8).toUpperCase()}`,
      `👤 *Cliente:* ${customerName}`,
      `🛏️ *Suíte:* ${suite?.name ?? ''}`,
      `🌹 *Decoração:* Incluída`,
      `📦 *Pacote:* ${pkg?.label ?? ''}`,
      ...(food ? [`🍽️ *Refeição:* ${food === 'jantar' ? 'Jantar' : food === 'sushi' ? 'Sushi' : 'Pizza'}`] : []),
      ...(drink ? [`🍹 *Bebida:* ${drink === 'vinho' ? 'Vinho' : drink === 'frisante' ? 'Frisante' : 'Drink'}`] : []),
      `🍫 *Fondue:* Incluído`,
      `⏱️ *Modalidade:* ${type === 'period' ? 'Período' : 'Pernoite'}`,
      `🟢 *Check-in:* ${checkIn ? fmtDt(checkIn) : ''}`,
      `🔴 *Check-out:* ${checkout ? fmtDt(checkout) : ''}`,
      `💰 *Total:* ${fmt(total)}`,
    ]
    window.open(`https://wa.me/${whatsappNum}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank')
  }

  // ── Success screen ──────────────────────────────────────────
  if (reservationId) {
    const isPix = paymentSource === 'pix'
    return (
      <div className="max-w-lg">
        <div className="border border-gold-700/40 rounded-2xl overflow-hidden">
          <div className="bg-gold-900/20 px-6 py-5 border-b border-gold-800/30 text-center">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
              style={{ background: 'linear-gradient(135deg,#c8a035,#e8c060)' }}
            >
              <svg className="w-6 h-6 text-black" fill="none" viewBox="0 0 20 20">
                <path d="M4 10l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="font-serif text-2xl font-light gold-gradient">
              {isPix ? 'Pagamento confirmado!' : 'Reserva registrada!'}
            </h2>
            {isPix && (
              <p className="text-[11px] text-gold-700/50 mt-1">
                Você receberá uma confirmação pelo WhatsApp em instantes.
              </p>
            )}
          </div>

          <div className="px-6 py-5 space-y-3">
            <SummaryRow label="Código" value={reservationId.slice(0, 8).toUpperCase()} mono />
            <SummaryRow label="Suíte" value={suite ? `${suite.name} + Decoração` : ''} />
            {foodLabel(food) && <SummaryRow label="Refeição" value={foodLabel(food)!} />}
            {drinkLabel(drink) && <SummaryRow label="Bebida" value={drinkLabel(drink)!} />}
            <SummaryRow label="Fondue" value="Incluído" />
            <SummaryRow label="Check-in" value={checkIn ? fmtDt(checkIn) : ''} />
            <SummaryRow label="Check-out" value={checkout ? fmtDt(checkout) : ''} highlight />
            {type === 'period' && checkout && (
              <div
                className="rounded-lg px-3.5 py-3 flex items-start gap-2.5"
                style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.18)' }}
              >
                <svg className="w-3.5 h-3.5 shrink-0 mt-[1px]" viewBox="0 0 14 14" fill="none" style={{ color: 'rgba(201,168,76,0.55)' }}>
                  <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1" />
                  <path d="M7 4.5v3l1.8 1.2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div>
                  <p className="text-[9px] tracking-widest uppercase mb-0.5" style={{ color: 'rgba(201,168,76,0.45)' }}>
                    Modalidade período · 2 horas
                  </p>
                  <p className="text-xs leading-snug" style={{ color: 'rgba(220,190,110,0.8)' }}>
                    Saída prevista às <span className="font-semibold">{fmtTime(checkout)}</span>. Respeitamos esse horário para garantir a limpeza e preparação da suíte para o próximo hóspede.
                  </p>
                </div>
              </div>
            )}
            <div className="border-t border-gold-900/40 pt-3 flex items-baseline justify-between">
              <span className="text-[10px] tracking-widest uppercase text-gold-600/60">Total</span>
              <span className="font-serif text-2xl font-semibold gold-gradient">{fmt(total)}</span>
            </div>
          </div>
        </div>

        {!isPix && (
          <button
            onClick={() => goWhatsApp(reservationId)}
            className="mt-5 w-full py-4 rounded-xl font-semibold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-3"
            style={{ background: 'linear-gradient(135deg,#128c7e,#25d366)', color: '#fff' }}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Falar com o atendimento
          </button>
        )}

        <p className="mt-3 text-[11px] text-gold-800/50 text-center">
          {isPix
            ? 'Mensagens enviadas automaticamente para o WhatsApp informado.'
            : 'Nossa equipe entrará em contato pelo WhatsApp para confirmar o pagamento.'}
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
        {/* Left: Summary */}
        <div>
          {/* Mobile: resumo compacto */}
          <div className="lg:hidden border border-gold-800/40 rounded-xl p-3 mb-4">
            <p className="text-[9px] tracking-widests uppercase text-gold-500/60 mb-2">Resumo</p>
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-gold-400/80 mb-2">
              {suite && <span>{suite.name}</span>}
              {type && <span>· {type === 'period' ? 'Período' : 'Pernoite'}</span>}
              {pkg && <span>· {pkg.label}</span>}
              {foodLabel(food) && <span>· {foodLabel(food)}</span>}
              {drinkLabel(drink) && <span>· {drinkLabel(drink)}</span>}
            </div>
            {checkIn && <p className="text-[11px] text-gold-600/60">Check-in: {fmtDt(checkIn)}</p>}
            {checkout && <p className="text-[11px] text-gold-600/60">Check-out: {fmtDt(checkout)}</p>}
            <div className="border-t border-gold-900/40 mt-2.5 pt-2">
              <div className="flex items-baseline justify-between mb-0.5">
                <span className="text-[9px] tracking-widests uppercase text-gold-600/60">Total</span>
                <span className="font-serif text-xl font-semibold gold-gradient">{fmt(total)}</span>
              </div>
              <p className="text-right text-[10px]" style={{ color: 'rgba(201,168,76,0.45)' }}>
                ou em até 3x de {installment(total, 3)} no cartão
              </p>
            </div>
          </div>

          {/* Desktop: resumo completo */}
          <div className="hidden lg:block border border-gold-800/40 rounded-xl overflow-hidden mb-6 lg:mb-0">
            <div className="bg-gold-900/20 px-5 py-3 border-b border-gold-800/30">
              <p className="text-[10px] tracking-widest uppercase text-gold-500/60">Resumo da reserva</p>
            </div>
            <div className="px-5 py-4 space-y-2.5">
              <SummaryRow label="Cliente" value={customerName} />
              <SummaryRow label="Suíte" value={suite ? `${suite.name} + Decoração` : '—'} />
              <SummaryRow label="Pacote" value={pkg?.label ?? '—'} />
              {foodLabel(food) && <SummaryRow label="Refeição" value={foodLabel(food)!} />}
              {drinkLabel(drink) && <SummaryRow label="Bebida" value={drinkLabel(drink)!} />}
              <SummaryRow label="Fondue" value="Incluído" />
              <SummaryRow label="Modalidade" value={type === 'period' ? 'Período' : 'Pernoite'} />
              <SummaryRow label="Check-in" value={checkIn ? fmtDt(checkIn) : '—'} />
              <SummaryRow label="Check-out" value={checkout ? fmtDt(checkout) : '—'} highlight />

              {/* Aviso de período — 2 horas */}
              {type === 'period' && checkout && (
                <div
                  className="rounded-lg px-3.5 py-3 flex items-start gap-2.5"
                  style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.18)' }}
                >
                  <svg className="w-3.5 h-3.5 shrink-0 mt-[1px]" viewBox="0 0 14 14" fill="none" style={{ color: 'rgba(201,168,76,0.55)' }}>
                    <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1" />
                    <path d="M7 4.5v3l1.8 1.2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div>
                    <p className="text-[9px] tracking-widest uppercase mb-0.5" style={{ color: 'rgba(201,168,76,0.45)' }}>
                      Modalidade período · 2 horas
                    </p>
                    <p className="text-xs leading-snug" style={{ color: 'rgba(220,190,110,0.8)' }}>
                      Saída prevista às <span className="font-semibold">{fmtTime(checkout)}</span>. Respeitamos esse horário para garantir a limpeza e preparação da suíte para o próximo hóspede.
                    </p>
                  </div>
                </div>
              )}

              <div className="border-t border-gold-900/40 pt-3">
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-[10px] tracking-widest uppercase text-gold-600/60">Total</span>
                  <span className="font-serif text-2xl font-semibold gold-gradient">{fmt(total)}</span>
                </div>
                <p className="text-right text-[11px]" style={{ color: 'rgba(201,168,76,0.45)' }}>
                  ou em até 3x de {installment(total, 3)} no cartão
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Payment */}
        <div>
          <p className="text-[10px] tracking-widest uppercase text-gold-600/60 mb-3">
            Forma de pagamento
          </p>

          {error && (
            <p className="mb-4 text-red-400 text-sm text-center bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3">
              {error}
            </p>
          )}

          {/* PIX QR shown after generation */}
          {pixCharge ? (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="p-4 bg-white rounded-2xl shadow-lg">
                  {pixCharge.qrCodeImage ? (
                    <img src={pixCharge.qrCodeImage} alt="QR Code PIX" className="w-52 h-52" />
                  ) : (
                    <QRCodeSVG value={pixCharge.brCode} size={208} level="M" />
                  )}
                </div>
              </div>

              <button
                onClick={copyPix}
                className="w-full py-3 rounded-xl text-sm font-medium border border-gold-700/40 text-gold-400 hover:bg-gold-900/20 transition-colors flex items-center justify-center gap-2"
              >
                {copied ? (
                  <><span className="text-green-400">✓</span> Copiado!</>
                ) : (
                  'Copiar código Pix'
                )}
              </button>

              <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gold-800/30 bg-gold-900/10">
                <span className="w-2 h-2 rounded-full bg-gold-400 animate-pulse shrink-0" />
                <p className="text-xs text-gold-500/70 leading-relaxed">
                  Aguardando confirmação… A tela muda automaticamente quando o pagamento for aprovado.
                </p>
              </div>

              <p className="text-[11px] text-gold-800/40 text-center">
                Escaneie no app do banco ou cole o código Pix Copia e Cola.
              </p>
            </div>
          ) : (
            /* Payment buttons — each is a direct action */
            <div className="space-y-4">
              {/* Reviews — social proof acima dos botões de pagamento */}
              <Reviews />

              {/* PIX button */}
              <button
                onClick={generatePixCharge}
                disabled={pixLoading || cardLoading}
                className="w-full py-4 rounded-xl font-semibold text-sm tracking-wide text-black transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                style={{ background: 'linear-gradient(135deg, #c8a035 0%, #e8c060 50%, #c8a035 100%)' }}
              >
                {pixLoading ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                    Gerando QR Code…
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Pagar {fmt(total)} com PIX
                  </>
                )}
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gold-900/40" />
                <span className="text-[10px] text-gold-800/50 tracking-widest uppercase">ou</span>
                <div className="flex-1 h-px bg-gold-900/40" />
              </div>

              {/* Card button */}
              <button
                onClick={handleCardPayment}
                disabled={cardLoading || pixLoading}
                className="w-full py-4 rounded-xl font-semibold text-sm tracking-wide transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3 border"
                style={{
                  background: 'rgba(201,168,76,0.08)',
                  borderColor: 'rgba(201,168,76,0.35)',
                  color: '#e8c060',
                }}
              >
                {cardLoading ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(201,168,76,0.3)', borderTopColor: '#e8c060' }} />
                    Redirecionando…
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                      <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M2 10h20" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                    <span className="flex flex-col items-start leading-tight">
                      <span>Pagar com Cartão</span>
                      <span className="text-[11px] font-normal opacity-70">em até 3x de {installment(total, 3)}</span>
                    </span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-center gap-1.5 text-[10px] text-gold-800/40">
                <svg viewBox="0 0 12 12" className="w-3 h-3 shrink-0" fill="none">
                  <rect x="1" y="3" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1" />
                  <path d="M4 3V2.5a2 2 0 014 0V3" stroke="currentColor" strokeWidth="1" />
                </svg>
                Ambiente seguro SSL
              </div>

              {/* Aviso pós-pagamento */}
              <div
                className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl"
                style={{ background: 'rgba(37,211,102,0.05)', border: '1px solid rgba(37,211,102,0.15)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(37,211,102,0.6)" className="shrink-0 mt-[1px]">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(200,220,200,0.55)' }}>
                  Após o pagamento, nossa equipe entrará em contato pelo WhatsApp para confirmar sua reserva. Qualquer dúvida, é só falar por lá.
                </p>
              </div>
            </div>
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

