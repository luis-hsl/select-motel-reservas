-- Fix 1: permite que usuários autenticados (admin) gerenciem promoções
CREATE POLICY "promotions_admin_all" ON promotions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Fix 2: coluna para redirecionar a uma etapa do app (null = usa button_url)
ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS button_step integer;
