-- =============================================================
-- Integração MotelMais PlugPlay (https://oxpi.com.br/api/PlugPlay)
-- =============================================================
-- Duas direções:
--   1. push  — reserva paga no site vira reserva no PMS (POST /api/Reserva)
--   2. pull  — disponibilidade real do PMS antes de fechar a venda
--              (GET /api/ReservaDisponibilidade/PorSuiteId)
--
-- Ambas dependem de saber, para cada suíte nossa, qual é a suíte lá.
-- O PMS identifica de duas formas e aceita qualquer uma no POST:
--   - suiteId                     → suíte específica
--   - suiteCategoriaIntegracaoId  → categoria; o PMS escolhe a suíte livre
--                                   com menor ocupação nos últimos 30 dias
-- Mapeamos as duas: pms_suite_id é o caminho preferido (o cliente escolheu
-- uma suíte concreta no site), pms_categoria_id é o fallback.

-- ── 1. suites: mapeamento para o PMS ─────────────────────────────────────────
ALTER TABLE suites
  ADD COLUMN IF NOT EXISTS pms_suite_id     integer,
  ADD COLUMN IF NOT EXISTS pms_categoria_id integer;

COMMENT ON COLUMN suites.pms_suite_id IS
  'Reserva.suiteId no MotelMais PlugPlay. NULL = suíte não mapeada: o push cai '
  'para pms_categoria_id e a checagem de disponibilidade no PMS é pulada.';
COMMENT ON COLUMN suites.pms_categoria_id IS
  'Reserva.suiteCategoriaIntegracaoId no MotelMais PlugPlay. Usado quando '
  'pms_suite_id é NULL — o PMS escolhe a suíte livre da categoria.';

-- Lookup por id do PMS (usado ao reconciliar retorno da API)
CREATE INDEX IF NOT EXISTS idx_suites_pms_suite_id
  ON suites (pms_suite_id)
  WHERE pms_suite_id IS NOT NULL;

-- ── 2. reservations: estado da sincronização ─────────────────────────────────
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS pms_reserva_id text,
  ADD COLUMN IF NOT EXISTS pms_synced_at  timestamptz,
  ADD COLUMN IF NOT EXISTS pms_last_error text;

COMMENT ON COLUMN reservations.pms_reserva_id IS
  'Reserva.id devolvido pelo PlugPlay. Preenchido = reserva existe lá.';
COMMENT ON COLUMN reservations.pms_synced_at IS
  'Quando o push concluiu com sucesso. NULL com status=paid indica pendência.';
COMMENT ON COLUMN reservations.pms_last_error IS
  'Último erro do push. Limpo em caso de sucesso.';

-- O PlugPlay deduplica por (integracaoId, integracaoAppId) e devolve 400 se
-- repetir. Mandamos o UUID da nossa reservation como integracaoId, então o
-- índice abaixo é só para diagnóstico/reconciliação — a idempotência real é lá.
CREATE INDEX IF NOT EXISTS idx_reservations_pms_reserva_id
  ON reservations (pms_reserva_id)
  WHERE pms_reserva_id IS NOT NULL;

-- Reservas pagas que ainda não chegaram no PMS — é esta a fila que importa
-- olhar quando o motel reclamar que uma reserva não apareceu na recepção.
CREATE INDEX IF NOT EXISTS idx_reservations_pms_pending
  ON reservations (created_at)
  WHERE status = 'paid' AND pms_synced_at IS NULL;

-- ── 3. View de diagnóstico ───────────────────────────────────────────────────
CREATE OR REPLACE VIEW pms_sync_pendentes AS
  SELECT r.id,
         r.created_at,
         r.check_in,
         r.customer_name,
         r.customer_phone,
         r.total_amount,
         s.name        AS suite_nome,
         s.pms_suite_id,
         s.pms_categoria_id,
         r.pms_last_error
    FROM reservations r
    LEFT JOIN suites s ON s.id = r.suite_id
   WHERE r.status = 'paid'
     AND r.pms_synced_at IS NULL
   ORDER BY r.created_at DESC;

COMMENT ON VIEW pms_sync_pendentes IS
  'Reservas pagas que ainda não foram confirmadas no MotelMais PlugPlay.';

GRANT SELECT ON pms_sync_pendentes TO service_role;
