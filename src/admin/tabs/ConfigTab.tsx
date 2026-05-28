import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

type Setting = { key: string; value: string; label: string | null }

export default function ConfigTab() {
  const [settings, setSettings] = useState<Setting[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('settings').select('*').order('key')
    setSettings(data ?? [])
    const v: Record<string, string> = {}
    data?.forEach(s => { v[s.key] = s.value })
    setValues(v)
    setLoading(false)
  }

  async function saveAll() {
    setSaving(true)
    for (const [key, value] of Object.entries(values)) {
      await supabase
        .from('settings')
        .update({ value, updated_at: new Date().toISOString() })
        .eq('key', key)
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading) return <div className="text-white/30 py-16 text-center text-sm">Carregando...</div>

  return (
    <div className="max-w-md">
      <h2 className="text-white/80 text-sm mb-6">Configurações do Aplicativo</h2>

      <div className="space-y-5">
        {settings.filter(s => !['fundir_photo_url', 'fundir_name'].includes(s.key)).map(s => (
          <div key={s.key}>
            <label className="text-white/40 text-[11px] tracking-widest uppercase block mb-1.5">
              {s.label ?? s.key}
            </label>
            <input
              type="text"
              value={values[s.key] ?? ''}
              onChange={e => setValues(prev => ({ ...prev, [s.key]: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold-500/40 transition-colors"
            />
          </div>
        ))}
      </div>

      <button
        onClick={saveAll}
        disabled={saving}
        className="mt-6 px-6 py-3 rounded-xl text-sm font-semibold text-black transition-all active:scale-[0.98] disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg, #c8a035 0%, #e8c060 50%, #c8a035 100%)' }}
      >
        {saving ? 'Salvando...' : saved ? '✓ Salvo!' : 'Salvar configurações'}
      </button>

      <div className="mt-8 p-4 rounded-xl bg-white/[0.02] border border-white/5">
        <p className="text-white/30 text-xs font-medium mb-2 uppercase tracking-wider">Como usar o WhatsApp</p>
        <p className="text-white/20 text-xs leading-relaxed">
          O número deve conter apenas dígitos: DDI (55) + DDD + número.<br />
          Exemplo: <span className="text-white/40">5543999887766</span>
        </p>
      </div>
    </div>
  )
}
