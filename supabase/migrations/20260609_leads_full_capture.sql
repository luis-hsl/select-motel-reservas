-- Consolida a captura de leads:
--   • adiciona colunas tax_id, mode, whatsapp_consent (idempotente)
--   • recria insert_lead com a assinatura completa (CPF + modo + WhatsApp consent + session)
--   • recria get_leads retornando todas as colunas + LEFT JOIN com onboarding_sessions (UTM)

-- ─── Colunas ───────────────────────────────────────────────────────────────
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS tax_id           text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS mode             text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS whatsapp_consent boolean NOT NULL DEFAULT false;

-- ─── insert_lead ───────────────────────────────────────────────────────────
-- Remove TODAS as assinaturas anteriores pra evitar ambiguidade de overload
DROP FUNCTION IF EXISTS public.insert_lead(text,text,text,text,text,text,timestamptz,text,text,numeric,text);
DROP FUNCTION IF EXISTS public.insert_lead(text,text,text,text,text,text,timestamptz,text,text,numeric,text,text);
DROP FUNCTION IF EXISTS public.insert_lead(text,text,text,text,text,text,timestamptz,text,text,numeric,text,text,boolean);
DROP FUNCTION IF EXISTS public.insert_lead(text,text,text,text,text,text,timestamptz,text,text,numeric,text,text,boolean,text,text);

CREATE FUNCTION public.insert_lead(
  p_name             text,
  p_phone            text,
  p_email            text,
  p_package_id       text        DEFAULT NULL,
  p_type             text        DEFAULT NULL,
  p_suite_id         text        DEFAULT NULL,
  p_check_in         timestamptz DEFAULT NULL,
  p_drink            text        DEFAULT NULL,
  p_food             text        DEFAULT NULL,
  p_total_amount     numeric     DEFAULT NULL,
  p_observations     text        DEFAULT NULL,
  p_session_token    text        DEFAULT NULL,
  p_whatsapp_consent boolean     DEFAULT false,
  p_tax_id           text        DEFAULT NULL,
  p_mode             text        DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.leads (
    name, phone, email, tax_id, mode,
    package_id, type, suite_id, check_in,
    drink, food, total_amount, observations,
    session_token, whatsapp_consent
  )
  VALUES (
    p_name, p_phone, p_email, p_tax_id, p_mode,
    p_package_id, p_type, p_suite_id, p_check_in,
    p_drink, p_food, p_total_amount, p_observations,
    p_session_token, p_whatsapp_consent
  );
$$;

GRANT EXECUTE ON FUNCTION public.insert_lead(
  text,text,text,text,text,text,timestamptz,text,text,numeric,text,text,boolean,text,text
) TO anon, authenticated;

-- ─── get_leads (LEFT JOIN com onboarding_sessions p/ UTM) ──────────────────
DROP FUNCTION IF EXISTS public.get_leads();

CREATE FUNCTION public.get_leads()
RETURNS TABLE (
  id               uuid,
  name             text,
  phone            text,
  email            text,
  tax_id           text,
  mode             text,
  package_id       text,
  type             text,
  suite_id         text,
  check_in         timestamptz,
  drink            text,
  food             text,
  total_amount     numeric,
  observations     text,
  status           text,
  created_at       timestamptz,
  whatsapp_consent boolean,
  session_token    text,
  utm_source       text,
  utm_medium       text,
  utm_campaign     text,
  utm_content      text,
  referrer         text,
  device           text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id, l.name, l.phone, l.email, l.tax_id, l.mode,
    l.package_id, l.type, l.suite_id, l.check_in,
    l.drink, l.food, l.total_amount, l.observations,
    l.status, l.created_at, l.whatsapp_consent,
    l.session_token,
    s.utm_source, s.utm_medium, s.utm_campaign, s.utm_content,
    s.referrer, s.device
  FROM   public.leads l
  LEFT JOIN public.onboarding_sessions s
         ON s.session_token = l.session_token
  ORDER  BY l.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_leads() TO anon, authenticated;
