-- =============================================================
-- Financeiro — formas de pagamento, taxa de adquirente e caixa
-- =============================================================
-- Os dados já estavam gravados e nenhuma tela lia. Aqui eles viram resposta.
--
-- **Duas fontes, com pesos diferentes.**
--
--   1. `pms_ocupacoes.pagamentos[]` é a base. Existe para todo o histórico
--      ingerido (01/11/2025 em diante) e não depende de captura mensal.
--   2. `pms_snapshots` é o relatório cru do PMS. Só ele traz `valorTaxa` e o
--      fechamento de caixa — mas só existe nos meses que alguém capturou. Tudo
--      que vem daí sai marcado com `disponivel` e a lista de meses faltando,
--      porque zero por falta de captura e zero por não ter havido movimento
--      são coisas opostas e a tela precisa saber diferenciar.
--
-- **Por que TODAS as linhas, inclusive `NOT eh_estadia`.** O Desempenho corta
-- em `eh_estadia` de propósito: venda direta infla ocupação e RevPAR. No
-- financeiro é o contrário — venda direta é dinheiro que entrou no mesmo caixa
-- e sumir com ela faria o total não bater com o fechamento da recepção. Entram
-- as duas, separadas em `estadia` / `venda_direta` em cada corte.
--
-- **A armadilha do `naoSoma`.** Duas formas de pagamento não são caixa:
-- `Cortesia` (id 4) e `Guia Go Taxa` (id 8, a comissão do guia). O PMS marca as
-- duas com `naoSoma: true` nos totais do relatório. Somar tudo ingenuamente dá
-- R$ 692.429,40 contra R$ 691.078,42 de `total_recebido` — R$ 1.350,98 de
-- diferença, que é exatamente Cortesia (845,00) + Guia Go Taxa (505,98).
-- Excluindo as duas, a soma bate com `total_recebido` em 5.286 de 5.286 linhas,
-- delta 0,00 (conferido em 04/08/2026). É essa conferência que vai para a tela.
--
-- Idempotente: só CREATE OR REPLACE. O migrate.yml reroda todos os .sql.

CREATE OR REPLACE FUNCTION pms_financeiro(p_inicio date, p_fim date)
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
    WITH
    -- Meses tocados pelo período. Serve para saber quais snapshots deveriam
    -- existir — sem isso não dá para distinguir "mês sem captura" de "mês sem
    -- movimento", e a tela mostraria zero como se fosse fato.
    --
    -- `cobravel` exclui mês que ainda não começou: numa visão de ano corrente,
    -- setembro a dezembro apareceriam como "captura faltando", que é alarme
    -- falso. Fuso da recepção, o mesmo que fecha o dia no PMS.
    meses AS (
      SELECT extract(year  FROM d)::int AS ano,
             extract(month FROM d)::int AS mes,
             d::date <= (now() AT TIME ZONE 'America/Sao_Paulo')::date AS cobravel
        FROM generate_series(date_trunc('month', p_inicio::timestamp),
                             date_trunc('month', p_fim::timestamp),
                             interval '1 month') d
    ),

    -- Quais formas não entram no caixa. Preferimos ouvir o próprio PMS
    -- (`totais[].naoSoma`) a fixar ids: se amanhã surgir uma terceira forma
    -- desse tipo, ela entra sozinha. O par conhecido fica como piso, para o
    -- caso de o período não ter nenhum snapshot capturado.
    nao_soma AS (
      SELECT DISTINCT t->>'descricao' AS forma
        FROM pms_snapshots s, jsonb_array_elements(s.payload->'totais') t
       WHERE s.chave = 'pagamentos' AND (t->>'naoSoma')::boolean
      UNION
      SELECT unnest(ARRAY['Cortesia', 'Guia Go Taxa'])
    ),

    ocup AS (
      SELECT * FROM pms_ocupacoes
       WHERE data_base_caixa BETWEEN p_inicio AND p_fim
    ),

    -- Um pagamento por linha. `dataPagamento` existe mas NÃO é o eixo: 75
    -- pagamentos vêm sem ela, e um pagamento lançado depois da virada cairia
    -- num dia diferente do fechamento a que pertence. `data_base_caixa` é o dia
    -- contábil do PMS e é o mesmo eixo do Desempenho — as duas telas somam
    -- igual, que é o mínimo para o dono confiar nas duas.
    pag AS (
      SELECT o.data_base_caixa,
             o.eh_estadia,
             (p->>'formaPagamentoId')::int                        AS forma_id,
             coalesce(p->>'formaPagamentoDescricao', 'sem forma') AS forma,
             coalesce((p->>'valor')::numeric, 0)                  AS valor,
             coalesce(p->>'formaPagamentoDescricao', '')
               IN (SELECT forma FROM nao_soma)                    AS fora_do_caixa
        FROM ocup o, jsonb_array_elements(o.pagamentos) p
    ),

    formas AS (
      SELECT forma_id, forma, fora_do_caixa,
             count(*)                                       AS lancamentos,
             sum(valor)                                     AS valor,
             coalesce(sum(valor) FILTER (WHERE eh_estadia), 0)     AS estadia,
             coalesce(sum(valor) FILTER (WHERE NOT eh_estadia), 0) AS venda_direta
        FROM pag GROUP BY 1, 2, 3
    ),

    -- Denominador da participação: só o que virou caixa. Cortesia entrando no
    -- denominador faria toda forma parecer menor do que é.
    caixa_total AS (
      SELECT coalesce(sum(valor) FILTER (WHERE NOT fora_do_caixa), 0) AS v FROM pag
    ),

    diario AS (
      SELECT data_base_caixa AS dia,
             coalesce(sum(valor) FILTER (WHERE NOT fora_do_caixa), 0) AS valor,
             count(*) FILTER (WHERE NOT fora_do_caixa)                AS lancamentos
        FROM pag GROUP BY 1
    ),

    totais_ocup AS (
      SELECT count(*)                                          AS ocupacoes,
             count(*) FILTER (WHERE eh_estadia)                AS estadias,
             count(*) FILTER (WHERE NOT eh_estadia)            AS vendas_diretas,
             coalesce(sum(total_recebido), 0)                  AS recebido,
             coalesce(sum(total_recebido) FILTER (WHERE eh_estadia), 0)     AS recebido_estadia,
             coalesce(sum(total_recebido) FILTER (WHERE NOT eh_estadia), 0) AS recebido_venda_direta,
             coalesce(sum(desconto), 0)                        AS desconto,
             coalesce(sum(acrescimo), 0)                       AS acrescimo,
             coalesce(sum(total_cortesia), 0)                  AS cortesia,
             count(*) FILTER (WHERE desconto > 0)              AS linhas_desconto,
             count(*) FILTER (WHERE total_cortesia > 0)        AS linhas_cortesia
        FROM ocup
    ),

    -- Conferência linha a linha: soma dos pagamentos que viram caixa contra o
    -- `total_recebido` que o PMS já calculou. Bate hoje; se um dia parar de
    -- bater, a tela mostra em vez de esconder.
    conferencia AS (
      SELECT count(*) FILTER (WHERE abs(o.total_recebido - coalesce(sp.soma, 0)) > 0.005) AS divergentes,
             coalesce(sum(o.total_recebido), 0) - coalesce(sum(sp.soma), 0)               AS delta
        FROM ocup o
        LEFT JOIN LATERAL (
          SELECT sum(coalesce((p->>'valor')::numeric, 0)) AS soma
            FROM jsonb_array_elements(o.pagamentos) p
           WHERE coalesce(p->>'formaPagamentoDescricao', '') NOT IN (SELECT forma FROM nao_soma)
        ) sp ON true
    ),

    -- ── Snapshots ────────────────────────────────────────────────────────────
    -- Filtramos item a item pela data, não pelo mês inteiro: assim o painel
    -- funciona em dia e semana, não só em mês fechado.
    snap_pag_meses AS (
      SELECT m.ano, m.mes,
             EXISTS (SELECT 1 FROM pms_snapshots s
                      WHERE s.chave = 'pagamentos' AND s.ano = m.ano AND s.mes = m.mes) AS tem
        FROM meses m WHERE m.cobravel
    ),
    snap_caixa_meses AS (
      SELECT m.ano, m.mes,
             EXISTS (SELECT 1 FROM pms_snapshots s
                      WHERE s.chave = 'caixa' AND s.ano = m.ano AND s.mes = m.mes) AS tem
        FROM meses m WHERE m.cobravel
    ),

    itens AS (
      SELECT coalesce(i->>'formaPagamentoDescricao', 'sem forma')  AS forma,
             coalesce((i->>'valor')::numeric, 0)                   AS bruto,
             coalesce((i->>'valorTaxa')::numeric, 0)               AS taxa,
             coalesce((i->>'valorLiquido')::numeric,
                      (i->>'valor')::numeric, 0)                   AS liquido,
             coalesce((i->>'antecipado')::boolean, false)          AS antecipado,
             i->>'bandeiraDescricao'                               AS bandeira
        FROM pms_snapshots s, jsonb_array_elements(s.payload->'items') i
       WHERE s.chave = 'pagamentos'
         AND (s.ano, s.mes) IN (SELECT ano, mes FROM meses)
         AND i->>'dataPagamento' IS NOT NULL
         AND left(i->>'dataPagamento', 10)::date BETWEEN p_inicio AND p_fim
    ),
    taxa_forma AS (
      SELECT forma, count(*) AS lancamentos,
             sum(bruto) AS bruto, sum(taxa) AS taxa, sum(liquido) AS liquido
        FROM itens GROUP BY 1
    ),

    fech AS (
      SELECT (c->>'id')::bigint                              AS id,
             -- Nome de funcionária. Cortado para o primeiro nome e normalizado
             -- (o PMS grava "ADRIANA", "vania", "Gisele" no mesmo campo).
             -- Ver o comentário sobre exposição individual mais abaixo.
             initcap(split_part(btrim(c->>'operador'), ' ', 1)) AS operador,
             left(c->>'dataBaseCaixa', 10)::date             AS data_base,
             c->>'inicio'                                    AS inicio,
             c->>'fim'                                       AS fim,
             coalesce((c->>'total')::numeric, 0)             AS total,
             coalesce((c->>'totalRecebido')::numeric, 0)     AS recebido,
             coalesce((c->>'totalAntecipado')::numeric, 0)   AS antecipado,
             coalesce((c->>'valorInicial')::numeric, 0)      AS valor_inicial,
             coalesce((c->>'totalSangrias')::numeric, 0)     AS sangrias,
             coalesce((c->>'totalDespesas')::numeric, 0)     AS despesas,
             coalesce((c->>'totalAjustes')::numeric, 0)      AS ajustes,
             coalesce((c->>'totalConsumoFunc')::numeric, 0)  AS consumo_funcionario,
             coalesce((c->>'totalDeclarado')::numeric, 0)    AS declarado,
             coalesce((c->>'conferido')::boolean, false)     AS conferido,
             coalesce((c->>'inicialDifereFinal')::boolean, false) AS divergente,
             coalesce((c->>'inicialDifereFinalQuebra')::numeric, 0) AS quebra
        FROM pms_snapshots s, jsonb_array_elements(s.payload) c
       WHERE s.chave = 'caixa'
         AND (s.ano, s.mes) IN (SELECT ano, mes FROM meses)
         AND c->>'dataBaseCaixa' IS NOT NULL
         AND left(c->>'dataBaseCaixa', 10)::date BETWEEN p_inicio AND p_fim
    )

    SELECT jsonb_build_object(
      'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim, 'dias', v_dias),

      'kpis', (
        SELECT jsonb_build_object(
          'caixa',                 round((SELECT v FROM caixa_total), 2),
          'recebido',              round(t.recebido, 2),
          'recebido_estadia',      round(t.recebido_estadia, 2),
          'recebido_venda_direta', round(t.recebido_venda_direta, 2),
          'ocupacoes',             t.ocupacoes,
          'estadias',              t.estadias,
          'vendas_diretas',        t.vendas_diretas,
          'lancamentos',           (SELECT count(*) FROM pag WHERE NOT fora_do_caixa),
          'ticket_pagamento',      CASE WHEN (SELECT count(*) FROM pag WHERE NOT fora_do_caixa) > 0
                                        THEN round((SELECT v FROM caixa_total)
                                                   / (SELECT count(*) FROM pag WHERE NOT fora_do_caixa), 2)
                                        ELSE 0 END,
          'desconto',              round(t.desconto, 2),
          'acrescimo',             round(t.acrescimo, 2),
          'cortesia',              round(t.cortesia, 2),
          'linhas_desconto',       t.linhas_desconto,
          'linhas_cortesia',       t.linhas_cortesia,
          -- Fora do caixa: cortesia concedida e comissão de guia. Não é receita,
          -- mas é o preço de estar no canal — some se não for nomeado.
          'fora_do_caixa',         round(coalesce((SELECT sum(valor) FROM pag WHERE fora_do_caixa), 0), 2),
          'conferencia_divergentes', (SELECT divergentes FROM conferencia),
          'conferencia_delta',       round((SELECT delta FROM conferencia), 2)
        ) FROM totais_ocup t
      ),

      'formas', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', forma_id, 'forma', forma,
                 'lancamentos', lancamentos,
                 'valor', round(valor, 2),
                 'estadia', round(estadia, 2),
                 'venda_direta', round(venda_direta, 2),
                 'fora_do_caixa', fora_do_caixa,
                 'participacao', CASE WHEN fora_do_caixa OR (SELECT v FROM caixa_total) = 0
                                      THEN NULL
                                      ELSE round(valor / (SELECT v FROM caixa_total), 4) END)
               ORDER BY fora_do_caixa, valor DESC) FROM formas), '[]'::jsonb),

      'diario', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'dia', dia, 'valor', round(valor, 2), 'lancamentos', lancamentos)
               ORDER BY dia) FROM diario), '[]'::jsonb),

      -- ── Taxa de adquirente ────────────────────────────────────────────────
      -- `registrada` é o campo que importa. Em 04/08/2026, `valorTaxa` e `taxa`
      -- vêm ZERO em todos os 5.441 pagamentos dos 10 meses capturados, e
      -- `authCode` é null em 100% deles: a conciliação com a adquirente não
      -- está ligada no PMS. Então o líquido aqui é igual ao bruto — não porque
      -- o motel não pague taxa, mas porque o sistema não sabe quanto é. A tela
      -- precisa dizer isso; mostrar "R$ 0 de taxa" seria mentira confortável.
      'taxa', jsonb_build_object(
        'disponivel',   coalesce((SELECT bool_or(tem) FROM snap_pag_meses), false),
        'meses_ausentes', coalesce((
          SELECT jsonb_agg(to_char(make_date(ano, mes, 1), 'YYYY-MM') ORDER BY ano, mes)
            FROM snap_pag_meses WHERE NOT tem), '[]'::jsonb),
        'lancamentos',  (SELECT count(*) FROM itens),
        'bruto',        round(coalesce((SELECT sum(bruto)   FROM itens), 0), 2),
        'valor_taxa',   round(coalesce((SELECT sum(taxa)    FROM itens), 0), 2),
        'liquido',      round(coalesce((SELECT sum(liquido) FROM itens), 0), 2),
        'registrada',   coalesce((SELECT sum(taxa) > 0 FROM itens), false),
        'com_bandeira', (SELECT count(*) FROM itens WHERE bandeira IS NOT NULL),
        'antecipados',  (SELECT count(*) FROM itens WHERE antecipado),
        'por_forma', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
                   'forma', forma, 'lancamentos', lancamentos,
                   'bruto', round(bruto, 2), 'valor_taxa', round(taxa, 2),
                   'liquido', round(liquido, 2),
                   'taxa_pct', CASE WHEN bruto > 0 THEN round(taxa / bruto, 4) ELSE 0 END)
                 ORDER BY bruto DESC) FROM taxa_forma), '[]'::jsonb),
        -- O único custo de canal que o PMS realmente registra. Vem das
        -- ocupações (não do snapshot), então existe em todo o histórico.
        'comissao_guia', round(coalesce((
          SELECT sum(valor) FROM pag WHERE forma = 'Guia Go Taxa'), 0), 2),
        'comissao_guia_base', round(coalesce((
          SELECT sum(valor) FROM pag WHERE forma = 'Guia Go Receber'), 0), 2)
      ),

      -- ── Fechamento de caixa ───────────────────────────────────────────────
      'caixa', jsonb_build_object(
        'disponivel', coalesce((SELECT bool_or(tem) FROM snap_caixa_meses), false),
        'meses_ausentes', coalesce((
          SELECT jsonb_agg(to_char(make_date(ano, mes, 1), 'YYYY-MM') ORDER BY ano, mes)
            FROM snap_caixa_meses WHERE NOT tem), '[]'::jsonb),
        'fechamentos',   (SELECT count(*) FROM fech),
        'conferidos',    (SELECT count(*) FROM fech WHERE conferido),
        'nao_conferidos',(SELECT count(*) FROM fech WHERE NOT conferido),
        'divergentes',   (SELECT count(*) FROM fech WHERE divergente),
        'quebra',        round(coalesce((SELECT sum(quebra) FROM fech), 0), 2),
        'total',         round(coalesce((SELECT sum(total) FROM fech), 0), 2),
        'recebido',      round(coalesce((SELECT sum(recebido) FROM fech), 0), 2),
        'antecipado',    round(coalesce((SELECT sum(antecipado) FROM fech), 0), 2),
        'sangrias',      round(coalesce((SELECT sum(sangrias) FROM fech), 0), 2),
        'despesas',      round(coalesce((SELECT sum(despesas) FROM fech), 0), 2),
        'ajustes',       round(coalesce((SELECT sum(ajustes) FROM fech), 0), 2),
        'consumo_funcionario', round(coalesce((SELECT sum(consumo_funcionario) FROM fech), 0), 2),
        -- `totalDeclarado` vem zerado em todos os 567 fechamentos capturados:
        -- ninguém digita a contagem física. Sem isso não existe "quebra de
        -- caixa" de verdade, e `inicialDifereFinal` nunca dispara. A tela conta
        -- quantos foram preenchidos para não fingir uma conferência que não há.
        'declarados',    (SELECT count(*) FROM fech WHERE declarado > 0),

        -- Só os que pedem ação. Um ano inteiro daria ~700 linhas e a tela não
        -- é um extrato: quem já foi conferido e fechou não precisa aparecer.
        'atencao', coalesce((
          SELECT jsonb_agg(x ORDER BY x->>'data_base' DESC) FROM (
            SELECT jsonb_build_object(
                     'id', id, 'operador', operador, 'data_base', data_base,
                     'inicio', inicio, 'fim', fim,
                     'total', round(total, 2), 'recebido', round(recebido, 2),
                     'sangrias', round(sangrias, 2), 'quebra', round(quebra, 2),
                     'conferido', conferido, 'divergente', divergente) AS x
              FROM fech
             WHERE divergente OR NOT conferido OR sangrias <> 0
             ORDER BY data_base DESC
             LIMIT 60) y), '[]'::jsonb),
        'atencao_total', (SELECT count(*) FROM fech
                           WHERE divergente OR NOT conferido OR sangrias <> 0),

        -- Produtividade por pessoa. Devolvida com o primeiro nome só, e a tela
        -- mantém o painel fechado por padrão: expor desempenho individual de
        -- funcionária é decisão do dono, não default de dashboard.
        'por_operador', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
                   'operador', operador, 'fechamentos', n,
                   'conferidos', conf, 'total', round(tot, 2))
                 ORDER BY tot DESC)
            FROM (SELECT operador, count(*) n,
                         count(*) FILTER (WHERE conferido) conf, sum(total) tot
                    FROM fech GROUP BY 1) o), '[]'::jsonb)
      )
    )
  );
END;
$$;

COMMENT ON FUNCTION pms_financeiro(date, date) IS
  'Financeiro do período num jsonb só: formas de pagamento, taxa de adquirente '
  'e fechamento de caixa. Conta TODAS as ocupações (estadia + venda direta), '
  'separadas em cada corte. Cortesia e Guia Go Taxa ficam fora do caixa porque '
  'o PMS as marca naoSoma. Os blocos taxa/caixa vêm de pms_snapshots e trazem '
  'disponivel + meses_ausentes: sem captura no mês, a tela diz que falta dado '
  'em vez de mostrar zero.';

REVOKE ALL ON FUNCTION pms_financeiro(date,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pms_financeiro(date,date) TO service_role;
