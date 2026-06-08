import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import type { ExperienceItem, ItemCategory } from '../types'

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const CATEGORY_META: Record<ItemCategory, { label: string; icon: string; subtitle: string }> = {
  food:  { label: 'Comida',   icon: '🍽',  subtitle: 'Selecione um item' },
  drink: { label: 'Bebida',   icon: '🥂', subtitle: 'Selecione um item' },
  extra: { label: 'Extras',   icon: '✨', subtitle: 'Opcionais' },
}

const CATEGORIES: ItemCategory[] = ['food', 'drink', 'extra']

/**
 * Step única que consolida Refeição + Bebida + Extras.
 * Comportamento varia pelo `mode`:
 *
 * - MODE PACOTE:
 *   - Itens vêm INCLUSOS no pacote (preço 0 / oculto).
 *   - Cliente só escolhe a VARIANTE dentro de cada categoria (radio).
 *   - Comida e bebida obrigatórias (uma de cada); extras opcionais.
 *
 * - MODE EXPERIÊNCIA:
 *   - Cada item tem preço VISÍVEL.
 *   - Cliente pode escolher múltiplos (checkbox).
 *   - Total atualiza em tempo real.
 *   - Continuar sempre permitido (pode ir só com a suíte).
 */
export default function StepExtras() {
  const { mode, selectedItems, toggleItem, clearItems, setFood, setDrink, food, drink, nextStep, prevStep } = useStore()
  const [items, setItems] = useState<ExperienceItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supa = supabase as any
      const { data } = await supa
        .from('experience_items')
        .select('id, category, label, description, price, photo_url, sort_order')
        .eq('active', true)
        .order('category')
        .order('sort_order')
      if (!cancelled && data) setItems(data as ExperienceItem[])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Modo pacote: mapeia a variante escolhida (food/drink legacy) pro id do item
  const isPackage = mode === 'package'

  const grouped = useMemo(() => {
    const acc: Record<ItemCategory, ExperienceItem[]> = { food: [], drink: [], extra: [] }
    items.forEach((it) => { acc[it.category].push(it) })
    return acc
  }, [items])

  // ── Estado dos selecionados ──
  function isSelected(item: ExperienceItem): boolean {
    if (isPackage) {
      if (item.category === 'food')  return food  === (item.id.replace('food-',  '') as typeof food)
      if (item.category === 'drink') return drink === (item.id.replace('drink-', '') as typeof drink)
      // extras no modo pacote = não tem (incluso no pacote)
      return false
    }
    return selectedItems.some((i) => i.id === item.id)
  }

  function pick(item: ExperienceItem) {
    if (isPackage) {
      // Pacote: troca a variante única dentro da categoria
      if (item.category === 'food') {
        const v = item.id.replace('food-', '') as 'jantar' | 'sushi' | 'pizza' | 'fondue'
        if (v === 'jantar' || v === 'sushi' || v === 'pizza') setFood(v)
      } else if (item.category === 'drink') {
        const v = item.id.replace('drink-', '') as 'vinho' | 'frisante' | 'drinque' | 'champagne'
        if (v === 'vinho' || v === 'frisante' || v === 'drinque') setDrink(v)
      }
      return
    }
    // Experiência: toggle múltiplo
    toggleItem(item)
  }

  // Em modo experiência: total parcial só dos itens (a suíte soma separado)
  const itemsTotal = useMemo(
    () => selectedItems.reduce((s, i) => s + Number(i.price || 0), 0),
    [selectedItems],
  )

  // No modo pacote: comida + bebida obrigatórios pra avançar
  const canContinue = isPackage ? (!!food && !!drink) : true

  if (loading) {
    return (
      <div className="text-gold-700/40 text-sm py-16 text-center">
        Carregando opções…
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={prevStep}
        className="flex items-center gap-1 text-gold-700/60 text-sm mb-6 hover:text-gold-500 transition-colors"
      >
        <span>←</span> Voltar
      </button>

      <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-light mb-2 leading-tight">
        {isPackage ? 'Comida, bebida' : 'Personalize'}<br />
        <span className="gold-gradient font-semibold italic">{isPackage ? 'e extras' : 'sua experiência'}</span>
      </h1>
      <p className="text-gold-700/70 text-sm mb-6 sm:mb-8">
        {isPackage
          ? 'Escolha uma comida e uma bebida do pacote (já incluso). Extras são opcionais.'
          : 'Escolha quantos itens quiser. Cada um soma no valor final.'}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">
        {CATEGORIES.map((cat) => {
          const meta = CATEGORY_META[cat]
          const list = grouped[cat]
          return (
            <section
              key={cat}
              className="rounded-2xl border border-gold-900/30 bg-white/[0.02] p-4"
            >
              <header className="flex items-baseline justify-between gap-2 mb-3 pb-2 border-b border-gold-900/30">
                <h3 className="text-gold-300 font-medium text-sm flex items-center gap-2">
                  <span>{meta.icon}</span> {meta.label}
                </h3>
                <p className="text-gold-700/50 text-[10px] tracking-widest uppercase">
                  {isPackage
                    ? (cat === 'extra' ? 'incluso no pacote' : meta.subtitle)
                    : (cat === 'extra' ? 'opcional' : 'a la carte')}
                </p>
              </header>

              {list.length === 0 ? (
                <p className="text-gold-800/40 text-xs py-6 text-center">Em breve.</p>
              ) : (
                <ul className="space-y-2">
                  {list.map((it) => {
                    const sel = isSelected(it)
                    return (
                      <li key={it.id}>
                        <button
                          type="button"
                          onClick={() => pick(it)}
                          disabled={isPackage && cat === 'extra'}
                          className={[
                            'w-full text-left rounded-xl px-3 py-2.5 transition-colors border',
                            'flex items-start gap-3',
                            sel
                              ? 'border-gold-500/60 bg-gold-500/10'
                              : 'border-white/5 hover:border-gold-700/40 bg-white/[0.015]',
                            isPackage && cat === 'extra' ? 'opacity-40 cursor-not-allowed' : '',
                          ].join(' ')}
                        >
                          {/* selector */}
                          <span
                            className={[
                              'w-4 h-4 rounded-full shrink-0 mt-0.5 border flex items-center justify-center',
                              sel ? 'border-gold-400 bg-gold-400/30' : 'border-gold-800/60',
                            ].join(' ')}
                            aria-hidden
                          >
                            {sel && <span className="w-2 h-2 rounded-full bg-gold-300" />}
                          </span>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="text-sm text-gold-200 truncate">{it.label}</p>
                              {!isPackage && it.price > 0 && (
                                <span className="text-xs text-gold-400 font-semibold tabular-nums shrink-0">
                                  {fmtBRL(it.price)}
                                </span>
                              )}
                            </div>
                            {it.description && (
                              <p className="text-[11px] text-gold-700/60 leading-snug mt-0.5">{it.description}</p>
                            )}
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )
        })}
      </div>

      {/* Total ao vivo (só modo experiência) */}
      {!isPackage && (
        <div className="mt-6 rounded-xl border border-gold-700/40 bg-gold-900/10 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] tracking-widest uppercase text-gold-700/60">Subtotal de itens</p>
            <p className="text-gold-700/40 text-[10px]">A suíte é cobrada à parte no fim.</p>
          </div>
          <span className="font-serif text-2xl font-semibold gold-gradient tabular-nums">
            {fmtBRL(itemsTotal)}
          </span>
        </div>
      )}

      <div className="mt-6 flex gap-3">
        {!isPackage && selectedItems.length > 0 && (
          <button
            onClick={clearItems}
            className="px-4 py-3 rounded-xl text-sm border border-white/10 text-white/50 hover:text-white/80"
          >
            Limpar
          </button>
        )}
        <button
          onClick={() => canContinue && nextStep()}
          disabled={!canContinue}
          className={[
            'flex-1 px-6 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200',
            canContinue
              ? 'bg-gradient-to-r from-gold-700 to-gold-500 text-black hover:from-gold-600 hover:to-gold-400'
              : 'bg-gold-900/20 text-gold-800/40 cursor-not-allowed',
          ].join(' ')}
        >
          Continuar →
        </button>
      </div>
    </div>
  )
}
