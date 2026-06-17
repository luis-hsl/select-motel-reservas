import { useState, useEffect, type ReactNode } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import { getSessionToken } from '../lib/tracking'
import Reviews from '../components/Reviews'
import { metaEvents } from '../lib/metaPixel'
import { SUITE_CATEGORIES } from '../data/suiteCategories'

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

const PRATO_LABELS: Record<string, string> = {
  risoto:     'Risoto de bacon com Brie',
  rigatone:   'Rigatone de cogumelos',
  mousseline: 'Mousseline com filé mignon',
}
function pratoLabel(id: string | null): string | null {
  return id ? (PRATO_LABELS[id] ?? id) : null
}

function foodTimeLabel(f: string | null): string | null {
  if (f === 'jantar') return 'Horário do jantar'
  if (f === 'sushi')  return 'Horário da barca'
  if (f === 'pizza')  return 'Horário da pizza'
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
    totalAmount, prevStep, drink, food, jantarPrato, jantarHorario,
    fondueHorario, suiteCategory,
    observations, setObservations, consentAt, selectedItems,
  } = useStore()

  // Label da categoria da suíte (Suíte Tradicional, Hidro Light, VIP Piscina…)
  const catDef = suite
    ? SUITE_CATEGORIES.find(c => c.dbCategory === suite.category)
    : suiteCategory
    ? SUITE_CATEGORIES.find(c => c.dbCategory === suiteCategory)
    : null
  const catLabel = catDef?.label ?? suite?.category ?? ''
  const suiteDisplay = suite
    ? `${catLabel} · nº ${suite.room_number}`
    : catLabel || '—'
  // Snapshot do que o cliente escolheu — vai na coluna extras (jsonb) da reserva
  // e é usado pra montar a mensagem que o motel recebe quando o pagamento confirma.
  const fondueInCart = selectedItems.some(i => i.id === 'food-fondue')
  const extras = {
    mode:         mode ?? 'package',
    packageId:    pkg?.id    ?? null,
    packageLabel: pkg?.label ?? null,
    includes:     pkg?.includes ?? [],
    drink,
    food,
    jantarPrato,
    jantarHorario,
    fondue:        fondueInCart || null,
    fondueHorario: fondueInCart ? fondueHorario : null,
    type,
    selectedItems,                            // a la carte (modo experiência)
    observations: observations?.trim() || null,
    lgpdConsentAt: consentAt,
    trackingSessionToken: getSessionToken(),
  }
  const total = totalAmount()
  const checkout = checkOut()

  const [obs, setObs] = useState(observations || '')

  const [showLocation, setShowLocation] = useState(false)
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

  // Scroll para o topo ao entrar na tela de pagamento
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }) }, [])

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

          {/* Aviso de chegada */}
          <ArrivalNotice name={customerName} roomNumber={suite?.room_number} />

          <div className="px-6 py-5 space-y-3">
            <SummaryRow label="Código" value={reservationId.slice(0, 8).toUpperCase()} mono />
            <SummaryRow label="Suíte" value={suiteDisplay} />
            {foodLabel(food) && <SummaryRow label="Refeição" value={foodLabel(food)!} />}
            {pratoLabel(jantarPrato) && <SummaryRow label="Prato" value={pratoLabel(jantarPrato)!} />}
            {jantarHorario && foodTimeLabel(food) && <SummaryRow label={foodTimeLabel(food)!} value={jantarHorario} />}
            {drinkLabel(drink) && <SummaryRow label="Bebida" value={drinkLabel(drink)!} />}
            {fondueInCart && <SummaryRow label="Fondue" value={fondueHorario ? `às ${fondueHorario}` : 'Selecionado'} />}
            {mode !== 'package' && selectedItems.length > 0 && selectedItems.map(item => (
              <SummaryRow key={item.id} label={item.label} value={Number(item.price) > 0 ? fmt(Number(item.price)) : 'Incluído'} />
            ))}
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
        Sua noite está<br />
        <span className="gold-gradient font-semibold italic">quase garantida</span>
      </h1>
      <p className="text-gold-700/70 text-sm mb-7">
        Revise o pedido abaixo e escolha como pagar — é rápido e seguro.
      </p>

      <div className="lg:grid lg:grid-cols-2 lg:gap-10 xl:gap-14 lg:items-start">
        {/* Left: Summary */}
        <div>
          {/* Mobile: resumo compacto */}
          <div className="lg:hidden border border-gold-800/40 rounded-xl overflow-hidden mb-4">
            {/* Aviso de chegada mobile */}
            <ArrivalNotice name={customerName} roomNumber={suite?.room_number} />

            <div className="p-3">
            <p className="text-[9px] tracking-widests uppercase text-gold-500/60 mb-2">Itens do pedido</p>
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-gold-400/80 mb-2">
              {suite && <span>{suiteDisplay}</span>}
              {type && <span>· {type === 'period' ? 'Período' : type === 'overnight' ? 'Pernoite' : type === 'oneHour' ? '1 hora' : 'Diária'}</span>}
              {pkg && <span>· {pkg.label}</span>}
              {foodLabel(food) && <span>· {foodLabel(food)}</span>}
              {pratoLabel(jantarPrato) && <span>· {pratoLabel(jantarPrato)}</span>}
              {jantarHorario && foodTimeLabel(food) && <span>· {foodTimeLabel(food)} {jantarHorario}</span>}
              {drinkLabel(drink) && <span>· {drinkLabel(drink)}</span>}
              {fondueInCart && <span>· Fondue{fondueHorario ? ` às ${fondueHorario}` : ''}</span>}
              {mode !== 'package' && selectedItems.map(item => (
                <span key={item.id}>· {item.label}</span>
              ))}
            </div>
            {checkIn && <p className="text-[11px] text-gold-600/60">Check-in: {fmtDt(checkIn)}</p>}
            {checkout && <p className="text-[11px] text-gold-600/60">Check-out: {fmtDt(checkout)}</p>}
            {type === 'period' && (
              <span className="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-full text-[10px]"
                    style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', color: 'rgba(201,168,76,0.6)' }}>
                <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <circle cx="6" cy="6" r="5" /><path d="M6 3.5v2.8l1.6 1" strokeLinecap="round" />
                </svg>
                2 horas de permanência
              </span>
            )}
            <div className="border-t border-gold-900/40 mt-2.5 pt-2.5">
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-[9px] tracking-widest uppercase text-gold-600/60">Total</span>
                <span className="font-serif text-2xl font-semibold gold-gradient">{fmt(total)}</span>
              </div>
              <div className="flex justify-end">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium"
                      style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.3)', color: 'rgba(230,195,100,0.9)' }}>
                  ou 3× de {installment(total, 3)} no cartão
                </span>
              </div>
            </div>
            </div>{/* close p-3 */}
          </div>

          {/* Desktop: resumo completo */}
          <div className="hidden lg:block border border-gold-800/40 rounded-xl overflow-hidden mb-6 lg:mb-0">
            <div className="bg-gold-900/20 px-5 py-3 border-b border-gold-800/30">
              <p className="text-[10px] tracking-widest uppercase text-gold-500/60">Resumo da reserva</p>
            </div>

            {/* Aviso de chegada */}
            <ArrivalNotice name={customerName} roomNumber={suite?.room_number} />

            <div className="px-5 py-4 space-y-2.5">
              <SummaryRow label="Cliente" value={customerName} />
              <SummaryRow label="Suíte" value={suiteDisplay} />
              {pkg && <SummaryRow label="Pacote" value={pkg.label} />}
              {foodLabel(food) && <SummaryRow label="Refeição" value={foodLabel(food)!} />}
              {pratoLabel(jantarPrato) && <SummaryRow label="Prato" value={pratoLabel(jantarPrato)!} />}
              {jantarHorario && foodTimeLabel(food) && <SummaryRow label={foodTimeLabel(food)!} value={jantarHorario} />}
              {drinkLabel(drink) && <SummaryRow label="Bebida" value={drinkLabel(drink)!} />}
              {fondueInCart && <SummaryRow label="Fondue" value={fondueHorario ? `às ${fondueHorario}` : 'Selecionado'} />}
              {mode !== 'package' && selectedItems.length > 0 && selectedItems.map(item => (
                <SummaryRow key={item.id} label={item.label} value={Number(item.price) > 0 ? fmt(Number(item.price)) : 'Incluído'} />
              ))}
              <SummaryRow label="Modalidade" value={type === 'period' ? 'Período' : type === 'overnight' ? 'Pernoite' : type === 'oneHour' ? '1 hora' : 'Diária'} />
              <SummaryRow label="Check-in" value={checkIn ? fmtDt(checkIn) : '—'} />
              <SummaryRow label="Check-out" value={checkout ? fmtDt(checkout) : '—'} highlight />
              {type === 'period' && (
                <div className="flex justify-end -mt-1">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px]"
                        style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', color: 'rgba(201,168,76,0.6)' }}>
                    <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
                      <circle cx="6" cy="6" r="5" /><path d="M6 3.5v2.8l1.6 1" strokeLinecap="round" />
                    </svg>
                    2 horas de permanência
                  </span>
                </div>
              )}

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

              <div className="border-t border-gold-900/40 pt-4">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-[10px] tracking-widest uppercase text-gold-600/60">Total</span>
                  <span className="font-serif text-3xl font-semibold gold-gradient">{fmt(total)}</span>
                </div>
                <div className="flex justify-end">
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-medium"
                        style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.3)', color: 'rgba(230,195,100,0.9)' }}>
                    ou 3× de {installment(total, 3)} no cartão
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Como Chegar + Suporte WhatsApp */}
        <div className="mt-4 space-y-3">
          {/* Como Chegar */}
          <div className="flex flex-col items-start">
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

            <div
              style={{
                maxHeight: showLocation ? '220px' : '0px',
                opacity: showLocation ? 1 : 0,
                overflow: 'hidden',
                transition: 'max-height 0.4s cubic-bezier(0.22,1,0.36,1), opacity 0.3s ease',
              }}
            >
              <div
                className="mt-3 px-5 py-4 rounded-2xl"
                style={{ background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.14)' }}
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

          {/* Suporte WhatsApp */}
          <a
            href={`https://wa.me/${whatsappNum}?text=${encodeURIComponent('Tenho dúvida com a minha reserva ou pagamento no site')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl transition-all duration-200 hover:opacity-90 active:scale-[0.97]"
            style={{
              background: 'rgba(37,211,102,0.05)',
              border: '1px solid rgba(37,211,102,0.16)',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="rgba(37,211,102,0.7)" className="shrink-0">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            <span style={{ fontSize: '0.72rem', color: 'rgba(180,240,195,0.70)', letterSpacing: '0.01em' }}>
              Dúvida na reserva ou no pagamento?{' '}
              <span style={{ color: 'rgba(37,211,102,0.80)', fontWeight: 600 }}>Chame a gente</span>
            </span>
          </a>
        </div>

        {/* Right: Payment */}
        <div>
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
              {/* Observações */}
              <div>
                <label className="block text-[10px] tracking-widest uppercase text-gold-600/60 mb-2">
                  Observações <span className="normal-case tracking-normal text-gold-800/40">(opcional)</span>
                </label>
                <textarea
                  value={obs}
                  onChange={e => { const v = e.target.value.slice(0, 500); setObs(v); setObservations(v) }}
                  placeholder="Ex: ligar a hidromassagem, servir os pratos às 21h…"
                  rows={2}
                  className="w-full bg-black/60 border border-gold-900/40 rounded-lg px-4 py-3 text-sm text-gold-200 placeholder-gold-900/50 outline-none focus:border-gold-600/60 transition-colors resize-none"
                />
              </div>

              <p className="text-[10px] tracking-widest uppercase text-gold-600/60">
                Forma de pagamento
              </p>

              {error && (
                <p className="text-red-400 text-sm text-center bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3">
                  {error}
                </p>
              )}

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

              {/* Social proof — abaixo dos botões de pagamento */}
              <Reviews />

              {/* Trust block — WhatsApp notice + garantias + formas de pagamento */}
              <div className="space-y-3">
                {/* WhatsApp notice */}
                <div
                  className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl"
                  style={{ background: 'rgba(37,211,102,0.05)', border: '1px solid rgba(37,211,102,0.15)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(37,211,102,0.6)" className="shrink-0 mt-[1px]">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(200,220,200,0.55)' }}>
                    Confirmação imediata por WhatsApp após o pagamento. Qualquer dúvida, é só chamar.
                  </p>
                </div>

                {/* Trust grid */}
                <div className="grid grid-cols-2 gap-2">
                  {([
                    {
                      icon: (
                        <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 mt-0.5 shrink-0" stroke="currentColor" strokeWidth="1.3" style={{ color: 'rgba(245,224,180,0.4)' }}>
                          <rect x="3" y="7" width="10" height="8" rx="1.5" />
                          <path d="M5 7V5a3 3 0 016 0v2" strokeLinecap="round" />
                        </svg>
                      ),
                      title: 'Pagamento seguro', desc: 'SSL 256-bit',
                    },
                    {
                      icon: (
                        <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 mt-0.5 shrink-0" stroke="currentColor" strokeWidth="1.3" style={{ color: 'rgba(245,224,180,0.4)' }}>
                          <path d="M13 7H7a4 4 0 000 8h5" strokeLinecap="round" />
                          <path d="M10 4l-3 3 3 3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ),
                      title: 'Cancelamento grátis', desc: 'Até 48h antes',
                    },
                    {
                      icon: (
                        <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 mt-0.5 shrink-0" stroke="currentColor" strokeWidth="1.3" style={{ color: 'rgba(245,224,180,0.4)' }}>
                          <path d="M3 3.5C3 2.7 3.7 2 4.5 2H5a1 1 0 011 1 4 4 0 00.5 2 1 1 0 01-.25 1.1l-.5.5a6 6 0 002.65 2.65l.5-.5A1 1 0 0110 8.5a4 4 0 002 .5 1 1 0 011 1v.5c0 .8-.7 1.5-1.5 1.5A8.5 8.5 0 013 3.5z" strokeLinecap="round" />
                        </svg>
                      ),
                      title: 'Suporte humano', desc: 'Atendemos agora',
                    },
                    {
                      icon: (
                        <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 mt-0.5 shrink-0" stroke="currentColor" strokeWidth="1.3" style={{ color: 'rgba(245,224,180,0.4)' }}>
                          <path d="M8 2l1.5 3.3L13 6l-2.5 2.4.6 3.6L8 10.4l-3.1 1.6.6-3.6L3 6l3.5-.7L8 2z" strokeLinejoin="round" />
                        </svg>
                      ),
                      title: '+400 casais', desc: 'já escolheram',
                    },
                  ] as { icon: ReactNode; title: string; desc: string }[]).map(g => (
                    <div key={g.title} className="flex items-start gap-2 px-3 py-2.5 rounded-xl"
                         style={{ background: 'rgba(201,168,76,0.03)', border: '1px solid rgba(201,168,76,0.08)' }}>
                      {g.icon}
                      <div>
                        <p className="text-[11px] font-medium" style={{ color: 'rgba(245,224,180,0.5)' }}>{g.title}</p>
                        <p className="text-[10px]" style={{ color: 'rgba(245,224,180,0.25)' }}>{g.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Payment methods */}
                <div className="flex items-center justify-center gap-3">
                  <span className="text-[10px] text-white/20 tracking-widest uppercase">Aceito</span>
                  <span className="px-2.5 py-1 rounded text-[10px] font-bold tracking-wide"
                        style={{ background: 'rgba(50,200,120,0.12)', border: '1px solid rgba(50,200,120,0.25)', color: 'rgba(50,200,120,0.7)' }}>
                    PIX
                  </span>
                  <span className="px-2.5 py-1 rounded text-[10px] font-bold tracking-wide"
                        style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', color: 'rgba(201,168,76,0.6)' }}>
                    CARTÃO
                  </span>
                  <span className="text-[10px] text-white/20">até 3×</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────

function ArrivalNotice({ name, roomNumber }: { name: string; roomNumber?: number }) {
  return (
    <div
      className="border-b border-gold-900/30 px-5 py-5"
      style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.07) 0%, rgba(201,168,76,0.03) 100%)' }}
    >
      <p className="text-[9px] tracking-[0.2em] uppercase text-gold-600/50 text-center mb-4">
        Como funciona na chegada
      </p>
      <div className="flex items-center justify-center gap-5">
        <div className="text-center">
          <p className="text-[9px] tracking-widest uppercase text-gold-700/45 mb-1">Nome</p>
          <p
            className="font-semibold leading-tight"
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: '1.15rem',
              color: 'rgba(245,220,150,0.95)',
              letterSpacing: '0.01em',
            }}
          >
            {name || '—'}
          </p>
        </div>
        {roomNumber !== undefined && (
          <>
            <div className="w-px h-10 bg-gold-800/40 shrink-0" />
            <div className="text-center">
              <p className="text-[9px] tracking-widest uppercase text-gold-700/45 mb-1">Suíte</p>
              <p
                className="font-semibold leading-tight"
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: '1.15rem',
                  color: 'rgba(245,220,150,0.95)',
                  letterSpacing: '0.02em',
                }}
              >
                nº {roomNumber}
              </p>
            </div>
          </>
        )}
      </div>
      <p className="text-center text-[10px] text-gold-700/50 mt-4 leading-relaxed">
        Ao chegar, só confirme seu nome e o número da suíte na recepção.
      </p>
    </div>
  )
}

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

