import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

interface CardItem {
  key: string
  label: string
  hint: string
}

const ITEMS: CardItem[] = [
  { key: 'pizza_photo_url',  label: 'Pizza',   hint: 'Aparece no card de refeição (Prata e Bronze)' },
  { key: 'drinque_photo_url',label: 'Drink',   hint: 'Aparece no card de bebida (Bronze — 2 drinks por casal)' },
]

export default function CardapioTab() {
  const [urls, setUrls]         = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [loading, setLoading]   = useState(true)
  const refs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ITEMS.map(i => i.key))
    const v: Record<string, string> = {}
    data?.forEach(r => { v[r.key] = r.value ?? '' })
    setUrls(v)
    setLoading(false)
  }

  async function uploadPhoto(key: string, file: File) {
    setUploading(prev => ({ ...prev, [key]: true }))
    const ext  = file.name.split('.').pop() ?? 'jpg'
    const path = `${key.replace('_photo_url', '')}.${ext}`
    const { error } = await supabase.storage
      .from('suite-photos')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (error) {
      alert(`Erro no upload: ${error.message}`)
      setUploading(prev => ({ ...prev, [key]: false }))
      return
    }
    const { data: { publicUrl } } = supabase.storage.from('suite-photos').getPublicUrl(path)
    await supabase.from('settings').update({ value: publicUrl }).eq('key', key)
    setUrls(prev => ({ ...prev, [key]: publicUrl }))
    setUploading(prev => ({ ...prev, [key]: false }))
  }

  if (loading) return <div className="text-white/30 py-16 text-center text-sm">Carregando...</div>

  return (
    <div className="max-w-md">
      <div className="mb-6">
        <p className="text-white/25 text-[10px] tracking-[0.4em] uppercase mb-1">Imagens dos cards</p>
        <h2 className="text-white/80 text-lg font-light">
          Cardápio / <span style={{
            backgroundImage: 'linear-gradient(135deg,#f5e0a0,#c8a035)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>Bebidas</span>
        </h2>
        <p className="text-white/30 text-xs mt-1 leading-relaxed">
          Faça upload das fotos que aparecem nos cards de seleção do app.
        </p>
      </div>

      <div className="space-y-6">
        {ITEMS.map(item => {
          const url        = urls[item.key] ?? ''
          const isUploading = uploading[item.key] ?? false
          return (
            <div key={item.key} className="p-4 rounded-2xl bg-white/[0.03] border border-white/8">
              <p className="text-white/40 text-[11px] tracking-widest uppercase mb-1">{item.label}</p>
              <p className="text-white/20 text-[10px] mb-3">{item.hint}</p>

              {url ? (
                <div className="mb-3 rounded-xl overflow-hidden border border-white/10">
                  <img src={url} alt={item.label} className="w-full block" />
                </div>
              ) : (
                <div className="mb-3 aspect-video flex flex-col items-center justify-center rounded-xl bg-white/5 border border-white/8 gap-2">
                  <span className="text-white/20 text-sm">Sem foto definida</span>
                </div>
              )}

              <input
                ref={el => { refs.current[item.key] = el }}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) uploadPhoto(item.key, f)
                  e.target.value = ''
                }}
              />
              <button
                onClick={() => refs.current[item.key]?.click()}
                disabled={isUploading}
                className="w-full py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
                style={{
                  background: isUploading
                    ? 'rgba(255,255,255,0.05)'
                    : 'linear-gradient(135deg,rgba(200,160,53,0.15),rgba(232,192,96,0.1))',
                  border: '1px solid rgba(200,160,53,0.35)',
                  color: isUploading ? 'rgba(255,255,255,0.3)' : 'rgba(232,192,96,0.85)',
                }}
              >
                {isUploading ? '↑ Enviando...' : url ? `Trocar foto — ${item.label}` : `+ Adicionar foto — ${item.label}`}
              </button>
            </div>
          )
        })}
      </div>

      <div className="mt-8 p-4 rounded-xl bg-white/[0.02] border border-white/5">
        <p className="text-white/30 text-xs font-medium mb-2 uppercase tracking-wider">Como funciona</p>
        <p className="text-white/20 text-xs leading-relaxed">
          Após o upload a foto aparece imediatamente nos cards do app — sem necessidade de republicar.
          Use JPG, PNG ou WEBP de boa resolução (mínimo 800×600 px).
        </p>
      </div>
    </div>
  )
}
