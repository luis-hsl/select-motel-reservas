-- =============================================================
-- Catálogo de produtos do PMS
-- =============================================================
-- `pms_ocupacoes.consumos[]` traz `produtoId`, `quantidade`, `preco` e
-- `precoCusto` — ou seja, margem por item é calculável sem depender da
-- permissão `RelVendaProdutos`, que a Oxpi não liberou. Só falta o nome:
-- sem esta tabela, o relatório de consumo mostraria "produto 137".
--
-- 343 itens no catálogo (medido em 04/08/2026), contra um cardápio bem menor
-- no site — `disponivel_cardapio` é o filtro para cruzar os dois.
--
-- Idempotente: o migrate.yml reroda todos os .sql a cada push.

CREATE TABLE IF NOT EXISTS pms_produtos (
  produto_id           integer PRIMARY KEY,
  nome                 text    NOT NULL,
  unidade              text,
  referencia           text,
  grupo_id             integer,
  grupo_nome           text,
  subgrupo_id          integer,
  subgrupo_nome        text,
  preco_custo          numeric(12,2) NOT NULL DEFAULT 0,
  preco_venda          numeric(12,2) NOT NULL DEFAULT 0,
  is_ativo             boolean NOT NULL DEFAULT true,
  disponivel_cardapio  boolean NOT NULL DEFAULT false,
  categoria_cardapio   text,
  raw                  jsonb   NOT NULL,
  atualizado_em        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE pms_produtos IS
  'Catálogo do PMS (GET /api/Entidades/Produto/GetAll). Serve para dar nome e '
  'custo ao consumos[] das ocupações.';
COMMENT ON COLUMN pms_produtos.preco_custo IS
  'Custo do PMS. Com preco_venda dá a margem sem precisar do RelVendaProdutos.';

CREATE INDEX IF NOT EXISTS idx_pms_produtos_grupo ON pms_produtos (grupo_nome);
CREATE INDEX IF NOT EXISTS idx_pms_produtos_cardapio
  ON pms_produtos (disponivel_cardapio) WHERE disponivel_cardapio;

ALTER TABLE pms_produtos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pms_produtos FROM anon, authenticated;
GRANT ALL ON pms_produtos TO service_role;
