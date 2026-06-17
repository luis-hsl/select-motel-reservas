import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

type Promo = {
  id: string
  title: string
  description: string
  photo_url: string | null
  button_text: string
  button_url: string
  active: boolean
  sort_order: number
  created_at: string
}

type EditDraft = {
  title: string
  description: string
  button_text: string
  button_url: string
  active: boolean
}

const EMPTY_DRAFT: EditDraft = {
  title: '',
  description: '',
  button_text: 'Saiba mais',
  button_url: '',
  active: true,
}

export default function PromosTab() {
  const [promos, setPromos]         = useState<Promo[]>([])
  const [loading, setLoading]       = useState(true)
  const [loadError, setLoadError]   = useState<string | null>(null)
  const [editingId, setEditingId]   = useState<string | null>(null)   // null = none, 'new' = new card
  const [draft, setDraft]           = useState<EditDraft>(EMPTY_DRAFT)
  const [saving, setSaving]         = useState(false)
  const [uploading, setUploading]   = useState(false)
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null) // temp publicUrl before save
  const fileRef        = useRef<HTMLInputElement | null>(null)
  const pendingFileRef = useRef<File | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoadError(null)
    const { data, error } = await supabase
      .from('promotions')
      .select('*')
      .order('sort_order')
      .order('created_at')
    if (error) { setLoadError(error.message); setLoading(false); return }
    setPromos(data ?? [])
    setLoading(false)
  }

  function startNew() {
    setDraft(EMPTY_DRAFT)
    setPendingPhoto(null)
    setEditingId('new')
  }

  function startEdit(p: Promo) {
    setDraft({
      title:       p.title,
      description: p.description,
      button_text: p.button_text,
      button_url:  p.button_url,
      active:      p.active,
    })
    setPendingPhoto(null)
    setEditingId(p.id)
  }

  function cancelEdit() {
    setEditingId(null)
    setPendingPhoto(null)
  }

  async function uploadPhoto(promoId: string, file: File): Promise<string | null> {
    const ext  = file.name.split('.').pop() ?? 'jpg'
    const path = `promos/${promoId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from('suite-photos')
      .upload(path, file, { contentType: file.type, upsert: true })
    if (error) { console.error(error); return null }
    const { data: { publicUrl } } = supabase.storage.from('suite-photos').getPublicUrl(path)
    return publicUrl
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)

    // If editing an existing promo, upload immediately; for new, we'll upload on save
    if (editingId && editingId !== 'new') {
      const url = await uploadPhoto(editingId, file)
      if (url) {
        await supabase.from('promotions').update({ photo_url: url }).eq('id', editingId)
        setPromos(prev => prev.map(p => p.id === editingId ? { ...p, photo_url: url } : p))
        setPendingPhoto(url)
      }
    } else {
      // For new promo, store the file temporarily as a data URL for preview
      const reader = new FileReader()
      reader.onload = ev => setPendingPhoto(ev.target?.result as string)
      reader.readAsDataURL(file)
      pendingFileRef.current = file
    }
    setUploading(false)
  }

  async function save() {
    if (!draft.title.trim()) { alert('Informe o título da promoção.'); return }
    setSaving(true)

    if (editingId === 'new') {
      const { data, error } = await supabase
        .from('promotions')
        .insert({
          title:       draft.title.trim(),
          description: draft.description.trim(),
          button_text: draft.button_text.trim() || 'Saiba mais',
          button_url:  draft.button_url.trim(),
          active:      draft.active,
          sort_order:  promos.length,
        })
        .select()
        .single()

      if (error || !data) { alert('Erro ao criar promoção.'); setSaving(false); return }

      // Upload pending file if any
      if (pendingFileRef.current) {
        const url = await uploadPhoto(data.id, pendingFileRef.current)
        if (url) {
          await supabase.from('promotions').update({ photo_url: url }).eq('id', data.id)
          data.photo_url = url
        }
        pendingFileRef.current = null
      }

      setPromos(prev => [...prev, data])
    } else {
      const { error } = await supabase
        .from('promotions')
        .update({
          title:       draft.title.trim(),
          description: draft.description.trim(),
          button_text: draft.button_text.trim() || 'Saiba mais',
          button_url:  draft.button_url.trim(),
          active:      draft.active,
        })
        .eq('id', editingId!)

      if (error) { alert('Erro ao salvar promoção.'); setSaving(false); return }
      setPromos(prev => prev.map(p => p.id === editingId
        ? { ...p, ...draft, photo_url: pendingPhoto ?? p.photo_url }
        : p))
    }

    setSaving(false)
    setPendingPhoto(null)
    setEditingId(null)
  }

  async function deletePromo(id: string) {
    if (!confirm('Excluir esta promoção?')) return
    await supabase.from('promotions').delete().eq('id', id)
    setPromos(prev => prev.filter(p => p.id !== id))
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('promotions').update({ active: !current }).eq('id', id)
    setPromos(prev => prev.map(p => p.id === id ? { ...p, active: !current } : p))
  }

  if (loading) return <div className="text-white/30 py-16 text-center text-sm">Carregando...</div>
  if (loadError) return (
    <div className="py-16 text-center space-y-2">
      <p className="text-red-400/80 text-sm">Erro ao carregar promoções</p>
      <p className="text-white/25 text-xs font-mono">{loadError}</p>
      <button onClick={load} className="mt-2 text-xs text-white/40 underline">Tentar novamente</button>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-white/80 text-sm">{promos.length} promoção{promos.length !== 1 ? 'ões' : ''} cadastrada{promos.length !== 1 ? 's' : ''}</h2>
        {editingId !== 'new' && (
          <button
            onClick={startNew}
            className="text-xs px-4 py-2 rounded-lg border transition-colors"
            style={{ border: '1px solid rgba(201,168,76,0.30)', color: 'rgba(201,168,76,0.80)', background: 'transparent' }}
          >
            + Nova promoção
          </button>
        )}
      </div>

      <div className="space-y-4">
        {/* New promo card */}
        {editingId === 'new' && (
          <PromoEditCard
            draft={draft}
            onChange={setDraft}
            photoPreview={pendingPhoto}
            onPhotoClick={() => fileRef.current?.click()}
            uploading={uploading}
            saving={saving}
            onSave={save}
            onCancel={cancelEdit}
          />
        )}

        {promos.map(p => (
          editingId === p.id ? (
            <PromoEditCard
              key={p.id}
              draft={draft}
              onChange={setDraft}
              photoPreview={pendingPhoto ?? p.photo_url}
              onPhotoClick={() => fileRef.current?.click()}
              uploading={uploading}
              saving={saving}
              onSave={save}
              onCancel={cancelEdit}
            />
          ) : (
            <PromoViewCard
              key={p.id}
              promo={p}
              onEdit={() => startEdit(p)}
              onDelete={() => deletePromo(p.id)}
              onToggle={() => toggleActive(p.id, p.active)}
            />
          )
        ))}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileRef as React.RefObject<HTMLInputElement>}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handlePhotoChange}
      />
    </div>
  )
}

// ── View card ──────────────────────────────────────────────────────────────────

function PromoViewCard({
  promo, onEdit, onDelete, onToggle,
}: {
  promo: Promo
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
}) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl overflow-hidden flex items-center gap-4 px-4 py-3">
      {/* Thumbnail */}
      {promo.photo_url ? (
        <img
          src={promo.photo_url}
          alt=""
          className="w-16 h-10 object-cover rounded-lg border border-white/10 shrink-0"
        />
      ) : (
        <div className="w-16 h-10 rounded-lg bg-white/5 border border-white/[0.08] flex items-center justify-center shrink-0">
          <span className="text-white/20 text-xs">foto</span>
        </div>
      )}

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="text-white/90 text-sm font-medium truncate">{promo.title}</p>
        {promo.description && (
          <p className="text-white/35 text-xs truncate">{promo.description}</p>
        )}
      </div>

      {/* Status + actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onToggle}
          className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
            promo.active
              ? 'text-green-400 border-green-400/30 hover:text-red-400 hover:border-red-400/30'
              : 'text-red-400 border-red-400/30 hover:text-green-400 hover:border-green-400/30'
          }`}
        >
          {promo.active ? 'Ativa' : 'Inativa'}
        </button>
        <button
          onClick={onEdit}
          className="text-xs px-2.5 py-1 rounded-lg border border-white/10 text-white/50 hover:text-white/80 transition-colors"
        >
          Editar
        </button>
        <button
          onClick={onDelete}
          className="text-xs px-2 py-1 rounded-lg border border-red-500/20 text-red-400/50 hover:text-red-400 hover:border-red-500/40 transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

// ── Edit card ──────────────────────────────────────────────────────────────────

function PromoEditCard({
  draft, onChange, photoPreview, onPhotoClick, uploading, saving, onSave, onCancel,
}: {
  draft: EditDraft
  onChange: (d: EditDraft) => void
  photoPreview: string | null
  onPhotoClick: () => void
  uploading: boolean
  saving: boolean
  onSave: () => void
  onCancel: () => void
}) {
  function set(field: keyof EditDraft, value: string | boolean) {
    onChange({ ...draft, [field]: value })
  }

  return (
    <div className="bg-white/[0.03] border border-white/[0.12] rounded-xl overflow-hidden">
      {/* Photo area */}
      <div
        className="relative cursor-pointer group"
        style={{ aspectRatio: '16/9', background: '#0a0a0a' }}
        onClick={onPhotoClick}
      >
        {photoPreview ? (
          <img src={photoPreview} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <span className="text-white/15 text-3xl">+</span>
            <span className="text-white/25 text-xs">Clique para adicionar foto de capa</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          <span className="text-white/0 group-hover:text-white/80 text-xs font-medium transition-colors">
            {uploading ? 'Enviando...' : 'Trocar foto'}
          </span>
        </div>
      </div>

      {/* Fields */}
      <div className="p-4 space-y-3">
        <div>
          <label className="block text-[10px] tracking-widest uppercase text-white/35 mb-1.5">Título *</label>
          <input
            type="text"
            value={draft.title}
            onChange={e => set('title', e.target.value)}
            placeholder="Ex: Happy Hour — 2h pelo preço de 1h"
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/90 placeholder-white/20 outline-none focus:border-white/25 transition-colors"
          />
        </div>

        <div>
          <label className="block text-[10px] tracking-widest uppercase text-white/35 mb-1.5">Descrição</label>
          <textarea
            value={draft.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Detalhes da promoção..."
            rows={3}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/90 placeholder-white/20 outline-none focus:border-white/25 transition-colors resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] tracking-widest uppercase text-white/35 mb-1.5">Texto do botão</label>
            <input
              type="text"
              value={draft.button_text}
              onChange={e => set('button_text', e.target.value)}
              placeholder="Saiba mais"
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/90 placeholder-white/20 outline-none focus:border-white/25 transition-colors"
            />
          </div>
          <div>
            <label className="block text-[10px] tracking-widest uppercase text-white/35 mb-1.5">URL do botão</label>
            <input
              type="url"
              value={draft.button_url}
              onChange={e => set('button_url', e.target.value)}
              placeholder="https://wa.me/..."
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/90 placeholder-white/20 outline-none focus:border-white/25 transition-colors"
            />
          </div>
        </div>

        {/* Active toggle */}
        <label className="flex items-center gap-3 cursor-pointer select-none pt-1">
          <div
            onClick={() => set('active', !draft.active)}
            className={`relative w-9 h-5 rounded-full transition-colors ${draft.active ? 'bg-green-600/70' : 'bg-white/10'}`}
          >
            <div
              className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
              style={{ left: draft.active ? '18px' : '2px' }}
            />
          </div>
          <span className="text-sm text-white/60">{draft.active ? 'Ativa' : 'Inativa'}</span>
        </label>

        {/* Buttons */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onSave}
            disabled={saving || uploading}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #c8a035, #e8c060)', color: '#080502' }}
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2.5 rounded-lg text-sm text-white/40 hover:text-white/70 border border-white/10 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
