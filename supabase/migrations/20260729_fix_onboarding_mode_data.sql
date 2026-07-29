-- =============================================================
-- Recupera onboarding_sessions.mode a partir da reserva
-- =============================================================
-- Contexto: até 2026-07-29 dois UPDATEs de backfill rodavam sem teto de data a
-- cada push do migrate.yml (que re-roda todas as migrations), estampando
-- mode='package' em qualquer sessão com mode NULL. Atingiu dois grupos:
--
--   1. Sessões do modo 'suite'. A edge function track-onboarding só aceitava
--      'package' e 'experience' — 'suite' virava NULL. Ou seja TODA sessão de
--      suíte ficava NULL e era candidata a ser estampada como 'package'.
--   2. Sessões abandonadas antes do cliente escolher o modo.
--
-- Para sessão convertida existe fonte da verdade: reservations.mode, gravado no
-- checkout e ligado pela onboarding_mark_converted(). Este arquivo restaura
-- essas — e somente essas.
--
-- Segunda fonte da verdade: leads.mode. O StepEscolha chama insert_lead() com
-- p_mode = modo escolhido e p_session_token = mesmo token da sessão. Cobre quem
-- preencheu o formulário mas não pagou — grupo que reservations não alcança.
--
-- Terceiro: sessão com max_step = 1 provadamente nunca teve modo. Em
-- StepEscolha.advance() o setMode(picked) e o nextStep() acontecem no mesmo
-- batch síncrono, então o app nunca reporta mode com step 1 — o primeiro ping
-- com modo já vai como step 2. Portanto mode NULL era o valor correto e o
-- 'package' que está lá foi estampado pelo backfill. Voltam para NULL, que é o
-- honesto: o admin já tem bucket "sem modo definido" para isso.
--
-- O que continua NÃO recuperável: sessão com max_step entre 2 e 6, sem lead e
-- sem reserva. Aí o app realmente gravou um modo (chegou ao step 2), então o
-- valor é confiável — não há nada a corrigir. O contador final confirma isso.
--
-- Idempotente: os guards `IS DISTINCT FROM` / `IS NOT NULL` fazem o re-run virar
-- no-op.

DO $$
DECLARE
  a_pkg int; a_exp int; a_suite int; a_null int;
  d_pkg int; d_exp int; d_suite int; d_null int;
  corrigidas    int;
  via_leads     int;
  zerados       int;
  confiaveis    int;
  suite_conv    int;
BEGIN
  SELECT count(*) FILTER (WHERE mode = 'package'),
         count(*) FILTER (WHERE mode = 'experience'),
         count(*) FILTER (WHERE mode = 'suite'),
         count(*) FILTER (WHERE mode IS NULL)
    INTO a_pkg, a_exp, a_suite, a_null
    FROM public.onboarding_sessions;

  RAISE NOTICE '[mode] ANTES  package=% experience=% suite=% null=%',
               a_pkg, a_exp, a_suite, a_null;

  -- ── Recuperação exata: o modo com que a reserva foi realmente criada ───────
  UPDATE public.onboarding_sessions s
     SET mode = r.mode
    FROM public.reservations r
   WHERE s.reservation_id = r.id
     AND r.mode IS NOT NULL
     AND s.mode IS DISTINCT FROM r.mode;
  GET DIAGNOSTICS corrigidas = ROW_COUNT;

  -- ── Recuperação exata 2: modo escolhido, gravado junto com o lead ──────────
  -- DISTINCT ON porque o mesmo session_token pode ter gerado vários leads
  -- (cliente voltou e reenviou o formulário) — vale o mais recente.
  -- Não toca em sessão convertida: ali reservations.mode é a fonte mais forte
  -- (o que foi efetivamente reservado) e já resolveu acima.
  UPDATE public.onboarding_sessions s
     SET mode = l.mode
    FROM (
      SELECT DISTINCT ON (session_token) session_token, mode
        FROM public.leads
       WHERE session_token IS NOT NULL AND mode IS NOT NULL
       ORDER BY session_token, created_at DESC
    ) l
   WHERE s.session_token = l.session_token
     AND s.reservation_id IS NULL
     AND s.mode IS DISTINCT FROM l.mode;
  GET DIAGNOSTICS via_leads = ROW_COUNT;

  -- ── Desfaz o estampado: max_step = 1 nunca teve modo ──────────────────────
  UPDATE public.onboarding_sessions
     SET mode = NULL
   WHERE mode IS NOT NULL
     AND COALESCE(max_step, 1) <= 1
     AND reservation_id IS NULL
     AND session_token NOT IN (
       SELECT session_token FROM public.leads
        WHERE session_token IS NOT NULL AND mode IS NOT NULL
     );
  GET DIAGNOSTICS zerados = ROW_COUNT;

  SELECT count(*) FILTER (WHERE mode = 'package'),
         count(*) FILTER (WHERE mode = 'experience'),
         count(*) FILTER (WHERE mode = 'suite'),
         count(*) FILTER (WHERE mode IS NULL)
    INTO d_pkg, d_exp, d_suite, d_null
    FROM public.onboarding_sessions;

  RAISE NOTICE '[mode] DEPOIS package=% experience=% suite=% null=%',
               d_pkg, d_exp, d_suite, d_null;
  RAISE NOTICE '[mode] corrigidas via reservations.mode (convertidas): %', corrigidas;
  RAISE NOTICE '[mode] corrigidas via leads.mode (preencheram o form): %', via_leads;
  RAISE NOTICE '[mode] estampadas pelo backfill, revertidas para NULL (max_step=1): %', zerados;

  -- Restante com modo preenchido e sem fonte externa: chegou ao step 2, logo o
  -- app gravou o modo. Confiável — contado só para fechar a conta.
  SELECT count(*) INTO confiaveis
    FROM public.onboarding_sessions
   WHERE mode IS NOT NULL
     AND COALESCE(max_step, 1) >= 2;

  RAISE NOTICE '[mode] com modo gravado pelo app (max_step>=2, confiável): %', confiaveis;

  SELECT count(*) INTO suite_conv
    FROM public.onboarding_sessions
   WHERE mode = 'suite';

  RAISE NOTICE '[mode] sessões em modo suite (antes invisíveis no admin): %', suite_conv;
END $$;
