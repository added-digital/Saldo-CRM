ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS due_date DATE,
ADD COLUMN IF NOT EXISTS booked BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
