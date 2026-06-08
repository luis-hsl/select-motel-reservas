-- ============================================================
-- Corrige IDs dos itens de decoração e define preços a la carte
-- das suítes para o modo Experiência.
-- ============================================================

-- 1) Remove placeholders com IDs errados (não seguiam o padrão extra-deco-*)
DELETE FROM experience_items
  WHERE id IN ('extra-decoracao', 'extra-petalas', 'extra-hidro', 'extra-surpresa');

-- 2) Insere decorações com IDs corretos (padrão esperado pelo front: extra-deco-<tier>)
INSERT INTO experience_items (id, category, label, description, price, sort_order) VALUES
  ('extra-deco-bronze', 'extra', 'Decoração Bronze', 'Decoração romântica com velas e iluminação básica',  0, 10),
  ('extra-deco-prata',  'extra', 'Decoração Prata',  'Decoração com velas, iluminação e pétalas de rosa',  0, 20),
  ('extra-deco-ouro',   'extra', 'Decoração Ouro',   'Decoração completa com velas, pétalas e surpresas',  0, 30)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ATENÇÃO: atualize os preços abaixo com os valores reais.
-- price = 0 é placeholder — o front exibe "—" em vez de R$ 0,00.
-- ============================================================

-- UPDATE experience_items SET price = 150 WHERE id = 'extra-deco-bronze';
-- UPDATE experience_items SET price = 250 WHERE id = 'extra-deco-prata';
-- UPDATE experience_items SET price = 350 WHERE id = 'extra-deco-ouro';

-- 3) Preços a la carte das suítes (suite sem preço = R$ 0 no total — CORRIJA AQUI)
--    Esses valores somam ao subtotal de itens quando mode = 'experience'.

-- ── VIP Piscina (Suítes 14 e 16) ─────────────────────────────
-- UPDATE suites SET price_period_alacarte = 0, price_overnight_alacarte = 0
--   WHERE id IN ('suite-14', 'suite-16');

-- ── Hidro (Suítes 15 e 18) ───────────────────────────────────
-- UPDATE suites SET price_period_alacarte = 0, price_overnight_alacarte = 0
--   WHERE id IN ('suite-15', 'suite-18');

-- ── Hidro Light (Suítes 12 e 13) ─────────────────────────────
-- UPDATE suites SET price_period_alacarte = 0, price_overnight_alacarte = 0
--   WHERE id IN ('suite-12', 'suite-13');

-- ── Standard (Suítes 11, 17, 22, 23, 24, 25, 26) ─────────────
-- UPDATE suites SET price_period_alacarte = 0, price_overnight_alacarte = 0
--   WHERE id IN ('suite-11', 'suite-17', 'suite-22', 'suite-23', 'suite-24', 'suite-25', 'suite-26');
