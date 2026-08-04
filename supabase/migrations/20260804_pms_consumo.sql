-- =============================================================
-- Consumo e margem de frigobar/cardápio
-- =============================================================
-- **Por que esta função existe.** A Oxpi não liberou `RelVendaProdutos` nem
-- `RelCurvaAbc` — os dois relatórios prontos deles respondem 401. Só que não
-- precisamos deles: `pms_ocupacoes.consumos[]` já traz, item a item, quantidade,
-- preço de venda e preço de custo. Margem e curva ABC saem daqui, do nosso lado,
-- sem depender de permissão que talvez nunca venha.
--
-- **`preco` e `precoCusto` são UNITÁRIOS.** Conferido em 04/08/2026 contra o
-- `total_consumo` que o próprio PMS carimba na ocupação: `sum(quantidade*preco)`
-- fecha em 2.310 das 2.312 estadias com consumo (99,9%), enquanto somar `preco`
-- como se fosse total de linha só fecha em 1.921. Nas 1.096 estadias com mais de
-- um item — onde as duas leituras divergem de verdade — a unitária acerta 1.095
-- e a de linha, 800. Não há dúvida razoável.
--
-- As 2 exceções são lançamento manual, não erro de fórmula: uma ocupação com
-- R$ 465 em itens e `total_consumo` de R$ 60 (cortesia dada na recepção) e uma
-- com item de preço zero e `total_consumo` de R$ 450 (digitado direto no caixa).
-- Por isso a função devolve `consumo` (nossa soma) e `consumo_pms` lado a lado:
-- a divergência é informação sobre a operação, não bug para esconder.
--
-- **O custo é o elo fraco, e a tela precisa dizer isso.** 2.364 das 4.597 linhas
-- vêm com `precoCusto: 0` — custo não cadastrado, não custo de graça. Tratar
-- zero como zero produziria "margem de 100%" em R$ 36 mil de faturamento, que é
-- exatamente o número que faria alguém tomar a decisão errada. Aqui zero vira
-- NULL, cai no `preco_custo` do catálogo quando existe, e o que sobrar sem custo
-- fica FORA do cálculo de margem e é reportado em `cobertura_custo`.
--
-- Idempotente: só CREATE OR REPLACE. O migrate.yml reroda todos os .sql a cada push.

CREATE OR REPLACE FUNCTION pms_consumo_margem(p_inicio date, p_fim date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
  v_dias integer;
BEGIN
  IF p_inicio IS NULL OR p_fim IS NULL OR p_inicio > p_fim THEN
    RETURN jsonb_build_object('erro', 'período inválido');
  END IF;

  v_dias := (p_fim - p_inicio) + 1;

  RETURN (
    -- `eh_estadia` sempre: venda direta no balcão entra em `pms_ocupacoes` com
    -- consumo mas sem suíte, e misturá-la aqui inflaria a taxa de anexação —
    -- que é justamente "quantas estadias consomem algo".
    WITH estadias AS (
      SELECT ocupacao_id, total_consumo, total_recebido, consumos
        FROM pms_ocupacoes
       WHERE eh_estadia
         AND data_base_caixa BETWEEN p_inicio AND p_fim
    ),
    cabecalho AS (
      SELECT count(*)                                AS estadias,
             coalesce(sum(total_recebido), 0)        AS receita_estadias,
             coalesce(sum(total_consumo), 0)         AS consumo_pms
        FROM estadias
    ),
    itens AS (
      SELECT e.ocupacao_id,
             (c->>'produtoId')::int                     AS produto_id,
             (c->>'quantidade')::numeric                AS qtd,
             (c->>'preco')::numeric                     AS preco,
             -- Zero aqui é "ninguém cadastrou", nunca "custa zero". Virar NULL
             -- desde a origem impede que a média seja puxada por custo fantasma.
             nullif((c->>'precoCusto')::numeric, 0)     AS custo_linha
        FROM estadias e, jsonb_array_elements(e.consumos) c
    ),
    -- LEFT JOIN de propósito: 10 dos 158 produtos consumidos não existem em
    -- `pms_produtos` (item apagado do catálogo depois da venda). Some-los seria
    -- perder faturamento real; aqui aparecem pelo id, sinalizados.
    linhas AS (
      SELECT i.ocupacao_id,
             i.produto_id,
             i.qtd,
             i.qtd * i.preco                            AS receita,
             p.produto_id IS NOT NULL                   AS no_catalogo,
             coalesce(p.nome, 'Produto ' || i.produto_id) AS nome,
             -- btrim porque o cadastro do PMS tem grupo com espaço no fim
             -- ("DECORAÇÕES ", "LOUÇAS ") — sem isso viram categorias gêmeas.
             coalesce(nullif(btrim(p.grupo_nome), ''), '(sem grupo)') AS grupo,
             -- Cascata de custo: o da linha manda (é o custo do dia da venda);
             -- o do catálogo é resgate para quem só perdeu o cadastro no PMS —
             -- recupera R$ 6.192 de faturamento que iria para o balde "sem custo".
             coalesce(i.custo_linha, nullif(p.preco_custo, 0)) AS custo_unit,
             CASE
               WHEN i.custo_linha IS NOT NULL             THEN 'linha'
               WHEN nullif(p.preco_custo, 0) IS NOT NULL  THEN 'catalogo'
               ELSE 'ausente'
             END                                        AS custo_origem,
             -- Custo idêntico ao preço de venda é assinatura de cadastro
             -- preguiçoso (copiaram o preço no campo de custo), não de item
             -- vendido no precinho. Conta-se por linha, não bool_or: no SKOL
             -- só parte dos lançamentos tem o custo estampado com o preço, e um
             -- "sim" solitário em 189 linhas condenaria um produto saudável.
             i.custo_linha IS NOT NULL AND i.custo_linha >= i.preco AS custo_cobre_preco
        FROM itens i
        LEFT JOIN pms_produtos p ON p.produto_id = i.produto_id
    ),
    totais AS (
      SELECT count(*)                                   AS linhas,
             coalesce(sum(qtd), 0)                      AS unidades,
             count(DISTINCT produto_id)                 AS produtos,
             count(DISTINCT ocupacao_id)                AS estadias_com_consumo,
             coalesce(sum(receita), 0)                  AS receita,
             coalesce(sum(qtd * custo_unit), 0)         AS custo,
             coalesce(sum(receita) FILTER (WHERE custo_unit IS NOT NULL), 0) AS receita_com_custo,
             count(DISTINCT produto_id) FILTER (WHERE NOT no_catalogo)       AS fora_catalogo
        FROM linhas
    ),
    por_produto AS (
      SELECT produto_id,
             min(nome)                                  AS nome,
             min(grupo)                                 AS grupo,
             bool_or(no_catalogo)                       AS no_catalogo,
             sum(qtd)                                   AS unidades,
             count(*)                                   AS linhas,
             count(DISTINCT ocupacao_id)                AS estadias,
             sum(receita)                               AS receita,
             sum(qtd * custo_unit)                      AS custo,
             sum(receita) FILTER (WHERE custo_unit IS NOT NULL) AS receita_com_custo,
             count(*) FILTER (WHERE custo_origem = 'ausente')   AS linhas_sem_custo,
             count(*) FILTER (WHERE custo_cobre_preco)  AS linhas_custo_cobre_preco,
             -- O preço unitário oscila (promoção, digitação manual), então a
             -- tela mostra o efetivo do período, não o de tabela.
             round(sum(receita) / nullif(sum(qtd), 0), 2) AS preco_medio
        FROM linhas
       GROUP BY produto_id
    ),
    -- Curva ABC sobre faturamento de consumo. O acumulado usado para classificar
    -- é o das linhas ANTERIORES: assim o produto que atravessa os 80% entra em A
    -- em vez de cair em B por um centavo, que é a convenção de estoque.
    abc AS (
      SELECT pp.*,
             coalesce(sum(pp.receita) OVER (
               ORDER BY pp.receita DESC, pp.produto_id
               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0)
               / nullif((SELECT receita FROM totais), 0)  AS acum_antes,
             sum(pp.receita) OVER (
               ORDER BY pp.receita DESC, pp.produto_id)
               / nullif((SELECT receita FROM totais), 0)  AS acum
        FROM por_produto pp
    ),
    classificado AS (
      SELECT a.*,
             CASE WHEN a.acum_antes < 0.80 THEN 'A'
                  WHEN a.acum_antes < 0.95 THEN 'B'
                  ELSE 'C' END AS classe
        FROM abc a
    ),
    por_grupo AS (
      SELECT grupo,
             count(DISTINCT produto_id)                 AS produtos,
             sum(unidades)                              AS unidades,
             sum(receita)                               AS receita,
             sum(custo)                                 AS custo,
             sum(receita_com_custo)                     AS receita_com_custo
        FROM por_produto
       GROUP BY grupo
    )
    SELECT jsonb_build_object(
      'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim, 'dias', v_dias),
      'kpis', (
        SELECT jsonb_build_object(
          'estadias',             c.estadias,
          'estadias_com_consumo', t.estadias_com_consumo,
          -- Taxa de anexação: metade das estadias não consome nada. É o número
          -- que diz se o problema é preço ou é o item nunca ser oferecido.
          'taxa_anexacao',        CASE WHEN c.estadias > 0
                                       THEN round(t.estadias_com_consumo::numeric / c.estadias, 4)
                                       ELSE 0 END,
          'receita_estadias',     round(c.receita_estadias, 2),
          'consumo',              round(t.receita, 2),
          'consumo_pms',          round(c.consumo_pms, 2),
          -- Diferença entre a nossa soma e o carimbo do PMS. Perto de zero
          -- valida a leitura unitária; se disparar, é cortesia ou lançamento
          -- manual — e a tela deve mostrar, não engolir.
          'divergencia',          round(t.receita - c.consumo_pms, 2),
          'participacao',         CASE WHEN c.receita_estadias > 0
                                       THEN round(t.receita / c.receita_estadias, 4)
                                       ELSE 0 END,
          'ticket_consumo',       CASE WHEN t.estadias_com_consumo > 0
                                       THEN round(t.receita / t.estadias_com_consumo, 2)
                                       ELSE 0 END,
          'consumo_por_estadia',  CASE WHEN c.estadias > 0
                                       THEN round(t.receita / c.estadias, 2)
                                       ELSE 0 END,
          'linhas',               t.linhas,
          'unidades',             round(t.unidades, 0),
          'produtos',             t.produtos,
          'produtos_fora_catalogo', t.fora_catalogo,
          'custo',                round(t.custo, 2),
          -- Margem calculada SÓ sobre o faturamento com custo conhecido. Diluir
          -- pelo total daria uma margem otimista que ninguém pode usar.
          'margem',               round(t.receita_com_custo - t.custo, 2),
          'margem_pct',           CASE WHEN t.receita_com_custo > 0
                                       THEN round((t.receita_com_custo - t.custo) / t.receita_com_custo, 4)
                                       END,
          'receita_com_custo',    round(t.receita_com_custo, 2),
          'receita_sem_custo',    round(t.receita - t.receita_com_custo, 2),
          -- Quanto do faturamento a margem acima realmente cobre. Abaixo de ~0,7
          -- a margem total vira indicativa, e a tela precisa dizer isso em voz alta.
          'cobertura_custo',      CASE WHEN t.receita > 0
                                       THEN round(t.receita_com_custo / t.receita, 4)
                                       ELSE 0 END
        ) FROM totais t, cabecalho c
      ),
      'abc', coalesce((
        SELECT jsonb_agg(x ORDER BY x->>'classe')
          FROM (
            SELECT jsonb_build_object(
                     'classe',        classe,
                     'produtos',      count(*),
                     'receita',       round(sum(receita), 2),
                     'participacao',  round(sum(receita) / nullif((SELECT receita FROM totais), 0), 4),
                     'margem',        round(sum(receita_com_custo) - sum(custo), 2)
                   ) AS x
              FROM classificado GROUP BY classe
          ) s), '[]'::jsonb),
      'produtos', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'produto_id',        produto_id,
                 'nome',              nome,
                 'grupo',             grupo,
                 'no_catalogo',       no_catalogo,
                 'classe',            classe,
                 'unidades',          round(unidades, 0),
                 'linhas',            linhas,
                 'estadias',          estadias,
                 'preco_medio',       preco_medio,
                 'receita',           round(receita, 2),
                 'custo',             round(coalesce(custo, 0), 2),
                 'receita_com_custo', round(coalesce(receita_com_custo, 0), 2),
                 'linhas_sem_custo',  linhas_sem_custo,
                 'linhas_custo_cobre_preco', linhas_custo_cobre_preco,
                 'margem',            CASE WHEN receita_com_custo > 0
                                           THEN round(receita_com_custo - custo, 2) END,
                 'margem_pct',        CASE WHEN receita_com_custo > 0
                                           THEN round((receita_com_custo - custo) / receita_com_custo, 4) END,
                 'participacao',      round(receita / nullif((SELECT receita FROM totais), 0), 4),
                 'acumulado',         round(acum, 4)
               ) ORDER BY receita DESC, produto_id)
          FROM classificado), '[]'::jsonb),
      'grupos', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'grupo',             grupo,
                 'produtos',          produtos,
                 'unidades',          round(unidades, 0),
                 'receita',           round(receita, 2),
                 'custo',             round(coalesce(custo, 0), 2),
                 'receita_com_custo', round(coalesce(receita_com_custo, 0), 2),
                 'margem',            CASE WHEN receita_com_custo > 0
                                           THEN round(receita_com_custo - custo, 2) END,
                 'margem_pct',        CASE WHEN receita_com_custo > 0
                                           THEN round((receita_com_custo - custo) / receita_com_custo, 4) END,
                 'cobertura_custo',   round(coalesce(receita_com_custo, 0) / nullif(receita, 0), 4)
               ) ORDER BY receita DESC)
          FROM por_grupo), '[]'::jsonb)
    )
  );
END;
$$;

COMMENT ON FUNCTION pms_consumo_margem(date, date) IS
  'Consumo, margem e curva ABC do frigobar/cardápio a partir de '
  'pms_ocupacoes.consumos[] — substitui RelVendaProdutos e RelCurvaAbc, que a '
  'Oxpi não liberou. preco e precoCusto são unitários. precoCusto zero é custo '
  'não cadastrado: cai no catálogo e, se nem lá houver, fica fora da margem e '
  'entra em kpis.cobertura_custo.';

REVOKE ALL ON FUNCTION pms_consumo_margem(date,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pms_consumo_margem(date,date) TO service_role;
