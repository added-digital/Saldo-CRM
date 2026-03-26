ALTER TABLE manager_time_kpis
  ADD COLUMN IF NOT EXISTS customer_id_1_hours NUMERIC(10, 2) NOT NULL DEFAULT 0;
