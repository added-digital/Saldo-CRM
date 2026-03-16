-- =====================================================
-- Migration 00008: CRM Enrichment Tables
-- =====================================================

CREATE TABLE IF NOT EXISTS customer_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  phone TEXT,
  linkedin TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_name ON customer_contacts(name);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_email ON customer_contacts(email);

DROP TRIGGER IF EXISTS set_updated_at ON customer_contacts;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON customer_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS customer_contact_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES customer_contacts(id) ON DELETE CASCADE,
  relationship_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_contact_links_customer ON customer_contact_links(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_contact_links_contact ON customer_contact_links(contact_id);

CREATE TABLE IF NOT EXISTS customer_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('meeting', 'call', 'email', 'note')),
  description TEXT NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_activities_customer ON customer_activities(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_activities_date ON customer_activities(date DESC);
CREATE INDEX IF NOT EXISTS idx_customer_activities_type ON customer_activities(activity_type);

CREATE TABLE IF NOT EXISTS customer_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL,
  price NUMERIC(12, 2),
  billing_model TEXT,
  start_date DATE,
  responsible_consultant UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_services_customer ON customer_services(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_services_type ON customer_services(service_type);

DROP TRIGGER IF EXISTS set_updated_at ON customer_services;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON customer_services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS customer_document_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  document_type TEXT,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_document_links_customer ON customer_document_links(customer_id);
