-- Retorna os IDs das suítes ocupadas para um determinado período.
-- Considera reservas com status 'paid' ou 'pending' que se sobrepõem ao intervalo.
CREATE OR REPLACE FUNCTION get_occupied_suite_ids(
  p_check_in  timestamptz,
  p_check_out timestamptz
)
RETURNS TABLE(suite_id text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT r.suite_id::text
  FROM   reservations r
  WHERE  r.status IN ('paid', 'pending')
    AND  r.check_in  < p_check_out
    AND  r.check_out > p_check_in;
END;
$$;

-- Permite que clientes anônimos e autenticados chamem a função
GRANT EXECUTE ON FUNCTION get_occupied_suite_ids(timestamptz, timestamptz)
  TO anon, authenticated;
