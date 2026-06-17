import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import { SUITE_CATEGORIES } from '../data/suiteCategories'
import type { ExperienceItem, ItemCategory } from '../types'

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

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

const DECOR_BY_SUITE_TIER: Record<string, string[]> = {
  bronze: ['extra-deco-bronze', 'extra-deco-prata'],
  prata:  ['extra-deco-prata', 'extra-deco-ouro'],
  ouro:   ['extra-deco-ouro'],
}

const FOOD_NOTA: Record<string, string> = {
  jantar: 'O jantar inclui entrada com tábua de frios: salame, lombo, queijo, amendoim e azeitonas.',
  sushi:  'No sushi o casal ganha uma barca de combinado premium servida diretamente para vocês.',
}

const PRATOS = [
  { id: 'risoto',      label: 'Risoto de bacon com queijo Brie' },
  { id: 'rigatone',   label: 'Rigatone de cogumelos com bechamel de dois queijos' },
  { id: 'mousseline', label: 'Mousseline de batatas com filé mignon e legumes saltados' },
]

export default function StepExtras() {
  const {
    mode, package: pkg, suite, suiteCategory, selectedItems, toggleItem, clearItems,
    setFood, setDrink, food, drink,
    jantarPrato, jantarHorario, setJantarPrato, setJantarHorario,
    fondueHorario, setFondueHorario,
    checkIn, type,
    totalAmount,
    nextStep, prevStep,
  } = useStore()

  const [items, setItems]   = useState<ExperienceItem[]>([])
  const [opted, setOpted]   = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
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
    items.forEach(it => { acc[it.category].push(it) })
    if (isPackage && pkg?.id) {
      const af = PACKAGE_FOOD_IDS[pkg.id]  ?? null
      const ad = PACKAGE_DRINK_IDS[pkg.id] ?? null
      if (af) acc.food  = acc.food.filter(i  => af.includes(i.id))
      if (ad) acc.drink = acc.drink.filter(i => ad.includes(i.id))
    }
    return acc
  }, [items, isPackage, pkg])

  function isSelected(item: ExperienceItem): boolean {
    if (isPackage) {
      if (item.category === 'food')  return food  === (item.id.replace('food-',  '') as typeof food)
      if (item.category === 'drink') return drink === (item.id.replace('drink-', '') as typeof drink)
    }
    return selectedItems.some(i => i.id === item.id)
  }

  function pick(item: ExperienceItem) {
    if (isPackage) {
      if (item.category === 'food') {
        const v = item.id.replace('food-', '') as 'jantar' | 'sushi' | 'pizza'
        if (v === 'jantar' || v === 'sushi' || v === 'pizza') setFood(v)
      } else if (item.category === 'drink') {
        const v = item.id.replace('drink-', '') as 'vinho' | 'frisante' | 'drinque' | 'champagne'
        if (v === 'vinho' || v === 'frisante' || v === 'drinque') setDrink(v)
      }
      return
    }
    toggleItem(item)
  }

  function pickDecor(item: ExperienceItem) {
    const existing = selectedItems.filter(i => i.category === 'extra' && i.id.startsWith('extra-deco-'))
    const wasSelected = existing.some(i => i.id === item.id)
    existing.forEach(i => toggleItem(i))
    if (!wasSelected) toggleItem(item)
  }

  const selectedDecor = selectedItems.find(i => i.category === 'extra' && i.id.startsWith('extra-deco-'))

  const itemsTotal = useMemo(
    () => selectedItems.reduce((s, i) => s + Number(i.price || 0), 0),
    [selectedItems],
  )

  const allowedDecorIds = useMemo(() => {
    if (isPackage || !suite) return null
    const allowed = new Set<string>()
    ;(suite.packageIds ?? []).forEach(tier => {
      (DECOR_BY_SUITE_TIER[tier] ?? []).forEach(id => allowed.add(id))
    })
    return allowed
  }, [isPackage, suite])

  const decoItems = useMemo(
    () => grouped.extra
      .filter(i => i.id.startsWith('extra-deco-'))
      .filter(i => !allowedDecorIds || allowedDecorIds.has(i.id)),
    [grouped.extra, allowedDecorIds],
  )

  useEffect(() => {
    if (!allowedDecorIds) return
    const sel = selectedItems.find(i => i.category === 'extra' && i.id.startsWith('extra-deco-'))
    if (sel && !allowedDecorIds.has(sel.id)) toggleItem(sel)
  }, [allowedDecorIds, selectedItems, toggleItem])

  const jantarSelected = isPackage && food === 'jantar' && (pkg?.id === 'ouro' || pkg?.id === 'prata')
  const sushiSelected  = isPackage && food === 'sushi'
  const pizzaSelected  = isPackage && food === 'pizza'
  const showTimePicker = jantarSelected || sushiSelected || pizzaSelected

  const fondueItem   = items.find(i => i.id === 'food-fondue') ?? null
  const fondueInCart = selectedItems.some(i => i.id === 'food-fondue')

  const dynamicTimeSlots = useMemo(() => {
    if (!checkIn || !type) return []
    const durationHours = type === 'period' ? 2 : 12
    const checkOut = new Date(checkIn)
    checkOut.setHours(checkOut.getHours() + durationHours)
    const slots: string[] = []
    const cur = new Date(checkIn)
    while (cur < checkOut) {
      slots.push(
        String(cur.getHours()).padStart(2, '0') + ':' +
        String(cur.getMinutes()).padStart(2, '0'),
      )
      cur.setMinutes(cur.getMinutes() + 30)
    }
    return slots
  }, [checkIn, type])

  const canContinue = isPackage
    ? (!!food && !!drink &&
       (!jantarSelected || (!!jantarPrato && !!jantarHorario)) &&
       (!sushiSelected  || !!jantarHorario) &&
       (!pizzaSelected  || !!jantarHorario) &&
       (!fondueInCart   || !!fondueHorario))
    : true

  if (loading) {
    return (
      <div className="text-gold-700/40 text-sm py-16 text-center">
        Carregando opções…
      </div>
    )
  }

  // Tela de opt-in (apenas no modo suite — no experience vai direto pros itens)
  if (mode === 'suite' && !opted) {
    return (
      <div>
        <button
          onClick={prevStep}
          className="flex items-center gap-1 text-gold-700/60 text-sm mb-8 hover:text-gold-500 transition-colors"
        >
          <span>←</span> Voltar
        </button>

        <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-light mb-3 leading-tight">
          Adicionar algo<br />
          <span className="gold-gradient font-semibold italic pr-1">à reserva?</span>
        </h1>
        <p className="text-gold-700/60 text-sm mb-10">
          Comidas, bebidas e extras opcionais para tornar a experiência ainda mais especial.
        </p>

        <div className="flex flex-col gap-3 max-w-md">
          <button
            onClick={() => setOpted(true)}
            className="flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
            style={{
              background: 'rgba(201,168,76,0.07)',
              border: '1px solid rgba(201,168,76,0.28)',
            }}
          >
            <div
              className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(201,168,76,0.14)' }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 2v10M2 7h10" stroke="rgba(223,192,122,0.9)" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-sm" style={{ color: 'rgba(228,218,198,0.9)' }}>Ver bebidas, comidas e extras</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'rgba(200,168,100,0.45)' }}>Veja o que temos disponível</p>
            </div>
          </button>

          <button
            onClick={nextStep}
            className="flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition-all duration-200 active:scale-[0.98]"
            style={{ border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div
              className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.03)' }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 7h8M8 4l3 3-3 3" stroke="rgba(180,160,120,0.5)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'rgba(180,160,120,0.55)' }}>Não, obrigado. Continuar</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'rgba(160,140,100,0.35)' }}>Ir direto para o pagamento</p>
            </div>
          </button>
        </div>
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

      <header className="mb-8 sm:mb-10">
        <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-light leading-tight mb-2">
          {isPackage ? 'Escolha o' : 'Monte sua'}{' '}
          <span className="gold-gradient font-semibold italic">
            {isPackage ? 'cardápio' : 'experiência'}
          </span>
        </h1>
        <p className="text-sm" style={{ color: 'rgba(200,168,100,0.55)' }}>
          {isPackage
            ? 'Selecione 1 comida e 1 bebida inclusos no seu pacote.'
            : 'Selecione o que quiser. Pode combinar ou avançar sem adicionar nada.'}
        </p>
      </header>

      {/* Comida */}
      <Section title="Comida" hint={isPackage ? 'inclusa' : 'opcional'} kicker="01">
        {grouped.food.map(item => (
          <MenuCard
            key={item.id}
            item={item}
            selected={isSelected(item)}
            showPrice={!isPackage}
            onClick={() => pick(item)}
          />
        ))}
      </Section>

      {/* Nota jantar / sushi */}
      {isPackage && pkg?.id === 'ouro' && food && FOOD_NOTA[food] && (
        <div
          className="mb-8 flex items-start gap-3 px-4 py-3.5 rounded-2xl"
          style={{
            background: 'rgba(201,168,76,0.05)',
            border: '1px solid rgba(201,168,76,0.18)',
          }}
        >
          <div
            className="w-4 h-4 shrink-0 mt-0.5 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(201,168,76,0.18)' }}
          >
            <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" style={{ color: 'rgba(201,168,76,0.8)' }}>
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'rgba(220,185,110,0.75)' }}>
            {FOOD_NOTA[food]}
          </p>
        </div>
      )}

      {/* Escolha do prato */}
      {jantarSelected && (
        <div className="mb-8">
          <SubHeader title="Escolha o prato" tag="obrigatório" />
          <div className="space-y-2">
            {PRATOS.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setJantarPrato(p.id)}
                className="w-full text-left px-4 py-3.5 rounded-2xl transition-all duration-200 active:scale-[0.99] outline-none flex items-center gap-3"
                style={{
                  background: jantarPrato === p.id ? 'rgba(201,168,76,0.09)' : 'transparent',
                  border: `1px solid ${jantarPrato === p.id ? 'rgba(201,168,76,0.45)' : 'rgba(201,168,76,0.10)'}`,
                }}
              >
                <span
                  className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center transition-all"
                  style={{
                    border: `1.5px solid ${jantarPrato === p.id ? 'rgba(201,168,76,0.9)' : 'rgba(201,168,76,0.25)'}`,
                    background: jantarPrato === p.id ? 'rgba(201,168,76,0.9)' : 'transparent',
                  }}
                >
                  {jantarPrato === p.id && <span className="w-1.5 h-1.5 rounded-full bg-black" />}
                </span>
                <span
                  className="text-sm leading-snug"
                  style={{ color: jantarPrato === p.id ? 'rgba(240,200,110,0.92)' : 'rgba(200,168,100,0.55)' }}
                >
                  {p.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Horário */}
      {showTimePicker && (
        <div className="mb-8">
          <SubHeader
            title={sushiSelected ? 'Horário da barca' : pizzaSelected ? 'Horário da pizza' : 'Horário do jantar'}
            tag={checkIn ? `chegada às ${checkIn.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'obrigatório'}
          />
          {dynamicTimeSlots.length === 0 ? (
            <p className="text-xs" style={{ color: 'rgba(200,168,100,0.40)' }}>Selecione um horário de chegada primeiro.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {dynamicTimeSlots.map(slot => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setJantarHorario(slot)}
                  className="px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.97]"
                  style={{
                    background: jantarHorario === slot ? 'rgba(201,168,76,0.14)' : 'transparent',
                    border: `1px solid ${jantarHorario === slot ? 'rgba(201,168,76,0.55)' : 'rgba(201,168,76,0.12)'}`,
                    color: jantarHorario === slot ? 'rgba(240,200,110,0.95)' : 'rgba(200,168,100,0.50)',
                  }}
                >
                  {slot}
                </button>
              ))}
            </div>
          )}
          <p className="mt-2.5 text-[10px]" style={{ color: 'rgba(200,168,100,0.30)' }}>
            Horário de Brasília. Confirmaremos pelo WhatsApp.
          </p>
        </div>
      )}

      {/* Bebida */}
      <Section title="Bebida" hint={isPackage ? 'inclusa' : 'opcional'} kicker="02">
        {grouped.drink.map(item => (
          <MenuCard
            key={item.id}
            item={item}
            selected={isSelected(item)}
            showPrice={!isPackage}
            onClick={() => pick(item)}
          />
        ))}
      </Section>

      {/* Fondue */}
      {isPackage && fondueItem && (
        <Section title="Fondue" hint="opcional" kicker="03">
          <MenuCard
            item={fondueItem}
            selected={fondueInCart}
            showPrice={false}
            onClick={() => {
              if (fondueInCart) setFondueHorario(null)
              toggleItem(fondueItem)
            }}
          />

          {fondueInCart && (
            <div className="mt-5">
              <SubHeader
                title="Horário do fondue"
                tag={checkIn ? `chegada às ${checkIn.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'obrigatório'}
              />
              {dynamicTimeSlots.length === 0 ? (
                <p className="text-xs" style={{ color: 'rgba(200,168,100,0.40)' }}>Selecione um horário de chegada primeiro.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {dynamicTimeSlots.map(slot => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setFondueHorario(slot)}
                      className="px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.97]"
                      style={{
                        background: fondueHorario === slot ? 'rgba(201,168,76,0.14)' : 'transparent',
                        border: `1px solid ${fondueHorario === slot ? 'rgba(201,168,76,0.55)' : 'rgba(201,168,76,0.12)'}`,
                        color: fondueHorario === slot ? 'rgba(240,200,110,0.95)' : 'rgba(200,168,100,0.50)',
                      }}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-2.5 text-[10px]" style={{ color: 'rgba(200,168,100,0.30)' }}>
                Horário de Brasília. Confirmaremos pelo WhatsApp.
              </p>
            </div>
          )}
        </Section>
      )}

      {/* Decoração */}
      {!isPackage && decoItems.length > 0 && (
        <Section title="Decoração" hint="opcional" kicker="03">
          {decoItems.map(deco => (
            <MenuCard
              key={deco.id}
              item={deco}
              selected={selectedDecor?.id === deco.id}
              showPrice={true}
              onClick={() => pickDecor(deco)}
            />
          ))}
        </Section>
      )}

      {/* Subtotal completo: suíte + itens */}
      {!isPackage && (() => {
        const catDef = suiteCategory ? SUITE_CATEGORIES.find(c => c.dbCategory === suiteCategory) : null
        const suitePrice = (() => {
          if (mode === 'suite' && catDef) {
            return type === 'oneHour'   ? (catDef.prices.oneHour   ?? 0) :
                   type === 'period'    ? catDef.prices.period :
                   type === 'overnight' ? catDef.prices.overnight :
                   type === 'diaria'    ? catDef.prices.diaria : 0
          }
          if (mode === 'experience' && suite) {
            return type === 'period'
              ? Number(suite.price_period_alacarte ?? 0)
              : Number(suite.price_overnight_alacarte ?? 0)
          }
          return 0
        })()
        const grandTotal = totalAmount()
        const typeLabel = type === 'oneHour' ? '1h' : type === 'period' ? 'Período' : type === 'overnight' ? 'Pernoite' : type === 'diaria' ? 'Diária' : ''

        return (
          <div
            className="mt-6 sm:mt-8 rounded-2xl px-5 py-4"
            style={{ background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.14)' }}
          >
            {/* Linha suíte */}
            {suitePrice > 0 && (
              <div className="flex items-center justify-between gap-4 mb-2">
                <span className="text-xs" style={{ color: 'rgba(200,168,100,0.55)' }}>
                  Suíte{typeLabel ? ` · ${typeLabel}` : ''}
                </span>
                <span className="text-xs tabular-nums" style={{ color: 'rgba(200,168,100,0.55)', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtBRL(suitePrice)}
                </span>
              </div>
            )}
            {/* Linha itens */}
            {itemsTotal > 0 && (
              <div className="flex items-center justify-between gap-4 mb-2">
                <span className="text-xs" style={{ color: 'rgba(200,168,100,0.55)' }}>
                  {selectedItems.length} {selectedItems.length === 1 ? 'item' : 'itens'} selecionados
                </span>
                <span className="text-xs tabular-nums" style={{ color: 'rgba(200,168,100,0.55)', fontVariantNumeric: 'tabular-nums' }}>
                  + {fmtBRL(itemsTotal)}
                </span>
              </div>
            )}
            {/* Divider */}
            {suitePrice > 0 && (
              <div className="mb-3" style={{ height: '1px', background: 'rgba(201,168,76,0.12)' }} />
            )}
            {/* Total */}
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-[10px] uppercase tracking-widest" style={{ color: 'rgba(201,168,76,0.45)' }}>Total</p>
              <span
                className="gold-gradient shrink-0"
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: '1.65rem',
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1,
                }}
              >
                {fmtBRL(grandTotal)}
              </span>
            </div>
          </div>
        )
      })()}

      {/* Ações */}
      <div className="mt-6 flex gap-3">
        {!isPackage && selectedItems.length > 0 && (
          <button
            onClick={clearItems}
            className="px-4 py-3 rounded-xl text-sm transition-colors"
            style={{ border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.35)' }}
          >
            Limpar
          </button>
        )}
        <button
          onClick={() => { if (!isPackage || canContinue) nextStep() }}
          disabled={isPackage && !canContinue}
          className="flex-1 px-6 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200"
          style={{
            background: (!isPackage || canContinue)
              ? 'linear-gradient(135deg, rgba(184,151,90,0.9), rgba(223,192,122,0.95), rgba(184,151,90,0.9))'
              : 'rgba(201,168,76,0.08)',
            color: (!isPackage || canContinue) ? '#080502' : 'rgba(201,168,76,0.25)',
            cursor: (!isPackage || canContinue) ? 'pointer' : 'not-allowed',
          }}
        >
          Continuar →
        </button>
      </div>
    </div>
  )
}

/* ── Subcomponentes ─────────────────────────────────────────── */

function Section({ title, hint, kicker, children }: {
  title: string; hint: string; kicker: string; children: React.ReactNode
}) {
  return (
    <section className="mb-8 sm:mb-10">
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] font-bold tabular-nums" style={{ color: 'rgba(201,168,76,0.30)', letterSpacing: '0.1em' }}>
            {kicker}
          </span>
          <h2 className="font-serif font-light text-xl sm:text-2xl" style={{ color: 'rgba(228,218,198,0.88)' }}>
            {title}
          </h2>
        </div>
        <span className="text-[9px] tracking-[0.35em] uppercase shrink-0" style={{ color: 'rgba(201,168,76,0.30)' }}>
          {hint}
        </span>
      </header>
      <div className="flex flex-col gap-2">
        {children}
      </div>
    </section>
  )
}

function SubHeader({ title, tag }: { title: string; tag: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="font-serif font-light text-base sm:text-lg" style={{ color: 'rgba(228,218,198,0.80)' }}>
        {title}
      </h3>
      <span className="text-[9px] tracking-[0.3em] uppercase shrink-0" style={{ color: 'rgba(201,168,76,0.35)' }}>
        {tag}
      </span>
    </div>
  )
}

function MenuCard({ item, selected, showPrice, onClick }: {
  item: ExperienceItem; selected: boolean; showPrice: boolean; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="w-full text-left outline-none transition-all duration-200 active:scale-[0.99] flex items-center gap-4 px-4 py-3.5 rounded-2xl"
      style={{
        background: selected ? 'rgba(201,168,76,0.07)' : 'transparent',
        border: `1px solid ${selected ? 'rgba(201,168,76,0.38)' : 'rgba(201,168,76,0.09)'}`,
      }}
    >
      {/* Foto */}
      <div
        className="shrink-0 rounded-xl overflow-hidden"
        style={{ width: '3.5rem', height: '3.5rem' }}
      >
        {item.photo_url ? (
          <img
            src={item.photo_url}
            alt={item.label}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: 'radial-gradient(ellipse, rgba(201,168,76,0.14), #080604)' }}
          >
            <span className="font-serif" style={{ color: 'rgba(201,168,76,0.30)', fontSize: '1.3rem' }}>✦</span>
          </div>
        )}
      </div>

      {/* Texto */}
      <div className="flex-1 min-w-0">
        <p className="font-serif text-sm sm:text-base leading-tight" style={{ color: selected ? 'rgba(240,218,168,0.95)' : 'rgba(218,198,158,0.82)' }}>
          {item.label}
        </p>
        {item.description && (
          <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'rgba(200,168,100,0.42)' }}>
            {item.description}
          </p>
        )}
        {showPrice && item.price > 0 && (
          <p className="mt-1 text-[11px] font-semibold tabular-nums" style={{ color: selected ? 'rgba(223,192,122,0.80)' : 'rgba(201,168,76,0.45)' }}>
            {fmtBRL(item.price)}
          </p>
        )}
      </div>

      {/* Check */}
      <div
        className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-all duration-200"
        style={{
          background: selected ? 'rgba(201,168,76,0.95)' : 'transparent',
          border: selected ? 'none' : '1px solid rgba(201,168,76,0.20)',
        }}
      >
        {selected && (
          <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none">
            <path d="M2 6l3 3 5-5" stroke="#080502" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
    </button>
  )
}

