// Tracking anônimo do onboarding. Sem PII até o usuário preencher StepDados.
// session_token persiste em localStorage por 30 dias (renovado a cada uso).

const STORAGE_KEY    = 'select-tracking-session'
const DISABLED_KEY   = 'select-tracking-disabled'   // 'true' = não trackeia este browser
const TTL_DAYS       = 30
const ENDPOINT       = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-onboarding`

// ?notrack=1 → desliga (persistente). ?notrack=0 → religa.
if (typeof window !== 'undefined') {
  const p = new URLSearchParams(window.location.search)
  const flag = p.get('notrack')
  if (flag === '1') {
    try { localStorage.setItem(DISABLED_KEY, 'true') } catch { /* noop */ }
    console.info('[tracking] desativado neste browser. Use ?notrack=0 pra religar.')
  } else if (flag === '0') {
    try { localStorage.removeItem(DISABLED_KEY) } catch { /* noop */ }
    console.info('[tracking] reativado neste browser.')
  }
}

function trackingDisabled(): boolean {
  if (typeof localStorage === 'undefined') return false
  try { return localStorage.getItem(DISABLED_KEY) === 'true' } catch { return false }
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  // fallback simples
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function readUtm(): Record<string, string | undefined> {
  if (typeof window === 'undefined') return {}
  const p = new URLSearchParams(window.location.search)
  return {
    source:   p.get('utm_source')   ?? undefined,
    medium:   p.get('utm_medium')   ?? undefined,
    campaign: p.get('utm_campaign') ?? undefined,
    content:  p.get('utm_content')  ?? undefined,
    term:     p.get('utm_term')     ?? undefined,
  }
}

export function getSessionToken(): string {
  if (typeof localStorage === 'undefined') return uuid()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { token: string; exp: number }
      if (parsed.token && parsed.exp > Date.now()) {
        // Estende TTL
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          token: parsed.token,
          exp: Date.now() + TTL_DAYS * 24 * 3600 * 1000,
        }))
        return parsed.token
      }
    }
  } catch { /* corrupted, regenera */ }
  const token = uuid()
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      token,
      exp: Date.now() + TTL_DAYS * 24 * 3600 * 1000,
    }))
  } catch { /* storage cheio / private */ }
  return token
}

// Evita disparar duas vezes seguidas pro mesmo step+mode (StrictMode/hot reload).
// O mode entra na chave: trackStep(2, null) seguido de trackStep(2, 'package')
// são eventos distintos — sem isso, o segundo era bloqueado e o mode nunca
// chegava ao banco (sessão ficava com mode=null e sumia do funil de Pacote).
let lastTrack: { step: number; mode: string | null; at: number } | null = null

/**
 * Reporta a step atual da sessão de onboarding pro backend.
 * Idempotente: chamadas rápidas pra mesma step são ignoradas.
 * `mode` é opcional — backend só persiste se vier preenchido (não sobrescreve com null).
 */
export async function trackStep(
  step: number,
  mode?: 'package' | 'experience' | null,
): Promise<void> {
  if (trackingDisabled()) return
  const m = mode ?? null
  if (
    lastTrack &&
    lastTrack.step === step &&
    lastTrack.mode === m &&
    Date.now() - lastTrack.at < 5000
  ) return
  lastTrack = { step, mode: m, at: Date.now() }

  const session_token = getSessionToken()
  const ua            = navigator.userAgent

  try {
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey':       import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        session_token,
        step,
        mode:         mode ?? null,
        user_agent:   ua,
        referrer:     document.referrer || null,
        landing_path: window.location.pathname + window.location.search,
        utm:          readUtm(),
      }),
      keepalive: true,  // se o user fechar a aba, ainda envia
    })
  } catch {
    // tracking nunca quebra UX
  }
}
