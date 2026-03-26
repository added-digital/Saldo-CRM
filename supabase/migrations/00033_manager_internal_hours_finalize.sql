UPDATE manager_time_kpis
SET
  internal_hours = COALESCE(customer_id_1_hours, 0),
  customer_hours = GREATEST(COALESCE(customer_hours, 0) - COALESCE(customer_id_1_hours, 0), 0)
WHERE customer_id_1_hours IS NOT NULL;

ALTER TABLE manager_time_kpis
  DROP COLUMN IF EXISTS customer_id_1_hours;

CREATE OR REPLACE FUNCTION accumulate_manager_time_kpi_rows(rows JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO manager_time_kpis (
    manager_profile_id,
    customer_manager_profile_id,
    period_year,
    period_month,
    total_hours,
    customer_hours,
    absence_hours,
    internal_hours,
    other_hours
  )
  SELECT
    manager_profile_id,
    customer_manager_profile_id,
    period_year,
    period_month,
    COALESCE(total_hours, 0)::numeric,
    COALESCE(customer_hours, 0)::numeric,
    COALESCE(absence_hours, 0)::numeric,
    COALESCE(internal_hours, 0)::numeric,
    COALESCE(other_hours, 0)::numeric
  FROM jsonb_to_recordset(rows) AS x(
    manager_profile_id uuid,
    customer_manager_profile_id uuid,
    period_year int,
    period_month int,
    total_hours numeric,
    customer_hours numeric,
    absence_hours numeric,
    internal_hours numeric,
    other_hours numeric
  )
  ON CONFLICT (manager_profile_id, customer_manager_profile_id, period_year, period_month)
  DO UPDATE SET
    total_hours = manager_time_kpis.total_hours + EXCLUDED.total_hours,
    customer_hours = manager_time_kpis.customer_hours + EXCLUDED.customer_hours,
    absence_hours = manager_time_kpis.absence_hours + EXCLUDED.absence_hours,
    internal_hours = manager_time_kpis.internal_hours + EXCLUDED.internal_hours,
    other_hours = manager_time_kpis.other_hours + EXCLUDED.other_hours,
    updated_at = now();
END;
$$;
