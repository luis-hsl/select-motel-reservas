-- =============================================================
-- Mapeamento suites ↔ MotelMais PlugPlay
-- =============================================================
-- Extraído de GET /api/SuitesStatus em 29/07/2026. As 13 suítes batem 1:1
-- com as nossas — mesmos números de quarto, mesmas 4 categorias.
--
-- Atenção: o `id` do PMS NÃO é o número do quarto. Ele expõe os dois:
--   id  → Reserva.suiteId (o que a API consome)
--   ref → número do quarto (o que a recepção e o site usam)
-- Ex.: quarto 12 é id=8; quarto 14 é id=12. Mapear pelo número quebraria.
--
-- Categorias (classeId no PMS):
--   1 SUÍTE             → Standard
--   2 HIDRO LIGHT       → Hidrolite
--   3 SUÍTE HIDRO       → Hidro
--   4 SUÍTE VIP PISCINA → VIP Piscina

UPDATE suites SET pms_suite_id = v.pms_id, pms_categoria_id = v.classe_id
  FROM (VALUES
    -- (suite_id, pms suiteId, classeId)   -- quarto / categoria
    ('suite-11',  1, 1),   -- 11  Standard
    ('suite-17',  2, 1),   -- 17  Standard
    ('suite-22',  3, 1),   -- 22  Standard
    ('suite-23',  4, 1),   -- 23  Standard
    ('suite-24',  5, 1),   -- 24  Standard
    ('suite-25',  6, 1),   -- 25  Standard
    ('suite-26',  7, 1),   -- 26  Standard
    ('suite-12',  8, 2),   -- 12  Hidrolite
    ('suite-13',  9, 2),   -- 13  Hidrolite
    ('suite-15', 10, 3),   -- 15  Hidro
    ('suite-18', 11, 3),   -- 18  Hidro
    ('suite-14', 12, 4),   -- 14  VIP Piscina
    ('suite-16', 13, 4)    -- 16  VIP Piscina
  ) AS v(suite_id, pms_id, classe_id)
 WHERE suites.id = v.suite_id;

-- Salvaguarda: se o cadastro local divergir do PMS, é melhor falhar a migration
-- do que deixar reserva sendo empurrada para a suíte errada.
DO $$
DECLARE faltando int;
BEGIN
  SELECT count(*) INTO faltando FROM suites WHERE active AND pms_suite_id IS NULL;
  IF faltando > 0 THEN
    RAISE WARNING 'PlugPlay: % suíte(s) ativa(s) sem pms_suite_id — o push vai '
                  'marcá-las como suite_unmapped. Rode plugplay-diag.', faltando;
  END IF;
END $$;
