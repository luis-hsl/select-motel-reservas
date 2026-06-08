import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'

type Lead = {
  id: string
  name: string
  phone: string
  email: string
  package_id: string | null
  type: string | null
  suite_id: string | null
  check_in: string | null
  drink: string | null
  food: string | null
  total_amount: number | null
  observations: string | null
  status: 'new' | 'contacted' | 'converted' | 'lost'
  created_at: string
  session_token: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  referrer: string | null
  device: string | null
  whatsapp_consent: boolean
}

const STATUS_STYLE: Record<string, string> = {
  new:       'text-blue-400  bg-blue-400/10  border-blue-400/30',
  contacted: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  converted: 'text-green-400 bg-green-400/10 border-green-400/30',
  lost:      'text-red-400   bg-red-400/10   border-red-400/30',
}
const STATUS_LABEL: Record<string, string> = {
  new: 'Novo', contacted: 'Contatado', converted: 'Convertido', lost: 'Perdido',
}
const DRINK_LABEL: Record<string, string> = {
  vinho: '🍷 Vinho', frisante: '🥂 Frisante',
}
const FOOD_LABEL: Record<string, string> = {
  jantar: '🍽 Jantar', sushi: '🍣 Sushi',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}
function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function waLink(phone: string) {
  const digits = phone.replace(/\D/g, '')
  const num = digits.startsWith('55') ? digits : `55${digits}`
  return `https://wa.me/${num}`
}
function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
function shortReferrer(ref: string) {
  try { return new URL(ref).hostname.replace('www.', '') } catch { return ref }
}

function Chip({ children, gold }: { children: React.ReactNode; gold?: boolean }) {
  return (
    <span className={[
      'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border',
      gold
        ? 'text-gold-400 bg-gold-400/10 border-gold-400/20'
        : 'text-white/50 bg-white/5 border-white/10',
    ].join(' ')}>
      {children}
    </span>
  )
}

function DeviceIcon({ device }: { device: string | null }) {
  if (!device) return null
  if (device === 'mobile') return (
    <svg className="w-3 h-3 text-white/25 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <circle cx="12" cy="18" r="1" fill="currentColor" />
    </svg>
  )
  if (device === 'tablet') return (
    <svg className="w-3.5 h-3.5 text-white/25 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <circle cx="12" cy="18" r="1" fill="currentColor" />
    </svg>
  )
  return (
    <svg className="w-3.5 h-3.5 text-white/25 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="4" width="20" height="14" rx="2" />
      <path d="M8 22h8M12 18v4" strokeLinecap="round" />
    </svg>
  )
}

function SourceBadge({ lead }: { lead: Lead }) {
  const hasCampaign = lead.utm_source || lead.utm_medium || lead.utm_campaign || lead.utm_content
  const hasReferrer = !!lead.referrer

  if (!hasCampaign && !hasReferrer && !lead.device) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <DeviceIcon device={lead.device} />

      {hasCampaign ? (
        <>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300/70">
            {lead.utm_source ?? '?'}
            {lead.utm_medium ? <span className="text-purple-400/40">/{lead.utm_medium}</span> : null}
          </span>
          {lead.utm_campaign && (
            <span className="text-white/30 truncate max-w-[150px]" title={lead.utm_campaign}>
              {lead.utm_campaign}
            </span>
          )}
          {lead.utm_content && (
            <span className="text-white/20 truncate max-w-[100px]" title={lead.utm_content}>
              {lead.utm_content}
            </span>
          )}
        </>
      ) : hasReferrer ? (
        <span className="text-white/25">via {shortReferrer(lead.referrer!)}</span>
      ) : (
        <span className="text-white/20">Direto</span>
      )}
    </div>
  )
}

export default function LeadsTab() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expandedPhones, setExpandedPhones] = useState<Set<string>>(new Set())

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase.rpc('get_leads')
    if (error) {
      setLoadError(error.message)
      setLeads([])
    } else {
      setLeads((data as Lead[]) ?? [])
    }
    setLoading(false)
  }

  async function updateStatus(id: string, status: string) {
    await supabase.rpc('update_lead_status', { lead_id: id, new_status: status })
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status: status as Lead['status'] } : l))
  }

  const filtered = useMemo(() => {
    return leads.filter(l => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          l.name.toLowerCase().includes(q) ||
          l.phone.includes(q) ||
          l.email.toLowerCase().includes(q) ||
          (l.utm_campaign ?? '').toLowerCase().includes(q) ||
          (l.utm_source ?? '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [leads, search, statusFilter])

  // Agrupa por telefone — mais recente como principal, anteriores como tentativas
  const dedupedLeads = useMemo(() => {
    const phoneMap = new Map<string, { main: Lead; attempts: Lead[] }>()
    // já vem ordenado por created_at desc do backend — o primeiro de cada phone é o mais recente
    filtered.forEach(lead => {
      const phone = lead.phone.replace(/\D/g, '') || lead.phone
      const entry = phoneMap.get(phone)
      if (!entry) {
        phoneMap.set(phone, { main: lead, attempts: [] })
      } else {
        entry.attempts.push(lead)
      }
    })
    return [...phoneMap.values()]
  }, [filtered])

  const newCount      = dedupedLeads.filter(e => e.main.status === 'new').length
  const convertedCount = dedupedLeads.filter(e => e.main.status === 'converted').length
  const totalSubmissions = filtered.length

  function toggleExpand(phone: string) {
    setExpandedPhones(prev => {
      const next = new Set(prev)
      next.has(phone) ? next.delete(phone) : next.add(phone)
      return next
    })
  }

  if (loading) return <div className="text-white/30 py-16 text-center text-sm">Carregando...</div>

  if (loadError) return (
    <div className="py-16 text-center">
      <p className="text-red-400/70 text-sm mb-1">Erro ao carregar leads</p>
      <p className="text-white/25 text-xs font-mono">{loadError}</p>
      <button onClick={load} className="mt-4 text-xs text-gold-500 hover:text-gold-400 underline">Tentar novamente</button>
    </div>
  )

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          placeholder="Nome, telefone, e-mail, campanha..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-gold-500/40 transition-colors"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-gold-500/40 cursor-pointer"
        >
          <option value="all">Todos</option>
          <option value="new">Novos</option>
          <option value="contacted">Contatados</option>
          <option value="converted">Convertidos</option>
          <option value="lost">Perdidos</option>
        </select>
        <button
          onClick={load}
          className="text-xs text-white/30 hover:text-white/60 transition-colors px-4 py-2.5 border border-white/8 rounded-xl whitespace-nowrap"
        >
          ↺ Atualizar
        </button>
      </div>

      {/* Summary */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 mb-5 text-xs">
        <span className="text-white/60 font-medium">{dedupedLeads.length} pessoa{dedupedLeads.length !== 1 ? 's' : ''} únicas</span>
        {totalSubmissions > dedupedLeads.length && (
          <span className="text-white/25">{totalSubmissions} submissões no total</span>
        )}
        {newCount > 0 && <span className="text-blue-400/70">{newCount} aguardando contato</span>}
        {convertedCount > 0 && <span className="text-green-400/70">{convertedCount} convertido{convertedCount !== 1 ? 's' : ''}</span>}
      </div>

      {dedupedLeads.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-white/30 text-lg mb-1">
            {search || statusFilter !== 'all' ? 'Nenhum lead encontrado' : 'Nenhum lead ainda'}
          </p>
          <p className="text-white/20 text-sm">
            {search || statusFilter !== 'all'
              ? 'Tente ajustar os filtros.'
              : 'Aparecerão aqui quando alguém preencher os dados mas não concluir o pagamento.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {dedupedLeads.map(({ main: l, attempts }) => {
            const phone = l.phone.replace(/\D/g, '') || l.phone
            const isExpanded = expandedPhones.has(phone)
            return (
            <div key={l.id} className="bg-white/[0.03] border border-white/8 rounded-xl p-4 space-y-3">

              {/* Header: nome + status + data + selector */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-white font-medium">{l.name}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${STATUS_STYLE[l.status]}`}>
                      {STATUS_LABEL[l.status]}
                    </span>
                    {l.whatsapp_consent ? (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-green-500/30 bg-green-500/10 text-green-400/80">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        WhatsApp ok
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-white/25">
                        sem WA
                      </span>
                    )}
                  </div>
                  <p className="text-white/20 text-[11px] mt-0.5">{fmtDate(l.created_at)}</p>
                </div>
                <select
                  value={l.status}
                  onChange={e => updateStatus(l.id, e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-gold-500/50 cursor-pointer shrink-0"
                >
                  <option value="new">Novo</option>
                  <option value="contacted">Contatado</option>
                  <option value="converted">Convertido</option>
                  <option value="lost">Perdido</option>
                </select>
              </div>

              {/* Contato */}
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={waLink(l.phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{ background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.3)', color: 'rgba(37,211,102,0.9)' }}
                  onClick={() => { if (l.status === 'new') updateStatus(l.id, 'contacted') }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  {l.phone}
                </a>
                <span className="text-white/35 text-xs truncate">{l.email}</span>
              </div>

              {/* Escolhas */}
              {(l.package_id || l.type || l.suite_id || l.drink || l.food || l.total_amount) && (
                <div className="flex flex-wrap gap-1.5">
                  {l.package_id && <Chip>Pacote {capitalize(l.package_id)}</Chip>}
                  {l.type && <Chip>{l.type === 'period' ? 'Período' : 'Pernoite'}</Chip>}
                  {l.suite_id && <Chip>Suíte {l.suite_id.replace('suite-', '')}</Chip>}
                  {l.drink && <Chip>{DRINK_LABEL[l.drink] ?? l.drink}</Chip>}
                  {l.food && <Chip>{FOOD_LABEL[l.food] ?? l.food}</Chip>}
                  {l.total_amount != null && <Chip gold>{fmtBRL(l.total_amount)}</Chip>}
                </div>
              )}

              {/* Check-in pretendido */}
              {l.check_in && (
                <p className="text-white/25 text-[11px]">Check-in pretendido: {fmtDate(l.check_in)}</p>
              )}

              {/* Origem de campanha */}
              <SourceBadge lead={l} />

              {/* Observações */}
              {l.observations && (
                <p className="italic text-white/25 text-xs border-t border-white/5 pt-2">"{l.observations}"</p>
              )}

              {/* Tentativas anteriores */}
              {attempts.length > 0 && (
                <div className="border-t border-white/5 pt-2">
                  <button
                    onClick={() => toggleExpand(phone)}
                    className="text-[11px] text-white/30 hover:text-white/60 transition-colors flex items-center gap-1"
                  >
                    <span>{isExpanded ? '▾' : '▸'}</span>
                    {attempts.length} tentativa{attempts.length > 1 ? 's' : ''} anterior{attempts.length > 1 ? 'es' : ''}
                  </button>
                  {isExpanded && (
                    <div className="mt-2 space-y-2 pl-3 border-l border-white/5">
                      {attempts.map(a => (
                        <div key={a.id} className="text-[11px] text-white/30 flex flex-wrap gap-x-3 gap-y-0.5">
                          <span className="tabular-nums">{fmtDate(a.created_at)}</span>
                          {a.package_id && <span>Pacote {capitalize(a.package_id)}</span>}
                          {a.type && <span>{a.type === 'period' ? 'Período' : 'Pernoite'}</span>}
                          {a.suite_id && <span>Suíte {a.suite_id.replace('suite-', '')}</span>}
                          {a.total_amount != null && <span className="text-gold-700/60">{fmtBRL(a.total_amount)}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
