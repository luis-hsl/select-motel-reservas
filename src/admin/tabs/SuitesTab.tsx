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
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ name: '', description: '', category: '', room_number: '' })
  const [saving, setSaving] = useState(false)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('suites')
      .select('id,name,description,category,room_number,active,photo_url')
      .order('sort_order')
    setSuites(data ?? [])
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

  async function uploadPhoto(suiteId: string, file: File) {
    setUploading(suiteId)
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${suiteId}.${ext}`

    const { error: upErr } = await supabase.storage
      .from('suite-photos')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (upErr) {
      alert('Erro no upload: ' + upErr.message)
      setUploading(null)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('suite-photos').getPublicUrl(path)
    await supabase.from('suites').update({ photo_url: publicUrl }).eq('id', suiteId)
    setSuites(prev => prev.map(s => s.id === suiteId ? { ...s, photo_url: publicUrl } : s))
    setUploading(null)
  }

  if (loading) return <div className="text-white/30 py-16 text-center text-sm">Carregando...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-white/80 text-sm">{suites.length} suítes</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {suites.map(suite => (
          <div key={suite.id} className="bg-white/[0.03] border border-white/8 rounded-xl overflow-hidden">
            {/* Photo */}
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
                  <span className="text-red-400 text-xs font-medium border border-red-400/40 px-3 py-1 rounded-full">
                    Inativa
                  </span>
                </div>
              )}
            </div>

            <div className="p-3">
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

              {editing !== suite.id && (
                <>
                  <input
                    ref={el => { fileRefs.current[suite.id] = el }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) uploadPhoto(suite.id, file)
                      e.target.value = ''
                    }}
                  />
                  <button
                    onClick={() => fileRefs.current[suite.id]?.click()}
                    disabled={uploading === suite.id}
                    className="w-full py-2 rounded-lg text-xs font-medium border border-gold-500/30 text-gold-400/80 hover:bg-gold-500/10 hover:text-gold-400 transition-colors disabled:opacity-40"
                  >
                    {uploading === suite.id
                      ? '↑ Enviando...'
                      : suite.photo_url
                      ? '↑ Trocar foto'
                      : '↑ Adicionar foto'}
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
