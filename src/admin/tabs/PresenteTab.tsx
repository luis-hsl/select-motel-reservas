import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

export default function PresenteTab() {
  const [photoUrl, setPhotoUrl] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const photoRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['fundir_photo_url', 'fundir_name'])
    data?.forEach(r => {
      if (r.key === 'fundir_photo_url') setPhotoUrl(r.value ?? '')
      if (r.key === 'fundir_name') setName(r.value ?? '')
    })
    setLoading(false)
  }

  async function uploadPhoto(file: File) {
    setUploading(true)
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `fundir.${ext}`
    const { error } = await supabase.storage
      .from('suite-photos')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (error) { alert(`Erro no upload: ${error.message}`); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('suite-photos').getPublicUrl(path)
    await supabase.from('settings').update({ value: publicUrl }).eq('key', 'fundir_photo_url')
    setPhotoUrl(publicUrl)
    setUploading(false)
  }

  async function saveName() {
    setSaving(true)
    await supabase
      .from('settings')
      .update({ value: name, updated_at: new Date().toISOString() })
      .eq('key', 'fundir_name')
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading) return <div className="text-white/30 py-16 text-center text-sm">Carregando...</div>

  return (
    <div className="max-w-md">
      <div className="mb-6">
        <p className="text-white/25 text-[10px] tracking-[0.4em] uppercase mb-1">Etapa 7 do wizard</p>
        <h2 className="text-white/80 text-lg font-light">
          Presente / <span style={{
            backgroundImage: 'linear-gradient(135deg,#f5e0a0,#c8a035)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>Fondue</span>
        </h2>
        <p className="text-white/30 text-xs mt-1 leading-relaxed">
          O cliente abre uma caixa surpresa e vê esta imagem — aparece em todas as experiências (Ouro, Prata e Bronze).
        </p>
      </div>

      {/* Foto atual */}
      <div className="mb-6 p-4 rounded-2xl bg-white/[0.03] border border-white/8">
        <p className="text-white/40 text-[11px] tracking-widest uppercase mb-3">Imagem do presente</p>

        {photoUrl ? (
          <div className="mb-3 rounded-xl overflow-hidden border border-white/10">
            <img src={photoUrl} alt="Fondue" className="w-full block" />
          </div>
        ) : (
          <div className="mb-3 aspect-video flex flex-col items-center justify-center rounded-xl bg-white/5 border border-white/8 gap-2">
            <span className="text-4xl">🎁</span>
            <span className="text-white/20 text-xs">Nenhuma imagem definida</span>
          </div>
        )}

        <input
          ref={photoRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) uploadPhoto(f)
            e.target.value = ''
          }}
        />
        <button
          onClick={() => photoRef.current?.click()}
          disabled={uploading}
          className="w-full py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
          style={{
            background: uploading ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg,rgba(200,160,53,0.15),rgba(232,192,96,0.1))',
            border: '1px solid rgba(200,160,53,0.35)',
            color: uploading ? 'rgba(255,255,255,0.3)' : 'rgba(232,192,96,0.85)',
          }}
        >
          {uploading ? '↑ Enviando imagem...' : photoUrl ? 'Trocar imagem' : '+ Adicionar imagem'}
        </button>

        <p className="text-white/20 text-[10px] mt-2 text-center">
          JPG, PNG ou WEBP · aparece no tamanho original
        </p>
      </div>

      {/* Nome */}
      <div className="mb-6 p-4 rounded-2xl bg-white/[0.03] border border-white/8">
        <label className="text-white/40 text-[11px] tracking-widest uppercase block mb-3">
          Nome do presente
        </label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ex: Fondue de Chocolate"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold-500/40 transition-colors"
        />
        <p className="text-white/20 text-[10px] mt-2">
          Exibido como texto alternativo da imagem (acessibilidade).
        </p>
      </div>

      <button
        onClick={saveName}
        disabled={saving}
        className="px-6 py-3 rounded-xl text-sm font-semibold text-black transition-all active:scale-[0.98] disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg, #c8a035 0%, #e8c060 50%, #c8a035 100%)' }}
      >
        {saving ? 'Salvando...' : saved ? '✓ Salvo!' : 'Salvar nome'}
      </button>

      {/* Preview info */}
      <div className="mt-8 p-4 rounded-xl bg-white/[0.02] border border-white/5">
        <p className="text-white/30 text-xs font-medium mb-2 uppercase tracking-wider">Como funciona</p>
        <p className="text-white/20 text-xs leading-relaxed">
          Na etapa 7, o cliente vê uma caixa 3D e toca para abrir. Após a animação, apenas esta imagem é revelada.
          Ele então clica em <span className="text-white/40">Desfrutar</span> para continuar.
        </p>
      </div>
    </div>
  )
}
