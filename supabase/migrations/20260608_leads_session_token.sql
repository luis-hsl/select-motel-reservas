-- Adiciona session_token à tabela leads para correlacionar com onboarding_sessions
ALTER TABLE leads ADD COLUMN IF NOT EXISTS session_token text;

-- Recria insert_lead com o novo parâmetro p_session_token
DROP FUNCTION IF EXISTS insert_lead(text,text,text,text,text,text,timestamptz,text,text,numeric,text);

CREATE FUNCTION insert_lead(
  p_name         text,
  p_phone        text,
  p_email        text,
  p_package_id   text        DEFAULT NULL,
  p_type         text        DEFAULT NULL,
  p_suite_id     text        DEFAULT NULL,
  p_check_in     timestamptz DEFAULT NULL,
  p_drink        text        DEFAULT NULL,
  p_food         text        DEFAULT NULL,
  p_total_amount numeric     DEFAULT NULL,
  p_observations text        DEFAULT NULL,
  p_session_token text       DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO leads (name, phone, email, package_id, type, suite_id, check_in, drink, food, total_amount, observations, session_token)
  VALUES (p_name, p_phone, p_email, p_package_id, p_type, p_suite_id, p_check_in, p_drink, p_food, p_total_amount, p_observations, p_session_token);
$$;

GRANT EXECUTE ON FUNCTION insert_lead(text,text,text,text,text,text,timestamptz,text,text,numeric,text,text) TO anon, authenticated;
