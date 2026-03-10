-- =====================================================
-- Migration 00003: Customers, Fortnox Connection, Audit Log
-- =====================================================

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fortnox_customer_number TEXT UNIQUE,
  name TEXT NOT NULL,
  org_number TEXT,
  email TEXT,
  phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  zip_code TEXT,
  city TEXT,
  country TEXT DEFAULT 'SE',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'removed')),
  account_manager_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  fortnox_raw JSONB,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_account_manager ON customers(account_manager_id);
CREATE INDEX IF NOT EXISTS idx_customers_fortnox_number ON customers(fortnox_customer_number);

DROP TRIGGER IF EXISTS set_updated_at ON customers;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS fortnox_connection (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  fortnox_tenant_id TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  connected_by UUID REFERENCES profiles(id),
  last_sync_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'idle' CHECK (sync_status IN ('idle', 'syncing', 'error')),
  sync_error TEXT,
  websocket_offset TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at ON fortnox_connection;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON fortnox_connection
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
