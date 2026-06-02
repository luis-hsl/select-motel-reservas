-- Persiste as escolhas do checkout (bebida, comida, label do pacote, etc).
-- Esses campos não vinham na reserva e por isso a notificação do motel
-- não conseguia mostrar "o que pediram".
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS extras JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Index leve pra eventualmente filtrar por algum extra no admin.
CREATE INDEX IF NOT EXISTS idx_reservations_extras_gin ON reservations USING gin (extras);
