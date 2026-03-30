-- =====================================================
-- Migration 00036: Mail templates
-- =====================================================

CREATE TABLE IF NOT EXISTS mail_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  template_type TEXT NOT NULL CHECK (template_type IN ('plain', 'plain_os')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mail_templates_updated_at ON mail_templates(updated_at DESC);

DROP TRIGGER IF EXISTS set_updated_at ON mail_templates;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON mail_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE mail_templates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'mail_templates_select' AND tablename = 'mail_templates'
  ) THEN
    CREATE POLICY mail_templates_select ON mail_templates
      FOR SELECT
      USING (has_scope('customers'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'mail_templates_manage_admin' AND tablename = 'mail_templates'
  ) THEN
    CREATE POLICY mail_templates_manage_admin ON mail_templates
      FOR ALL
      USING (get_user_role() = 'admin')
      WITH CHECK (get_user_role() = 'admin');
  END IF;
END $$;
