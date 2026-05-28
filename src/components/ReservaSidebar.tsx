import { useStore } from '../store/useStore'

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
  const { package: pkg, drink, food, type, suite, checkIn, checkOut, totalAmount } = useStore()
  const total = totalAmount()
  const checkout = checkOut()

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-80 xl:w-96 shrink-0">
        <div className="sticky top-24 border border-gold-800/40 rounded-xl overflow-hidden">
          <div className="bg-gold-900/20 px-5 py-3 border-b border-gold-800/30">
            <p className="text-[10px] xl:text-[11px] tracking-widest uppercase text-gold-500/60">Sua Reserva</p>
          </div>

          <div className="px-5 xl:px-6 py-4 xl:py-5 space-y-4 bg-black/60">
            {pkg ? <Row label="Pacote" value={pkg.label} /> : <Placeholder label="Pacote" />}
            {drink && <Row label="Bebida" value={drink === 'vinho' ? '🍷 Vinho' : '🥂 Frisante'} />}
            {food && <Row label="Refeição" value={food === 'jantar' ? '🍽 Jantar' : '🍣 Sushi'} />}
            {type
              ? <Row label="Modalidade" value={type === 'period' ? 'Período' : 'Pernoite'} />
              : <Placeholder label="Modalidade" />
            }
            {suite ? <Row label="Suíte" value={suite.name} /> : <Placeholder label="Suíte" />}
            {checkIn ? <Row label="Check-in" value={fmtDt(checkIn)} /> : null}
            {checkout ? <Row label="Check-out" value={fmtDt(checkout)} highlight /> : null}

            <div className="border-t border-gold-800/30 pt-4">
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] tracking-widest uppercase text-gold-600/60">Total</span>
                {total > 0
                  ? <span className="font-serif text-2xl font-semibold gold-gradient">{fmt(total)}</span>
                  : <span className="text-gold-800/50 text-sm">—</span>
                }
              </div>
              {type && (
                <p className="text-[11px] text-gold-700/50 mt-1">
                  {type === 'period' ? 'Período promocional' : 'Pernoite'}
                </p>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile bottom bar — only when something is selected */}
      {(pkg || total > 0) && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-black/95 backdrop-blur border-t border-gold-800/30 px-4 py-3">
          <div className="flex items-center justify-between max-w-5xl mx-auto">
            <div className="flex items-center gap-3 min-w-0">
              {pkg && (
                <span className="text-xs text-gold-400 font-medium truncate">{pkg.label}</span>
              )}
              {type && (
                <>
                  <span className="text-gold-800/50 text-xs">·</span>
                  <span className="text-xs text-gold-600/70 truncate">
                    {type === 'period' ? 'Período' : 'Pernoite'}
                  </span>
                </>
              )}
              {suite && (
                <>
                  <span className="text-gold-800/50 text-xs">·</span>
                  <span className="text-xs text-gold-600/70 truncate">{suite.name}</span>
                </>
              )}
            </div>
            {total > 0 && (
              <span className="font-serif text-lg font-semibold gold-gradient shrink-0 ml-3">
                {fmt(total)}
              </span>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] xl:text-[11px] tracking-widest uppercase text-gold-600/50 mb-0.5">{label}</p>
      <p className={`text-sm xl:text-base font-medium ${highlight ? 'text-gold-200' : 'text-gold-300'}`}>{value}</p>
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
