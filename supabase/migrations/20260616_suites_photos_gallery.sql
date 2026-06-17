-- Adiciona coluna de galeria de fotos às suítes (array de URLs, até 15 por suíte)
ALTER TABLE suites ADD COLUMN IF NOT EXISTS photos text[] DEFAULT '{}';
