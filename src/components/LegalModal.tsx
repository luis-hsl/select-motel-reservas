import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export type LegalKind = 'terms' | 'privacy'

const TODAY = '03/06/2026'

const TEXTS: Record<LegalKind, { title: string; sections: Array<{ h: string; p: string[] }> }> = {
  terms: {
    title: 'Termos de Uso',
    sections: [
      { h: '1. Aceitação dos termos', p: [
        'Ao usar o site selectreservas.com.br você aceita estes Termos de Uso. Se não concordar, não utilize o serviço.',
      ]},
      { h: '2. Quem somos', p: [
        'O Select Motel é uma empresa de hospedagem com sede na Rodovia Celso Fumiu Makita, Parque Industrial, Ivaiporã – PR, 86870-000.',
        'Telefone de contato: (43) 99909-7482.',
      ]},
      { h: '3. Reserva e pagamento', p: [
        'A reserva é confirmada apenas após a confirmação efetiva do pagamento (PIX ou cartão de crédito). O recebimento dos pagamentos é processado pela AbacatePay Pagamentos.',
        'A reserva fica pré-reservada por até 5 minutos enquanto o pagamento é concluído. Se o pagamento não for confirmado nesse tempo, a suíte volta a ficar disponível para outros clientes.',
        'O valor pago não é reembolsado em caso de no-show (não comparecimento). Em casos de remarcação por motivo justificado, entre em contato pelo WhatsApp informando o código da reserva.',
      ]},
      { h: '4. Apresentação no motel', p: [
        'O cliente deve apresentar documento de identidade com foto no momento do check-in.',
        'O horário de check-in deve ser respeitado. Atrasos acima de 30 minutos podem implicar perda da reserva, sem direito a reembolso.',
      ]},
      { h: '5. Regras do estabelecimento', p: [
        'É proibido o ingresso de menores de 18 anos.',
        'Animais não são permitidos.',
        'Avarias causadas pelo cliente serão cobradas conforme tabela do estabelecimento.',
      ]},
      { h: '6. Limitação de responsabilidade', p: [
        'O Select Motel não se responsabiliza por objetos esquecidos nas suítes. Solicite o lacre da bagagem na recepção em caso de necessidade.',
      ]},
      { h: '7. Alteração destes termos', p: [
        'Estes termos podem ser atualizados a qualquer momento. A versão vigente é a publicada nesta página.',
      ]},
      { h: 'Última atualização', p: [TODAY]},
    ],
  },
  privacy: {
    title: 'Política de Privacidade',
    sections: [
      { h: '1. Quem é o controlador dos dados', p: [
        'O controlador dos dados pessoais coletados neste site é o Select Motel (Ivaiporã – PR), conforme endereço informado nos Termos de Uso.',
      ]},
      { h: '2. Quais dados coletamos', p: [
        'Coletamos: nome completo, CPF, telefone (WhatsApp), e-mail e observações opcionais informadas no momento da reserva.',
        'Coletamos também dados de uso (páginas visitadas, dispositivo, IP aproximado) por meio de Google Tag Manager e Google Ads.',
      ]},
      { h: '3. Finalidade do tratamento', p: [
        'Os dados pessoais são usados exclusivamente para: identificar o titular da reserva, processar o pagamento, enviar a confirmação por WhatsApp, organizar o atendimento no momento do check-in, e cumprir obrigações legais e fiscais.',
        'Os dados de uso (cookies/analytics) servem para entender o comportamento dos visitantes e melhorar o site e as campanhas.',
      ]},
      { h: '4. Compartilhamento', p: [
        'Compartilhamos dados estritamente com fornecedores necessários à prestação do serviço: AbacatePay (processamento de pagamento), Wuzapi/WhatsApp (envio da confirmação) e Google (analytics).',
        'Não vendemos nem cedemos dados pessoais a terceiros para fins de marketing externo.',
      ]},
      { h: '5. Prazo de retenção', p: [
        'Dados de reservas pagas são retidos por 5 anos por exigência fiscal. Reservas não concluídas (pending vencido) são apagadas em até 90 dias.',
      ]},
      { h: '6. Seus direitos (LGPD)', p: [
        'Você tem direito a: acessar seus dados, corrigir dados incorretos, solicitar exclusão dos dados (quando não houver obrigação legal de retenção), revogar consentimento e portabilidade.',
        'Para exercer qualquer desses direitos, entre em contato pelo WhatsApp (43) 99909-7482 informando seu CPF.',
      ]},
      { h: '7. Segurança', p: [
        'Os dados são armazenados em servidor com HTTPS, banco de dados criptografado em repouso e acesso restrito por chave SSH e autenticação por token. Pagamentos são processados pela AbacatePay; não armazenamos número de cartão de crédito.',
      ]},
      { h: '8. Cookies', p: [
        'Usamos cookies essenciais (sessão/auth) e de análise (Google Tag Manager / Google Ads). Você pode bloqueá-los nas configurações do navegador, mas algumas funcionalidades do site podem ser afetadas.',
      ]},
      { h: 'Última atualização', p: [TODAY]},
    ],
  },
}

interface Props { kind: LegalKind; onClose: () => void }

export default function LegalModal({ kind, onClose }: Props) {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onEsc)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onEsc)
    }
  }, [onClose])

  const { title, sections } = TEXTS[kind]

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-title"
      onClick={onClose}
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-gold-800/40 bg-[#0a0806] shadow-2xl"
      >
        <header className="flex items-center justify-between gap-4 px-5 sm:px-6 py-4 border-b border-gold-900/40 shrink-0">
          <h2 id="legal-title" className="font-serif text-xl sm:text-2xl text-gold-200">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="w-9 h-9 rounded-full flex items-center justify-center text-gold-400/80 hover:text-gold-200 hover:bg-white/5 transition-colors"
          >
            ✕
          </button>
        </header>

        <div className="overflow-y-auto px-5 sm:px-6 py-5 space-y-5 text-sm text-gold-300/85 leading-relaxed">
          {sections.map(({ h, p }) => (
            <section key={h}>
              <h3 className="text-gold-200 font-semibold mb-2">{h}</h3>
              {p.map((t, i) => (
                <p key={i} className="mb-2 last:mb-0">{t}</p>
              ))}
            </section>
          ))}
        </div>

        <footer className="px-5 sm:px-6 py-3 border-t border-gold-900/40 text-right shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-gold-700/20 border border-gold-700/40 text-gold-200 hover:bg-gold-700/30"
          >
            Fechar
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
