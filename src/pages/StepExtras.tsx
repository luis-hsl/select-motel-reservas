import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import type { ExperienceItem, ItemCategory } from '../types'

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Lógica original dos pacotes — quais opções cada um permite.
// Pacote = "experiência pronta", então cada um tem combinações fechadas.
const PACKAGE_FOOD_IDS: Record<string, string[]> = {
  ouro:   ['food-jantar', 'food-sushi'],
  prata:  ['food-jantar', 'food-pizza'],
  bronze: ['food-pizza'],
}
const PACKAGE_DRINK_IDS: Record<string, string[]> = {
  ouro:   ['drink-vinho', 'drink-frisante'],
  prata:  ['drink-vinho', 'drink-frisante'],
  bronze: ['drink-drinque'],
}

/**
 * StepExtras — Step consolidada de Comida + Bebida + Decoração.
 *
 * Direção visual: cards com imagem (estilo cardápio de restaurante premium).
 *
 * MODE PACOTE:
 *   - Comida: radio (1 escolhida, sem preço)
 *   - Bebida: radio (1 escolhida, sem preço)
 *   - Decoração: oculta (já vem inclusa no pacote)
 *
 * MODE EXPERIÊNCIA:
 *   - Comida: toggle múltiplo, preço explícito
 *   - Bebida: toggle múltiplo, preço explícito
 *   - Decoração: radio entre Bronze/Prata/Ouro ou "sem decoração" (opcional)
 */
export default function StepExtras() {
  const { mode, package: pkg, selectedItems, toggleItem, clearItems, setFood, setDrink, food, drink, nextStep, prevStep } = useStore()
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

  const isPackage = mode === 'package'

  const grouped = useMemo(() => {
    const acc: Record<ItemCategory, ExperienceItem[]> = { food: [], drink: [], extra: [] }
    items.forEach((it) => { acc[it.category].push(it) })

    // No modo pacote: restringe food/drink às opções permitidas pelo pacote
    // (mesma lógica do StepRefeicao/StepBebida antigos).
    if (isPackage && pkg?.id) {
      const allowedFood  = PACKAGE_FOOD_IDS[pkg.id]  ?? null
      const allowedDrink = PACKAGE_DRINK_IDS[pkg.id] ?? null
      if (allowedFood)  acc.food  = acc.food.filter(i  => allowedFood.includes(i.id))
      if (allowedDrink) acc.drink = acc.drink.filter(i => allowedDrink.includes(i.id))
    }
    return acc
  }, [items, isPackage, pkg])

  function isSelected(item: ExperienceItem): boolean {
    if (isPackage) {
      if (item.category === 'food')  return food  === (item.id.replace('food-',  '') as typeof food)
      if (item.category === 'drink') return drink === (item.id.replace('drink-', '') as typeof drink)
      return false
    }
    return selectedItems.some((i) => i.id === item.id)
  }

  function pick(item: ExperienceItem) {
    if (isPackage) {
      if (item.category === 'food') {
        const v = item.id.replace('food-', '') as 'jantar' | 'sushi' | 'pizza' | 'fondue'
        if (v === 'jantar' || v === 'sushi' || v === 'pizza') setFood(v)
      } else if (item.category === 'drink') {
        const v = item.id.replace('drink-', '') as 'vinho' | 'frisante' | 'drinque' | 'champagne'
        if (v === 'vinho' || v === 'frisante' || v === 'drinque') setDrink(v)
      }
      return
    }
    toggleItem(item)
  }

  // Decoração no modo experiência funciona como radio: escolhe 1 nível (ou nenhum)
  function pickDecor(item: ExperienceItem | null) {
    if (isPackage) return
    // remove qualquer decoração que já estava selecionada
    selectedItems
      .filter(i => i.category === 'extra' && i.id.startsWith('extra-deco-'))
      .forEach((i) => toggleItem(i))
    // adiciona a nova (se houver)
    if (item) toggleItem(item)
  }

  const selectedDecor = isPackage
    ? null
    : selectedItems.find(i => i.category === 'extra' && i.id.startsWith('extra-deco-'))

  const itemsTotal = useMemo(
    () => selectedItems.reduce((s, i) => s + Number(i.price || 0), 0),
    [selectedItems],
  )

  // Modo pacote: comida + bebida obrigatórios; experiência: sempre pode avançar
  const canContinue = isPackage ? (!!food && !!drink) : true

  if (loading) {
    return (
      <div className="text-gold-700/40 text-sm py-16 text-center">
        Carregando opções…
      </div>
    )
  }

  return (
    <div className="step-in">
      <button
        onClick={prevStep}
        className="flex items-center gap-1 text-gold-700/60 text-sm mb-6 hover:text-gold-500 transition-colors"
      >
        <span>←</span> Voltar
      </button>

      <header className="mb-6 sm:mb-8">
        <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-light leading-tight mb-2">
          {isPackage ? 'Escolha o' : 'Monte sua'}{' '}
          <span className="gold-gradient font-semibold italic">
            {isPackage ? 'cardápio' : 'experiência'}
          </span>
        </h1>
        <p className="text-gold-700/70 text-sm">
          {isPackage
            ? 'Selecione 1 comida e 1 bebida que já vêm no seu pacote.'
            : 'Cada item soma no valor final. Decoração é opcional.'}
        </p>
      </header>

      {/* ─── Comida ─── */}
      <Section
        title="Comida"
        hint={isPackage ? 'inclusa no pacote' : 'a la carte'}
        kicker="01"
      >
        <CardGrid>
          {grouped.food.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              selected={isSelected(item)}
              showPrice={!isPackage}
              onClick={() => pick(item)}
            />
          ))}
        </CardGrid>
      </Section>

      {/* ─── Bebida ─── */}
      <Section
        title="Bebida"
        hint={isPackage ? 'inclusa no pacote' : 'a la carte'}
        kicker="02"
      >
        <CardGrid>
          {grouped.drink.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              selected={isSelected(item)}
              showPrice={!isPackage}
              onClick={() => pick(item)}
            />
          ))}
        </CardGrid>
      </Section>

      {/* ─── Decoração — só no modo experiência (pacote já vem com decoração inclusa) ─── */}
      {!isPackage && grouped.extra.length > 0 && (
        <Section
          title="Decoração"
          hint="opcional"
          kicker="03"
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            {/* Opção "sem decoração" — radio implícito */}
            <DecorCard
              label="Sem decoração"
              tier=""
              price={0}
              selected={!selectedDecor}
              onClick={() => pickDecor(null)}
            />
            {grouped.extra.filter(i => i.id.startsWith('extra-deco-')).map((deco) => (
              <DecorCard
                key={deco.id}
                label={deco.label.replace('Decoração ', '')}
                tier={deco.id.replace('extra-deco-', '')}
                price={deco.price}
                selected={selectedDecor?.id === deco.id}
                onClick={() => pickDecor(deco)}
              />
            ))}
          </div>
        </Section>
      )}

      {/* ─── Subtotal flutuante (experiência) ─── */}
      {!isPackage && (
        <div className="mt-6 sm:mt-8 rounded-xl border border-gold-700/40 bg-gold-900/10 px-4 py-3.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] tracking-widest uppercase text-gold-700/60">Subtotal de itens</p>
            <p className="text-gold-700/40 text-[10px] mt-0.5">A suíte é cobrada à parte no fim.</p>
          </div>
          <span className="font-serif text-2xl font-semibold gold-gradient tabular-nums shrink-0">
            {fmtBRL(itemsTotal)}
          </span>
        </div>
      )}

      {/* ─── Ações ─── */}
      <div className="mt-6 flex gap-3">
        {!isPackage && selectedItems.length > 0 && (
          <button
            onClick={clearItems}
            className="px-4 py-3 rounded-xl text-sm border border-white/10 text-white/50 hover:text-white/80 transition-colors"
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

/* ────────────────────────────────────────────────────────────── */
/*  Subcomponentes                                                */
/* ────────────────────────────────────────────────────────────── */

function Section({
  title, hint, kicker, children,
}: {
  title: string; hint: string; kicker: string; children: React.ReactNode
}) {
  return (
    <section className="mb-7 sm:mb-9">
      <header className="flex items-baseline justify-between gap-3 mb-3 sm:mb-4">
        <div className="flex items-baseline gap-3">
          <span className="font-serif italic text-gold-600/60 text-sm tabular-nums">{kicker}.</span>
          <h2 className="font-serif italic text-gold-200 text-xl sm:text-2xl">{title}</h2>
        </div>
        <span className="text-[9px] tracking-[0.35em] uppercase text-gold-700/40 shrink-0">
          {hint}
        </span>
      </header>
      <span className="block h-px w-full bg-gradient-to-r from-gold-700/30 via-transparent to-transparent mb-4" />
      {children}
    </section>
  )
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
      {children}
    </div>
  )
}

function ItemCard({
  item, selected, showPrice, onClick,
}: {
  item: ExperienceItem
  selected: boolean
  showPrice: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={[
        'group relative aspect-[3/4] rounded-xl overflow-hidden border outline-none',
        'transition-all duration-300 active:scale-[0.97] focus-visible:ring-1 focus-visible:ring-gold-500',
        selected
          ? 'border-gold-400 shadow-lg shadow-gold-500/20'
          : 'border-gold-900/40 hover:border-gold-700/70',
      ].join(' ')}
    >
      {/* Foto background */}
      {item.photo_url ? (
        <img
          src={item.photo_url}
          alt={item.label}
          loading="lazy"
          decoding="async"
          className={[
            'absolute inset-0 w-full h-full object-cover transition-all duration-500',
            selected ? 'scale-105' : 'scale-100 group-hover:scale-105',
          ].join(' ')}
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'radial-gradient(ellipse at center, rgba(201,168,76,0.18) 0%, #0a0805 70%)' }}
        >
          <span className="font-serif italic text-gold-700/50 text-3xl">✦</span>
        </div>
      )}

      {/* Overlay degradê preto pra leitura */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: selected
            ? 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.35) 55%, rgba(201,168,76,0.10) 100%)'
            : 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.40) 55%, rgba(0,0,0,0.10) 100%)',
        }}
      />

      {/* Check indicator */}
      <span
        aria-hidden
        className={[
          'absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300',
          selected
            ? 'bg-gold-400 scale-100 opacity-100'
            : 'bg-black/60 border border-gold-700/40 scale-90 opacity-70',
        ].join(' ')}
      >
        {selected ? (
          <svg viewBox="0 0 14 14" className="w-3.5 h-3.5 text-black" fill="none">
            <path d="M3 7l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <span className="w-1.5 h-1.5 rounded-full bg-gold-700/50" />
        )}
      </span>

      {/* Conteúdo inferior */}
      <div className="absolute inset-x-0 bottom-0 p-2.5 sm:p-3 text-left">
        <p className="font-serif italic text-gold-100 text-base sm:text-lg leading-tight truncate">
          {item.label}
        </p>
        {item.description && (
          <p className="text-[10px] sm:text-[11px] text-gold-300/65 leading-snug mt-0.5 line-clamp-2 hidden sm:block">
            {item.description}
          </p>
        )}
        {showPrice && item.price > 0 && (
          <p className="mt-1.5 text-xs font-semibold text-gold-300 tabular-nums">
            {fmtBRL(item.price)}
          </p>
        )}
      </div>
    </button>
  )
}

function DecorCard({
  label, tier, price, selected, onClick,
}: {
  label: string
  tier: string  // 'bronze' | 'prata' | 'ouro' | '' (sem decoração)
  price: number
  selected: boolean
  onClick: () => void
}) {
  const accent = tier === 'ouro'   ? '#fcd34d'
               : tier === 'prata'  ? '#d1d5db'
               : tier === 'bronze' ? '#b07a3c'
               :                     'rgba(154,125,10,0.5)'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={[
        'relative rounded-xl overflow-hidden border outline-none px-3 py-3 sm:py-4',
        'transition-all duration-300 active:scale-[0.97]',
        selected
          ? 'border-gold-400'
          : 'border-gold-900/40 hover:border-gold-700/70',
      ].join(' ')}
      style={{
        background: selected
          ? `radial-gradient(ellipse at top, ${accent}22 0%, transparent 65%), #0a0805`
          : 'linear-gradient(180deg, #0a0805 0%, #060403 100%)',
      }}
    >
      {/* Ornamento topo (faz a hierarquia visual entre bronze/prata/ouro) */}
      <span
        aria-hidden
        className="block h-px mb-2.5"
        style={{
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
          width: tier === 'ouro' ? '80%' : tier === 'prata' ? '60%' : tier === 'bronze' ? '40%' : '20%',
          margin: '0 auto',
          marginBottom: '10px',
        }}
      />

      {tier ? (
        <p className="font-serif italic text-center text-base sm:text-lg leading-none" style={{ color: accent }}>
          {label}
        </p>
      ) : (
        <p className="text-center text-[11px] tracking-[0.25em] uppercase text-gold-700/55 leading-none">
          {label}
        </p>
      )}

      {price > 0 ? (
        <p className="mt-1.5 text-center text-[11px] font-semibold text-gold-300/85 tabular-nums">
          {`+ ${price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}
        </p>
      ) : (
        <p className="mt-1.5 text-center text-[10px] text-gold-700/40">—</p>
      )}

      {selected && (
        <span
          aria-hidden
          className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-gold-400 flex items-center justify-center"
        >
          <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 text-black" fill="none">
            <path d="M2 5l2 2 4-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </button>
  )
}
