import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { toWebP } from '../../lib/webp'

type Suite = {
  id: string
  name: string
  description: string
  category: string | null
  room_number: number | null
  active: boolean
  photo_url: string | null
}

type SuitePhoto = {
  id: string
  suite_id: string
  url: string
  sort_order: number
}

type EditForm = {
  name: string
  description: string
  category: string
  room_number: string
}

const CATEGORIES = ['VIP Piscina', 'Hidro', 'Hidro Light', 'Standard']

export default function SuitesTab() {
  const [suites, setSuites] = useState<Suite[]>([])
  const [photos, setPhotos] = useState<Record<string, SuitePhoto[]>>({})
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ name: '', description: '', category: '', room_number: '' })
  const [saving, setSaving] = useState(false)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: suitesData }, { data: photosData }] = await Promise.all([
      supabase.from('suites').select('id,name,description,category,room_number,active,photo_url').order('sort_order'),
      (supabase as any).from('suite_photos').select('id,suite_id,url,sort_order').order('sort_order'),
    ])
    setSuites(suitesData ?? [])
    const grouped: Record<string, SuitePhoto[]> = {}
    ;(photosData ?? []).forEach((p: SuitePhoto) => {
      if (!grouped[p.suite_id]) grouped[p.suite_id] = []
      grouped[p.suite_id].push(p)
    })
    setPhotos(grouped)
    setLoading(false)
  }

  function startEdit(suite: Suite) {
    setEditing(suite.id)
    setEditForm({
      name: suite.name,
      description: suite.description,
      category: suite.category ?? '',
      room_number: suite.room_number?.toString() ?? '',
    })
  }

  async function saveEdit(id: string) {
    setSaving(true)
    const updates = {
      name: editForm.name,
      description: editForm.description,
      category: editForm.category || null,
      room_number: editForm.room_number ? parseInt(editForm.room_number) : null,
    }
    await supabase.from('suites').update(updates).eq('id', id)
    setSuites(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s))
    setEditing(null)
    setSaving(false)
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('suites').update({ active: !current }).eq('id', id)
    setSuites(prev => prev.map(s => s.id === id ? { ...s, active: !current } : s))
  }

  async function uploadPhotos(suiteId: string, files: FileList) {
    setUploading(suiteId)
    const existing = photos[suiteId] ?? []
    let nextOrder = existing.length > 0 ? Math.max(...existing.map(p => p.sort_order)) + 1 : 0
    const added: SuitePhoto[] = []

    for (const file of Array.from(files)) {
      const webpFile = await toWebP(file)
      const path = `${suiteId}/${Date.now()}-${nextOrder}.webp`

      const { error: upErr } = await supabase.storage
        .from('suite-photos')
        .upload(path, webpFile, { upsert: false, contentType: 'image/webp' })

      if (upErr) { alert('Erro no upload: ' + upErr.message); continue }

      const { data: { publicUrl } } = supabase.storage.from('suite-photos').getPublicUrl(path)

      const { data: row } = await (supabase as any)
        .from('suite_photos')
        .insert({ suite_id: suiteId, url: publicUrl, sort_order: nextOrder })
        .select().single()

      if (row) added.push(row as SuitePhoto)
      nextOrder++
    }

    const allPhotos = [...existing, ...added]

    // Primeira foto vira capa da suíte
    if (allPhotos.length > 0) {
      const cover = allPhotos[0].url
      await supabase.from('suites').update({ photo_url: cover }).eq('id', suiteId)
      setSuites(prev => prev.map(s => s.id === suiteId ? { ...s, photo_url: cover } : s))
    }

    setPhotos(prev => ({ ...prev, [suiteId]: allPhotos }))
    setUploading(null)
  }

  async function deletePhoto(suiteId: string, photo: SuitePhoto) {
    setDeleting(photo.id)

    // Extrai path relativo da URL pública
    const match = photo.url.split('/suite-photos/')
    if (match[1]) await supabase.storage.from('suite-photos').remove([match[1]])

    await (supabase as any).from('suite_photos').delete().eq('id', photo.id)

    const remaining = (photos[suiteId] ?? []).filter(p => p.id !== photo.id)
    setPhotos(prev => ({ ...prev, [suiteId]: remaining }))

    // Atualiza capa para a próxima foto (ou null se não houver)
    const newCover = remaining[0]?.url ?? null
    await supabase.from('suites').update({ photo_url: newCover }).eq('id', suiteId)
    setSuites(prev => prev.map(s => s.id === suiteId ? { ...s, photo_url: newCover } : s))

    setDeleting(null)
  }

  if (loading) return <div className="text-white/30 py-16 text-center text-sm">Carregando...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-white/80 text-sm">{suites.length} suítes</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {suites.map(suite => {
          const suitePhotos = photos[suite.id] ?? []
          return (
            <div key={suite.id} className="bg-white/[0.03] border border-white/8 rounded-xl overflow-hidden">

              {/* Cover */}
              <div className="aspect-video relative bg-white/5">
                {suite.photo_url ? (
                  <img src={suite.photo_url} alt={suite.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                    <span className="text-white/20 text-2xl">📷</span>
                    <span className="text-white/20 text-xs">Sem foto</span>
                  </div>
                )}
                {!suite.active && (
                  <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                    <span className="text-red-400 text-xs font-medium border border-red-400/40 px-3 py-1 rounded-full">Inativa</span>
                  </div>
                )}
                {suitePhotos.length > 1 && (
                  <span className="absolute bottom-2 right-2 text-[10px] bg-black/60 text-white/50 px-2 py-0.5 rounded-full">
                    {suitePhotos.length} fotos
                  </span>
                )}
              </div>

              <div className="p-3">
                {/* Edit form */}
                {editing === suite.id ? (
                  <div className="space-y-2.5 mb-3">
                    <div>
                      <label className="text-white/30 text-[10px] uppercase tracking-wider block mb-1">Nome</label>
                      <input
                        value={editForm.name}
                        onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/40 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-white/30 text-[10px] uppercase tracking-wider block mb-1">Categoria</label>
                      <select
                        value={editForm.category}
                        onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/40 cursor-pointer"
                      >
                        <option value="">—</option>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-white/30 text-[10px] uppercase tracking-wider block mb-1">Nº do quarto</label>
                      <input
                        type="number"
                        value={editForm.room_number}
                        onChange={e => setEditForm(f => ({ ...f, room_number: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/40 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-white/30 text-[10px] uppercase tracking-wider block mb-1">Descrição</label>
                      <textarea
                        value={editForm.description}
                        onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                        rows={2}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/40 resize-none transition-colors"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(suite.id)}
                        disabled={saving}
                        className="flex-1 py-2 rounded-lg text-xs font-semibold text-black disabled:opacity-50 transition-opacity"
                        style={{ background: 'linear-gradient(135deg, #c8a035, #e8c060)' }}
                      >
                        {saving ? 'Salvando...' : 'Salvar'}
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="px-3 py-2 rounded-lg text-xs text-white/40 border border-white/10 hover:text-white/60 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium">{suite.name}</p>
                      <p className="text-white/40 text-xs">
                        {suite.category ?? '—'}
                        {suite.room_number ? ` · Quarto ${suite.room_number}` : ''}
                      </p>
                      {suite.description && (
                        <p className="text-white/25 text-xs mt-1 line-clamp-2">{suite.description}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <button
                        onClick={() => toggleActive(suite.id, suite.active)}
                        className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                          suite.active
                            ? 'text-green-400 border-green-400/30 hover:text-red-400 hover:border-red-400/30'
                            : 'text-red-400 border-red-400/30 hover:text-green-400 hover:border-green-400/30'
                        }`}
                      >
                        {suite.active ? 'Ativa' : 'Inativa'}
                      </button>
                      <button
                        onClick={() => startEdit(suite)}
                        className="text-[11px] text-white/30 hover:text-white/60 transition-colors"
                      >
                        Editar
                      </button>
                    </div>
                  </div>
                )}

                {/* Thumbnail grid */}
                {editing !== suite.id && suitePhotos.length > 0 && (
                  <div className="grid grid-cols-4 gap-1 mb-3">
                    {suitePhotos.map((photo, idx) => (
                      <div key={photo.id} className="relative group aspect-square rounded-md overflow-hidden bg-white/5">
                        <img src={photo.url} alt="" className="w-full h-full object-cover" />
                        {idx === 0 && (
                          <span className="absolute top-0.5 left-0.5 text-[8px] bg-yellow-500/80 text-black px-1 rounded font-semibold leading-tight">
                            capa
                          </span>
                        )}
                        <button
                          onClick={() => deletePhoto(suite.id, photo)}
                          disabled={deleting === photo.id}
                          className="absolute inset-0 bg-black/65 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-red-400 text-sm font-bold disabled:cursor-wait"
                        >
                          {deleting === photo.id ? '…' : '✕'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload */}
                {editing !== suite.id && (
                  <>
                    <input
                      ref={el => { fileRefs.current[suite.id] = el }}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      className="hidden"
                      onChange={e => {
                        if (e.target.files?.length) uploadPhotos(suite.id, e.target.files)
                        e.target.value = ''
                      }}
                    />
                    <button
                      onClick={() => fileRefs.current[suite.id]?.click()}
                      disabled={uploading === suite.id}
                      className="w-full py-2 rounded-lg text-xs font-medium border border-gold-500/30 text-gold-400/80 hover:bg-gold-500/10 hover:text-gold-400 transition-colors disabled:opacity-40"
                    >
                      {uploading === suite.id
                        ? '↑ Convertendo e enviando…'
                        : suitePhotos.length > 0
                        ? `↑ Adicionar mais fotos (${suitePhotos.length} enviada${suitePhotos.length > 1 ? 's' : ''})`
                        : '↑ Adicionar fotos'}
                    </button>
                    <p className="text-white/15 text-[10px] text-center mt-1">
                      PNG · JPG → convertido para WebP automaticamente
                    </p>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
