-- =============================================================
-- Fase 2 — Ingest do movimento real do PMS (MotelMais PlugPlay)
-- =============================================================
-- Até aqui o banco do site só conhecia o que o site vendeu. A estadia de
-- balcão — que é a maior parte do movimento — vivia só no PMS, e sumia da
-- nossa vista assim que a recepção fechava a conta.
--
-- Esta migration cria o destino do ingest de `GET /api/Ocupacao/PorPeriodo`.
-- O que isso destrava:
--   - histórico que sobrevive ao PMS fora do ar
--   - cruzamento site × balcão em SQL (reservations.pms_reserva_id ↔ reserva_id)
--   - recorrência por placa, que é a base do fidelidade (Fase 4)
--
-- Formas medidas contra produção em 04/08/2026 e versionadas em
-- supabase/functions/_shared/PLUGPLAY-SAMPLES.md — a spec declara
-- `responses.200` vazio para este endpoint.
--
-- **Idempotente de ponta a ponta**: o migrate.yml reroda TODOS os .sql a cada
-- push e engole falha com `|| echo FAILED`, então nada aqui pode quebrar na
-- segunda execução.

-- ── 1. Ocupações ─────────────────────────────────────────────────────────────
-- Colunas promovidas = as que a gente consulta. O objeto do PMS tem ~45 campos
-- escalares e três arrays; o resto fica em `raw`, para não ter que caçar
-- schema toda vez que eles acrescentarem um campo.
CREATE TABLE IF NOT EXISTS pms_ocupacoes (
  ocupacao_id             bigint      PRIMARY KEY,
  codigo                  bigint,
  caixa_id                bigint,
  caixa_original_id       bigint,

  -- suiteId do PMS + a nossa suíte, resolvida por suites.pms_suite_id.
  -- NULL em suite_id = suíte que o PMS tem e o site não mapeou.
  pms_suite_id            integer,
  suite_id                text        REFERENCES suites(id) ON DELETE SET NULL,

  -- `timestamp` sem fuso DE PROPÓSITO: o PMS trabalha em horário local da
  -- recepção e não manda offset. Converter para timestamptz exigiria assumir
  -- um fuso e erraria na virada do horário de verão. Aqui é literalmente
  -- "o que o relógio da recepção marcava".
  entrada                 timestamp,
  saida                   timestamp,
  -- Dia-base do caixa: é por ele que o PMS agrupa o movimento, não pela data
  -- de entrada. Estadia que entra 23h e sai 2h pertence ao dia anterior.
  data_base_caixa         date,

  modo                    integer,
  tipo_conducao           integer,
  is_entrada_automatica   boolean,

  -- A identidade do hóspede de balcão. Preenchida em ~74% das estadias e é o
  -- join natural com o cadastro do site (Fase 4). Não há nome/CPF no objeto.
  placa                   text,
  -- Preenchido só nas estadias que nasceram de reserva. Cruza com
  -- reservations.pms_reserva_id e responde "quanto do movimento veio do site".
  reserva_id              text,
  cliente_fidelidade_id   text,

  quantidade_pessoa_extra integer,
  qtd_pernoite_extra      integer,

  -- Valores. O PMS não manda total somado: cada modalidade vem num campo.
  -- Consolidamos as variantes (pernoite, pernoiteExecutivo, pernoite3/4…) e
  -- guardamos o detalhe em `raw`.
  valor_normal            numeric(12,2) NOT NULL DEFAULT 0,
  valor_pernoite          numeric(12,2) NOT NULL DEFAULT 0,
  valor_excesso           numeric(12,2) NOT NULL DEFAULT 0,
  desconto                numeric(12,2) NOT NULL DEFAULT 0,
  acrescimo               numeric(12,2) NOT NULL DEFAULT 0,
  pessoa_extra            numeric(12,2) NOT NULL DEFAULT 0,
  total_cortesia          numeric(12,2) NOT NULL DEFAULT 0,
  total_consumo           numeric(12,2) NOT NULL DEFAULT 0,
  total_recebido          numeric(12,2) NOT NULL DEFAULT 0,

  -- Arrays filhos como jsonb: vêm sempre junto da ocupação e nunca são
  -- consultados sozinhos. Virar tabela é fácil depois; o contrário não.
  pagamentos              jsonb       NOT NULL DEFAULT '[]'::jsonb,
  consumos                jsonb       NOT NULL DEFAULT '[]'::jsonb,
  observacoes             jsonb       NOT NULL DEFAULT '[]'::jsonb,

  raw                     jsonb       NOT NULL,

  ingerido_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_em           timestamptz NOT NULL DEFAULT now()
);

-- Nem toda linha de "ocupação" é estadia. Medido no backfill de 04/08/2026
-- (1.635 linhas de 01/05 a 03/08): 145 vêm com `suiteId = 0`, ou seja, sem
-- quarto nenhum. O corte é limpo — `modo` 0/1/2/4 sempre tem suíte, `modo` 5/7
-- nunca tem:
--
--   modo 5 (111 linhas) — venda direta: só consumo, valor de estadia zero.
--                         É o `vendasDireta`/`vendaDiretaQtd` do relatório.
--   modo 7 ( 34 linhas) — R$ 630 de estadia sem quarto e sem consumo.
--
-- São receita de verdade (R$ 1.583 no período) e por isso não são descartadas,
-- mas contá-las como estadia infla a ocupação em ~9%. Esta coluna existe para
-- que quem for somar não precise saber disso.
ALTER TABLE pms_ocupacoes
  ADD COLUMN IF NOT EXISTS eh_estadia boolean
  GENERATED ALWAYS AS (pms_suite_id IS NOT NULL AND pms_suite_id > 0) STORED;

COMMENT ON COLUMN pms_ocupacoes.eh_estadia IS
  'false = linha sem quarto (venda direta e afins, modo 5 e 7). Filtrar por '
  'true ao contar ocupação, taxa e RevPAR.';

CREATE INDEX IF NOT EXISTS idx_pms_ocupacoes_estadia
  ON pms_ocupacoes (data_base_caixa DESC)
  WHERE eh_estadia;

COMMENT ON TABLE pms_ocupacoes IS
  'Estadias do PMS (GET /api/Ocupacao/PorPeriodo). Inclui balcão e telefone. '
  'Chave é o ocupacaoId deles — o ingest faz upsert, então reprocessar o mesmo '
  'período é seguro.';
COMMENT ON COLUMN pms_ocupacoes.entrada IS
  'Horário local da recepção, sem fuso. O PMS não manda offset.';
COMMENT ON COLUMN pms_ocupacoes.data_base_caixa IS
  'Dia-base do caixa no PMS. Agrupar por aqui, não por date(entrada).';
COMMENT ON COLUMN pms_ocupacoes.placa IS
  'Placa do carro. ~74% preenchida; é o identificador prático do hóspede de '
  'balcão, já que o objeto não traz nome/CPF/telefone.';
COMMENT ON COLUMN pms_ocupacoes.raw IS
  'Objeto cru da API. Fonte da verdade quando uma coluna promovida discordar.';

CREATE INDEX IF NOT EXISTS idx_pms_ocupacoes_entrada
  ON pms_ocupacoes (entrada DESC);
CREATE INDEX IF NOT EXISTS idx_pms_ocupacoes_data_base
  ON pms_ocupacoes (data_base_caixa DESC);
CREATE INDEX IF NOT EXISTS idx_pms_ocupacoes_suite
  ON pms_ocupacoes (suite_id, data_base_caixa DESC);
-- Parciais: a maioria das linhas tem NULL nas duas, e só as preenchidas
-- interessam (recorrência por placa, atribuição de venda do site).
CREATE INDEX IF NOT EXISTS idx_pms_ocupacoes_placa
  ON pms_ocupacoes (placa)
  WHERE placa IS NOT NULL AND placa <> '';
CREATE INDEX IF NOT EXISTS idx_pms_ocupacoes_reserva
  ON pms_ocupacoes (reserva_id)
  WHERE reserva_id IS NOT NULL;

-- ── 2. Snapshots dos relatórios mensais ──────────────────────────────────────
-- Os relatórios (ocupação por categoria, mapa de calor, caixa) são caros e
-- mudam pouco depois que o mês fecha. Guardamos o payload inteiro em jsonb:
-- a forma deles é larga (~90 escalares no topo) e promover coluna a coluna
-- envelheceria a cada campo novo que a Oxpi acrescentar.
CREATE TABLE IF NOT EXISTS pms_snapshots (
  chave         text        NOT NULL,   -- 'ocupacao-categoria' | 'mapa-calor' | 'caixa' | 'pagamentos'
  ano           integer     NOT NULL,
  mes           integer     NOT NULL,
  payload       jsonb       NOT NULL,
  capturado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chave, ano, mes),
  CONSTRAINT pms_snapshots_mes_check CHECK (mes BETWEEN 1 AND 12)
);

COMMENT ON TABLE pms_snapshots IS
  'Payload cru dos relatórios mensais do PMS, um por (chave, ano, mês). '
  'Recapturar o mês corrente sobrescreve; mês fechado tende a não mudar.';

-- ── 3. Log das rodadas do ingest ─────────────────────────────────────────────
-- O migrate.yml e o cron dizem "success" sem provar que gravaram. Este log é
-- o que responde "o ingest de ontem rodou e trouxe quanto?" sem ler container.
CREATE TABLE IF NOT EXISTS pms_ingest_runs (
  id           bigserial   PRIMARY KEY,
  tipo         text        NOT NULL,   -- 'incremental' | 'backfill' | 'snapshots'
  inicio       date,
  fim          date,
  lidos        integer     NOT NULL DEFAULT 0,
  gravados     integer     NOT NULL DEFAULT 0,
  duracao_ms   integer,
  erro         text,
  criado_em    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pms_ingest_runs_criado
  ON pms_ingest_runs (criado_em DESC);

-- ── 4. Fechamento de acesso ──────────────────────────────────────────────────
-- Estas três tabelas guardam receita, placa de cliente e pagamento. RLS ligada
-- sem policy nenhuma = ninguém lê pelo PostgREST; service_role (o edge
-- function) ignora RLS e continua enxergando tudo.
--
-- É explícito de propósito: em 04/08/2026 descobrimos que uma função ficava
-- aberta na internet porque a proteção estava num arquivo que o self-host não
-- lê. Aqui a garantia é do banco, não de configuração.
ALTER TABLE pms_ocupacoes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_snapshots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_ingest_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON pms_ocupacoes   FROM anon, authenticated;
REVOKE ALL ON pms_snapshots   FROM anon, authenticated;
REVOKE ALL ON pms_ingest_runs FROM anon, authenticated;

GRANT ALL ON pms_ocupacoes   TO service_role;
GRANT ALL ON pms_snapshots   TO service_role;
GRANT ALL ON pms_ingest_runs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE pms_ingest_runs_id_seq TO service_role;

-- ── 5. Site × balcão ─────────────────────────────────────────────────────────
-- O cruzamento que motivou a fase inteira: quanto do movimento do motel o site
-- está trazendo. `reserva_id` só vem preenchido quando a estadia nasceu de uma
-- reserva, e `reservations.pms_reserva_id` é o que o nosso push gravou.
-- `DROP` antes de `CREATE OR REPLACE` porque a view mudou de colunas depois de
-- publicada — `REPLACE` só aceita acrescentar coluna no fim, e falharia aqui.
DROP VIEW IF EXISTS pms_movimento_por_origem;
CREATE VIEW pms_movimento_por_origem AS
  SELECT o.data_base_caixa,
         CASE
           WHEN r.id IS NOT NULL      THEN 'site'
           WHEN o.reserva_id IS NULL  THEN 'balcao'
           ELSE 'reserva_recepcao'
         END                                    AS origem,
         count(*)                               AS estadias,
         sum(o.total_recebido)                  AS receita,
         sum(o.total_consumo)                   AS consumo,
         count(*) FILTER (WHERE o.placa IS NOT NULL AND o.placa <> '') AS com_placa
    FROM pms_ocupacoes o
    LEFT JOIN reservations r ON r.pms_reserva_id = o.reserva_id
   -- Venda direta não é estadia e não tem origem no sentido desta view.
   WHERE o.eh_estadia
   GROUP BY 1, 2;

COMMENT ON VIEW pms_movimento_por_origem IS
  'Estadias e receita por dia e origem, só linhas com quarto (eh_estadia). '
  '"site" = casou com reservations; "reserva_recepcao" = reserva que o site '
  'não criou (telefone); "balcao" = walk-in.';

GRANT SELECT ON pms_movimento_por_origem TO service_role;
