-- =====================================================
-- Migration 00009: App Settings & Licensing Tables
-- =====================================================

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS license_price_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_number TEXT UNIQUE NOT NULL,
  product_name TEXT,
  monthly_price NUMERIC(12, 2) DEFAULT 0,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_license_price_list_article ON license_price_list(article_number);

DROP TRIGGER IF EXISTS set_updated_at ON license_price_list;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON license_price_list
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS license_customer_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_number TEXT UNIQUE NOT NULL,
  name TEXT,
  fortnox_customer_number TEXT,
  discount_percent NUMERIC(5, 2) DEFAULT 0,
  fixed_price_fortnox NUMERIC(12, 2),
  fixed_price_reda NUMERIC(12, 2),
  comment TEXT,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_license_customer_config_org ON license_customer_config(org_number);

DROP TRIGGER IF EXISTS set_updated_at ON license_customer_config;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON license_customer_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
