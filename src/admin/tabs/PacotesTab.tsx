import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

type Package = {
  id: string
  label: string
  tagline: string
  price_period: number
  price_overnight: number
  highlighted: boolean
}

type Edits = Record<string, { price_period?: number; price_overnight?: number }>

export default function PacotesTab() {
  const [packages, setPackages] = useState<Package[]>([])
  const [loading, setLoading] = useState(true)
  const [edits, setEdits] = useState<Edits>({})
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('packages')
      .select('id, label, tagline, price_period, price_overnight, highlighted')
      .order('sort_order')
    setPackages(data ?? [])
    setLoading(false)
  }

  function edit(id: string, field: 'price_period' | 'price_overnight', val: number) {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }))
  }

  async function save(pkg: Package) {
    const changes = edits[pkg.id]
    if (!changes) return
    setSaving(pkg.id)
    await supabase.from('packages').update(changes).eq('id', pkg.id)
    setPackages(prev => prev.map(p => p.id === pkg.id ? { ...p, ...changes } : p))
    setEdits(prev => { const n = { ...prev }; delete n[pkg.id]; return n })
    setSaving(null)
  }

  function cancel(id: string) {
    setEdits(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  function val(pkg: Package, field: 'price_period' | 'price_overnight') {
    return edits[pkg.id]?.[field] ?? pkg[field]
  }

  if (loading) return <div className="text-white/30 py-16 text-center text-sm">Carregando...</div>

  return (
    <div>
      <h2 className="text-white/80 text-sm mb-6">Preços dos Pacotes</h2>

      <div className="space-y-4">
        {packages.map(pkg => {
          const changed = !!edits[pkg.id]
          return (
            <div key={pkg.id} className="bg-white/[0.03] border border-white/8 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div>
                  <p className="text-white font-medium">{pkg.label}</p>
                  <p className="text-white/40 text-xs">{pkg.tagline}</p>
                </div>
                {pkg.highlighted && (
                  <span className="ml-auto text-[11px] text-gold-400 border border-gold-400/30 px-2 py-0.5 rounded-full">
                    Destaque
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {(['price_period', 'price_overnight'] as const).map(field => (
                  <div key={field}>
                    <label className="text-white/40 text-[11px] tracking-wider uppercase block mb-1.5">
                      {field === 'price_period' ? 'Período' : 'Pernoite'}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">R$</span>
                      <input
                        type="number"
                        value={val(pkg, field)}
                        onChange={e => edit(pkg.id, field, Number(e.target.value))}
                        className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500/40 transition-colors"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {changed && (
                <div className="flex items-center gap-3 mt-4">
                  <button
                    onClick={() => save(pkg)}
                    disabled={saving === pkg.id}
                    className="px-5 py-2 rounded-lg text-xs font-semibold text-black transition-all active:scale-[0.98] disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #c8a035, #e8c060)' }}
                  >
                    {saving === pkg.id ? 'Salvando...' : 'Salvar'}
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
    </div>
  )
}
