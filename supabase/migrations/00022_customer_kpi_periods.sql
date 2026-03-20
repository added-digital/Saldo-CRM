CREATE TABLE IF NOT EXISTS customer_kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  fortnox_customer_number TEXT,
  period_type TEXT NOT NULL CHECK (period_type IN ('year', 'month')),
  period_year INT NOT NULL,
  period_month INT NOT NULL DEFAULT 0,
  total_turnover NUMERIC(14, 2) NOT NULL DEFAULT 0,
  invoice_count INT NOT NULL DEFAULT 0,
  total_hours NUMERIC(10, 2) NOT NULL DEFAULT 0,
  contract_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, period_type, period_year, period_month),
  CHECK (
    (period_type = 'year' AND period_month = 0)
    OR (period_type = 'month' AND period_month BETWEEN 1 AND 12)
  )
);

CREATE INDEX IF NOT EXISTS idx_customer_kpis_customer ON customer_kpis(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_kpis_period ON customer_kpis(period_type, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_customer_kpis_fortnox_customer ON customer_kpis(fortnox_customer_number);

DROP TRIGGER IF EXISTS set_updated_at ON customer_kpis;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON customer_kpis
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE customer_kpis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_kpis_select ON customer_kpis;
CREATE POLICY customer_kpis_select ON customer_kpis FOR SELECT USING (has_scope('customers'));

DROP POLICY IF EXISTS customer_kpis_manage ON customer_kpis;
CREATE POLICY customer_kpis_manage ON customer_kpis FOR ALL USING (get_user_role() = 'admin');
