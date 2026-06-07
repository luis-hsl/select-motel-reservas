-- Função get_leads: retorna todos os leads ordenados pelo mais recente
CREATE OR REPLACE FUNCTION get_leads()
RETURNS TABLE (
  id          uuid,
  name        text,
  phone       text,
  email       text,
  package_id  text,
  type        text,
  suite_id    text,
  check_in    timestamptz,
  drink       text,
  food        text,
  total_amount numeric,
  observations text,
  status      text,
  created_at  timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id, name, phone, email,
    package_id, type, suite_id, check_in,
    drink, food, total_amount, observations,
    status, created_at
  FROM leads
  ORDER BY created_at DESC;
$$;

-- Função update_lead_status: atualiza o status de um lead
CREATE OR REPLACE FUNCTION update_lead_status(lead_id uuid, new_status text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE leads SET status = new_status WHERE id = lead_id;
$$;

-- Garante que o anon/authenticated possam chamar as funções via PostgREST
GRANT EXECUTE ON FUNCTION get_leads() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_lead_status(uuid, text) TO anon, authenticated;
