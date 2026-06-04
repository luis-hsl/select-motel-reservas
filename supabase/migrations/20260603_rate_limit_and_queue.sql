-- =============================================================
-- 1) Rate limit por bucket — anti-spam para abacatepay-create-charge
-- =============================================================
-- Bucket é uma chave arbitrária (ex: 'create-charge:ip:1.2.3.4' ou
-- 'create-charge:email:foo@x.com'). Janela rolante de 60s.
CREATE TABLE IF NOT EXISTS rate_limit (
  bucket       text PRIMARY KEY,
  count        integer     NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_window ON rate_limit (window_start);

-- Atomicamente incrementa o contador, resetando se a janela passou.
-- Retorna TRUE quando estourou o limite (deve negar a requisição).
CREATE OR REPLACE FUNCTION rate_limit_hit(
  p_bucket    text,
  p_max       integer,
  p_window_s  integer
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO rate_limit (bucket, count, window_start)
  VALUES (p_bucket, 1, now())
  ON CONFLICT (bucket) DO UPDATE
    SET count        = CASE WHEN rate_limit.window_start < now() - make_interval(secs => p_window_s)
                            THEN 1
                            ELSE rate_limit.count + 1 END,
        window_start = CASE WHEN rate_limit.window_start < now() - make_interval(secs => p_window_s)
                            THEN now()
                            ELSE rate_limit.window_start END
  RETURNING count INTO v_count;

  RETURN v_count > p_max;
END;
$$;

GRANT EXECUTE ON FUNCTION rate_limit_hit(text, integer, integer) TO service_role;

-- Limpeza periódica das chaves antigas (chamada pelo cron junto do queue worker)
CREATE OR REPLACE FUNCTION rate_limit_cleanup() RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM rate_limit WHERE window_start < now() - interval '1 hour';
$$;

GRANT EXECUTE ON FUNCTION rate_limit_cleanup() TO service_role;


-- =============================================================
-- 2) Fila de notificações — garantia de entrega das mensagens
-- =============================================================
-- Quando o pagamento confirma, o webhook insere uma linha aqui em vez de
-- chamar send-reservation-whatsapp direto. Um worker (process-notifications-queue)
-- consome a fila com retry exponencial.
CREATE TABLE IF NOT EXISTS notification_queue (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text        NOT NULL,    -- ex: 'reservation_whatsapp'
  payload      jsonb       NOT NULL,    -- ex: { "reservationId": "..." }
  status       text        NOT NULL DEFAULT 'pending',  -- pending|sent|failed
  attempts     integer     NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  sent_at      timestamptz,
  CONSTRAINT notification_queue_status_check
    CHECK (status IN ('pending','sent','failed'))
);

CREATE INDEX IF NOT EXISTS idx_notification_queue_due
  ON notification_queue (next_attempt_at)
  WHERE status = 'pending';

-- Apaga itens entregues há mais de 30 dias
CREATE OR REPLACE FUNCTION notification_queue_cleanup() RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM notification_queue
   WHERE status IN ('sent','failed') AND sent_at < now() - interval '30 days';
$$;

GRANT EXECUTE ON FUNCTION notification_queue_cleanup() TO service_role;
