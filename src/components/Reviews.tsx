// ⚠️ Reviews/depoimentos para reforçar confiança na step de pagamento.
//
// IMPORTANTE: substitua estes depoimentos por reviews REAIS com permissão
// dos clientes assim que possível. Reviews fictícios em e-commerce
// configuram publicidade enganosa (CDC Art. 37) com risco de multa pelo
// PROCON / sanção do Ministério da Justiça.
//
// Alternativas legítimas:
//   - Prints reais de mensagens do WhatsApp (com autorização do remetente)
//   - Cards de reviews do Google My Business (importáveis via API)
//   - Reviews verificadas do Booking/TripAdvisor

interface Review {
  name:   string
  date:   string
  rating: number   // 1..5
  text:   string
}

const REVIEWS: Review[] = [
  {
    name:   'Mariana S.',
    date:   '2 semanas atrás',
    rating: 5,
    text:   'Suíte impecável, decoração linda e o atendimento foi acima do esperado. Voltaremos com certeza!',
  },
  {
    name:   'Rafael e Carla',
    date:   '1 mês atrás',
    rating: 5,
    text:   'Reservei pra um jantar romântico, chegamos e estava tudo preparado. O fondue surpreendeu. Recomendo demais.',
  },
  {
    name:   'Juliana M.',
    date:   '3 semanas atrás',
    rating: 5,
    text:   'Pagamento por PIX rapidíssimo, confirmação no WhatsApp na hora. Suíte com hidro super limpa.',
  },
  {
    name:   'Bruno A.',
    date:   '2 meses atrás',
    rating: 5,
    text:   'Discreto, organizado e com privacidade. O pacote Ouro vale cada centavo.',
  },
]

function Stars({ n }: { n: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${n} de 5 estrelas`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          viewBox="0 0 20 20"
          className="w-3.5 h-3.5"
          fill={i < n ? '#e8c060' : 'rgba(201,168,76,0.18)'}
          aria-hidden
        >
          <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9 4.8 17.6l1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
        </svg>
      ))}
    </div>
  )
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
}

export default function Reviews() {
  const avg = REVIEWS.reduce((s, r) => s + r.rating, 0) / REVIEWS.length
  return (
    <section className="rounded-2xl border border-gold-900/30 bg-white/[0.02] p-4 sm:p-5">
      {/* Header com média */}
      <div className="flex items-center gap-3 mb-4">
        <Stars n={5} />
        <div className="text-xs">
          <span className="text-gold-300 font-semibold">{avg.toFixed(1)}</span>
          <span className="text-white/40"> · {REVIEWS.length}+ avaliações</span>
        </div>
      </div>

      <div className="space-y-3">
        {REVIEWS.map((r) => (
          <article
            key={r.name + r.date}
            className="border border-white/5 rounded-xl p-3 bg-white/[0.015]"
          >
            <div className="flex items-start gap-3">
              {/* Avatar com iniciais */}
              <div
                className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-[11px] font-semibold text-black"
                style={{ background: 'linear-gradient(135deg,#c8a035,#e8c060)' }}
                aria-hidden
              >
                {initials(r.name)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <p className="text-white/85 text-sm font-medium truncate">{r.name}</p>
                  <span className="text-white/30 text-[10px] shrink-0">{r.date}</span>
                </div>
                <Stars n={r.rating} />
                <p className="text-white/65 text-xs leading-relaxed mt-1.5">{r.text}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
