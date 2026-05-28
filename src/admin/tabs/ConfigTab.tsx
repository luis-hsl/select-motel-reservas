import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

type Setting = { key: string; value: string; label: string | null }

export default function ConfigTab() {
  const [settings, setSettings] = useState<Setting[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploadingFundir, setUploadingFundir] = useState(false)
  const fundirPhotoRef = useRef<HTMLInputElement | null>(null)

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

  async function uploadFundirPhoto(file: File) {
    setUploadingFundir(true)
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `fundir.${ext}`
    const { error } = await supabase.storage
      .from('suite-photos')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (error) { alert(`Erro: ${error.message}`); setUploadingFundir(false); return }
    const { data: { publicUrl } } = supabase.storage.from('suite-photos').getPublicUrl(path)
    await supabase.from('settings').update({ value: publicUrl }).eq('key', 'fundir_photo_url')
    setValues(prev => ({ ...prev, fundir_photo_url: publicUrl }))
    setUploadingFundir(false)
  }

  if (loading) return <div className="text-white/30 py-16 text-center text-sm">Carregando...</div>

  const fundirPhotoUrl = values['fundir_photo_url']

  return (
    <div className="max-w-md">
      <h2 className="text-white/80 text-sm mb-6">Configurações do Aplicativo</h2>

      {/* ── Seção Fundir ── */}
      <div className="mb-8 p-4 rounded-xl bg-white/[0.03] border border-white/8">
        <p className="text-white/60 text-xs font-medium uppercase tracking-widest mb-4">🎁 Presente / Fondue</p>

        {/* Foto atual */}
        <div className="mb-3">
          {fundirPhotoUrl ? (
            <img src={fundirPhotoUrl} alt="Fondue" className="w-full rounded-xl block mb-2" />
          ) : (
            <div className="aspect-video flex items-center justify-center rounded-xl bg-white/5 mb-2">
              <span className="text-white/20 text-sm">Sem foto definida</span>
            </div>
          )}
          <input
            ref={fundirPhotoRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadFundirPhoto(f); e.target.value = '' }}
          />
          <button
            onClick={() => fundirPhotoRef.current?.click()}
            disabled={uploadingFundir}
            className="w-full py-2.5 rounded-xl text-xs font-medium border border-gold-500/30 text-gold-400/80 hover:bg-gold-500/10 transition-colors disabled:opacity-40"
          >
            {uploadingFundir ? '↑ Enviando...' : fundirPhotoUrl ? '🖼 Trocar foto do fondue' : '🖼 + Foto do fondue'}
          </button>
        </div>

        {/* Nome */}
        <div>
          <label className="text-white/40 text-[11px] tracking-widest uppercase block mb-1.5">Nome do presente</label>
          <input
            type="text"
            value={values['fundir_name'] ?? ''}
            onChange={e => setValues(prev => ({ ...prev, fundir_name: e.target.value }))}
            placeholder="Ex: Fondue de Chocolate"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold-500/40 transition-colors"
          />
        </div>
      </div>

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
