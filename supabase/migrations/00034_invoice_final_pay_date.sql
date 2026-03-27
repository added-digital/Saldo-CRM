ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS final_pay_date DATE;

CREATE INDEX IF NOT EXISTS idx_invoices_final_pay_date ON invoices(final_pay_date);
