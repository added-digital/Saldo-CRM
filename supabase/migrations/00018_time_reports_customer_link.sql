ALTER TABLE time_reports
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_time_reports_customer_id ON time_reports(customer_id);

UPDATE time_reports tr
SET
  customer_id = c.id,
  fortnox_customer_number = c.fortnox_customer_number,
  customer_name = c.name
FROM customers c
WHERE c.fortnox_cost_center IS NOT NULL
  AND tr.fortnox_customer_number = c.fortnox_cost_center
  AND (
    tr.customer_id IS DISTINCT FROM c.id
    OR tr.fortnox_customer_number IS DISTINCT FROM c.fortnox_customer_number
    OR tr.customer_name IS DISTINCT FROM c.name
  );
