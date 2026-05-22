import { useStore } from '../store/useStore'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function ReservaSidebar() {
  const { package: pkg, type, suite, totalAmount } = useStore()
  const total = totalAmount()

  return (
    <aside className="w-72 shrink-0">
      <div className="sticky top-24 border border-gold-800/40 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="bg-gold-900/20 px-5 py-3 border-b border-gold-800/30">
          <p className="text-[10px] tracking-widest uppercase text-gold-500/60">Sua Reserva</p>
        </div>

        <div className="px-5 py-4 space-y-4 bg-black/60">
          {/* Package */}
          {pkg ? (
            <Row label="Pacote" value={pkg.label} />
          ) : (
            <Placeholder label="Pacote" />
          )}

          {/* Type */}
          {type ? (
            <Row
              label="Modalidade"
              value={type === 'period' ? 'Período' : 'Pernoite'}
            />
          ) : (
            <Placeholder label="Modalidade" />
          )}

          {/* Suite */}
          {suite ? (
            <Row label="Suíte" value={suite.name} />
          ) : (
            <Placeholder label="Suíte" />
          )}

          {/* Divider */}
          <div className="border-t border-gold-800/30 pt-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] tracking-widest uppercase text-gold-600/60">Total</span>
              {total > 0 ? (
                <span className="font-serif text-2xl font-semibold gold-gradient">
                  {fmt(total)}
                </span>
              ) : (
                <span className="text-gold-800/50 text-sm">—</span>
              )}
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
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] tracking-widest uppercase text-gold-600/50 mb-0.5">{label}</p>
      <p className="text-sm text-gold-300 font-medium">{value}</p>
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
