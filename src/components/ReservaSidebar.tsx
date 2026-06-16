import { useStore } from '../store/useStore'
import { SUITE_CATEGORIES } from '../data/suiteCategories'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDt(d: Date) {
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function ReservaSidebar() {
  const {
    mode, package: pkg, suiteCategory,
    drink, food,
    type, suite, checkIn, checkOut,
    totalAmount, selectedItems,
  } = useStore()

  const total     = totalAmount()
  const checkout  = checkOut()
  const showPrice = total > 0

  const catDef = suiteCategory
    ? SUITE_CATEGORIES.find(c => c.dbCategory === suiteCategory)
    : null

  const typeLabel =
    type === 'oneHour'   ? '1 Hora' :
    type === 'period'    ? 'Período (2h)' :
    type === 'overnight' ? 'Pernoite (~12h)' :
    type === 'diaria'    ? 'Diária 24h' : null

  // Labels legíveis para modo pacote
  const drinkLabel =
    drink === 'vinho'    ? 'Vinho' :
    drink === 'frisante' ? 'Frisante' :
    drink === 'drinque'  ? 'Drinque' : null

  const foodLabel =
    food === 'jantar' ? 'Jantar' :
    food === 'sushi'  ? 'Sushi'  :
    food === 'pizza'  ? 'Pizza'  : null

  const hasPackageExtras = mode === 'package' && (!!drinkLabel || !!foodLabel || selectedItems.length > 0)
  const hasFreeItems     = mode !== 'package' && selectedItems.length > 0

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────── */}
      <aside className="hidden lg:block w-80 xl:w-96 shrink-0" aria-label="Sua reserva">
        <div className="sticky top-24 border border-gold-800/40 rounded-xl overflow-hidden">
          <div className="bg-gold-900/20 px-5 py-3 border-b border-gold-800/30">
            <p className="text-[10px] xl:text-[11px] tracking-widest uppercase text-gold-500/60">
              Sua Reserva
            </p>
          </div>

          <div className="px-5 xl:px-6 py-4 xl:py-5 space-y-4 bg-black/60">

            {/* Categoria / Pacote */}
            {mode === 'suite' ? (
              catDef
                ? <Row label="Categoria" value={catDef.label} />
                : <Placeholder label="Categoria" />
            ) : (
              pkg ? <Row label="Pacote" value={pkg.label} /> : <Placeholder label="Pacote" />
            )}

            {/* Duração */}
            {typeLabel
              ? <Row label="Duração" value={typeLabel} />
              : <Placeholder label="Duração" />
            }

            {/* Suíte */}
            {suite
              ? <Row label="Suíte" value={suite.name} />
              : <Placeholder label="Suíte" />
            }

            {/* Datas */}
            {checkIn  && <Row label="Check-in"  value={fmtDt(checkIn)} />}
            {checkout && <Row label="Check-out" value={fmtDt(checkout)} highlight />}

            {/* ── Itens selecionados — Pacote ── */}
            {hasPackageExtras && (
              <div className="border-t border-gold-800/20 pt-3 space-y-2">
                {foodLabel && (
                  <ItemLine label="Refeição" value={foodLabel} />
                )}
                {drinkLabel && (
                  <ItemLine label="Bebida" value={drinkLabel} />
                )}
                {selectedItems.map(item => (
                  <ItemLine
                    key={item.id}
                    label={item.label}
                    price={Number(item.price) > 0 ? Number(item.price) : undefined}
                  />
                ))}
              </div>
            )}

            {/* ── Itens selecionados — Suite / Experience ── */}
            {hasFreeItems && (
              <div className="border-t border-gold-800/20 pt-3 space-y-2">
                {selectedItems.map(item => (
                  <ItemLine
                    key={item.id}
                    label={item.label}
                    price={Number(item.price) > 0 ? Number(item.price) : undefined}
                  />
                ))}
              </div>
            )}

            {/* ── Total ── */}
            {showPrice && (
              <div className="border-t border-gold-800/30 pt-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[10px] tracking-widest uppercase text-gold-600/60">
                    Total
                  </span>
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
                    {fmt(total)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── Mobile bottom bar ───────────────────────────────── */}
      {(pkg || catDef || total > 0) && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-black/95 backdrop-blur border-t border-gold-800/30 px-4 py-3">
          <div className="flex items-center justify-between max-w-5xl mx-auto gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {/* Categoria / Pacote */}
              {mode === 'suite'
                ? catDef && <span className="text-xs text-gold-400 font-medium truncate">{catDef.label}</span>
                : pkg     && <span className="text-xs text-gold-400 font-medium truncate">{pkg.label}</span>
              }
              {typeLabel && (
                <>
                  <span className="text-gold-800/40 text-xs shrink-0">·</span>
                  <span className="text-xs text-gold-600/60 truncate">{typeLabel}</span>
                </>
              )}
              {suite && (
                <>
                  <span className="text-gold-800/40 text-xs shrink-0">·</span>
                  <span className="text-xs text-gold-600/60 truncate">{suite.name}</span>
                </>
              )}
              {/* Contagem de itens no mobile */}
              {(hasFreeItems || hasPackageExtras) && (
                <>
                  <span className="text-gold-800/40 text-xs shrink-0">·</span>
                  <span className="text-xs text-gold-500/70 shrink-0">
                    {selectedItems.length + (foodLabel ? 1 : 0) + (drinkLabel && mode === 'package' ? 1 : 0)} {
                      (selectedItems.length + (foodLabel ? 1 : 0) + (drinkLabel && mode === 'package' ? 1 : 0)) === 1
                        ? 'item'
                        : 'itens'
                    }
                  </span>
                </>
              )}
            </div>

            {showPrice && (
              <span
                className="gold-gradient shrink-0"
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: '1.3rem',
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1,
                }}
              >
                {fmt(total)}
              </span>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/* ── Subcomponentes ─────────────────────────────────────────── */

function Row({ label, value, highlight }: {
  label: string; value: string; highlight?: boolean
}) {
  return (
    <div>
      <p className="text-[10px] xl:text-[11px] tracking-widest uppercase text-gold-600/50 mb-0.5">
        {label}
      </p>
      <p className={`text-sm xl:text-base font-medium ${highlight ? 'text-gold-200' : 'text-gold-300'}`}>
        {value}
      </p>
    </div>
  )
}

function ItemLine({ label, value, price }: {
  label: string; value?: string; price?: number
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-gold-300/70 leading-snug">
        {value ? `${label}: ${value}` : label}
      </span>
      {price !== undefined && (
        <span
          className="shrink-0 text-gold-400/75"
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: '0.82rem',
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.01em',
          }}
        >
          + {fmt(price)}
        </span>
      )}
    </div>
  )
}

function Placeholder({ label }: { label: string }) {
  return (
    <div>
      <p className="text-[10px] tracking-widest uppercase text-gold-900/60 mb-0.5">{label}</p>
      <div className="h-4 w-24 rounded bg-gold-900/20 animate-pulse" />
    </div>
  )
}
