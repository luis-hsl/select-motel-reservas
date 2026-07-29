-- =============================================================
-- Arquivo de conversas do WhatsApp (entrada e saída)
-- =============================================================
-- O Wuzapi é um gateway de envio: mensagem recebida que não é entregue a um
-- webhook é descartada em tempo real. Não existe endpoint de histórico — nem
-- no Wuzapi nem no próprio WhatsApp, cujo protocolo multi-dispositivo entrega
-- a mensagem uma vez e deixa o histórico no aparelho. Esta tabela é a única
-- memória de atendimento que o sistema tem, e só vale daqui pra frente.
--
-- Conteúdo é sensível (conversa de motel + telefone). Duas defesas:
--   1. RLS sem policy pra anon/authenticated — só service_role enxerga.
--   2. Retenção curta com expurgo automático (ver purge_whatsapp_messages).
--
-- Idempotente: migrate.yml re-roda todas as migrations a cada push, e com
-- ON_ERROR_STOP=1 qualquer erro aborta o arquivo inteiro no meio.

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Tipo do evento do Wuzapi ("Message", "ReadReceipt", ...). Guardamos o que
  -- chegar; hoje só assinamos Message, mas o campo não custa nada.
  event_type    text        NOT NULL DEFAULT 'Message',
  -- ID da mensagem no WhatsApp. Chave de deduplicação: o Wuzapi reentrega o
  -- webhook quando não recebe 2xx.
  wa_message_id text,
  -- JID da conversa: "5511...@s.whatsapp.net" (direta) ou "...@g.us" (grupo).
  chat_jid      text,
  -- Só os dígitos do remetente, no formato que reservations.customer_phone usa
  -- depois de normalizado — é por aqui que se cruza conversa com reserva.
  sender_phone  text,
  is_group      boolean     NOT NULL DEFAULT false,
  -- true = mensagem que o motel enviou (pelo painel ou pelo próprio celular).
  -- Precisa dos dois lados pra reconstruir o atendimento.
  from_me       boolean     NOT NULL DEFAULT false,
  body          text,
  -- Horário informado pelo WhatsApp. Pode divergir de received_at quando o
  -- celular estava sem rede e sincroniza depois.
  sent_at       timestamptz,
  -- Payload cru. O formato exato do Wuzapi não está documentado no README, e
  -- muda entre versões da imagem :latest — guardar o original garante que uma
  -- extração errada acima seja recuperável sem perder dado.
  payload       jsonb       NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now()
);

-- Deduplicação das reentregas. Parcial porque wa_message_id pode vir nulo em
-- evento cujo formato não reconhecemos — nesse caso grava duplicado mesmo, é
-- melhor que perder.
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_wa_id
  ON whatsapp_messages (wa_message_id)
  WHERE wa_message_id IS NOT NULL;

-- Reconstruir uma conversa em ordem.
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_chat
  ON whatsapp_messages (chat_jid, sent_at DESC);

-- Cruzar atendimento com reserva por telefone.
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_sender
  ON whatsapp_messages (sender_phone)
  WHERE sender_phone IS NOT NULL;

-- Varredura do expurgo.
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_received
  ON whatsapp_messages (received_at);

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- Postgres não tem CREATE POLICY IF NOT EXISTS — DROP antes é o idioma padrão.
-- Não existe policy de leitura pra anon/authenticated, e isso é deliberado:
-- com RLS ligada e nenhuma policy, a tabela some da API pública. Só o
-- service_role (edge functions) enxerga.
DROP POLICY IF EXISTS "whatsapp_messages_service_all" ON whatsapp_messages;
CREATE POLICY "whatsapp_messages_service_all" ON whatsapp_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Expurgo ──────────────────────────────────────────────────────────────────
-- Retenção de 90 dias. O projeto não usa pg_cron, então quem dispara é a
-- própria edge function, de forma probabilística (~1 chamada em 100). Com o
-- volume de um motel isso roda algumas vezes por semana, que é frequência de
-- sobra pra uma janela de 90 dias — e não adiciona nada pra manter.
CREATE OR REPLACE FUNCTION purge_whatsapp_messages(p_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM whatsapp_messages
   WHERE received_at < now() - make_interval(days => p_days);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION purge_whatsapp_messages(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_whatsapp_messages(integer) TO service_role;

COMMENT ON TABLE whatsapp_messages IS
  'Arquivo de atendimento do WhatsApp, alimentado pelo webhook do Wuzapi '
  '(supabase/functions/wuzapi-webhook). Só daqui pra frente: não há como '
  'recuperar conversa anterior à ativação do webhook. Retenção 90 dias.';
