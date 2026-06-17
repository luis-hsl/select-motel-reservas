CREATE TABLE promotions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL,
  description text        NOT NULL DEFAULT '',
  photo_url   text,
  button_text text        NOT NULL DEFAULT 'Saiba mais',
  button_url  text        NOT NULL DEFAULT '',
  active      boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "promotions_public_read" ON promotions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "promotions_service_all" ON promotions FOR ALL TO service_role USING (true) WITH CHECK (true);
