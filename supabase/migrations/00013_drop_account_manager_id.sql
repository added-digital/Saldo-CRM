DROP INDEX IF EXISTS idx_customers_account_manager;
ALTER TABLE customers DROP COLUMN IF EXISTS account_manager_id;
