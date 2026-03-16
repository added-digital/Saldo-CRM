ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS fortnox_employee_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS fortnox_group_name TEXT,
  ADD COLUMN IF NOT EXISTS fortnox_cost_center TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_fortnox_employee ON profiles(fortnox_employee_id);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS industry TEXT,
  ADD COLUMN IF NOT EXISTS revenue NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS employees INTEGER,
  ADD COLUMN IF NOT EXISTS office TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS fortnox_active BOOLEAN,
  ADD COLUMN IF NOT EXISTS bolagsverket_status TEXT,
  ADD COLUMN IF NOT EXISTS bolagsverket_registered_office TEXT,
  ADD COLUMN IF NOT EXISTS bolagsverket_board_count INTEGER,
  ADD COLUMN IF NOT EXISTS bolagsverket_company_data JSONB,
  ADD COLUMN IF NOT EXISTS bolagsverket_board_data JSONB,
  ADD COLUMN IF NOT EXISTS bolagsverket_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customers_org_number ON customers(org_number);
CREATE INDEX IF NOT EXISTS idx_customers_industry ON customers(industry);

ALTER TABLE customers
  DROP CONSTRAINT IF EXISTS customers_status_check;

ALTER TABLE customers
  ADD CONSTRAINT customers_status_check
  CHECK (status IN ('active', 'paused', 'former', 'archived', 'removed'));
