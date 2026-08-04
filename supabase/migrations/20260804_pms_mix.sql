-- =============================================================
-- Mix do movimento — por que o ticket médio cai sem ninguém mexer no preço
-- =============================================================
-- O ticket saiu de R$ 161,56 (dez/25) para R$ 132,23 (jul/26), −18%. A tabela
-- de preços não mudou nesse intervalo, então a pergunta não é "quanto caiu" e
-- sim "o motel passou a vender outra coisa?".
--
-- Um ticket médio é sempre a média ponderada de células (categoria de suíte ×
-- modalidade de tempo). Ele desce por dois caminhos independentes:
--
--   mix   — a mesma célula custa o mesmo, mas pesa menos no total
--            (menos Pernoite, mais Standard de 2h)
--   preço — a célula em si passou a render menos
--            (desconto, consumo por estadia caindo, tarifa mexida)
--
-- Somar as duas explicações dá exatamente a variação observada, e é essa
-- identidade que esta função devolve. Sem separar, "ticket caiu" é diagnóstico
-- de nada: reagir a mix com corte de preço piora o resultado.
--
-- Decomposição usada (shift-share, exata por construção):
--   Σ sᵃ·tᵃ − Σ sᵇ·tᵇ = Σ (sᵃ−sᵇ)·tᵇ  +  Σ sᵇ·(tᵃ−tᵇ)  +  Σ (sᵃ−sᵇ)·(tᵃ−tᵇ)
--                        └── mix ──┘     └── preço ──┘     └── interação ──┘
-- A interação fica separada em vez de rateada porque ela tem leitura própria:
-- positiva quer dizer que o que encolheu foi justamente o que barateou.
--
-- Idempotente: só CREATE OR REPLACE. O migrate.yml reroda TODOS os .sql a cada
-- push, então rodar de novo não pode falhar nem duplicar nada.

-- ── Mix e decomposição do ticket num período ────────────────────────────────
-- `p_inicio`/`p_fim` nulos = todo o histórico ingerido. A pergunta do mix é
-- sobre tendência longa e o seletor do painel só sabe recortar mês ou ano;
-- sem esse atalho a tela abriria justamente sem os meses que interessam.
CREATE OR REPLACE FUNCTION pms_mix_periodo(p_inicio date, p_fim date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
  v_cob_ini date;   -- primeiro/último dia com estadia ingerida
  v_cob_fim date;
  v_ini     date;
  v_fim     date;
  v_int_ini date;   -- primeiro/último mês INTEIRO dentro do recorte
  v_int_fim date;
  v_all_ini date;   -- primeiro/último mês com movimento, inteiro ou não
  v_all_fim date;
  v_base    date;   -- as duas pontas que a decomposição compara
  v_atual   date;
  v_tk_base numeric;  -- ticket geral do mês base; centra o efeito de mix
BEGIN
  SELECT min(data_base_caixa), max(data_base_caixa)
    INTO v_cob_ini, v_cob_fim
    FROM pms_ocupacoes WHERE eh_estadia;

  v_ini := coalesce(p_inicio, v_cob_ini);
  v_fim := coalesce(p_fim,    v_cob_fim);

  IF v_ini IS NULL OR v_fim IS NULL OR v_ini > v_fim THEN
    RETURN jsonb_build_object(
      'erro',        'período inválido ou sem estadia ingerida',
      'periodo',     jsonb_build_object('inicio', v_ini, 'fim', v_fim, 'meses', 0),
      'cobertura',   jsonb_build_object('primeiro_dia', v_cob_ini, 'ultimo_dia', v_cob_fim),
      'rotulos_modalidade', '[]'::jsonb,
      'rotulos_categoria',  '[]'::jsonb,
      'mensal',      '[]'::jsonb,
      'decomposicao', NULL
    );
  END IF;

  -- Mês cortado ao meio (o corrente, quase sempre) tem ticket instável e mix
  -- enviesado pelo dia da semana que calhou de entrar. Ele continua na série,
  -- marcado como `parcial`, mas não serve de ponta da comparação.
  SELECT min(mes) FILTER (WHERE inteiro), max(mes) FILTER (WHERE inteiro),
         min(mes),                        max(mes)
    INTO v_int_ini, v_int_fim, v_all_ini, v_all_fim
    FROM (
      SELECT date_trunc('month', data_base_caixa)::date AS mes,
             date_trunc('month', data_base_caixa)::date >= v_ini
               AND (date_trunc('month', data_base_caixa) + interval '1 month')::date - 1 <= v_fim
               AS inteiro
        FROM pms_ocupacoes
       WHERE eh_estadia
         AND data_base_caixa BETWEEN v_ini AND v_fim
       GROUP BY 1, 2
    ) m;

  IF v_all_ini IS NULL THEN
    RETURN jsonb_build_object(
      'periodo',     jsonb_build_object('inicio', v_ini, 'fim', v_fim, 'meses', 0),
      'cobertura',   jsonb_build_object('primeiro_dia', v_cob_ini, 'ultimo_dia', v_cob_fim),
      'rotulos_modalidade', '[]'::jsonb,
      'rotulos_categoria',  '[]'::jsonb,
      'mensal',      '[]'::jsonb,
      'decomposicao', NULL
    );
  END IF;

  -- Só descarta os parciais se ainda sobrarem duas pontas distintas; num
  -- recorte de mês único é melhor comparar meia-ponta do que devolver zeros.
  IF v_int_ini IS NOT NULL AND v_int_fim > v_int_ini THEN
    v_base := v_int_ini; v_atual := v_int_fim;
  ELSE
    v_base := v_all_ini; v_atual := v_all_fim;
  END IF;

  -- Centro do efeito de mix. Sem ele a leitura por célula inverte de sinal:
  -- (Δshare × ticket) marca "Standard de 2h cresceu" como efeito POSITIVO,
  -- quando crescer uma célula abaixo da média é justamente o que derruba o
  -- ticket. Como Σ Δshare = 0 dentro de cada abertura, subtrair uma constante
  -- não move o total — só endireita a atribuição linha a linha.
  SELECT sum(total_recebido) / nullif(count(*), 0) INTO v_tk_base
    FROM pms_ocupacoes
   WHERE eh_estadia
     AND data_base_caixa >= v_base
     AND data_base_caixa < (v_base + interval '1 month')::date;

  RETURN (
    WITH estadias AS (
      SELECT date_trunc('month', o.data_base_caixa)::date AS mes,
             o.modo,
             -- Mapa em PLUGPLAY.md. Modalidade nova aparece com o número cru em
             -- vez de sumir — foi assim que modo 5 e 7 apareceram no backfill.
             CASE o.modo WHEN 0 THEN '1 hora'
                         WHEN 1 THEN 'Pernoite'
                         WHEN 2 THEN 'Período (2h)'
                         WHEN 4 THEN 'Diária'
                         ELSE 'modo ' || o.modo::text END AS modalidade,
             coalesce(s.category, 'sem categoria')        AS categoria,
             o.total_recebido,
             o.total_consumo,
             -- Hospedagem = o que sobrou depois do frigobar. Vem da subtração e
             -- não da soma dos valor_*: desconto e acréscimo entram no recebido
             -- e ficariam de fora se a gente somasse tarifa por tarifa.
             o.total_recebido - o.total_consumo           AS hospedagem
        FROM pms_ocupacoes o
        LEFT JOIN suites s ON s.id = o.suite_id
       -- Venda direta (modo 5/7, ~9% das linhas) não tem quarto: entraria na
       -- média puxando o ticket sem representar estadia nenhuma.
       WHERE o.eh_estadia
         AND o.data_base_caixa BETWEEN v_ini AND v_fim
    ),
    mes_tot AS (
      SELECT mes,
             count(*)                                AS estadias,
             sum(total_recebido)                     AS receita,
             sum(total_consumo)                      AS consumo,
             sum(hospedagem)                         AS hospedagem
        FROM estadias GROUP BY 1
    ),
    mod_mes AS (
      SELECT mes, modo, modalidade,
             count(*) AS estadias, sum(total_recebido) AS receita
        FROM estadias GROUP BY 1, 2, 3
    ),
    cat_mes AS (
      SELECT mes, categoria,
             count(*) AS estadias, sum(total_recebido) AS receita
        FROM estadias GROUP BY 1, 2
    ),
    -- A célula fina. Categoria e modalidade separadas se contaminam: "Período
    -- de 2h ficou mais barato" pode ser só Período de 2h tendo virado Standard.
    cel_mes AS (
      SELECT mes, categoria || ' · ' || modalidade AS celula,
             count(*) AS estadias, sum(total_recebido) AS receita
        FROM estadias GROUP BY 1, 2
    ),

    -- ── Contrafactuais mês a mês ──────────────────────────────────────────
    -- Duas séries que respondem a pergunta sem esperar o leitor fazer conta:
    -- congelando o mix no mês base sobra o efeito de preço; congelando os
    -- preços sobra o efeito de mix. A que acompanhar o ticket real é a culpada.
    base_cel AS (
      SELECT c.celula,
             c.estadias::numeric / t.estadias AS share,
             c.receita / c.estadias           AS ticket
        FROM cel_mes c JOIN mes_tot t ON t.mes = c.mes
       WHERE c.mes = v_base
    ),
    contraf AS (
      -- Renormaliza pelas células presentes nos dois meses: célula que só
      -- existe de um lado não tem par de preço e distorceria a série se
      -- entrasse com peso e ticket zero.
      SELECT c.mes,
             sum(b.share * c.receita / c.estadias)
               / nullif(sum(b.share), 0)                          AS ticket_mix_base,
             sum(c.estadias::numeric / t.estadias * b.ticket)
               / nullif(sum(c.estadias::numeric / t.estadias), 0)  AS ticket_precos_base
        FROM cel_mes c
        JOIN mes_tot t  ON t.mes = c.mes
        JOIN base_cel b ON b.celula = c.celula
       GROUP BY c.mes
    ),

    -- ── Decomposição base → atual, nas três aberturas ─────────────────────
    -- Empilhadas numa tabela só para a conta ser escrita uma vez; ler as três
    -- lado a lado é o que mostra quanto do mix é modalidade e quanto é suíte.
    dims AS (
      SELECT 'modalidade'::text AS dim, mes, modalidade AS chave, estadias, receita FROM mod_mes
      UNION ALL
      SELECT 'categoria',            mes, categoria,      estadias, receita FROM cat_mes
      UNION ALL
      SELECT 'celula',               mes, celula,         estadias, receita FROM cel_mes
    ),
    pares AS (
      SELECT coalesce(b.dim, a.dim)     AS dim,
             coalesce(b.chave, a.chave) AS chave,
             coalesce(b.estadias, 0)    AS est_base,
             coalesce(a.estadias, 0)    AS est_atual,
             coalesce(b.estadias::numeric
                        / nullif((SELECT estadias FROM mes_tot WHERE mes = v_base), 0), 0)  AS s_base,
             coalesce(a.estadias::numeric
                        / nullif((SELECT estadias FROM mes_tot WHERE mes = v_atual), 0), 0) AS s_atual,
             -- Célula que existe de um lado só herda o ticket do outro. Assim a
             -- diferença inteira cai em "mix" — que é a verdade: ela não ficou
             -- mais barata, ela deixou de ser vendida.
             coalesce(b.receita / b.estadias, a.receita / a.estadias) AS tk_base,
             coalesce(a.receita / a.estadias, b.receita / b.estadias) AS tk_atual
        FROM      (SELECT * FROM dims WHERE mes = v_base)  b
        FULL JOIN (SELECT * FROM dims WHERE mes = v_atual) a
               ON a.dim = b.dim AND a.chave = b.chave
    ),
    efeitos AS (
      SELECT dim, chave, est_base, est_atual, s_base, s_atual, tk_base, tk_atual,
             -- Centrado em v_tk_base: "esta célula rende acima/abaixo da média
             -- e ganhou/perdeu peso". O total da abertura fica idêntico.
             (s_atual - s_base) * (tk_base - coalesce(v_tk_base, 0)) AS ef_mix,
             s_base * (tk_atual - tk_base)                           AS ef_preco,
             (s_atual - s_base) * (tk_atual - tk_base)               AS ef_inter
        FROM pares
    )

    SELECT jsonb_build_object(
      'periodo', jsonb_build_object(
        'inicio', v_ini, 'fim', v_fim,
        'meses', (SELECT count(*) FROM mes_tot)
      ),
      -- A tela usa para limitar as setas do seletor e para distinguir "não
      -- vendeu" de "ainda não ingerimos esse mês".
      'cobertura', jsonb_build_object(
        'primeiro_dia', v_cob_ini, 'ultimo_dia', v_cob_fim
      ),

      -- Ordem estável por volume no período inteiro: sem isso a mesma
      -- modalidade trocaria de cor entre um mês e outro na barra empilhada.
      'rotulos_modalidade', coalesce((
        SELECT jsonb_agg(x.modalidade ORDER BY x.n DESC, x.modalidade)
          FROM (SELECT modalidade, sum(estadias) AS n FROM mod_mes GROUP BY 1) x), '[]'::jsonb),
      'rotulos_categoria', coalesce((
        SELECT jsonb_agg(x.categoria ORDER BY x.n DESC, x.categoria)
          FROM (SELECT categoria, sum(estadias) AS n FROM cat_mes GROUP BY 1) x), '[]'::jsonb),

      'mensal', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'mes',      to_char(t.mes, 'YYYY-MM'),
                 'parcial',  t.mes < v_ini
                               OR (t.mes + interval '1 month')::date - 1 > v_fim,
                 'estadias', t.estadias,
                 'receita',  round(t.receita, 2),
                 'consumo',  round(t.consumo, 2),
                 'ticket',            round(t.receita / t.estadias, 2),
                 'ticket_hospedagem', round(t.hospedagem / t.estadias, 2),
                 'ticket_consumo',    round(t.consumo / t.estadias, 2),
                 'ticket_mix_base',    round(cf.ticket_mix_base, 2),
                 'ticket_precos_base', round(cf.ticket_precos_base, 2),
                 'modalidades', coalesce((
                   SELECT jsonb_agg(jsonb_build_object(
                            'modo',     m.modo,
                            'rotulo',   m.modalidade,
                            'estadias', m.estadias,
                            'share',    round(m.estadias::numeric / t.estadias, 4),
                            'ticket',   round(m.receita / m.estadias, 2),
                            'receita',  round(m.receita, 2))
                          ORDER BY m.estadias DESC)
                     FROM mod_mes m WHERE m.mes = t.mes), '[]'::jsonb),
                 'categorias', coalesce((
                   SELECT jsonb_agg(jsonb_build_object(
                            'categoria', c.categoria,
                            'estadias',  c.estadias,
                            'share',     round(c.estadias::numeric / t.estadias, 4),
                            'ticket',    round(c.receita / c.estadias, 2),
                            'receita',   round(c.receita, 2))
                          ORDER BY c.estadias DESC)
                     FROM cat_mes c WHERE c.mes = t.mes), '[]'::jsonb)
               ) ORDER BY t.mes)
          FROM mes_tot t
          LEFT JOIN contraf cf ON cf.mes = t.mes), '[]'::jsonb),

      'decomposicao', (
        SELECT jsonb_build_object(
          'base', jsonb_build_object(
            'mes',      to_char(b.mes, 'YYYY-MM'),
            'estadias', b.estadias,
            'ticket',            round(b.receita / b.estadias, 2),
            'ticket_hospedagem', round(b.hospedagem / b.estadias, 2),
            'ticket_consumo',    round(b.consumo / b.estadias, 2)),
          'atual', jsonb_build_object(
            'mes',      to_char(a.mes, 'YYYY-MM'),
            'estadias', a.estadias,
            'ticket',            round(a.receita / a.estadias, 2),
            'ticket_hospedagem', round(a.hospedagem / a.estadias, 2),
            'ticket_consumo',    round(a.consumo / a.estadias, 2)),
          'variacao',     round(a.receita / a.estadias - b.receita / b.estadias, 2),
          'variacao_pct', round((a.receita / a.estadias - b.receita / b.estadias)
                                / nullif(b.receita / b.estadias, 0), 4),
          -- Antes de discutir mix vale saber se o que caiu foi quarto ou
          -- frigobar: são times e alavancas diferentes.
          'variacao_hospedagem', round(a.hospedagem / a.estadias - b.hospedagem / b.estadias, 2),
          'variacao_consumo',    round(a.consumo / a.estadias - b.consumo / b.estadias, 2),

          'dimensoes', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                     'dim',       e.dim,
                     'mix',       round(e.mix, 2),
                     'preco',     round(e.preco, 2),
                     'interacao', round(e.inter, 2))
                   -- Da abertura mais grossa para a mais fina.
                   ORDER BY CASE e.dim WHEN 'modalidade' THEN 1
                                       WHEN 'categoria'  THEN 2 ELSE 3 END)
              FROM (SELECT dim, sum(ef_mix) AS mix, sum(ef_preco) AS preco,
                           sum(ef_inter) AS inter
                      FROM efeitos GROUP BY dim) e), '[]'::jsonb),

          -- Só a abertura fina: é a lista de "quem puxou o ticket", e é dela
          -- que sai a ação (o que voltar a vender, não o que descontar).
          'celulas', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                     'chave',          f.chave,
                     'estadias_base',  f.est_base,
                     'estadias_atual', f.est_atual,
                     'share_base',     round(f.s_base, 4),
                     'share_atual',    round(f.s_atual, 4),
                     'ticket_base',    round(f.tk_base, 2),
                     'ticket_atual',   round(f.tk_atual, 2),
                     'efeito_mix',     round(f.ef_mix, 2),
                     'efeito_preco',   round(f.ef_preco, 2),
                     'efeito_total',   round(f.ef_mix + f.ef_preco + f.ef_inter, 2))
                   ORDER BY abs(f.ef_mix + f.ef_preco + f.ef_inter) DESC)
              FROM efeitos f WHERE f.dim = 'celula'), '[]'::jsonb)
        )
          FROM mes_tot b, mes_tot a
         WHERE b.mes = v_base AND a.mes = v_atual
      )
    )
  );
END;
$$;

COMMENT ON FUNCTION pms_mix_periodo(date, date) IS
  'Mix mensal (share por modalidade e por categoria) mais a decomposição '
  'shift-share do ticket médio entre a primeira e a última ponta do período: '
  'quanto da variação é mix, quanto é preço e quanto é interação. Argumentos '
  'nulos = todo o histórico ingerido. Conta apenas eh_estadia.';

REVOKE ALL ON FUNCTION pms_mix_periodo(date,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pms_mix_periodo(date,date) TO service_role;
