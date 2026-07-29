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
-- O que NÃO é recuperável, e por que fica como está: sessão não convertida com
-- max_step <= 6. Um 'package' gravado pelo app (cliente escolheu pacote e
-- desistiu no meio) é byte-a-byte indistinguível de um 'package' estampado pelo
-- backfill — nenhuma coluna guarda o valor anterior nem quando mudou. Reescrever
-- esse grupo em massa destruiria dado bom junto com o ruim, o que é pior que o
-- ruído atual. Os contadores abaixo dimensionam o grupo no log do workflow.
--
-- Idempotente: o guard `IS DISTINCT FROM` faz o re-run não tocar em nada.

DO $$
DECLARE
  a_pkg int; a_exp int; a_suite int; a_null int;
  d_pkg int; d_exp int; d_suite int; d_null int;
  corrigidas    int;
  ambiguas      int;
  suite_no_pms  int;
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

  SELECT count(*) FILTER (WHERE mode = 'package'),
         count(*) FILTER (WHERE mode = 'experience'),
         count(*) FILTER (WHERE mode = 'suite'),
         count(*) FILTER (WHERE mode IS NULL)
    INTO d_pkg, d_exp, d_suite, d_null
    FROM public.onboarding_sessions;

  RAISE NOTICE '[mode] DEPOIS package=% experience=% suite=% null=%',
               d_pkg, d_exp, d_suite, d_null;
  RAISE NOTICE '[mode] convertidas corrigidas via reservations.mode: %', corrigidas;

  -- ── Dimensiona o que sobrou sem fonte da verdade ───────────────────────────
  -- max_step >= 7 só é alcançável no fluxo de pacote (suíte e experiência têm
  -- 6 steps), então esses 'package' são confiáveis mesmo sem conversão.
  SELECT count(*) INTO ambiguas
    FROM public.onboarding_sessions
   WHERE mode = 'package'
     AND reservation_id IS NULL
     AND COALESCE(max_step, 1) <= 6;

  RAISE NOTICE '[mode] ambíguas (package, sem reserva, max_step<=6) — podem ser '
               'suite/experience/package-abandonado, mantidas como estão: %', ambiguas;

  -- Sessões de suíte que converteram mas cuja reserva não tem mapeamento PMS:
  -- não afeta o funil, só sinaliza cadastro incompleto.
  SELECT count(*) INTO suite_no_pms
    FROM public.onboarding_sessions s
    JOIN public.reservations r ON r.id = s.reservation_id
   WHERE r.mode = 'suite';

  RAISE NOTICE '[mode] sessões convertidas em modo suite (antes invisíveis no admin): %',
               suite_no_pms;
END $$;
