-- Adiciona 'suite' como modo válido na coluna mode da tabela reservations.
-- A constraint original (criada em 20260608_experience_mode.sql) só permitia
-- 'package' e 'experience', causando violação ao usar o fluxo de suíte avulsa.

ALTER TABLE reservations
  DROP CONSTRAINT IF EXISTS reservations_mode_check;

ALTER TABLE reservations
  ADD CONSTRAINT reservations_mode_check
    CHECK (mode IN ('package', 'experience', 'suite'));
