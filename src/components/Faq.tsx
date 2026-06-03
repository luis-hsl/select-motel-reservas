// FAQ visível na primeira step (StepPacote) — bate com o schema FAQPage do index.html.
// Política do Google: as Q&A do schema PRECISAM aparecer na página, senão rich snippet é negado.
// Usa <details> nativo: acessível, indexável mesmo sem JS, e abre/fecha sem React state.

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'Como faço minha reserva no Select Motel?',
    a:
      'É só seguir os passos no site: escolha o pacote, o tipo de estadia (período ou pernoite), a data e a suíte preferida. Em seguida selecione refeição, bebida, preencha seus dados e pague com PIX ou cartão. A confirmação chega no seu WhatsApp.',
  },
  {
    q: 'Quais formas de pagamento são aceitas?',
    a:
      'PIX (com QR Code gerado na hora) e cartão de crédito em até 3x. O pagamento é processado pelo AbacatePay, com criptografia e antifraude.',
  },
  {
    q: 'Qual a diferença entre período e pernoite?',
    a:
      'O período é uma estadia de 2 horas, ideal para um encontro mais curto. Já o pernoite são 12 horas com café da manhã (quando disponível pelo pacote escolhido).',
  },
  {
    q: 'Os pacotes incluem decoração romântica?',
    a:
      'Sim. Todos os pacotes (Bronze, Prata e Ouro) já vêm com decoração romântica inclusa. Os pacotes maiores também incluem jantar, fondue e bebidas como vinho ou frisante.',
  },
  {
    q: 'Onde fica o Select Motel?',
    a:
      'O Select Motel fica na Rodovia Celso Fumiu Makita, no Parque Industrial em Ivaiporã (PR), CEP 86870-000. Atendemos clientes de Ivaiporã, Apucarana, Cândido de Abreu, Faxinal e região.',
  },
  {
    q: 'Posso escolher qual suíte quero?',
    a:
      'Sim. Após escolher o pacote, você vê todas as suítes daquela categoria — VIP com piscina, Hidro, Hidro Light ou Standard — com fotos e vídeo de cada uma para escolher a sua favorita.',
  },
  {
    q: 'Como funciona o cancelamento ou alteração?',
    a:
      'Reservas confirmadas com pagamento podem ser remarcadas mediante contato direto pelo WhatsApp informando o código da reserva enviado na confirmação. Cada caso é avaliado individualmente.',
  },
  {
    q: 'Vocês têm estacionamento privativo?',
    a:
      'Sim. Estacionamento coberto e privativo, com discrição total. A suíte só é entregue após a vaga estar disponível.',
  },
]

export default function Faq() {
  return (
    <section
      aria-labelledby="faq-title"
      className="mt-16 sm:mt-20 lg:mt-24 pt-10 border-t border-gold-900/30"
    >
      <h2
        id="faq-title"
        className="font-serif text-2xl sm:text-3xl font-light text-center mb-2"
      >
        Perguntas <span className="gold-gradient italic font-semibold">frequentes</span>
      </h2>
      <p className="text-gold-700/60 text-xs sm:text-sm text-center mb-8">
        Tudo que você precisa saber antes de reservar
      </p>

      <div className="max-w-2xl mx-auto space-y-2">
        {FAQ.map(({ q, a }) => (
          <details
            key={q}
            className="group rounded-xl border border-gold-900/30 bg-white/[0.02] overflow-hidden open:bg-white/[0.04] open:border-gold-700/40 transition-colors"
          >
            <summary className="cursor-pointer list-none px-5 py-4 flex items-center justify-between gap-3 text-sm sm:text-[15px] font-medium text-gold-200/95">
              <span>{q}</span>
              <span
                className="text-gold-600/70 transition-transform group-open:rotate-45 text-xl leading-none shrink-0"
                aria-hidden
              >
                +
              </span>
            </summary>
            <div className="px-5 pb-4 text-sm text-gold-300/70 leading-relaxed">
              {a}
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}
