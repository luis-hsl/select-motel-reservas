import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

type Status = {
  connected?: boolean
  loggedIn?: boolean
  jid?: string
}

type PairMode = 'qr' | 'code'

const PAIR_TTL_MS    = 2 * 60 * 1000   // sessao de pareamento expira em 2 min na UI
const QR_REFRESH_MS  = 25 * 1000        // QR real do WhatsApp expira em ~30s — renovamos antes


async function adminInvoke<T = unknown>(
  action: string,
  init: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<{ ok: boolean; status: number; data: T | { error?: string } }> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token ?? ''
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wuzapi-admin?action=${action}`
  const res = await fetch(url, {
    method: init.method ?? 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

export default function WhatsAppTab() {
  const [status, setStatus] = useState<Status | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [pairMode, setPairMode] = useState<PairMode>('qr')

  // QR
  const [qr, setQr] = useState<string>('')
  const [qrLoading, setQrLoading] = useState(false)
  const [qrExpiresAt, setQrExpiresAt] = useState<number | null>(null)

  // Pareamento por codigo
  const [pairPhone, setPairPhone] = useState('')
  const [pairCode, setPairCode] = useState('')
  const [pairLoading, setPairLoading] = useState(false)
  const [codeExpiresAt, setCodeExpiresAt] = useState<number | null>(null)

  // tick a cada segundo para atualizar contadores
  const [, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Setting: telefone do motel
  const [notifPhone, setNotifPhone] = useState('')
  const [notifSaving, setNotifSaving] = useState(false)
  const [notifSaved, setNotifSaved] = useState(false)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true)
    const r = await adminInvoke<Status>('status')
    if (r.ok) setStatus(r.data as Status)
    setStatusLoading(false)
  }, [])

  const loadNotif = useCallback(async () => {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'motel_notification_phone')
      .maybeSingle()
    setNotifPhone(data?.value ?? '')
  }, [])

  useEffect(() => {
    refreshStatus()
    loadNotif()
    const t = setInterval(refreshStatus, 5000)
    return () => clearInterval(t)
  }, [refreshStatus, loadNotif])

  async function handleConnect() {
    setBusy(true); setError(null)
    const r = await adminInvoke('connect', { method: 'POST' })
    if (!r.ok) setError(`Falha ao conectar (${r.status})`)
    setBusy(false)
    setTimeout(refreshStatus, 1000)
  }

  // Inicia sessao de QR de 2min: gera o primeiro e agenda renovacoes
  async function handleGetQr() {
    setQrLoading(true); setError(null)
    if (!status?.connected) await handleConnect()
    await new Promise(res => setTimeout(res, 1500))
    const r = await adminInvoke<{ qr: string }>('qr')
    if (r.ok && (r.data as { qr: string }).qr) {
      setQr((r.data as { qr: string }).qr)
      setQrExpiresAt(Date.now() + PAIR_TTL_MS)
    } else {
      setError('Não consegui obter QR')
    }
    setQrLoading(false)
  }

  // Auto-renova o QR a cada ~25s ate expirar
  useEffect(() => {
    if (!qrExpiresAt) return
    const t = setInterval(async () => {
      if (Date.now() >= qrExpiresAt) { setQr(''); setQrExpiresAt(null); return }
      const r = await adminInvoke<{ qr: string }>('qr')
      if (r.ok && (r.data as { qr: string }).qr) setQr((r.data as { qr: string }).qr)
    }, QR_REFRESH_MS)
    return () => clearInterval(t)
  }, [qrExpiresAt])

  // Limpa QR/codigo quando o user logar com sucesso
  useEffect(() => {
    if (status?.loggedIn) {
      setQr(''); setQrExpiresAt(null)
      setPairCode(''); setCodeExpiresAt(null)
    }
  }, [status?.loggedIn])

  async function handlePairByCode() {
    if (!pairPhone.trim()) { setError('Informe o telefone do celular que vai parear'); return }
    setPairLoading(true); setError(null); setPairCode(''); setCodeExpiresAt(null)
    if (!status?.connected) await handleConnect()
    await new Promise(res => setTimeout(res, 1000))
    const r = await adminInvoke<{ code: string }>('pair', {
      method: 'POST',
      body: { phone: pairPhone.replace(/\D/g, '') },
    })
    if (r.ok && (r.data as { code: string }).code) {
      setPairCode((r.data as { code: string }).code)
      setCodeExpiresAt(Date.now() + PAIR_TTL_MS)
    } else {
      setError('Falha ao gerar código de pareamento')
    }
    setPairLoading(false)
  }

  // Limpa code quando expira
  useEffect(() => {
    if (codeExpiresAt && Date.now() >= codeExpiresAt) {
      setPairCode(''); setCodeExpiresAt(null)
    }
  }, [codeExpiresAt])

  async function handleDisconnect() {
    if (!confirm('Desconectar o WhatsApp? Você precisará escanear/parear de novo.')) return
    setBusy(true)
    await adminInvoke('disconnect', { method: 'POST' })
    setQr(''); setQrExpiresAt(null); setPairCode(''); setCodeExpiresAt(null)
    setBusy(false)
    setTimeout(refreshStatus, 1000)
  }

  async function handleLogout() {
    if (!confirm('Fazer LOGOUT? Isso encerra a sessão por completo no aparelho.')) return
    setBusy(true)
    await adminInvoke('logout', { method: 'POST' })
    setQr(''); setQrExpiresAt(null); setPairCode(''); setCodeExpiresAt(null)
    setBusy(false)
    setTimeout(refreshStatus, 1000)
  }

  async function saveNotifPhone() {
    setNotifSaving(true)
    const digits = notifPhone.replace(/\D/g, '')
    await supabase
      .from('settings')
      .update({ value: digits, updated_at: new Date().toISOString() })
      .eq('key', 'motel_notification_phone')
    setNotifPhone(digits)
    setNotifSaving(false); setNotifSaved(true)
    setTimeout(() => setNotifSaved(false), 2500)
  }

  const isLoggedIn = !!status?.loggedIn
  const isConnected = !!status?.connected

  function fmtRemaining(expiresAt: number | null): string {
    if (!expiresAt) return ''
    const s = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }
  const qrRemaining   = fmtRemaining(qrExpiresAt)
  const codeRemaining = fmtRemaining(codeExpiresAt)
  const statusLabel = isLoggedIn ? 'Conectado' : isConnected ? 'Aguardando pareamento' : 'Desconectado'
  const statusColor = isLoggedIn ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                                  : isConnected ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                                                : 'text-red-400 border-red-500/30 bg-red-500/10'

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-white/80 text-sm">WhatsApp</h2>

      {/* ===== STATUS ===== */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-white/40 text-[11px] tracking-widest uppercase mb-1">Status da sessão</p>
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border ${statusColor}`}>
                <span className="w-2 h-2 rounded-full" style={{ background: 'currentColor' }} />
                {statusLoading ? '...' : statusLabel}
              </span>
              {status?.jid && (
                <span className="text-white/30 text-xs truncate max-w-[200px]">{status.jid}</span>
              )}
            </div>
          </div>
          <button
            onClick={refreshStatus}
            className="text-xs text-white/50 hover:text-white/80 px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/30"
          >
            Atualizar
          </button>
        </div>

        {isLoggedIn && (
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleDisconnect}
              disabled={busy}
              className="text-xs text-amber-400/80 hover:text-amber-400 px-3 py-1.5 rounded-lg border border-amber-500/20 hover:border-amber-500/40 disabled:opacity-40"
            >
              Desconectar (offline)
            </button>
            <button
              onClick={handleLogout}
              disabled={busy}
              className="text-xs text-red-400/80 hover:text-red-400 px-3 py-1.5 rounded-lg border border-red-500/20 hover:border-red-500/40 disabled:opacity-40"
            >
              Logout (precisa parear de novo)
            </button>
          </div>
        )}
      </section>

      {/* ===== PAREAMENTO (so se nao logado) ===== */}
      {!isLoggedIn && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <p className="text-white/40 text-[11px] tracking-widest uppercase mb-3">Conectar dispositivo</p>

          <div className="flex gap-2 mb-5">
            <button
              onClick={() => setPairMode('qr')}
              className={`flex-1 text-sm py-2 rounded-lg border transition-colors ${
                pairMode === 'qr'
                  ? 'border-gold-500/50 text-gold-400 bg-gold-500/5'
                  : 'border-white/10 text-white/40 hover:text-white/70'
              }`}
            >
              QR Code
            </button>
            <button
              onClick={() => setPairMode('code')}
              className={`flex-1 text-sm py-2 rounded-lg border transition-colors ${
                pairMode === 'code'
                  ? 'border-gold-500/50 text-gold-400 bg-gold-500/5'
                  : 'border-white/10 text-white/40 hover:text-white/70'
              }`}
            >
              Código (8 dígitos)
            </button>
          </div>

          {pairMode === 'qr' && (
            <div>
              {qr ? (
                <div className="flex flex-col items-center gap-3">
                  <img src={qr} alt="QR" className="w-64 h-64 rounded-lg bg-white p-3" />
                  <div className="flex items-center gap-2">
                    <span className="text-white/40 text-xs">Expira em</span>
                    <span className="font-mono text-sm text-gold-400 tabular-nums">{qrRemaining}</span>
                  </div>
                  <p className="text-white/40 text-xs text-center max-w-xs">
                    WhatsApp → ⋮ → <strong className="text-white/60">Dispositivos conectados</strong> → <strong className="text-white/60">Conectar dispositivo</strong> → aponta a câmera.<br />
                    O QR se renova automaticamente. Depois de 2 min você precisa gerar de novo.
                  </p>
                  <button
                    onClick={handleGetQr}
                    disabled={qrLoading}
                    className="text-xs text-white/50 hover:text-white/80 underline disabled:opacity-40"
                  >
                    Reiniciar sessão de QR
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGetQr}
                  disabled={qrLoading || busy}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-black transition-all active:scale-[0.98] disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #c8a035 0%, #e8c060 50%, #c8a035 100%)' }}
                >
                  {qrLoading ? 'Gerando QR...' : 'Gerar QR Code'}
                </button>
              )}
            </div>
          )}

          {pairMode === 'code' && (
            <div className="space-y-3">
              <label className="text-white/40 text-[11px] tracking-widest uppercase block mb-1.5">
                Telefone do celular (com DDI+DDD)
              </label>
              <input
                type="tel"
                inputMode="numeric"
                placeholder="5543999887766"
                value={pairPhone}
                onChange={e => setPairPhone(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold-500/40"
              />
              <button
                onClick={handlePairByCode}
                disabled={pairLoading || busy || !pairPhone.trim()}
                className="w-full py-3 rounded-xl text-sm font-semibold text-black transition-all active:scale-[0.98] disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #c8a035 0%, #e8c060 50%, #c8a035 100%)' }}
              >
                {pairLoading ? 'Gerando código...' : 'Gerar código de pareamento'}
              </button>

              {pairCode && (
                <div className="mt-4 p-5 rounded-xl border border-gold-500/30 bg-gold-500/5 text-center">
                  <p className="text-white/40 text-[11px] tracking-widest uppercase mb-2">Código de pareamento</p>
                  <p className="font-mono text-3xl text-gold-400 tracking-[0.3em]">{pairCode}</p>
                  <div className="mt-2 flex items-center justify-center gap-2">
                    <span className="text-white/40 text-xs">Expira em</span>
                    <span className="font-mono text-sm text-gold-400 tabular-nums">{codeRemaining}</span>
                  </div>
                  <p className="text-white/40 text-xs mt-3 leading-relaxed">
                    No WhatsApp → ⋮ → <strong className="text-white/60">Dispositivos conectados</strong> → <strong className="text-white/60">Conectar dispositivo</strong> → toque em <strong className="text-white/60">Conectar com número de telefone</strong> e digite esse código.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ===== TELEFONE DE NOTIFICACAO DO MOTEL ===== */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <p className="text-white/40 text-[11px] tracking-widest uppercase mb-3">
          Telefone que recebe avisos de novas reservas
        </p>
        <p className="text-white/30 text-xs mb-3">
          Toda vez que uma reserva for confirmada (pagamento aprovado), uma mensagem é enviada pra este número com os dados da reserva. Deixe vazio pra desligar.
        </p>
        <div className="flex gap-2">
          <input
            type="tel"
            inputMode="numeric"
            placeholder="5543999887766 (DDI + DDD + número)"
            value={notifPhone}
            onChange={e => setNotifPhone(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold-500/40"
          />
          <button
            onClick={saveNotifPhone}
            disabled={notifSaving}
            className="px-5 rounded-xl text-sm font-semibold text-black active:scale-[0.98] disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #c8a035 0%, #e8c060 50%, #c8a035 100%)' }}
          >
            {notifSaving ? '...' : notifSaved ? '✓' : 'Salvar'}
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}
    </div>
  )
}
