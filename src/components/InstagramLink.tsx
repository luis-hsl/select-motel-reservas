import { useEffect, useState } from 'react'

const HANDLE = 'selectmotelivaipora'
const URL    = `https://www.instagram.com/${HANDLE}/`

function IgGlyph({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Versão inline pro header do desktop. */
export function InstagramInline() {
  return (
    <a
      href={URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Instagram @selectmotelivaipora"
      title="Conheça nosso Instagram"
      className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-gold-800/40 hover:border-gold-500/60 transition-colors text-gold-500/80 hover:text-gold-300"
    >
      <IgGlyph className="w-4 h-4" />
      <span className="text-xs font-medium">@{HANDLE}</span>
    </a>
  )
}

/**
 * FAB flutuante no canto inferior direito (mobile). Persistente em todas as steps.
 * Visível apenas em telas < sm. Tem badge "Siga" pra chamar atenção na primeira vista
 * e some ao rolar pra não atrapalhar a CTA.
 */
export function InstagramFab() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <a
      href={URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Instagram @selectmotelivaipora"
      className={[
        'sm:hidden fixed z-40 right-4 bottom-[64px] group',
        'transition-all duration-300',
        scrolled ? 'opacity-90 scale-95' : 'opacity-100 scale-100',
      ].join(' ')}
    >
      {/* Pulse ring behind */}
      <span
        className="absolute inset-0 rounded-full animate-ping"
        style={{ background: 'radial-gradient(circle, rgba(201,168,76,0.35) 0%, transparent 70%)' }}
      />

      <span
        className="relative flex items-center justify-center w-12 h-12 rounded-full shadow-lg"
        style={{
          background:
            'linear-gradient(135deg, #f09433 0%, #e6683c 30%, #dc2743 60%, #bc1888 100%)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5), 0 0 0 2px rgba(255,255,255,0.08)',
        }}
      >
        <IgGlyph className="w-6 h-6 text-white" />
      </span>
    </a>
  )
}
