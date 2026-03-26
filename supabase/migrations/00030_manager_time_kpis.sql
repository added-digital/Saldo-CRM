CREATE TABLE IF NOT EXISTS manager_time_kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  customer_manager_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  period_year INT NOT NULL,
  period_month INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  total_hours NUMERIC(10, 2) NOT NULL DEFAULT 0,
  customer_hours NUMERIC(10, 2) NOT NULL DEFAULT 0,
  absence_hours NUMERIC(10, 2) NOT NULL DEFAULT 0,
  internal_hours NUMERIC(10, 2) NOT NULL DEFAULT 0,
  other_hours NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (manager_profile_id, customer_manager_profile_id, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_manager_time_kpis_manager_period
  ON manager_time_kpis(manager_profile_id, period_year, period_month);

CREATE INDEX IF NOT EXISTS idx_manager_time_kpis_customer_manager_period
  ON manager_time_kpis(customer_manager_profile_id, period_year, period_month);

DROP TRIGGER IF EXISTS set_updated_at ON manager_time_kpis;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON manager_time_kpis
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE manager_time_kpis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS manager_time_kpis_select ON manager_time_kpis;
CREATE POLICY manager_time_kpis_select ON manager_time_kpis FOR SELECT USING (has_scope('customers'));

DROP POLICY IF EXISTS manager_time_kpis_manage ON manager_time_kpis;
CREATE POLICY manager_time_kpis_manage ON manager_time_kpis FOR ALL USING (get_user_role() = 'admin');
