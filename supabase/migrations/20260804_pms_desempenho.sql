-- =============================================================
-- Fase 3 — Desempenho: agregação do movimento ingerido
-- =============================================================
-- A Fase 2 trouxe as estadias para o Postgres. Aqui elas viram os números que
-- a aba "Desempenho" mostra.
--
-- **Por que calcular aqui e não consumir os relatórios do PMS.** Os snapshots
-- em `pms_snapshots` continuam sendo o arquivo cru, mas o painel não depende
-- deles, por três motivos medidos em 04/08/2026:
--
--   1. Os campos de comparativo do relatório deles (`mesPassado`, `anoPassado`,
--      `benchmarkRede`) voltam **todos null**. Com histórico próprio, o
--      comparativo é conta nossa e funciona.
--   2. O relatório conta venda direta junto com estadia; aqui `eh_estadia`
--      corta na origem, então ocupação e RevPAR não vêm inflados em ~9%.
--   3. Sem depender de chamada ao PMS, a tela abre com ele fora do ar — que
--      era o ponto de ter ingerido.
--
-- Idempotente: só CREATE OR REPLACE.

-- ── Desempenho de um período ─────────────────────────────────────────────────
-- Devolve tudo num jsonb só: a tela faz um round-trip, não seis.
--
-- `taxa_giro` passa de 1,0 de propósito — é ocupações por suíte-dia, não fração
-- de capacidade. Motel gira o mesmo quarto várias vezes ao dia. Fórmula
-- conferida contra a própria API na Fase 0. Ver PLUGPLAY-SAMPLES.md.
CREATE OR REPLACE FUNCTION pms_desempenho(p_inicio date, p_fim date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
  v_suites  integer;
  v_dias    integer;
  v_base    numeric;   -- suíte-dias disponíveis no período
BEGIN
  IF p_inicio IS NULL OR p_fim IS NULL OR p_inicio > p_fim THEN
    RETURN jsonb_build_object('erro', 'período inválido');
  END IF;

  SELECT count(*) INTO v_suites
    FROM suites WHERE pms_suite_id IS NOT NULL AND active;

  v_dias := (p_fim - p_inicio) + 1;
  v_base := GREATEST(1, v_suites * v_dias);

  RETURN (
    WITH estadias AS (
      SELECT o.*, s.category
        FROM pms_ocupacoes o
        LEFT JOIN suites s ON s.id = o.suite_id
       WHERE o.eh_estadia
         AND o.data_base_caixa BETWEEN p_inicio AND p_fim
    ),
    -- Venda direta e afins ficam de fora dos KPIs de ocupação, mas são receita
    -- e some do total se a gente simplesmente ignorar.
    extras AS (
      SELECT count(*) AS linhas, coalesce(sum(total_recebido), 0) AS receita
        FROM pms_ocupacoes
       WHERE NOT eh_estadia
         AND data_base_caixa BETWEEN p_inicio AND p_fim
    ),
    kpis AS (
      SELECT count(*)                              AS estadias,
             coalesce(sum(total_recebido), 0)      AS receita,
             coalesce(sum(total_consumo), 0)       AS consumo,
             coalesce(sum(desconto), 0)            AS desconto,
             coalesce(sum(total_cortesia), 0)      AS cortesia,
             count(*) FILTER (WHERE placa IS NOT NULL) AS com_placa
        FROM estadias
    ),
    diario AS (
      SELECT data_base_caixa AS dia,
             count(*)                         AS estadias,
             coalesce(sum(total_recebido), 0) AS receita,
             coalesce(sum(total_consumo), 0)  AS consumo
        FROM estadias GROUP BY 1
    ),
    -- Só dia da semana, sem hora. **A hora não existe para o nosso integrador**:
    -- `Ocupacao/PorPeriodo` devolve `entrada`/`saida` com tempo zerado
    -- (`T00:00:00` no payload cru), e o relatório `MapaCalorPorMesAno` responde
    -- 200 com a grade 7×24 inteira em zero — verificado em julho/2026, um mês
    -- com 482 estadias. Os outros relatórios do mesmo mês vêm corretos, então
    -- é específico do mapa de calor, não falta de permissão genérica.
    -- Enquanto isso não mudar, "que horas o motel enche" é pergunta sem fonte.
    dia_semana AS (
      SELECT extract(dow FROM data_base_caixa)::int AS dow,
             count(*)                         AS estadias,
             coalesce(sum(total_recebido), 0) AS receita
        FROM estadias GROUP BY 1
    ),
    origem AS (
      SELECT CASE
               WHEN r.id IS NOT NULL     THEN 'site'
               WHEN e.reserva_id IS NULL THEN 'balcao'
               ELSE 'reserva_recepcao'
             END                              AS origem,
             count(*)                         AS estadias,
             coalesce(sum(e.total_recebido), 0) AS receita
        FROM estadias e
        LEFT JOIN reservations r ON r.pms_reserva_id = e.reserva_id
       GROUP BY 1
    ),
    categoria AS (
      SELECT coalesce(category, 'sem categoria') AS categoria,
             count(*)                            AS estadias,
             coalesce(sum(total_recebido), 0)    AS receita
        FROM estadias GROUP BY 1
    ),
    -- Mapa em PLUGPLAY.md. Modalidade nova aparece com o número cru em vez de
    -- sumir — foi assim que modo 5 e 7 apareceram no backfill.
    modalidade AS (
      SELECT modo,
             CASE modo WHEN 0 THEN '1 hora'
                       WHEN 1 THEN 'Pernoite'
                       WHEN 2 THEN 'Período (2h)'
                       WHEN 4 THEN 'Diária'
                       ELSE 'modo ' || modo::text END AS rotulo,
             count(*)                         AS estadias,
             coalesce(sum(total_recebido), 0) AS receita
        FROM estadias GROUP BY 1, 2
    )
    SELECT jsonb_build_object(
      'periodo', jsonb_build_object(
        'inicio', p_inicio, 'fim', p_fim, 'dias', v_dias, 'suites', v_suites
      ),
      'kpis', (
        SELECT jsonb_build_object(
          'estadias',   k.estadias,
          'receita',    round(k.receita, 2),
          'consumo',    round(k.consumo, 2),
          'desconto',   round(k.desconto, 2),
          'cortesia',   round(k.cortesia, 2),
          'com_placa',  k.com_placa,
          'ticket',     CASE WHEN k.estadias > 0
                             THEN round(k.receita / k.estadias, 2) ELSE 0 END,
          'revpar',     round(k.receita / v_base, 2),
          'taxa_giro',  round(k.estadias::numeric / v_base, 4),
          'extras_linhas',  (SELECT linhas  FROM extras),
          'extras_receita', (SELECT round(receita, 2) FROM extras)
        ) FROM kpis k
      ),
      'diario', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'dia', dia, 'estadias', estadias,
                 'receita', round(receita, 2), 'consumo', round(consumo, 2))
               ORDER BY dia) FROM diario), '[]'::jsonb),
      'por_dia_semana', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'dow', dow, 'estadias', estadias, 'receita', round(receita, 2))
               ORDER BY dow) FROM dia_semana), '[]'::jsonb),
      'por_origem', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'origem', origem, 'estadias', estadias, 'receita', round(receita, 2))
               ORDER BY estadias DESC) FROM origem), '[]'::jsonb),
      'por_categoria', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'categoria', categoria, 'estadias', estadias, 'receita', round(receita, 2))
               ORDER BY receita DESC) FROM categoria), '[]'::jsonb),
      'por_modalidade', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'modo', modo, 'rotulo', rotulo, 'estadias', estadias,
                 'receita', round(receita, 2))
               ORDER BY estadias DESC) FROM modalidade), '[]'::jsonb)
    )
  );
END;
$$;

COMMENT ON FUNCTION pms_desempenho(date, date) IS
  'Desempenho do período num jsonb só. Conta apenas eh_estadia; venda direta '
  'entra separada em kpis.extras_*. taxa_giro é ocupações por suíte-dia e '
  'passa de 1,0 legitimamente.';

REVOKE ALL ON FUNCTION pms_desempenho(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pms_desempenho(date, date) TO service_role;

-- ── Até onde o histórico vai ────────────────────────────────────────────────
-- A tela precisa saber se um comparativo é "caiu" ou "não existe dado". Sem
-- isso, mês sem ingest viraria queda de 100%.
CREATE OR REPLACE FUNCTION pms_cobertura()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT jsonb_build_object(
    'primeiro_dia', min(data_base_caixa),
    'ultimo_dia',   max(data_base_caixa),
    'estadias',     count(*) FILTER (WHERE eh_estadia),
    'linhas',       count(*)
  ) FROM pms_ocupacoes;
$$;

COMMENT ON FUNCTION pms_cobertura() IS
  'Janela de dados já ingerida. A tela usa para distinguir "sem movimento" de '
  '"período anterior ao backfill".';

REVOKE ALL ON FUNCTION pms_cobertura() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pms_cobertura() TO service_role;
