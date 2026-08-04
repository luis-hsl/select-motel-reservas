-- =============================================================
-- Fase 4 — Recorrência de hóspede por placa
-- =============================================================
-- 97% do movimento é balcão, e o balcão não tem cadastro: o objeto de ocupação
-- do PMS não traz nome, CPF, telefone nem e-mail. O único identificador que a
-- recepção já digita hoje — por operação própria, não por pedido nosso — é a
-- placa do carro, preenchida em ~74% das linhas (~85% quando se olha só
-- `eh_estadia`). É por ela, e só por ela, que dá para responder "esse hóspede
-- já esteve aqui" — e é o join natural com um futuro cadastro no site, onde a
-- placa pode ser pedida na reserva.
--
-- **Placa é dado pessoal.** Esta função devolve a placa já mascarada
-- (`ABC1***`) e só do top 10. A lista inteira nunca sai do banco: um painel
-- que exporta 1.878 placas identificáveis é um vazamento esperando acontecer,
-- e nenhuma pergunta de negócio aqui precisa da placa inteira. Quando o
-- programa de fidelidade existir, o casamento placa↔cadastro se faz em SQL,
-- server-side, não na tela.
--
-- **Censura à esquerda.** Quem visitou antes de `p_inicio` aparece como
-- "primeira visita" dentro da janela. Por isso `kpis.novos_sem_historico` olha
-- a tabela inteira, não só o período: é a diferença entre "cliente novo" e
-- "cliente que a janela cortou". Em janela curta os dois números divergem
-- muito, e é o segundo que vale.
--
-- Idempotente: só CREATE OR REPLACE. O migrate.yml reroda todos os .sql a cada
-- push e engole falha com `|| echo FAILED`, então nada aqui pode quebrar na
-- segunda execução.

CREATE OR REPLACE FUNCTION pms_recorrencia_placa(p_inicio date, p_fim date)
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
    -- Normalização da placa ANTES de agrupar. Placa é campo livre digitado no
    -- balcão: 'abc1d23', 'ABC-1D23' e 'ABC 1D23' são o mesmo carro, e agrupar
    -- pelo texto cru transformaria cada erro de digitação num "cliente novo" —
    -- ou seja, subestimaria a recorrência exatamente onde ela mais importa
    -- (o cliente frequente, que aparece muitas vezes e tem mais chance de ter
    -- sido digitado errado ao menos uma vez).
    --
    -- Medido em 04/08/2026 sobre 3.993 estadias com placa: normalizar não
    -- funde nenhuma placa (1.878 distintas antes e depois) e todas têm 7
    -- caracteres. Ou seja, hoje a recepção digita limpo. Fica assim mesmo:
    -- custa nada e é a linha de defesa para quando um turno novo entrar.
    WITH estadias AS (
      SELECT ocupacao_id,
             data_base_caixa,
             total_recebido,
             total_consumo,
             upper(regexp_replace(placa, '[^A-Za-z0-9]', '', 'g')) AS placa
        FROM pms_ocupacoes
       WHERE eh_estadia
         AND data_base_caixa BETWEEN p_inicio AND p_fim
         AND placa IS NOT NULL AND placa <> ''
    ),
    -- Placa que vira string vazia depois da limpeza ('---', '.') é lixo de
    -- digitação, não hóspede. Agrupá-la juntaria carros diferentes no mesmo
    -- "cliente" e inventaria um recorrente enorme.
    limpas AS (
      SELECT * FROM estadias WHERE placa <> ''
    ),
    -- Denominador honesto: todas as estadias do período, com placa ou sem.
    -- Sem isso a tela leria "84% do movimento é de recorrente" quando o certo
    -- é "84% do movimento COM PLACA". A fatia sem placa é o teto de erro de
    -- tudo que vem abaixo.
    universo AS (
      SELECT count(*)                                                  AS estadias,
             coalesce(sum(total_recebido), 0)                          AS receita,
             count(*) FILTER (WHERE placa IS NOT NULL AND placa <> '') AS com_placa
        FROM pms_ocupacoes
       WHERE eh_estadia
         AND data_base_caixa BETWEEN p_inicio AND p_fim
    ),
    hospedes AS (
      SELECT placa,
             count(*)                         AS visitas,
             coalesce(sum(total_recebido), 0) AS receita,
             coalesce(sum(total_consumo), 0)  AS consumo,
             min(data_base_caixa)             AS primeira,
             max(data_base_caixa)             AS ultima
        FROM limpas
       GROUP BY 1
    ),
    -- Ordem da visita dentro da janela + intervalo até a anterior. O desempate
    -- por ocupacao_id existe porque `data_base_caixa` é dia, não instante: o
    -- mesmo carro pode fechar duas contas no mesmo dia-base (motel gira o
    -- quarto), e sem desempate a ordem seria não-determinística.
    ordem AS (
      SELECT l.*,
             row_number() OVER (PARTITION BY placa
                                ORDER BY data_base_caixa, ocupacao_id) AS n,
             count(*)     OVER (PARTITION BY placa)                    AS v,
             data_base_caixa - lag(data_base_caixa) OVER (PARTITION BY placa
                                ORDER BY data_base_caixa, ocupacao_id) AS gap
        FROM limpas l
    ),
    -- Já esteve aqui antes da janela? Roda contra a tabela inteira, usando o
    -- índice parcial de placa. É o que separa "novo de verdade" de "novo só
    -- porque o filtro começa em p_inicio".
    historico AS (
      SELECT DISTINCT upper(regexp_replace(placa, '[^A-Za-z0-9]', '', 'g')) AS placa
        FROM pms_ocupacoes
       WHERE eh_estadia
         AND data_base_caixa < p_inicio
         AND placa IS NOT NULL AND placa <> ''
    ),
    -- Faixas escolhidas para acionamento, não para estatística: quem veio 1 vez
    -- é alvo de "volte", 2 é alvo de "vira habitué", 3-5 já é cliente, 6+ é
    -- quem o motel não pode perder.
    distribuicao AS (
      SELECT CASE WHEN visitas = 1          THEN '1 visita'
                  WHEN visitas = 2          THEN '2 visitas'
                  WHEN visitas BETWEEN 3 AND 5 THEN '3 a 5 visitas'
                  ELSE '6 ou mais'          END AS faixa,
             CASE WHEN visitas = 1 THEN 1
                  WHEN visitas = 2 THEN 2
                  WHEN visitas BETWEEN 3 AND 5 THEN 3
                  ELSE 4 END                    AS ordem_faixa,
             count(*)                           AS hospedes,
             sum(visitas)                       AS estadias,
             sum(receita)                       AS receita
        FROM hospedes
       GROUP BY 1, 2
    ),
    -- "Mesmo dia" fica numa faixa própria em vez de somar com 1-7: pode ser o
    -- casal que voltou à noite, mas também é o formato típico de conta
    -- duplicada. Separado, dá para olhar; misturado, puxaria a mediana para
    -- baixo e faria o motel achar que o ciclo do cliente é semanal.
    intervalos AS (
      SELECT CASE WHEN gap = 0                  THEN 'Mesmo dia'
                  WHEN gap BETWEEN 1  AND 7     THEN '1 a 7 dias'
                  WHEN gap BETWEEN 8  AND 15    THEN '8 a 15 dias'
                  WHEN gap BETWEEN 16 AND 30    THEN '16 a 30 dias'
                  WHEN gap BETWEEN 31 AND 60    THEN '31 a 60 dias'
                  ELSE '61 dias ou mais'        END AS faixa,
             CASE WHEN gap = 0 THEN 1
                  WHEN gap BETWEEN 1  AND 7  THEN 2
                  WHEN gap BETWEEN 8  AND 15 THEN 3
                  WHEN gap BETWEEN 16 AND 30 THEN 4
                  WHEN gap BETWEEN 31 AND 60 THEN 5
                  ELSE 6 END                      AS ordem_faixa,
             count(*)                             AS pares
        FROM ordem
       WHERE gap IS NOT NULL
       GROUP BY 1, 2
    ),
    -- Ticket por estadia, em TRÊS grupos e não dois. Dois seriam uma armadilha:
    -- comparar "primeira visita" contra "retorno" joga o hóspede de uma vez só
    -- dentro do "primeira", e ele é o de ticket mais alto do motel (medido:
    -- R$ 163 contra R$ 140 da primeira visita de quem viria a voltar). O
    -- resultado pooled dava −15% e a leitura seria "recorrente gasta menos ao
    -- voltar", quando metade disso é mistura de população.
    --
    --   unico               → estadias de quem só apareceu 1x na janela
    --   recorrente_primeira → a 1ª estadia de quem voltou (mesma gente do
    --                         retorno, antes de voltar) — comparação sem mix
    --   retorno             → toda estadia com n > 1 (n > 1 já implica volta)
    ticket AS (
      SELECT count(*) FILTER (WHERE v = 1)                                     AS estadias_unico,
             count(*) FILTER (WHERE v > 1 AND n = 1)                           AS estadias_rec_primeira,
             count(*) FILTER (WHERE n > 1)                                     AS estadias_retorno,
             coalesce(avg(total_recebido) FILTER (WHERE v = 1), 0)             AS ticket_unico,
             coalesce(avg(total_recebido) FILTER (WHERE v > 1 AND n = 1), 0)   AS ticket_rec_primeira,
             coalesce(avg(total_recebido) FILTER (WHERE n > 1), 0)             AS ticket_retorno,
             coalesce(avg(total_consumo)  FILTER (WHERE v = 1), 0)             AS consumo_unico,
             coalesce(avg(total_consumo)  FILTER (WHERE n > 1), 0)             AS consumo_retorno
        FROM ordem
    ),
    agregado AS (
      SELECT count(*)                                          AS hospedes,
             count(*) FILTER (WHERE visitas = 1)               AS uma_visita,
             count(*) FILTER (WHERE visitas >= 2)              AS recorrentes,
             coalesce(sum(visitas) FILTER (WHERE visitas >= 2), 0) AS estadias_recorrentes,
             coalesce(sum(receita) FILTER (WHERE visitas >= 2), 0) AS receita_recorrentes,
             coalesce(sum(visitas), 0)                         AS estadias_placa,
             coalesce(sum(receita), 0)                         AS receita_placa,
             coalesce(avg(receita) FILTER (WHERE visitas = 1), 0)  AS valor_uma_visita,
             coalesce(avg(receita) FILTER (WHERE visitas >= 2), 0) AS valor_recorrente
        FROM hospedes
    )
    SELECT jsonb_build_object(
      'periodo', jsonb_build_object(
        'inicio', p_inicio, 'fim', p_fim, 'dias', v_dias
      ),
      -- Mesma forma que `pms_cobertura` devolve: a tela usa para travar as
      -- setas do seletor e não navegar para antes do backfill.
      'cobertura', (
        SELECT jsonb_build_object(
          'primeiro_dia', min(data_base_caixa),
          'ultimo_dia',   max(data_base_caixa)
        ) FROM pms_ocupacoes WHERE eh_estadia
      ),
      'kpis', (
        SELECT jsonb_build_object(
          'estadias',             u.estadias,
          'estadias_com_placa',   u.com_placa,
          'cobertura_placa',      CASE WHEN u.estadias > 0
                                       THEN round(u.com_placa::numeric / u.estadias, 4)
                                       ELSE 0 END,
          'hospedes',             a.hospedes,
          'uma_visita',           a.uma_visita,
          'recorrentes',          a.recorrentes,
          -- Fração de PESSOAS que voltaram. Sempre menor que a fatia do
          -- movimento, porque quem volta ocupa mais linhas por definição.
          'taxa_recorrencia',     CASE WHEN a.hospedes > 0
                                       THEN round(a.recorrentes::numeric / a.hospedes, 4)
                                       ELSE 0 END,
          'estadias_recorrentes', a.estadias_recorrentes,
          -- Fração do MOVIMENTO (com placa) que veio de quem já tinha vindo.
          -- É este o número que justifica o programa de fidelidade.
          'fatia_movimento',      CASE WHEN a.estadias_placa > 0
                                       THEN round(a.estadias_recorrentes::numeric / a.estadias_placa, 4)
                                       ELSE 0 END,
          'receita_recorrentes',  round(a.receita_recorrentes, 2),
          'fatia_receita',        CASE WHEN a.receita_placa > 0
                                       THEN round(a.receita_recorrentes / a.receita_placa, 4)
                                       ELSE 0 END,
          'visitas_por_hospede',  CASE WHEN a.hospedes > 0
                                       THEN round(a.estadias_placa::numeric / a.hospedes, 2)
                                       ELSE 0 END,
          -- De quem só apareceu 1x na janela, quantos nunca tinham vindo antes
          -- dela. A diferença para `uma_visita` é o tamanho da censura.
          'novos_sem_historico',  (
            SELECT count(*) FROM hospedes h
             WHERE h.visitas = 1
               AND NOT EXISTS (SELECT 1 FROM historico x WHERE x.placa = h.placa)
          )
        ) FROM universo u, agregado a
      ),
      'ticket', (
        SELECT jsonb_build_object(
          'estadias_unico',        t.estadias_unico,
          'estadias_rec_primeira', t.estadias_rec_primeira,
          'estadias_retorno',      t.estadias_retorno,
          'unico',                 round(t.ticket_unico, 2),
          'rec_primeira',          round(t.ticket_rec_primeira, 2),
          'retorno',               round(t.ticket_retorno, 2),
          'consumo_unico',         round(t.consumo_unico, 2),
          'consumo_retorno',       round(t.consumo_retorno, 2),
          -- A comparação que vale: a MESMA gente, antes e depois de voltar.
          'delta_intra',           CASE WHEN t.ticket_rec_primeira > 0
                                        THEN round((t.ticket_retorno - t.ticket_rec_primeira)
                                                   / t.ticket_rec_primeira, 4)
                                        ELSE NULL END,
          -- E a que engana: retorno contra quem nunca voltou. Fica exposta de
          -- propósito, para a tela poder mostrar que são coisas diferentes.
          'delta_vs_unico',        CASE WHEN t.ticket_unico > 0
                                        THEN round((t.ticket_retorno - t.ticket_unico)
                                                   / t.ticket_unico, 4)
                                        ELSE NULL END,
          -- Valor acumulado por hóspede no período. É aqui que o recorrente
          -- ganha: ele paga menos POR NOITE e muito mais NO ANO. Um programa
          -- de fidelidade que só empurrasse ticket estaria mirando errado.
          'valor_uma_visita',      round(a.valor_uma_visita, 2),
          'valor_recorrente',      round(a.valor_recorrente, 2),
          'multiplo_valor',        CASE WHEN a.valor_uma_visita > 0
                                        THEN round(a.valor_recorrente / a.valor_uma_visita, 2)
                                        ELSE NULL END
        ) FROM ticket t, agregado a
      ),
      'distribuicao', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'faixa', faixa, 'hospedes', hospedes,
                 'estadias', estadias, 'receita', round(receita, 2))
               ORDER BY ordem_faixa) FROM distribuicao), '[]'::jsonb),
      'intervalo', (
        -- Mediana, não média: um par de 250 dias (alguém que sumiu e voltou)
        -- puxa a média para longe do ciclo real. p25/p75 dão a janela em que
        -- a maioria dos retornos cabe — é ela que define de quanto em quanto
        -- tempo vale acionar.
        SELECT jsonb_build_object(
          'pares',   count(*),
          'mediana', round(percentile_cont(0.5)  WITHIN GROUP (ORDER BY gap)::numeric, 1),
          'p25',     round(percentile_cont(0.25) WITHIN GROUP (ORDER BY gap)::numeric, 1),
          'p75',     round(percentile_cont(0.75) WITHIN GROUP (ORDER BY gap)::numeric, 1),
          'media',   round(avg(gap)::numeric, 1),
          'faixas',  coalesce((
            SELECT jsonb_agg(jsonb_build_object('faixa', faixa, 'pares', pares)
                   ORDER BY ordem_faixa) FROM intervalos), '[]'::jsonb)
        ) FROM ordem WHERE gap IS NOT NULL
      ),
      -- Top 10 e só. A placa sai daqui JÁ MASCARADA: o painel não precisa
      -- dela inteira para reconhecer "aquele cliente", e o que não trafega não
      -- vaza. `ocorrencia` desempata dois mascarados iguais na tela.
      'top_receita', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'placa',   left(placa, 4) || '***',
                 'visitas', visitas,
                 'receita', round(receita, 2),
                 'consumo', round(consumo, 2),
                 'ticket',  round(receita / visitas, 2),
                 'primeira', primeira,
                 'ultima',   ultima)
               ORDER BY receita DESC)
          FROM (SELECT * FROM hospedes ORDER BY receita DESC, placa LIMIT 10) t
      ), '[]'::jsonb),
      'top_frequencia', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'placa',   left(placa, 4) || '***',
                 'visitas', visitas,
                 'receita', round(receita, 2),
                 'ticket',  round(receita / visitas, 2),
                 'primeira', primeira,
                 'ultima',   ultima)
               ORDER BY visitas DESC, receita DESC)
          FROM (SELECT * FROM hospedes ORDER BY visitas DESC, receita DESC, placa LIMIT 10) t
      ), '[]'::jsonb)
    )
  );
END;
$$;

COMMENT ON FUNCTION pms_recorrencia_placa(date, date) IS
  'Recorrência de hóspede por placa do carro — base do programa de fidelidade. '
  'Só eh_estadia e só linhas com placa preenchida; kpis.cobertura_placa diz que '
  'fatia do movimento a análise enxerga. A placa é normalizada (upper, sem '
  'separador) antes de agrupar e sai MASCARADA (ABC1***), apenas no top 10 — a '
  'lista completa é dado pessoal e não deixa o banco.';

REVOKE ALL ON FUNCTION pms_recorrencia_placa(date,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pms_recorrencia_placa(date,date) TO service_role;
