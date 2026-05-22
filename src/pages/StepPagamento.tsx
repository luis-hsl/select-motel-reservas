import { useStore } from '../store/useStore'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function StepPagamento() {
  const { package: pkg, type, suite, checkIn, customerName, totalAmount, prevStep } = useStore()
  const total = totalAmount()

  function handlePay() {
    // TODO: criar cobrança Asaas → redirecionar
    alert('Integração Asaas em breve!')
  }

  return (
    <div>
      <button onClick={prevStep} className="flex items-center gap-1 text-gold-700/60 text-sm mb-8 hover:text-gold-500 transition-colors">
        <span>←</span> Voltar
      </button>

      <h1 className="font-serif text-4xl sm:text-5xl font-light mb-2 leading-tight">
        Confirme sua<br />
        <span className="gold-gradient font-semibold italic">reserva</span>
      </h1>
      <p className="text-gold-700/70 text-sm mb-10">
        Revise os detalhes antes de prosseguir para o pagamento.
      </p>

      <div className="max-w-md space-y-4">
        {/* Summary card */}
        <div className="border border-gold-800/40 rounded-xl overflow-hidden">
          <div className="bg-gold-900/20 px-5 py-3 border-b border-gold-800/30">
            <p className="text-[10px] tracking-widest uppercase text-gold-500/60">Resumo da reserva</p>
          </div>
          <div className="px-5 py-4 space-y-3">
            <SummaryRow label="Cliente" value={customerName} />
            <SummaryRow label="Pacote" value={pkg?.label ?? '—'} />
            <SummaryRow label="Modalidade" value={type === 'period' ? 'Período' : 'Pernoite'} />
            <SummaryRow label="Suíte" value={suite?.name ?? '—'} />
            <SummaryRow
              label="Check-in"
              value={checkIn?.toLocaleString('pt-BR', {
                weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
              }) ?? '—'}
            />
            <div className="border-t border-gold-900/40 pt-3 flex items-baseline justify-between">
              <span className="text-[10px] tracking-widest uppercase text-gold-600/60">Total</span>
              <span className="font-serif text-2xl font-semibold gold-gradient">{fmt(total)}</span>
            </div>
          </div>
        </div>

        {/* Pay button */}
        <button
          onClick={handlePay}
          className="w-full py-4 rounded-xl bg-gradient-to-r from-gold-700 to-gold-500 text-black font-semibold text-sm hover:from-gold-600 hover:to-gold-400 transition-all duration-200"
        >
          Pagar agora — {fmt(total)}
        </button>

        <p className="text-[11px] text-gold-800/50 text-center">
          Você será redirecionado para o ambiente seguro de pagamento.
        </p>
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[10px] tracking-widest uppercase text-gold-700/50">{label}</span>
      <span className="text-sm text-gold-300 font-medium text-right max-w-[60%]">{value}</span>
    </div>
  )
}
