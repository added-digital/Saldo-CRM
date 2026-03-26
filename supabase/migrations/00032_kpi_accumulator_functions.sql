CREATE OR REPLACE FUNCTION accumulate_customer_totals_rows(rows JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  WITH input_rows AS (
    SELECT
      customer_id,
      COALESCE(total_turnover, 0)::numeric AS total_turnover,
      COALESCE(invoice_count, 0)::int AS invoice_count,
      COALESCE(total_hours, 0)::numeric AS total_hours,
      COALESCE(contract_value, 0)::numeric AS contract_value
    FROM jsonb_to_recordset(rows) AS x(
      customer_id uuid,
      total_turnover numeric,
      invoice_count int,
      total_hours numeric,
      contract_value numeric
    )
  ),
  grouped AS (
    SELECT
      customer_id,
      SUM(total_turnover) AS total_turnover,
      SUM(invoice_count) AS invoice_count,
      SUM(total_hours) AS total_hours,
      SUM(contract_value) AS contract_value
    FROM input_rows
    GROUP BY customer_id
  )
  UPDATE customers c
  SET
    total_turnover = COALESCE(c.total_turnover, 0) + g.total_turnover,
    invoice_count = COALESCE(c.invoice_count, 0) + g.invoice_count,
    total_hours = COALESCE(c.total_hours, 0) + g.total_hours,
    contract_value = COALESCE(c.contract_value, 0) + g.contract_value
  FROM grouped g
  WHERE c.id = g.customer_id;
END;
$$;

CREATE OR REPLACE FUNCTION accumulate_customer_kpi_rows(rows JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO customer_kpis (
    customer_id,
    fortnox_customer_number,
    period_type,
    period_year,
    period_month,
    total_turnover,
    invoice_count,
    total_hours,
    customer_hours,
    absence_hours,
    internal_hours,
    other_hours,
    contract_value
  )
  SELECT
    customer_id,
    fortnox_customer_number,
    period_type,
    period_year,
    period_month,
    COALESCE(total_turnover, 0)::numeric,
    COALESCE(invoice_count, 0)::int,
    COALESCE(total_hours, 0)::numeric,
    COALESCE(customer_hours, 0)::numeric,
    COALESCE(absence_hours, 0)::numeric,
    COALESCE(internal_hours, 0)::numeric,
    COALESCE(other_hours, 0)::numeric,
    COALESCE(contract_value, 0)::numeric
  FROM jsonb_to_recordset(rows) AS x(
    customer_id uuid,
    fortnox_customer_number text,
    period_type text,
    period_year int,
    period_month int,
    total_turnover numeric,
    invoice_count int,
    total_hours numeric,
    customer_hours numeric,
    absence_hours numeric,
    internal_hours numeric,
    other_hours numeric,
    contract_value numeric
  )
  ON CONFLICT (customer_id, period_type, period_year, period_month)
  DO UPDATE SET
    total_turnover = customer_kpis.total_turnover + EXCLUDED.total_turnover,
    invoice_count = customer_kpis.invoice_count + EXCLUDED.invoice_count,
    total_hours = customer_kpis.total_hours + EXCLUDED.total_hours,
    customer_hours = customer_kpis.customer_hours + EXCLUDED.customer_hours,
    absence_hours = customer_kpis.absence_hours + EXCLUDED.absence_hours,
    internal_hours = customer_kpis.internal_hours + EXCLUDED.internal_hours,
    other_hours = customer_kpis.other_hours + EXCLUDED.other_hours,
    contract_value = customer_kpis.contract_value + EXCLUDED.contract_value,
    updated_at = now();
END;
$$;

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
    other_hours,
    customer_id_1_hours
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
    COALESCE(other_hours, 0)::numeric,
    COALESCE(customer_id_1_hours, 0)::numeric
  FROM jsonb_to_recordset(rows) AS x(
    manager_profile_id uuid,
    customer_manager_profile_id uuid,
    period_year int,
    period_month int,
    total_hours numeric,
    customer_hours numeric,
    absence_hours numeric,
    internal_hours numeric,
    other_hours numeric,
    customer_id_1_hours numeric
  )
  ON CONFLICT (manager_profile_id, customer_manager_profile_id, period_year, period_month)
  DO UPDATE SET
    total_hours = manager_time_kpis.total_hours + EXCLUDED.total_hours,
    customer_hours = manager_time_kpis.customer_hours + EXCLUDED.customer_hours,
    absence_hours = manager_time_kpis.absence_hours + EXCLUDED.absence_hours,
    internal_hours = manager_time_kpis.internal_hours + EXCLUDED.internal_hours,
    other_hours = manager_time_kpis.other_hours + EXCLUDED.other_hours,
    customer_id_1_hours = manager_time_kpis.customer_id_1_hours + EXCLUDED.customer_id_1_hours,
    updated_at = now();
END;
$$;
