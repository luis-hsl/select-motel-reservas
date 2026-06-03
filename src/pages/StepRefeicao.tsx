import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'

type FoodId = 'jantar' | 'sushi' | 'pizza'

interface Opcao { id: FoodId; label: string; sub: string; imgKey: string | null; imgFallback: string }

const JANTAR: Opcao = { id: 'jantar', label: 'Jantar', sub: 'Prato completo com entrada', imgKey: null,              imgFallback: '/jantar.webp' }
const SUSHI:  Opcao = { id: 'sushi',  label: 'Sushi',  sub: 'Combinado premium',          imgKey: null,              imgFallback: '/sushi.webp'  }
const PIZZA:  Opcao = { id: 'pizza',  label: 'Pizza',  sub: 'Pizza artesanal',             imgKey: 'pizza_photo_url', imgFallback: ''             }

const OPCOES_POR_PACOTE: Record<string, Opcao[]> = {
  ouro:   [JANTAR, SUSHI],
  prata:  [JANTAR, PIZZA],
  bronze: [PIZZA],
}

const SUBTITULO: Record<string, string> = {
  ouro:   'Incluída no Pacote Ouro. Escolha a experiência gastronômica.',
  prata:  'Incluída no Pacote Prata. Escolha a sua preferência.',
  bronze: 'Incluída no Pacote Bronze. A pizza artesanal já está reservada para vocês.',
}

const NOTA: Partial<Record<FoodId, string>> = {
  jantar: '✦ O jantar inclui entrada — tábua de frios com salame, lombo, queijo, amendoim e azeitonas.',
  sushi:  '⚠ O sushi não inclui entrada — o combinado premium é servido diretamente.',
}

const GOLD_BORDER = 'rgba(180,140,40,0.5)'
const GOLD_RING   = 'rgba(200,160,50,0.35)'
const GOLD_GLOW   = 'rgba(160,120,30,0.35)'
const GOLD_NAME   = 'linear-gradient(180deg,#f5e0a0 0%,#d4a017 45%,#8b6010 100%)'

export default function StepRefeicao() {
  const { setFood, nextStep, prevStep, package: pkg } = useStore()
  const pkgId  = pkg?.id ?? 'ouro'
  const opcoes = OPCOES_POR_PACOTE[pkgId] ?? OPCOES_POR_PACOTE.ouro

  const [selected, setSelected]     = useState<FoodId | null>(null)
  const [remoteUrls, setRemoteUrls] = useState<Record<string, string>>({})
  const ctaRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const keys = opcoes.filter(o => o.imgKey).map(o => o.imgKey as string)
    if (keys.length === 0) return
    supabase.from('settings').select('key, value').in('key', keys).then(({ data }) => {
      const v: Record<string, string> = {}
      data?.forEach(r => { if (r.value) v[r.key] = r.value })
      setRemoteUrls(v)
    })
  }, [pkgId])

  useEffect(() => {
    if (opcoes.length === 1) setSelected(opcoes[0].id)
  }, [pkgId])

  useEffect(() => {
    if (!selected) return
    requestAnimationFrame(() => ctaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }, [selected])

  function imgFor(opt: Opcao) {
    if (opt.imgKey && remoteUrls[opt.imgKey]) return remoteUrls[opt.imgKey]
    return opt.imgFallback
  }

  function confirm() {
    if (!selected) return
    setFood(selected)
    nextStep()
  }

  const isSingle = opcoes.length === 1

  return (
    <div>
      <button onClick={prevStep} className="flex items-center gap-1 text-gold-700/60 text-sm mb-8 hover:text-gold-500 transition-colors">
        <span>←</span> Voltar
      </button>

      <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-light mb-2 leading-tight">
        {isSingle
          ? (<>Uma surpresa<br /><span className="gold-gradient font-semibold italic">para o casal</span></>)
          : (<>Qual refeição<br /><span className="gold-gradient font-semibold italic pr-1">o casal prefere?</span></>)}
      </h1>
      <p className="text-gold-700/70 text-sm mb-8 sm:mb-10">{SUBTITULO[pkgId]}</p>

      <div className={`grid gap-3 max-w-xl ${isSingle ? 'grid-cols-1 max-w-xs' : 'grid-cols-2'}`}>
        {opcoes.map(opt => {
          const isSel = selected === opt.id
          const img   = imgFor(opt)
          return (
            <button
              key={opt.id}
              onClick={() => setSelected(opt.id)}
              className="relative text-left rounded-2xl overflow-hidden outline-none transition-all duration-300 active:scale-[0.98]"
              style={{
                border: `1px solid ${GOLD_BORDER}`,
                boxShadow: isSel
                  ? `0 0 0 2px ${GOLD_RING}, 0 4px 40px ${GOLD_GLOW}, inset 0 0 40px rgba(0,0,0,0.3)`
                  : `inset 0 0 40px rgba(0,0,0,0.5)`,
                minHeight: isSingle ? 300 : 220,
              }}
            >
              <div className="absolute inset-0">
                {img && <img src={img} alt={opt.label} className="w-full h-full object-cover" draggable={false} />}
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.2) 55%, rgba(0,0,0,0) 100%)' }} />
              </div>

              {isSel && (
                <div className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center z-10" style={{ background: '#c9a84c', boxShadow: `0 0 12px ${GOLD_GLOW}` }}>
                  <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 12 12">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}

              <div className="relative z-10 flex flex-col justify-end h-full p-4" style={{ minHeight: isSingle ? 300 : 220 }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-px w-6" style={{ background: '#c9a84c', boxShadow: '0 0 6px #c9a84c' }} />
                </div>
                <h2 className="font-serif font-bold tracking-widest text-transparent bg-clip-text leading-none" style={{ fontSize: 'clamp(1.1rem,3vw,1.5rem)', backgroundImage: GOLD_NAME }}>
                  {opt.label.toUpperCase()}
                </h2>
              </div>
            </button>
          )
        })}
      </div>

      {selected && NOTA[selected] && (
        <div className="mt-4 max-w-xl px-4 py-3 rounded-xl border border-gold-800/30 bg-gold-900/10">
          <p className="text-xs text-gold-300/80">{NOTA[selected]}</p>
        </div>
      )}

      <div className="mt-6">
        <button
          ref={ctaRef}
          onClick={confirm}
          disabled={!selected}
          className={['flex items-center gap-2 px-8 py-3.5 rounded-lg text-sm font-semibold transition-all duration-200',
            selected ? 'bg-gradient-to-r from-gold-700 to-gold-500 text-black hover:from-gold-600 hover:to-gold-400'
                     : 'bg-gold-900/20 text-gold-800/40 cursor-not-allowed'].join(' ')}
        >
          {selected
            ? `Continuar com ${selected === 'jantar' ? 'Jantar' : selected === 'sushi' ? 'Sushi' : 'Pizza'} →`
            : 'Escolha uma refeição para continuar'}
        </button>
      </div>
    </div>
  )
}
