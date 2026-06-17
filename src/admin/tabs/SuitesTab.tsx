import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

type Suite = {
  id: string
  name: string
  category: string | null
  room_number: number | null
  active: boolean
  photo_url: string | null
  photos: string[] | null
}

export default function SuitesTab() {
  const [suites, setSuites] = useState<Suite[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<{ id: string; count: number } | null>(null)
  const [deleting, setDeleting] = useState<{ id: string; url: string } | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('suites')
      .select('id, name, category, room_number, active, photo_url, photos')
      .order('sort_order')
    setSuites(data ?? [])
    setLoading(false)
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('suites').update({ active: !current }).eq('id', id)
    setSuites(prev => prev.map(s => s.id === id ? { ...s, active: !current } : s))
  }

  async function uploadPhotos(suiteId: string, files: FileList) {
    const suite = suites.find(s => s.id === suiteId)
    const current = suite?.photos ?? []
    const slots = 15 - current.length
    if (slots <= 0) { alert('Limite de 15 fotos já atingido.'); return }

    const toUpload = Array.from(files).slice(0, slots)
    setUploading({ id: suiteId, count: toUpload.length })

    const newUrls: string[] = []
    for (const file of toUpload) {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `gallery/${suiteId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage
        .from('suite-photos')
        .upload(path, file, { contentType: file.type })
      if (error) { console.error(error); continue }
      const { data: { publicUrl } } = supabase.storage.from('suite-photos').getPublicUrl(path)
      newUrls.push(publicUrl)
    }

    if (newUrls.length > 0) {
      const updated = [...current, ...newUrls]
      const coverUpdate = suite?.photo_url ? {} : { photo_url: newUrls[0] }
      await supabase.from('suites').update({ photos: updated, ...coverUpdate }).eq('id', suiteId)
      setSuites(prev => prev.map(s => s.id === suiteId
        ? { ...s, photos: updated, ...(s.photo_url ? {} : { photo_url: newUrls[0] }) }
        : s))
    }
    setUploading(null)
  }

  async function deletePhoto(suiteId: string, photoUrl: string) {
    if (!confirm('Remover esta foto?')) return
    setDeleting({ id: suiteId, url: photoUrl })

    // Remove from storage (extract path after bucket name)
    try {
      const url = new URL(photoUrl)
      const marker = '/suite-photos/'
      const idx = url.pathname.indexOf(marker)
      if (idx !== -1) {
        const storagePath = decodeURIComponent(url.pathname.slice(idx + marker.length).split('?')[0])
        await supabase.storage.from('suite-photos').remove([storagePath])
      }
    } catch { /* noop */ }

    const suite = suites.find(s => s.id === suiteId)
    const updated = (suite?.photos ?? []).filter(u => u !== photoUrl)
    const newCover = suite?.photo_url === photoUrl ? (updated[0] ?? null) : suite?.photo_url ?? null
    await supabase.from('suites').update({ photos: updated, photo_url: newCover }).eq('id', suiteId)
    setSuites(prev => prev.map(s => s.id === suiteId
      ? { ...s, photos: updated, photo_url: newCover }
      : s))
    setDeleting(null)
  }

  async function setAsCover(suiteId: string, photoUrl: string) {
    await supabase.from('suites').update({ photo_url: photoUrl }).eq('id', suiteId)
    setSuites(prev => prev.map(s => s.id === suiteId ? { ...s, photo_url: photoUrl } : s))
  }

  if (loading) return <div className="text-white/30 py-16 text-center text-sm">Carregando...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-white/80 text-sm">{suites.length} suítes cadastradas</h2>
        <p className="text-white/25 text-xs hidden sm:block">Até 15 fotos por suíte · primeira foto = capa</p>
      </div>

      <div className="space-y-4">
        {suites.map(suite => {
          const photos = suite.photos ?? []
          const isUploading = uploading?.id === suite.id
          const canAdd = photos.length < 15

          return (
            <div key={suite.id} className="bg-white/[0.03] border border-white/[0.08] rounded-xl overflow-hidden">

              {/* Suite header */}
              <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-white/[0.06]">
                <div className="flex items-center gap-3 min-w-0">
                  {suite.photo_url ? (
                    <img
                      src={suite.photo_url}
                      alt=""
                      className="w-10 h-10 rounded-lg object-cover shrink-0 border border-white/10"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0 border border-white/[0.08]">
                      <span className="text-white/25 text-xs font-bold">{suite.room_number ?? '?'}</span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-white/90 text-sm font-medium truncate">{suite.name}</p>
                    <p className="text-white/35 text-xs">
                      {suite.category ?? '—'}
                      {suite.room_number ? ` · nº ${suite.room_number}` : ''}
                      <span className="ml-2 text-white/20">{photos.length}/15 fotos</span>
                    </p>
                  </div>
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

              {/* Photo gallery */}
              <div className="p-4">
                {photos.length > 0 ? (
                  <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-1.5 mb-3">
                    {photos.map((url, idx) => {
                      const isCover = suite.photo_url === url
                      const isDeleting = deleting?.id === suite.id && deleting.url === url
                      return (
                        <div key={url} className="relative group aspect-square">
                          <img
                            src={url}
                            className="w-full h-full object-cover rounded-lg border border-white/10"
                            loading="lazy"
                          />
                          {/* Cover badge */}
                          <span className={`absolute bottom-0.5 left-0.5 text-[8px] px-1 py-px rounded leading-tight font-medium ${
                            isCover
                              ? 'bg-amber-700/90 text-amber-200'
                              : 'bg-black/60 text-white/40 opacity-0 group-hover:opacity-100'
                          } transition-opacity`}>
                            {isCover ? 'capa' : `${idx + 1}`}
                          </span>

                          {/* Action overlay */}
                          {!isDeleting && (
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors rounded-lg flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto">
                              {!isCover && (
                                <button
                                  onClick={() => setAsCover(suite.id, url)}
                                  className="w-6 h-6 rounded-full bg-amber-700/80 hover:bg-amber-600 flex items-center justify-center text-[8px] text-amber-100 font-bold transition-colors"
                                  title="Definir como capa"
                                >
                                  ★
                                </button>
                              )}
                              <button
                                onClick={() => deletePhoto(suite.id, url)}
                                className="w-6 h-6 rounded-full bg-red-900/80 hover:bg-red-700 flex items-center justify-center text-[10px] text-white font-bold transition-colors"
                                title="Remover foto"
                              >
                                ✕
                              </button>
                            </div>
                          )}

                          {/* Deleting spinner */}
                          {isDeleting && (
                            <div className="absolute inset-0 rounded-lg bg-black/60 flex items-center justify-center">
                              <div className="w-4 h-4 rounded-full border border-white/20 border-t-white/70 animate-spin" />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-white/20 text-xs mb-3">Nenhuma foto adicionada ainda.</p>
                )}

                {/* Add photos button */}
                <input
                  ref={el => { fileRefs.current[suite.id] = el }}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={e => {
                    const files = e.target.files
                    if (files && files.length > 0) uploadPhotos(suite.id, files)
                    e.target.value = ''
                  }}
                />
                <button
                  onClick={() => canAdd && fileRefs.current[suite.id]?.click()}
                  disabled={!canAdd || isUploading}
                  className="text-xs px-4 py-2 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    border: canAdd ? '1px solid rgba(201,168,76,0.30)' : '1px solid rgba(255,255,255,0.08)',
                    color: canAdd ? 'rgba(201,168,76,0.80)' : 'rgba(255,255,255,0.25)',
                    background: 'transparent',
                  }}
                >
                  {isUploading
                    ? `↑ Enviando ${uploading!.count} foto${uploading!.count !== 1 ? 's' : ''}...`
                    : canAdd
                    ? `+ Adicionar fotos  ${photos.length}/15`
                    : '✓ Limite atingido (15/15)'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
