ALTER TABLE contract_accruals
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_contract_accruals_is_active
ON contract_accruals(is_active);
