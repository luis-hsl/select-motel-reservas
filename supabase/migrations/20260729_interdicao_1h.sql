-- =============================================================
-- Interdição de limpeza: 2h → 1h
-- =============================================================
-- As 2h vinham da temporada de Dia dos Namorados, quando cada quarto era
-- limpo E redecorado entre ocupações. Fora dessa temporada só há limpeza,
-- que leva 1h.
--
-- O prazo custa receita: com 2h, uma reserva às 18:00 bloqueia a suíte desde
-- as 16:00 e mata a janela 16:00–17:00. Verificado contra o PMS — com 1h o
-- bloqueio começa às 17:00 e essa faixa volta a ser vendável.
--
-- Esta coluna passa a valer de verdade: plugplay-sync-reserva a envia como
-- Reserva.horasInterdicao, sobrepondo o default do integrador no PMS. Antes
-- desta mudança ela existia mas não era lida por nenhuma lógica.
--
-- Para voltar à decoração sazonal, basta subir o valor (por suíte, se quiser):
--   UPDATE suites SET cleaning_buffer_h = 2 WHERE id IN ('suite-14','suite-16');

UPDATE suites SET cleaning_buffer_h = 1 WHERE cleaning_buffer_h <> 1;

COMMENT ON COLUMN suites.cleaning_buffer_h IS
  'Horas de interdição para limpeza antes da entrada. Enviado ao MotelMais '
  'PlugPlay como Reserva.horasInterdicao. Era 2 na temporada de decoração '
  '(Dia dos Namorados); 1 é o padrão só-limpeza.';

DO $$
DECLARE fora int;
BEGIN
  SELECT count(*) INTO fora FROM suites WHERE active AND cleaning_buffer_h <> 1;
  IF fora > 0 THEN
    RAISE NOTICE 'PlugPlay: % suíte(s) ativa(s) com interdição diferente de 1h '
                 '(intencional se for decoração sazonal).', fora;
  END IF;
END $$;
