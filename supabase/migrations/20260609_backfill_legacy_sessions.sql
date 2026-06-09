-- Recupera sessões antigas pra encaixarem no novo funil de Pacote.
--
-- Contexto:
--   • Até 2026-06-08 ~16h UTC, só existia o fluxo Pacote (8 steps):
--       Escolha → Pacote → Tipo → Data → Suíte → Cardápio → Dados → Pagamento
--   • Depois do commit 1fb51a5 (2026-06-08 ~16h UTC) o fluxo virou 7 steps,
--     o StepDados foi fundido inline no StepEscolha, e o modo Experiência
--     (6 steps, sem StepPacote) passou a existir.
--
-- Como a estrutura mudou, sessões antigas têm steps numeradas no esquema
-- velho (1..8) mas o admin agora exibe o esquema novo (1..7). Sem remap,
-- todas as sessões antigas caíam no bucket "indefinido" do funil — perdendo
-- ~1800 pontos de dados.
--
-- Esta migration:
--   1) Marca como 'package' todas as sessões anteriores ao cutoff (era o único
--      modo possível).
--   2) Remap das steps antigas pro layout novo:
--        old 8 (Pagamento) → new 7 (Pagamento)
--        old 7 (Dados)     → new 6 (Extras)  — porque o cliente completou
--                                              Cardápio e parou em Dados,
--                                              que hoje vive dentro do Step 1
--        old 1..6          → idem
--   3) Mesmo remap aplicado em steps_history.
--   4) Sessões pós-cutoff que ainda estejam com mode=NULL (corrida entre
--      backfill e deploy do tracking novo) também recebem 'package' como
--      fallback — pacote é o card recomendado e a esmagadora maioria.

DO $$
DECLARE
  cutoff timestamptz := '2026-06-08 16:00:00+00';
BEGIN
  -- 1 + 2: backfill mode e remap steps das sessões antigas
  UPDATE public.onboarding_sessions
  SET    mode         = 'package',
         current_step = CASE
                          WHEN current_step >= 8 THEN 7
                          WHEN current_step = 7  THEN 6
                          ELSE current_step
                        END,
         max_step     = CASE
                          WHEN max_step >= 8 THEN 7
                          WHEN max_step = 7  THEN 6
                          ELSE max_step
                        END,
         steps_history = (
           SELECT jsonb_agg(
                    jsonb_build_object(
                      'step',
                      CASE
                        WHEN (entry->>'step')::int >= 8 THEN 7
                        WHEN (entry->>'step')::int  = 7 THEN 6
                        ELSE (entry->>'step')::int
                      END,
                      'at', entry->>'at'
                    )
                    ORDER BY entry->>'at'
                  )
           FROM   jsonb_array_elements(COALESCE(steps_history, '[]'::jsonb)) AS entry
         )
  WHERE  started_at < cutoff
    AND  (mode IS NULL OR mode <> 'package');

  -- 4: fallback pra sessões pós-cutoff sem mode (race entre deploy e tracking)
  UPDATE public.onboarding_sessions
  SET    mode = 'package'
  WHERE  mode IS NULL
    AND  started_at >= cutoff;
END $$;
