import { usePanorama } from './panoramaContext'
import type { SuitePainel } from '../lib/plugplayAdmin'

// As 13 suítes, sempre visíveis, em qualquer seção do painel.
//
// É a única coisa que só este produto tem: um motel de 13 quartos cabe inteiro
// numa faixa, e quem abre o admin quer saber disso antes de qualquer número.
//
// As cores vêm do PMS (`corBackground`), não de uma paleta nossa. A recepção
// olha o mapa dela o dia inteiro; a faixa fala a mesma língua, e status novo
// que eles criarem já chega colorido sem deploy daqui.

/** Largura mínima de cada tile. Abaixo disso o número do quarto some. */
const MIN_TILE = 34

function Tile({ s }: { s: SuitePainel }) {
  const titulo = [
    `Quarto ${s.quarto} · ${s.nome}`,
    s.status,
    s.ocupada && s.perm ? `resta ${s.perm}` : null,
    s.ocupada && s.totalPrevisto > 0
      ? s.totalPrevisto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : null,
  ].filter(Boolean).join(' · ')

  return (
    <div
      title={titulo}
      aria-label={titulo}
      className="relative flex-1 rounded-[3px] overflow-hidden"
      style={{ minWidth: MIN_TILE, background: 'rgba(255,255,255,0.04)' }}
    >
      {/* Barra de status: a cor é o dado, a altura é constante. */}
      <div className="h-[3px] w-full" style={{ background: s.corBackground }} />
      <div className="px-1.5 pt-1 pb-1.5 text-center">
        <div className="figura text-[11px] leading-none text-white/80">{s.quarto}</div>
        <div className="figura text-[9px] leading-none mt-1 text-white/30">
          {s.ocupada ? (s.perm || '—') : '·'}
        </div>
      </div>
      {s.alertaTempo && (
        <div className="absolute top-[3px] right-0 w-1 h-1 rounded-full bg-amber-400" />
      )}
    </div>
  )
}

export default function SuiteStrip() {
  const { dados, carregando, semContato } = usePanorama()

  if (carregando) {
    return <div className="h-[46px] flex items-center text-white/20 text-[10px]">Lendo as suítes...</div>
  }

  const suites = dados?.suites ?? []
  if (suites.length === 0) {
    return (
      <div className="h-[46px] flex items-center text-white/25 text-[10px]">
        {dados?.configured === false
          ? 'Integração com o PMS desligada.'
          : 'O PMS não devolveu o mapa das suítes.'}
      </div>
    )
  }

  const k = dados?.kpis

  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1 flex-1 min-w-0 overflow-x-auto scrollbar-hide">
        {suites.map((s) => <Tile key={s.pmsId} s={s} />)}
      </div>

      {k && (
        <div className="hidden sm:flex items-baseline gap-3 shrink-0 pl-3 border-l border-white/8">
          <div className="text-right">
            <div className="figura text-sm text-white leading-none">{k.ocupada}/{k.total}</div>
            <div className="text-[9px] text-white/30 uppercase tracking-wider mt-1">ocupadas</div>
          </div>
          {semContato && (
            <span className="text-[9px] text-amber-400/70 uppercase tracking-wider">
              sem contato
            </span>
          )}
        </div>
      )}
    </div>
  )
}
