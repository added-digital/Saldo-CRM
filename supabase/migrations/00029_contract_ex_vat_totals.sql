ALTER TABLE contract_accruals
ADD COLUMN IF NOT EXISTS total_ex_vat NUMERIC(12, 2);
