-- ============================================================
-- Modo Experiência (a la carte)
-- ============================================================
-- Cliente pode escolher entre:
--   1. PACOTE: preço fechado (Bronze/Prata/Ouro) já com tudo incluso/descontado
--   2. EXPERIÊNCIA: monta seu pedido item-por-item, preço mais alto por item
--      (justamente pra empurrar quem quer "tudo" pra escolher o pacote)
--
-- Schema:
--   - experience_items: catálogo de comidas/bebidas/extras com preço a la carte
--   - suites: ganha price_period_alacarte / price_overnight_alacarte (oculto pro cliente)
--   - reservations: ganha mode + items (itens selecionados quando mode='experience')

-- 1) Itens da experiência (cardapio a la carte)
CREATE TABLE IF NOT EXISTS experience_items (
  id          text         PRIMARY KEY,
  category    text         NOT NULL CHECK (category IN ('food','drink','extra')),
  label       text         NOT NULL,
  description text,
  price       numeric(10,2) NOT NULL DEFAULT 0,
  photo_url   text,
  sort_order  integer      NOT NULL DEFAULT 0,
  active      boolean      NOT NULL DEFAULT true,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_experience_items_category
  ON experience_items (category, sort_order)
  WHERE active = true;

ALTER TABLE experience_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY experience_items_read_public ON experience_items
  FOR SELECT TO anon, authenticated USING (active = true);
CREATE POLICY experience_items_auth_all ON experience_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2) Preço a la carte das suítes (oculto pro cliente — só soma no total)
ALTER TABLE suites
  ADD COLUMN IF NOT EXISTS price_period_alacarte    numeric(10,2),
  ADD COLUMN IF NOT EXISTS price_overnight_alacarte numeric(10,2);

-- 3) Reservations: mode + items selecionados
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS mode             text NOT NULL DEFAULT 'package'
    CHECK (mode IN ('package','experience'));

-- O package_id passa a ser NULL quando mode='experience' (já tem trigger lá).
-- Pra isso a FK precisa permitir null:
ALTER TABLE reservations
  ALTER COLUMN package_id DROP NOT NULL;

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION experience_items_set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_experience_items_updated ON experience_items;
CREATE TRIGGER trg_experience_items_updated
  BEFORE UPDATE ON experience_items
  FOR EACH ROW EXECUTE FUNCTION experience_items_set_updated_at();

-- 4) Seed inicial — placeholders R$ 0 (você vai cadastrar os preços via SQL ou admin)
INSERT INTO experience_items (id, category, label, description, price, sort_order) VALUES
  -- COMIDAS
  ('food-jantar',   'food',  'Jantar completo',           'Prato principal acompanhado de entrada e sobremesa',   0, 10),
  ('food-sushi',    'food',  'Sushi',                     'Combinado especial',                                    0, 20),
  ('food-pizza',    'food',  'Pizza',                     'Pizza individual ou grande',                            0, 30),
  ('food-fondue',   'food',  'Fondue de chocolate',       'Frutas frescas e biscoitos',                            0, 40),

  -- BEBIDAS
  ('drink-vinho',     'drink', 'Vinho',                   'Garrafa de vinho tinto ou branco',                      0, 10),
  ('drink-frisante',  'drink', 'Frisante',                'Garrafa de espumante frisante',                         0, 20),
  ('drink-champagne', 'drink', 'Champagne',               'Garrafa de champagne especial',                         0, 30),
  ('drink-drinque',   'drink', 'Drink especial',          'Drink criado pelo bartender',                           0, 40),

  -- EXTRAS / EXPERIÊNCIAS
  ('extra-decoracao',  'extra', 'Decoração romântica',    'Decoração com velas e iluminação',                      0, 10),
  ('extra-petalas',    'extra', 'Pétalas de rosa',        'Pétalas na cama e no chão',                             0, 20),
  ('extra-hidro',      'extra', 'Hidromassagem preparada','Banheira com sais e pétalas',                           0, 30),
  ('extra-surpresa',   'extra', 'Surpresa do chef',       'Item surpresa do bartender ou chef',                    0, 40)
ON CONFLICT (id) DO NOTHING;
