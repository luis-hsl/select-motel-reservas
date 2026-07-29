-- =============================================================
-- pms_sync_pendentes: só o que ainda dá para resolver
-- =============================================================
-- A versão anterior listava toda reserva paga sem pms_synced_at — o que inclui
-- as pagas antes da integração existir. Em produção isso já nasceu com 3 falsos
-- positivos de julho/2026, com check-in vencido.
--
-- O problema não é o ruído em si: é que um erro de sync de verdade ficaria
-- enterrado no meio deles, e a view existe justamente para ser o sinal de
-- "alguma reserva não chegou na recepção".
--
-- Passa a listar só reservas com check-in no futuro: as vencidas são
-- irrelevantes (a estadia já aconteceu) e saem sozinhas conforme o tempo passa.

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
     AND r.check_in > now()
   ORDER BY r.check_in;

COMMENT ON VIEW pms_sync_pendentes IS
  'Reservas pagas com check-in futuro que ainda não foram confirmadas no '
  'MotelMais PlugPlay. Vazia = tudo em dia. Reservas vencidas são omitidas: '
  'sincronizá-las não teria efeito.';

GRANT SELECT ON pms_sync_pendentes TO service_role;
