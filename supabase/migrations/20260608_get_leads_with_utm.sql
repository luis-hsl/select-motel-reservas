-- Recria get_leads fazendo LEFT JOIN com onboarding_sessions
-- para retornar dados de campanha (UTM) junto com cada lead
DROP FUNCTION IF EXISTS get_leads();

CREATE FUNCTION get_leads()
RETURNS TABLE (
  id            uuid,
  name          text,
  phone         text,
  email         text,
  package_id    text,
  type          text,
  suite_id      text,
  check_in      timestamptz,
  drink         text,
  food          text,
  total_amount  numeric,
  observations  text,
  status        text,
  created_at    timestamptz,
  session_token text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  referrer      text,
  device        text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id, l.name, l.phone, l.email,
    l.package_id, l.type, l.suite_id, l.check_in,
    l.drink, l.food, l.total_amount, l.observations,
    l.status, l.created_at,
    l.session_token,
    s.utm_source, s.utm_medium, s.utm_campaign, s.utm_content,
    s.referrer, s.device
  FROM   leads l
  LEFT JOIN onboarding_sessions s ON s.session_token = l.session_token
  ORDER  BY l.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_leads() TO anon, authenticated;
