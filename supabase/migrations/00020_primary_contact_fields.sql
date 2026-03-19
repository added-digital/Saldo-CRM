ALTER TABLE customer_contacts
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT;

ALTER TABLE customer_contact_links
ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_customer_contact_links_is_primary
ON customer_contact_links(is_primary)
WHERE is_primary = true;
