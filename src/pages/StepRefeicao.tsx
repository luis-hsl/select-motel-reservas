import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'

type FoodId = 'jantar' | 'sushi' | 'pizza'

interface Opcao { id: FoodId; label: string; sub: string; imgKey: string | null; imgFallback: string }

const JANTAR: Opcao = { id: 'jantar', label: 'Jantar', sub: 'Prato completo com entrada', imgKey: null,               imgFallback: '/jantar.webp' }
const SUSHI:  Opcao = { id: 'sushi',  label: 'Sushi',  sub: 'Combinado premium',          imgKey: null,               imgFallback: '/sushi.webp'  }
const PIZZA:  Opcao = { id: 'pizza',  label: 'Pizza',  sub: 'Pizza artesanal',             imgKey: 'pizza_photo_url',  imgFallback: ''             }

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

const NOTA: Partial<Record<FoodId, { icon: 'check' | 'warn'; text: string }>> = {
  jantar: { icon: 'check', text: 'O jantar inclui entrada — tábua de frios com salame, lombo, queijo, amendoim e azeitonas.' },
  sushi:  { icon: 'warn',  text: 'O sushi não inclui entrada — o combinado premium é servido diretamente.' },
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
    const keys = [
      ...opcoes.filter(o => o.imgKey).map(o => o.imgKey as string),
      'fondue_photo_url',
    ]
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

  const isSingle   = opcoes.length === 1
  const fondueUrl  = remoteUrls['fondue_photo_url'] ?? '/fondue.webp'
  const gridClass  = isSingle ? 'grid-cols-1 max-w-xs' : 'grid-cols-1 sm:grid-cols-2 max-w-xl'
  const nota       = selected ? NOTA[selected] : null

  return (
    <div>
      <button onClick={prevStep} className="flex items-center gap-1 text-gold-700/60 text-sm mb-8 hover:text-gold-500 transition-colors">
        <span>←</span> Voltar
      </button>

      <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-light mb-2 leading-tight">
        {isSingle
          ? (<>Uma surpresa<br /><span className="gold-gradient font-semibold italic">para o casal</span></>)
          : (<>Qual refeição<br /><span className="gold-gradient font-semibold italic pr-1 lg:pr-3">o casal prefere?</span></>)}
      </h1>
      <p className="text-gold-700/70 text-sm mb-8 sm:mb-10">{SUBTITULO[pkgId]}</p>

      {/* Opções de refeição */}
      <div className={`grid gap-3 ${gridClass}`}>
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

      {/* Nota de jantar/sushi (Ouro) */}
      {nota && (
        <div
          className="mt-3 flex items-start gap-2.5 px-4 py-3 rounded-xl"
          style={{
            background: nota.icon === 'check' ? 'rgba(201,168,76,0.06)' : 'rgba(180,100,30,0.08)',
            border: nota.icon === 'check' ? '1px solid rgba(201,168,76,0.22)' : '1px solid rgba(200,120,40,0.28)',
            maxWidth: isSingle ? '20rem' : '36rem',
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
      )}

      {/* Fondue — sempre incluído */}
      <div className={`mt-6 ${isSingle ? 'max-w-xs' : 'max-w-xl'}`}>
        <p className="text-[9px] tracking-widest uppercase text-gold-600/45 mb-2">Também incluído</p>
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{
            border: `1px solid ${GOLD_BORDER}`,
            boxShadow: `0 0 0 2px ${GOLD_RING}, 0 4px 30px ${GOLD_GLOW}, inset 0 0 40px rgba(0,0,0,0.3)`,
            minHeight: 160,
          }}
        >
          <div className="absolute inset-0">
            <img src={fondueUrl} alt="Fondue" className="w-full h-full object-cover" draggable={false} />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.15) 55%, rgba(0,0,0,0) 100%)' }} />
          </div>

          {/* Checkmark fixo — sempre incluído */}
          <div className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center z-10" style={{ background: '#c9a84c', boxShadow: `0 0 12px ${GOLD_GLOW}` }}>
            <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 12 12">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <div className="relative z-10 flex flex-col justify-end h-full p-4" style={{ minHeight: 160 }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-px w-6" style={{ background: '#c9a84c', boxShadow: '0 0 6px #c9a84c' }} />
            </div>
            <h2 className="font-serif font-bold tracking-widest text-transparent bg-clip-text leading-none mb-1" style={{ fontSize: 'clamp(1.1rem,3vw,1.5rem)', backgroundImage: GOLD_NAME }}>
              FONDUE
            </h2>
            <p className="text-white/45 text-[11px] tracking-wide">Fondue de chocolate — incluído no pacote</p>
          </div>
        </div>
      </div>

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
