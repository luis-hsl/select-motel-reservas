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

// Decoração permitida por tier da suíte (modo experiência).
// A suíte carrega seu pacote em `packageIds` — o tamanho dela define até onde
// a decoração pode "subir": decoração Ouro num quarto Bronze pequeno fica
// exagerada, então cada tier libera a própria decoração + um nível acima.
//   bronze → bronze, prata    prata → prata, ouro    ouro → só ouro
const DECOR_BY_SUITE_TIER: Record<string, string[]> = {
  bronze: ['extra-deco-bronze', 'extra-deco-prata'],
  prata:  ['extra-deco-prata', 'extra-deco-ouro'],
  ouro:   ['extra-deco-ouro'],
}

const FOOD_NOTA: Record<string, { icon: 'check' | 'warn'; text: string }> = {
  jantar: { icon: 'check', text: 'O jantar inclui entrada com tábua de frios: salame, lombo, queijo, amendoim e azeitonas.' },
  sushi:  { icon: 'check', text: 'No sushi o casal ganha uma barca de combinado premium servida diretamente para vocês.' },
}

const PRATOS = [
  { id: 'risoto', label: 'Risoto de bacon com queijo Brie' },
  { id: 'rigatone', label: 'Rigatone de cogumelos com bechamel de dois queijos' },
  { id: 'mousseline', label: 'Mousseline de batatas com filé mignon e legumes saltados' },
]


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
  const {
    mode, package: pkg, suite, selectedItems, toggleItem, clearItems,
    setFood, setDrink, food, drink,
    jantarPrato, jantarHorario, setJantarPrato, setJantarHorario,
    fondueHorario, setFondueHorario,
    checkIn, type,
    nextStep, prevStep,
  } = useStore()
  const [items, setItems] = useState<ExperienceItem[]>([])
  // Nos modos experience/suite mostra primeiro uma tela de opt-in
  const [opted, setOpted] = useState(false)
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
      // extra/decoração em modo pacote também usa selectedItems
    }
    return selectedItems.some((i) => i.id === item.id)
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

  // Radio de decoração: troca o nível ou deseleciona (pacote = opcional, experiência = obrigatória)
  function pickDecor(item: ExperienceItem | null) {
    const existing = selectedItems.filter(i => i.category === 'extra' && i.id.startsWith('extra-deco-'))
    const wasSelected = existing.some(i => i.id === item?.id)
    existing.forEach(i => toggleItem(i))
    if (item && !wasSelected) toggleItem(item)
  }

  const selectedDecor = selectedItems.find(i => i.category === 'extra' && i.id.startsWith('extra-deco-'))

  const itemsTotal = useMemo(
    () => selectedItems.reduce((s, i) => s + Number(i.price || 0), 0),
    [selectedItems],
  )

  // Decorações liberadas pelo tier da suíte escolhida (modo experiência).
  // null = sem restrição (modo pacote ou suíte ainda não escolhida).
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

  // Se o cliente voltou e trocou pra uma suíte que não permite a decoração já
  // marcada, deseleciona pra não enviar uma combinação inválida.
  useEffect(() => {
    if (!allowedDecorIds) return
    const sel = selectedItems.find(i => i.category === 'extra' && i.id.startsWith('extra-deco-'))
    if (sel && !allowedDecorIds.has(sel.id)) toggleItem(sel)
  }, [allowedDecorIds, selectedItems, toggleItem])

  const jantarSelected = isPackage && food === 'jantar' && (pkg?.id === 'ouro' || pkg?.id === 'prata')
  const sushiSelected  = isPackage && food === 'sushi'
  const pizzaSelected  = isPackage && food === 'pizza'
  const showTimePicker = jantarSelected || sushiSelected || pizzaSelected

  // Fondue: seção independente, toggle via selectedItems
  const fondueItem   = items.find(i => i.id === 'food-fondue') ?? null
  const fondueInCart = selectedItems.some(i => i.id === 'food-fondue')

  // Gera slots de 30 min entre check-in e check-out
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

  // Modo pacote: comida + bebida obrigatórios; jantar → prato + horário; sushi/pizza → horário
  //   fondue opcional, mas se selecionado exige horário
  // Modo experiência: decoração obrigatória (se existir alguma opção disponível)
  const canContinue = isPackage
    ? (!!food && !!drink &&
       (!jantarSelected || (!!jantarPrato && !!jantarHorario)) &&
       (!sushiSelected  || !!jantarHorario) &&
       (!pizzaSelected  || !!jantarHorario) &&
       (!fondueInCart   || !!fondueHorario))
    : (decoItems.length === 0 || !!selectedDecor)

  if (loading) {
    return (
      <div className="text-gold-700/40 text-sm py-16 text-center">
        Carregando opções…
      </div>
    )
  }

  // Tela de opt-in para experience / suite (pacote sempre mostra comida+bebida)
  if (!isPackage && !opted) {
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
        <p className="text-gold-700/70 text-sm mb-10">
          Comidas, bebidas e extras opcionais para tornar a experiência ainda mais especial.
        </p>

        <div className="flex flex-col gap-4 max-w-md">
          <button
            onClick={() => setOpted(true)}
            className="flex items-center gap-4 px-6 py-5 rounded-2xl text-left transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
            style={{
              background: 'rgba(201,168,76,0.08)',
              border: '1px solid rgba(201,168,76,0.3)',
            }}
          >
            <span
              className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-xl"
              style={{ background: 'rgba(201,168,76,0.15)', color: '#f5d87a' }}
            >
              +
            </span>
            <div>
              <p className="text-gold-200 font-semibold text-base">Adicionar bebidas, comidas e extras</p>
              <p className="text-gold-700/60 text-sm mt-0.5">Veja o que temos disponível para você</p>
            </div>
          </button>

          <button
            onClick={nextStep}
            className="flex items-center gap-4 px-6 py-5 rounded-2xl text-left transition-all duration-200 hover:bg-white/5 active:scale-[0.98]"
            style={{ border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <span
              className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(180,160,120,0.6)' }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            <div>
              <p className="text-gold-400/70 font-medium text-base">Não, obrigado — continuar</p>
              <p className="text-gold-800/50 text-sm mt-0.5">Ir direto para o pagamento</p>
            </div>
          </button>
        </div>
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
            : 'Selecione comida, bebida e decoração. Decoração é obrigatória.'}
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

      {/* Nota jantar/sushi — só pacote ouro */}
      {isPackage && pkg?.id === 'ouro' && food && FOOD_NOTA[food] && (() => {
        const nota = FOOD_NOTA[food]
        return (
          <div
            className="mb-7 sm:mb-9 -mt-4 flex items-start gap-2.5 px-4 py-3 rounded-xl"
            style={{
              background: nota.icon === 'check' ? 'rgba(201,168,76,0.06)' : 'rgba(180,100,30,0.08)',
              border: nota.icon === 'check' ? '1px solid rgba(201,168,76,0.22)' : '1px solid rgba(200,120,40,0.28)',
            }}
          >
            {nota.icon === 'check' ? (
              <svg className="w-3.5 h-3.5 shrink-0 mt-[2px]" viewBox="0 0 14 14" fill="none" style={{ color: 'rgba(201,168,76,0.7)' }}>
                <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1" />
                <path d="M4.5 7l2 2 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 shrink-0 mt-[2px]" viewBox="0 0 14 14" fill="none" style={{ color: 'rgba(210,140,60,0.8)' }}>
                <path d="M7 1.5L12.5 12H1.5L7 1.5z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
                <path d="M7 5.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <circle cx="7" cy="10" r="0.6" fill="currentColor" />
              </svg>
            )}
            <p className="text-xs leading-relaxed" style={{ color: nota.icon === 'check' ? 'rgba(220,185,110,0.85)' : 'rgba(220,160,80,0.85)' }}>
              {nota.text}
            </p>
          </div>
        )
      })()}

      {/* ─── Escolha do prato (jantar ouro/prata) ─── */}
      {jantarSelected && (
        <div className="mb-7 sm:mb-9">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h2 className="font-serif italic text-gold-200 text-xl sm:text-2xl">Escolha o prato</h2>
            <span className="text-[9px] tracking-[0.35em] uppercase text-gold-700/40">obrigatório</span>
          </div>
          <div className="space-y-2.5">
            {PRATOS.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setJantarPrato(p.id)}
                className="w-full text-left px-4 py-3.5 rounded-xl border transition-all duration-200 active:scale-[0.99] outline-none"
                style={{
                  background: jantarPrato === p.id
                    ? 'rgba(201,168,76,0.10)'
                    : 'rgba(255,255,255,0.02)',
                  borderColor: jantarPrato === p.id
                    ? 'rgba(201,168,76,0.55)'
                    : 'rgba(201,168,76,0.15)',
                  boxShadow: jantarPrato === p.id
                    ? '0 0 0 1px rgba(201,168,76,0.25), 0 4px 20px rgba(160,120,30,0.15)'
                    : 'none',
                }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all"
                    style={{
                      borderColor: jantarPrato === p.id ? 'rgba(201,168,76,0.9)' : 'rgba(201,168,76,0.3)',
                      background: jantarPrato === p.id ? 'rgba(201,168,76,0.9)' : 'transparent',
                    }}
                  >
                    {jantarPrato === p.id && (
                      <span className="w-1.5 h-1.5 rounded-full bg-black" />
                    )}
                  </span>
                  <span className="text-sm leading-snug" style={{ color: jantarPrato === p.id ? 'rgba(240,200,110,0.95)' : 'rgba(200,165,80,0.65)' }}>
                    {p.label}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── Horário (jantar ou barca de sushi) ─── */}
      {showTimePicker && (
        <div className="mb-7 sm:mb-9">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h2 className="font-serif italic text-gold-200 text-xl sm:text-2xl">
              {sushiSelected ? 'Horário da barca' : pizzaSelected ? 'Horário da pizza' : 'Horário do jantar'}
            </h2>
            <span className="text-[9px] tracking-[0.35em] uppercase text-gold-700/40">
              {checkIn ? `check-in às ${checkIn.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'obrigatório'}
            </span>
          </div>
          {dynamicTimeSlots.length === 0 ? (
            <p className="text-xs text-gold-700/40">Selecione um horário de check-in primeiro.</p>
          ) : (
            <div className="flex flex-wrap gap-2.5">
              {dynamicTimeSlots.map(slot => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setJantarHorario(slot)}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium border transition-all duration-200 active:scale-[0.97]"
                  style={{
                    background: jantarHorario === slot ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.02)',
                    borderColor: jantarHorario === slot ? 'rgba(201,168,76,0.6)' : 'rgba(201,168,76,0.18)',
                    color: jantarHorario === slot ? 'rgba(240,200,110,0.95)' : 'rgba(200,165,80,0.55)',
                    boxShadow: jantarHorario === slot ? '0 0 0 1px rgba(201,168,76,0.25)' : 'none',
                  }}
                >
                  {slot}
                </button>
              ))}
            </div>
          )}
          <p className="mt-2 text-[10px] text-gold-700/40">Horário de Brasília. Confirmaremos pelo WhatsApp.</p>
        </div>
      )}

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

      {/* ─── Fondue — seção própria em todos os pacotes ─── */}
      {isPackage && fondueItem && (
        <Section title="Fondue" hint="opcional" kicker="03">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
            <ItemCard
              item={fondueItem}
              selected={fondueInCart}
              showPrice={false}
              onClick={() => {
                if (fondueInCart) setFondueHorario(null)
                toggleItem(fondueItem)
              }}
            />
          </div>

          {/* Picker de horário — aparece quando fondue é adicionado */}
          {fondueInCart && (
            <div className="mt-5">
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <h3 className="font-serif italic text-gold-200 text-lg sm:text-xl">Horário do fondue</h3>
                <span className="text-[9px] tracking-[0.35em] uppercase text-gold-700/40">
                  {checkIn ? `check-in às ${checkIn.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'obrigatório'}
                </span>
              </div>
                  {dynamicTimeSlots.length === 0 ? (
                <p className="text-xs text-gold-700/40">Selecione um horário de check-in primeiro.</p>
              ) : (
                <div className="flex flex-wrap gap-2.5">
                  {dynamicTimeSlots.map(slot => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setFondueHorario(slot)}
                      className="px-5 py-2.5 rounded-xl text-sm font-medium border transition-all duration-200 active:scale-[0.97]"
                      style={{
                        background: fondueHorario === slot ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.02)',
                        borderColor: fondueHorario === slot ? 'rgba(201,168,76,0.6)' : 'rgba(201,168,76,0.18)',
                        color: fondueHorario === slot ? 'rgba(240,200,110,0.95)' : 'rgba(200,165,80,0.55)',
                        boxShadow: fondueHorario === slot ? '0 0 0 1px rgba(201,168,76,0.25)' : 'none',
                      }}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-2 text-[10px] text-gold-700/40">Horário de Brasília. Confirmaremos pelo WhatsApp.</p>
            </div>
          )}
        </Section>
      )}

      {/* ─── Decoração — só no modo experiência (pacote já vem com decoração inclusa) ─── */}
      {!isPackage && decoItems.length > 0 && (
        <Section
          title="Decoração"
          hint="obrigatória"
          kicker="03"
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            {decoItems.map((deco) => (
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
    <section className="mb-8 sm:mb-10">
      <header className="flex items-center justify-between gap-3 mb-4 sm:mb-5">
        <div className="flex items-center gap-2.5">
          <span
            className="text-[10px] font-bold tabular-nums"
            style={{ color: 'rgba(201,168,76,0.35)', letterSpacing: '0.1em' }}
          >
            {kicker}
          </span>
          <h2 className="font-serif font-light text-gold-100 text-xl sm:text-2xl">{title}</h2>
        </div>
        <span className="text-[9px] tracking-[0.35em] uppercase shrink-0" style={{ color: 'rgba(201,168,76,0.35)' }}>
          {hint}
        </span>
      </header>
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
      className="group relative outline-none transition-all duration-300 active:scale-[0.97]"
      style={{
        aspectRatio: '3/4',
        borderRadius: '16px',
        overflow: 'hidden',
        border: `1px solid ${selected ? 'rgba(201,168,76,0.55)' : 'rgba(201,168,76,0.10)'}`,
        boxShadow: selected
          ? '0 0 0 1px rgba(201,168,76,0.20), 0 8px 32px rgba(0,0,0,0.55)'
          : '0 4px 16px rgba(0,0,0,0.4)',
      }}
    >
      {/* Foto */}
      {item.photo_url ? (
        <img
          src={item.photo_url}
          alt={item.label}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          style={{ transform: selected ? 'scale(1.05)' : undefined }}
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'radial-gradient(ellipse at center, rgba(201,168,76,0.14) 0%, #080604 70%)' }}
        >
          <span className="font-serif text-gold-700/30 text-4xl">✦</span>
        </div>
      )}

      {/* Overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: selected
            ? 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.22) 55%, rgba(201,168,76,0.07) 100%)'
            : 'linear-gradient(to top, rgba(0,0,0,0.86) 0%, rgba(0,0,0,0.28) 55%, rgba(0,0,0,0.04) 100%)',
        }}
      />

      {/* Check */}
      {selected && (
        <div
          className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(201,168,76,0.95)' }}
        >
          <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none">
            <path d="M2 6l3 3 5-5" stroke="#080502" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}

      {/* Texto inferior */}
      <div className="absolute inset-x-0 bottom-0 px-3 py-3">
        <p className="font-serif text-gold-100 text-sm sm:text-base leading-tight">
          {item.label}
        </p>
        {showPrice && item.price > 0 && (
          <p className="mt-1 text-[11px] font-semibold tabular-nums" style={{ color: 'rgba(223,192,122,0.75)' }}>
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
  tier: string
  price: number
  selected: boolean
  onClick: () => void
}) {
  const accent = tier === 'ouro'   ? '#fcd34d'
               : tier === 'prata'  ? '#d1d5db'
               : tier === 'bronze' ? '#c08040'
               :                     'rgba(154,125,10,0.45)'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="relative flex flex-col items-center outline-none transition-all duration-300 active:scale-[0.97] px-4 py-5"
      style={{
        borderRadius: '16px',
        background: selected
          ? `radial-gradient(ellipse at top, ${accent}16 0%, transparent 70%), #0c0903`
          : '#09070400',
        border: `1px solid ${selected ? accent + '50' : 'rgba(201,168,76,0.10)'}`,
        boxShadow: selected ? `0 0 0 1px ${accent}18, 0 8px 28px rgba(0,0,0,0.5)` : 'none',
      }}
    >
      {/* Linha de acento superior */}
      <div
        className="mb-4"
        style={{
          height: '1px',
          width: tier === 'ouro' ? '3rem' : tier === 'prata' ? '2.5rem' : '2rem',
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
          opacity: selected ? 1 : 0.5,
        }}
      />

      <p
        className="font-serif font-light text-center text-base sm:text-lg leading-none"
        style={{ color: selected ? accent : `${accent}90` }}
      >
        {label}
      </p>

      {price > 0 && (
        <p
          className="mt-2 text-[11px] font-semibold tabular-nums"
          style={{ color: selected ? 'rgba(223,192,122,0.80)' : 'rgba(201,168,76,0.40)' }}
        >
          + {fmtBRL(price)}
        </p>
      )}

      {selected && (
        <div
          className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ background: accent }}
        >
          <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none">
            <path d="M2 6l3 3 5-5" stroke="#080502" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </button>
  )
}
