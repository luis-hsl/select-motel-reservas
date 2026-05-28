import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

type Suite = {
  id: string
  name: string
  description: string
  category: string | null
  room_number: number | null
  active: boolean
  photo_url: string | null
  video_url: string | null
}

type Uploading = { id: string; kind: 'photo' | 'video' } | null

export default function SuitesTab() {
  const [suites, setSuites] = useState<Suite[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<Uploading>(null)
  const photoRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const videoRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('suites')
      .select('id, name, description, category, room_number, active, photo_url, video_url')
      .order('sort_order')
    setSuites(data ?? [])
    setLoading(false)
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('suites').update({ active: !current }).eq('id', id)
    setSuites(prev => prev.map(s => s.id === id ? { ...s, active: !current } : s))
  }

  async function uploadFile(suiteId: string, file: File, kind: 'photo' | 'video') {
    setUploading({ id: suiteId, kind })

    const bucket = kind === 'photo' ? 'suite-photos' : 'suite-videos'
    const ext = file.name.split('.').pop() ?? (kind === 'photo' ? 'jpg' : 'mp4')
    const path = `${suiteId}.${ext}`

    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: true, contentType: file.type })

    if (upErr) {
      alert(`Erro no upload: ${upErr.message}`)
      setUploading(null)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path)
    if (kind === 'photo') {
      await supabase.from('suites').update({ photo_url: publicUrl }).eq('id', suiteId)
      setSuites(prev => prev.map(s => s.id === suiteId ? { ...s, photo_url: publicUrl } : s))
    } else {
      await supabase.from('suites').update({ video_url: publicUrl }).eq('id', suiteId)
      setSuites(prev => prev.map(s => s.id === suiteId ? { ...s, video_url: publicUrl } : s))
    }
    setUploading(null)
  }

  if (loading) return <div className="text-white/30 py-16 text-center text-sm">Carregando...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-white/80 text-sm">{suites.length} suítes</h2>
        <p className="text-white/25 text-xs hidden sm:block">Foto (capa) + vídeo por suíte</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {suites.map(suite => {
          const uploadingPhoto = uploading?.id === suite.id && uploading.kind === 'photo'
          const uploadingVideo = uploading?.id === suite.id && uploading.kind === 'video'
          const busy = uploadingPhoto || uploadingVideo

          return (
            <div key={suite.id} className="bg-white/[0.03] border border-white/8 rounded-xl overflow-hidden">

              {/* ── Foto de capa ── */}
              <div className="aspect-video relative bg-white/5">
                {suite.photo_url ? (
                  <img src={suite.photo_url} alt={suite.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                    <span className="text-white/15 text-3xl">🖼️</span>
                    <span className="text-white/20 text-xs">Sem foto de capa</span>
                  </div>
                )}
                {!suite.active && (
                  <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                    <span className="text-red-400 text-xs font-medium border border-red-400/40 px-3 py-1 rounded-full">
                      Inativa
                    </span>
                  </div>
                )}
              </div>

              {/* ── Vídeo preview ── */}
              {suite.video_url && (
                <div className="relative bg-black">
                  <video
                    src={suite.video_url}
                    controls
                    muted
                    playsInline
                    className="w-full max-h-36 object-cover"
                  />
                  <span className="absolute top-1.5 left-2 text-[10px] text-white/40 tracking-widest uppercase">vídeo</span>
                </div>
              )}

              {/* ── Info + botões ── */}
              <div className="p-3">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <p className="text-white text-sm font-medium">{suite.name}</p>
                    <p className="text-white/40 text-xs">{suite.category ?? '—'}</p>
                  </div>
                  <button
                    onClick={() => toggleActive(suite.id, suite.active)}
                    className={`text-xs px-2.5 py-1 rounded-lg border shrink-0 transition-colors ${
                      suite.active
                        ? 'text-green-400 border-green-400/30 hover:text-red-400 hover:border-red-400/30'
                        : 'text-red-400 border-red-400/30 hover:text-green-400 hover:border-green-400/30'
                    }`}
                  >
                    {suite.active ? 'Ativa' : 'Inativa'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {/* Foto */}
                  <input
                    ref={el => { photoRefs.current[suite.id] = el }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) uploadFile(suite.id, file, 'photo')
                      e.target.value = ''
                    }}
                  />
                  <button
                    onClick={() => photoRefs.current[suite.id]?.click()}
                    disabled={busy}
                    className="py-2 rounded-lg text-xs font-medium border border-gold-500/30 text-gold-400/80 hover:bg-gold-500/10 hover:text-gold-400 transition-colors disabled:opacity-40"
                  >
                    {uploadingPhoto ? '↑ Enviando...' : suite.photo_url ? '🖼 Trocar foto' : '🖼 + Foto'}
                  </button>

                  {/* Vídeo */}
                  <input
                    ref={el => { videoRefs.current[suite.id] = el }}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,video/x-msvideo"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) uploadFile(suite.id, file, 'video')
                      e.target.value = ''
                    }}
                  />
                  <button
                    onClick={() => videoRefs.current[suite.id]?.click()}
                    disabled={busy}
                    className="py-2 rounded-lg text-xs font-medium border border-blue-500/30 text-blue-400/80 hover:bg-blue-500/10 hover:text-blue-400 transition-colors disabled:opacity-40"
                  >
                    {uploadingVideo ? '↑ Enviando...' : suite.video_url ? '▶ Trocar vídeo' : '▶ + Vídeo'}
                  </button>
                </div>
              </div>

            </div>
          )
        })}
      </div>
    </div>
  )
}
