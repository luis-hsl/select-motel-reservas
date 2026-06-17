-- =============================================================
-- Sincroniza colunas ausentes no projeto trfzjleivvbogdwelfhv
-- (migrations do projeto anterior nunca foram aplicadas aqui)
-- =============================================================

-- ── 1. reservations: package_id pode ser NULL (modes experience/suite) ────────
ALTER TABLE reservations
  ALTER COLUMN package_id DROP NOT NULL;

-- ── 2. reservations: coluna mode ─────────────────────────────────────────────
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'package';

-- Garante o constraint com os 3 modos válidos (package, experience, suite)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reservations_mode_check' AND conrelid = 'reservations'::regclass
  ) THEN
    ALTER TABLE reservations
      ADD CONSTRAINT reservations_mode_check
        CHECK (mode IN ('package', 'experience', 'suite'));
  END IF;
END $$;

-- ── 3. reservations: coluna extras ───────────────────────────────────────────
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS extras JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_reservations_extras_gin
  ON reservations USING gin (extras);

-- ── 4. reservations: ampliar check de type para incluir diaria e oneHour ─────
-- O check original só tinha 'period' e 'overnight'.
ALTER TABLE reservations
  DROP CONSTRAINT IF EXISTS reservations_type_check;

ALTER TABLE reservations
  ADD CONSTRAINT reservations_type_check
    CHECK (type IN ('period', 'overnight', 'diaria', 'oneHour'));

-- ── 5. suites: preços a la carte (modo Experiência) ──────────────────────────
ALTER TABLE suites
  ADD COLUMN IF NOT EXISTS price_period_alacarte    numeric(10,2),
  ADD COLUMN IF NOT EXISTS price_overnight_alacarte numeric(10,2);

-- ── 6. rate_limit: tabela e funções anti-spam ─────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limit (
  bucket       text PRIMARY KEY,
  count        integer     NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_window ON rate_limit (window_start);

CREATE OR REPLACE FUNCTION rate_limit_hit(
  p_bucket   text,
  p_max      integer,
  p_window_s integer
) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE v_count integer;
BEGIN
  INSERT INTO rate_limit (bucket, count, window_start) VALUES (p_bucket, 1, now())
  ON CONFLICT (bucket) DO UPDATE
    SET count        = CASE WHEN rate_limit.window_start < now() - make_interval(secs => p_window_s)
                            THEN 1 ELSE rate_limit.count + 1 END,
        window_start = CASE WHEN rate_limit.window_start < now() - make_interval(secs => p_window_s)
                            THEN now() ELSE rate_limit.window_start END
  RETURNING count INTO v_count;
  RETURN v_count > p_max;
END;
$$;

GRANT EXECUTE ON FUNCTION rate_limit_hit(text, integer, integer) TO service_role;

-- ── 7. notification_queue: fila de notificações WhatsApp ─────────────────────
CREATE TABLE IF NOT EXISTS notification_queue (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text        NOT NULL,
  payload         jsonb       NOT NULL,
  status          text        NOT NULL DEFAULT 'pending',
  attempts        integer     NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  CONSTRAINT notification_queue_status_check
    CHECK (status IN ('pending','sent','failed'))
);

CREATE INDEX IF NOT EXISTS idx_notification_queue_due
  ON notification_queue (next_attempt_at)
  WHERE status = 'pending';

ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_queue_service_all ON notification_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 8. get_occupied_suite_ids: função de disponibilidade ─────────────────────
CREATE OR REPLACE FUNCTION get_occupied_suite_ids(
  p_check_in  timestamptz,
  p_check_out timestamptz
)
RETURNS TABLE(suite_id text)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT r.suite_id::text
  FROM   reservations r
  WHERE  r.status IN ('paid', 'pending')
    AND  r.check_in  < p_check_out
    AND  r.check_out > p_check_in;
END;
$$;

GRANT EXECUTE ON FUNCTION get_occupied_suite_ids(timestamptz, timestamptz)
  TO anon, authenticated;
