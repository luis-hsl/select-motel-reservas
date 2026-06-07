-- Cria tabela leads se não existir
CREATE TABLE IF NOT EXISTS leads (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  phone        text        NOT NULL,
  email        text        NOT NULL,
  package_id   text,
  type         text,
  suite_id     text,
  check_in     timestamptz,
  drink        text,
  food         text,
  total_amount numeric,
  observations text,
  status       text        NOT NULL DEFAULT 'new',
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Habilita RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Política: anon pode inserir (captura de lead), postgres/service pode tudo
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'leads' AND policyname = 'leads_insert_anon'
  ) THEN
    CREATE POLICY leads_insert_anon ON leads FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'leads' AND policyname = 'leads_all_postgres'
  ) THEN
    CREATE POLICY leads_all_postgres ON leads TO postgres USING (true) WITH CHECK (true);
  END IF;
END$$;

-- Remove funções antigas se existirem com assinatura diferente
DROP FUNCTION IF EXISTS get_leads();
DROP FUNCTION IF EXISTS update_lead_status(uuid, text);

-- Função get_leads
CREATE FUNCTION get_leads()
RETURNS TABLE (
  id           uuid,
  name         text,
  phone        text,
  email        text,
  package_id   text,
  type         text,
  suite_id     text,
  check_in     timestamptz,
  drink        text,
  food         text,
  total_amount numeric,
  observations text,
  status       text,
  created_at   timestamptz
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
  FROM   leads
  ORDER  BY created_at DESC;
$$;

-- Função update_lead_status
CREATE FUNCTION update_lead_status(lead_id uuid, new_status text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE leads SET status = new_status WHERE id = lead_id;
$$;

-- Permissões
GRANT SELECT, INSERT, UPDATE ON leads TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_leads()                    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_lead_status(uuid, text) TO anon, authenticated;
