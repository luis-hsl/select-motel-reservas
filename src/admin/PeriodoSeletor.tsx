import {
  GRANULARIDADES, faixa, navegar, rotulo, temAnterior, temProximo,
  type Granularidade,
} from './periodo'

// Controle de período: granularidade + navegação, numa linha só.
//
// As setas ficam desabilitadas quando não há para onde ir — antes do primeiro
// dia ingerido ou depois de hoje. Deixá-las clicáveis levaria a telas vazias
// que parecem "o motel não faturou nada", que é o pior tipo de tela em branco.

interface Props {
  granularidade: Granularidade
  ancora: string
  primeiroDia: string | null
  onChange: (g: Granularidade, ancora: string) => void
}

export default function PeriodoSeletor({ granularidade, ancora, primeiroDia, onChange }: Props) {
  const [inicio, fim] = faixa(granularidade, ancora)
  const podeVoltar = temAnterior(granularidade, ancora, primeiroDia)
  const podeAvancar = temProximo(granularidade, ancora)

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Granularidade */}
      <div className="flex rounded-lg border border-white/8 overflow-hidden">
        {GRANULARIDADES.map((g) => {
          const ativo = g.id === granularidade
          return (
            <button
              key={g.id}
              onClick={() => onChange(g.id, ancora)}
              aria-pressed={ativo}
              className={`text-[11px] px-3 py-1.5 transition-colors ${
                ativo
                  ? 'text-gold-500 bg-gold-500/[0.09]'
                  : 'text-white/40 hover:text-white/75 hover:bg-white/[0.03]'
              }`}
            >
              {g.label}
            </button>
          )
        })}
      </div>

      {/* Navegação */}
      <div className="flex items-center gap-1">
        <Seta
          direcao="anterior"
          disabled={!podeVoltar}
          onClick={() => onChange(granularidade, navegar(granularidade, ancora, -1))}
        />
        <span className="figura text-[11px] text-white/60 min-w-[120px] text-center">
          {rotulo(granularidade, inicio, fim)}
        </span>
        <Seta
          direcao="proximo"
          disabled={!podeAvancar}
          onClick={() => onChange(granularidade, navegar(granularidade, ancora, 1))}
        />
      </div>
    </div>
  )
}

function Seta({ direcao, disabled, onClick }: {
  direcao: 'anterior' | 'proximo'; disabled: boolean; onClick: () => void
}) {
  const anterior = direcao === 'anterior'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={anterior ? 'Período anterior' : 'Próximo período'}
      className="p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/[0.04]
                 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-white/40
                 disabled:cursor-not-allowed transition-colors"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
           stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d={anterior ? 'M7.5 2.5L4 6l3.5 3.5' : 'M4.5 2.5L8 6l-3.5 3.5'} />
      </svg>
    </button>
  )
}
