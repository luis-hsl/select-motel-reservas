-- Adiciona coluna `mode` na onboarding_sessions pra separar funil de
-- Pacote vs Experiência no admin Ao Vivo. NULL = sessão antiga ou
-- ainda não escolheu (ping de step 1 sem submit).

ALTER TABLE public.onboarding_sessions
  ADD COLUMN IF NOT EXISTS mode text;

-- Backfill heurístico pra sessões antigas: max_step ≥ 7 → pacote
-- (o funil antigo tinha 8 e 7; agora é 7 e 6 — então só max_step extremos são confiáveis).
UPDATE public.onboarding_sessions
SET    mode = 'package'
WHERE  mode IS NULL AND max_step >= 7;

-- Index opcional pra filtros rápidos no admin
CREATE INDEX IF NOT EXISTS onboarding_sessions_mode_idx
  ON public.onboarding_sessions (mode);
