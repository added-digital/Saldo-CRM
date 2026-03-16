-- =====================================================
-- Migration 00007: Fortnox Data Cache
-- =====================================================

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_number TEXT UNIQUE NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  fortnox_customer_number TEXT,
  customer_name TEXT,
  invoice_date DATE,
  total NUMERIC(12, 2),
  balance NUMERIC(12, 2),
  currency_code TEXT DEFAULT 'SEK',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_fortnox_customer ON invoices(fortnox_customer_number);
CREATE INDEX IF NOT EXISTS idx_invoices_document ON invoices(document_number);

DROP TRIGGER IF EXISTS set_updated_at ON invoices;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS invoice_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL,
  article_number TEXT,
  article_name TEXT,
  description TEXT,
  quantity NUMERIC(10, 2),
  unit_price NUMERIC(10, 2),
  total NUMERIC(10, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_rows_invoice ON invoice_rows(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoice_rows_article ON invoice_rows(article_number);

CREATE TABLE IF NOT EXISTS article_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_number TEXT UNIQUE NOT NULL,
  article_name TEXT,
  description TEXT,
  unit TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_article_registry_number ON article_registry(article_number);
CREATE INDEX IF NOT EXISTS idx_article_registry_name ON article_registry(article_name);

DROP TRIGGER IF EXISTS set_updated_at ON article_registry;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON article_registry
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS article_group_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_number TEXT UNIQUE NOT NULL,
  article_name TEXT,
  group_name TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_article_group_mappings_group ON article_group_mappings(group_name);
CREATE INDEX IF NOT EXISTS idx_article_group_mappings_article ON article_group_mappings(article_number);

DROP TRIGGER IF EXISTS set_updated_at ON article_group_mappings;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON article_group_mappings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS cost_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_centers_code ON cost_centers(code);

DROP TRIGGER IF EXISTS set_updated_at ON cost_centers;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON cost_centers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS time_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unique_key TEXT UNIQUE NOT NULL,
  report_id TEXT,
  report_date DATE,
  employee_id TEXT,
  employee_name TEXT,
  fortnox_customer_number TEXT,
  customer_name TEXT,
  project_number TEXT,
  project_name TEXT,
  activity TEXT,
  article_number TEXT,
  hours NUMERIC(10, 2),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_reports_date ON time_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_time_reports_customer ON time_reports(fortnox_customer_number);
CREATE INDEX IF NOT EXISTS idx_time_reports_employee ON time_reports(employee_id);
CREATE INDEX IF NOT EXISTS idx_time_reports_unique_key ON time_reports(unique_key);

DROP TRIGGER IF EXISTS set_updated_at ON time_reports;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON time_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS contract_accruals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fortnox_customer_number TEXT NOT NULL,
  contract_number TEXT NOT NULL,
  customer_name TEXT,
  description TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT,
  accrual_type TEXT,
  period TEXT,
  total NUMERIC(12, 2),
  currency_code TEXT DEFAULT 'SEK',
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fortnox_customer_number, contract_number)
);

CREATE INDEX IF NOT EXISTS idx_contract_accruals_customer ON contract_accruals(fortnox_customer_number);
CREATE INDEX IF NOT EXISTS idx_contract_accruals_updated ON contract_accruals(updated_at);

DROP TRIGGER IF EXISTS set_updated_at ON contract_accruals;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON contract_accruals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
