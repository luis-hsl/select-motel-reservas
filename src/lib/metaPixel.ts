// Helper pra disparar eventos do Meta Pixel client-side.
// O fbq() é inicializado no <head> do index.html (já carrega o script).
//
// Eventos padrão do Meta:
//   - PageView           (já dispara automático no init)
//   - ViewContent        (visualizou um item — pacote/suíte)
//   - AddToCart          (selecionou pra comprar)
//   - Lead               (preencheu formulário)
//   - InitiateCheckout   (chegou na tela de pagamento)
//   - Purchase           (pagou)
//
// Cada chamada também gera um event_id que devolvemos. Esse event_id deve
// ser passado pra Conversions API server-side com o mesmo valor — o Meta
// usa pra fazer DEDUPLICAÇÃO (não conta a mesma conversão 2x).

type Fbq = (...args: unknown[]) => void

function fbq(): Fbq | null {
  const w = window as unknown as { fbq?: Fbq }
  return typeof w.fbq === 'function' ? w.fbq : null
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Dispara um evento padrão do Meta Pixel e retorna o event_id (pra dedup com CAPI).
 */
export function trackMeta(
  eventName: string,
  params: Record<string, unknown> = {},
): string | null {
  const f = fbq()
  if (!f) return null
  const event_id = uuid()
  try {
    f('track', eventName, params, { eventID: event_id })
  } catch {
    return null
  }
  return event_id
}

// Helpers semânticos pros eventos mais usados — assim StepX.tsx fica limpo
export const metaEvents = {
  viewContent(opts: { id: string; name: string; category?: string; value?: number }) {
    return trackMeta('ViewContent', {
      content_type: 'product',
      content_ids:  [opts.id],
      content_name: opts.name,
      content_category: opts.category,
      value:    opts.value,
      currency: 'BRL',
    })
  },
  addToCart(opts: { id: string; name: string; value?: number }) {
    return trackMeta('AddToCart', {
      content_type: 'product',
      content_ids:  [opts.id],
      content_name: opts.name,
      value:    opts.value,
      currency: 'BRL',
    })
  },
  lead() {
    return trackMeta('Lead')
  },
  initiateCheckout(opts: { value: number; numItems?: number }) {
    return trackMeta('InitiateCheckout', {
      value:    opts.value,
      currency: 'BRL',
      num_items: opts.numItems ?? 1,
    })
  },
  purchase(opts: { value: number; orderId: string; contentIds?: string[] }) {
    return trackMeta('Purchase', {
      value:        opts.value,
      currency:     'BRL',
      content_type: 'product',
      content_ids:  opts.contentIds ?? [],
      order_id:     opts.orderId,
    })
  },
}
