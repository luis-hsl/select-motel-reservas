import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

type Package = {
  id: string
  label: string
  tagline: string
  price_period: number
  price_overnight: number
  highlighted: boolean
  includes: string[]
  note: string | null
}

type EditState = {
  label: string
  tagline: string
  price_period: number
  price_overnight: number
  highlighted: boolean
  includes: string[]
  note: string
}

export default function PacotesTab() {
  const [packages, setPackages] = useState<Package[]>([])
  const [loading, setLoading] = useState(true)
  const [edits, setEdits] = useState<Record<string, EditState>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [newItem, setNewItem] = useState<Record<string, string>>({})

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('packages')
      .select('id,label,tagline,price_period,price_overnight,highlighted,includes,note')
      .order('sort_order')
    setPackages(data ?? [])
    setLoading(false)
  }

  function draft(pkg: Package): EditState {
    return edits[pkg.id] ?? {
      label: pkg.label,
      tagline: pkg.tagline,
      price_period: pkg.price_period,
      price_overnight: pkg.price_overnight,
      highlighted: pkg.highlighted,
      includes: [...(pkg.includes ?? [])],
      note: pkg.note ?? '',
    }
  }

  function setField<K extends keyof EditState>(id: string, pkg: Package, field: K, value: EditState[K]) {
    setEdits(prev => ({ ...prev, [id]: { ...draft(pkg), [field]: value } }))
  }

  function isDirty(pkg: Package) { return !!edits[pkg.id] }

  async function save(pkg: Package) {
    const e = draft(pkg)
    setSaving(pkg.id)
    await supabase.from('packages').update({
      label: e.label,
      tagline: e.tagline,
      price_period: e.price_period,
      price_overnight: e.price_overnight,
      highlighted: e.highlighted,
      includes: e.includes,
      note: e.note || null,
    }).eq('id', pkg.id)
    setPackages(prev => prev.map(p =>
      p.id === pkg.id ? { ...p, ...e, note: e.note || null } : p,
    ))
    setEdits(prev => { const n = { ...prev }; delete n[pkg.id]; return n })
    setSaving(null)
  }

  function cancel(id: string) {
    setEdits(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  function addInclude(pkg: Package) {
    const val = (newItem[pkg.id] ?? '').trim()
    if (!val) return
    const e = draft(pkg)
    setEdits(prev => ({ ...prev, [pkg.id]: { ...e, includes: [...e.includes, val] } }))
    setNewItem(prev => ({ ...prev, [pkg.id]: '' }))
  }

  function removeInclude(pkg: Package, idx: number) {
    const e = draft(pkg)
    setEdits(prev => ({
      ...prev,
      [pkg.id]: { ...e, includes: e.includes.filter((_, i) => i !== idx) },
    }))
  }

  if (loading) return <div className="text-white/30 py-16 text-center text-sm">Carregando...</div>

  return (
    <div className="space-y-5">
      {packages.map(pkg => {
        const e = draft(pkg)
        const dirty = isDirty(pkg)
        return (
          <div key={pkg.id} className="bg-white/[0.03] border border-white/8 rounded-xl p-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-5">
              <div className="flex-1 space-y-2 min-w-0">
                <input
                  value={e.label}
                  onChange={ev => setField(pkg.id, pkg, 'label', ev.target.value)}
                  className="w-full bg-transparent border-b border-white/10 pb-1 text-white font-medium text-base focus:outline-none focus:border-gold-500/40 transition-colors"
                  placeholder="Nome do pacote"
                />
                <input
                  value={e.tagline}
                  onChange={ev => setField(pkg.id, pkg, 'tagline', ev.target.value)}
                  className="w-full bg-transparent border-b border-white/8 pb-1 text-white/40 text-sm focus:outline-none focus:border-gold-500/30 transition-colors"
                  placeholder="Tagline"
                />
              </div>
              <button
                onClick={() => setField(pkg.id, pkg, 'highlighted', !e.highlighted)}
                className={`text-[11px] px-2.5 py-1 rounded-full border shrink-0 transition-all ${
                  e.highlighted
                    ? 'text-gold-400 border-gold-400/40 bg-gold-400/10'
                    : 'text-white/20 border-white/10 hover:text-white/40 hover:border-white/20'
                }`}
              >
                ★ Destaque
              </button>
            </div>

            {/* Prices */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              {(['price_period', 'price_overnight'] as const).map(field => (
                <div key={field}>
                  <label className="text-white/40 text-[10px] tracking-wider uppercase block mb-1.5">
                    {field === 'price_period' ? 'Período' : 'Pernoite'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">R$</span>
                    <input
                      type="number"
                      value={e[field]}
                      onChange={ev => setField(pkg.id, pkg, field, Number(ev.target.value))}
                      className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500/40 transition-colors"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Includes */}
            <div className="mb-4">
              <label className="text-white/40 text-[10px] tracking-wider uppercase block mb-2">
                O que inclui
              </label>
              <div className="space-y-1.5 mb-2">
                {e.includes.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 group">
                    <span className="text-gold-400/60 text-xs shrink-0">✓</span>
                    <span className="text-white/60 text-sm flex-1">{item}</span>
                    <button
                      onClick={() => removeInclude(pkg, idx)}
                      className="text-white/20 hover:text-red-400 text-base leading-none opacity-0 group-hover:opacity-100 transition-all px-1"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={newItem[pkg.id] ?? ''}
                  onChange={ev => setNewItem(prev => ({ ...prev, [pkg.id]: ev.target.value }))}
                  onKeyDown={ev => { if (ev.key === 'Enter') { ev.preventDefault(); addInclude(pkg) } }}
                  placeholder="Adicionar item..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-gold-500/30 transition-colors"
                />
                <button
                  onClick={() => addInclude(pkg)}
                  className="px-3 py-2 rounded-lg text-sm text-white/40 border border-white/10 hover:text-white/70 hover:border-white/20 transition-colors"
                >
                  +
                </button>
              </div>
            </div>

            {/* Note */}
            <div className="mb-5">
              <label className="text-white/40 text-[10px] tracking-wider uppercase block mb-1.5">
                Observação (opcional)
              </label>
              <input
                value={e.note}
                onChange={ev => setField(pkg.id, pkg, 'note', ev.target.value)}
                placeholder="Ex: Válido de seg a qui"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-gold-500/30 transition-colors"
              />
            </div>

            {dirty && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => save(pkg)}
                  disabled={saving === pkg.id}
                  className="px-5 py-2 rounded-lg text-xs font-semibold text-black transition-all active:scale-[0.98] disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #c8a035, #e8c060)' }}
                >
                  {saving === pkg.id ? 'Salvando...' : 'Salvar alterações'}
                </button>
                <button
                  onClick={() => cancel(pkg.id)}
                  className="text-xs text-white/30 hover:text-white/60 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
