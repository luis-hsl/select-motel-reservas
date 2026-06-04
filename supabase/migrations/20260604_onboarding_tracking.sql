-- =============================================================
-- Onboarding tracking — visão ao vivo de sessões no checkout
-- =============================================================
-- Sem PII até o cliente preencher StepDados. IP é hasheado.
CREATE TABLE IF NOT EXISTS onboarding_sessions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token   text        NOT NULL UNIQUE,   -- vem do localStorage do cliente
  started_at      timestamptz NOT NULL DEFAULT now(),
  last_active_at  timestamptz NOT NULL DEFAULT now(),
  current_step    integer     NOT NULL DEFAULT 1,
  max_step        integer     NOT NULL DEFAULT 1, -- maior step atingido (pro funil)
  steps_history   jsonb       NOT NULL DEFAULT '[]'::jsonb,
                                                  -- [{ "step": 1, "at": "2026-…" }, ...]
  user_agent      text,
  device          text,                          -- 'mobile' | 'tablet' | 'desktop'
  referrer        text,
  landing_path    text,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_content     text,
  utm_term        text,
  ip_hash         text,                          -- sha256(ip + salt) — não reverteable
  converted       boolean     NOT NULL DEFAULT false,
  reservation_id  uuid                           REFERENCES reservations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_onboarding_active     ON onboarding_sessions (last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_onboarding_started    ON onboarding_sessions (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_onboarding_converted  ON onboarding_sessions (converted, started_at DESC);

ALTER TABLE onboarding_sessions ENABLE ROW LEVEL SECURITY;

-- Anon NÃO lê — só admin (authenticated) pode ler no painel
CREATE POLICY onboarding_read_authenticated ON onboarding_sessions
  FOR SELECT TO authenticated USING (true);

-- Service role faz tudo (edge function track-onboarding)
CREATE POLICY onboarding_service_role_all ON onboarding_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Realtime: liga publicação só dessa tabela pro admin escutar
ALTER PUBLICATION supabase_realtime ADD TABLE onboarding_sessions;

-- Housekeeping: remove sessões abandonadas há mais de 90 dias
CREATE OR REPLACE FUNCTION onboarding_cleanup() RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM onboarding_sessions
   WHERE converted = false
     AND last_active_at < now() - interval '90 days';
$$;

GRANT EXECUTE ON FUNCTION onboarding_cleanup() TO service_role;

-- Função pra marcar a sessão como convertida quando o pagamento confirmar
CREATE OR REPLACE FUNCTION onboarding_mark_converted(
  p_session_token text,
  p_reservation_id uuid
) RETURNS void
LANGUAGE sql
AS $$
  UPDATE onboarding_sessions
     SET converted = true,
         reservation_id = p_reservation_id,
         last_active_at = now()
   WHERE session_token = p_session_token;
$$;

GRANT EXECUTE ON FUNCTION onboarding_mark_converted(text, uuid) TO service_role;
