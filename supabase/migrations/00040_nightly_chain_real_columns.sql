ALTER TABLE sync_jobs
  ADD COLUMN IF NOT EXISTS nightly_chain_id TEXT,
  ADD COLUMN IF NOT EXISTS nightly_step_index INT;

CREATE INDEX IF NOT EXISTS idx_sync_jobs_nightly_chain
  ON sync_jobs(nightly_chain_id, nightly_step_index)
  WHERE nightly_chain_id IS NOT NULL;

CREATE OR REPLACE FUNCTION process_sync_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  job RECORD;
  function_url TEXT;
  base_url TEXT;
  service_key TEXT;
  stale_cutoff TIMESTAMPTZ := now() - INTERVAL '3 minutes';
BEGIN
  base_url := current_setting('app.settings.supabase_url', true);
  IF base_url IS NULL OR base_url = '' THEN
    base_url := 'https://cqnnvupstdygilzofuvs.supabase.co';
  END IF;

  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets
  WHERE name = 'SERVICE_ROLE_KEY'
  LIMIT 1;

  IF service_key IS NULL THEN
    RAISE WARNING 'process_sync_queue: SERVICE_ROLE_KEY not found in vault';
    RETURN;
  END IF;

  UPDATE sync_jobs
  SET dispatch_lock = false,
      status = 'processing'
  WHERE dispatch_lock = true
    AND last_dispatched_at < stale_cutoff
    AND status IN ('pending', 'processing');

  UPDATE sync_jobs
  SET status = 'processing'
  WHERE status = 'pending'
    AND nightly_chain_id IS NULL
    AND step_name IS NOT NULL
    AND batch_phase IS NOT NULL;

  FOR job IN
    SELECT sj.id, sj.step_name, sj.batch_phase, sj.batch_offset, sj.payload
    FROM sync_jobs AS sj
    WHERE sj.status = 'processing'
      AND sj.dispatch_lock = false
      AND sj.step_name IS NOT NULL
      AND sj.batch_phase IS NOT NULL
    ORDER BY sj.created_at ASC
    LIMIT 3
    FOR UPDATE SKIP LOCKED
  LOOP
    function_url := base_url || '/functions/v1/sync-' || job.step_name;

    UPDATE sync_jobs
    SET dispatch_lock = true,
        last_dispatched_at = now()
    WHERE id = job.id;

    PERFORM net.http_post(
      url := function_url,
      body := jsonb_build_object(
        'job_id', job.id,
        'phase', job.batch_phase,
        'offset', job.batch_offset,
        'detail_offset', COALESCE((job.payload->>'detail_offset')::int, 0)
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      )
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION advance_nightly_chain()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  active_chain TEXT;
  current_index INT;
  prev_status TEXT;
BEGIN
  SELECT nightly_chain_id INTO active_chain
  FROM sync_jobs
  WHERE nightly_chain_id IS NOT NULL
    AND status = 'pending'
  ORDER BY nightly_step_index ASC
  LIMIT 1;

  IF active_chain IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM sync_jobs
    WHERE nightly_chain_id = active_chain
      AND status = 'processing'
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM sync_jobs
    WHERE nightly_chain_id = active_chain
      AND status = 'failed'
  ) THEN
    UPDATE sync_jobs
    SET status = 'failed',
        error_message = 'Cancelled: previous step failed'
    WHERE nightly_chain_id = active_chain
      AND status = 'pending';
    RETURN;
  END IF;

  SELECT nightly_step_index INTO current_index
  FROM sync_jobs
  WHERE nightly_chain_id = active_chain
    AND status = 'pending'
  ORDER BY nightly_step_index ASC
  LIMIT 1;

  IF current_index IS NULL THEN
    RETURN;
  END IF;

  IF current_index = 0 THEN
    UPDATE sync_jobs
    SET status = 'processing'
    WHERE nightly_chain_id = active_chain
      AND nightly_step_index = 0
      AND status = 'pending';
    RETURN;
  END IF;

  SELECT status INTO prev_status
  FROM sync_jobs
  WHERE nightly_chain_id = active_chain
    AND nightly_step_index = current_index - 1;

  IF prev_status = 'completed' THEN
    UPDATE sync_jobs
    SET status = 'processing'
    WHERE nightly_chain_id = active_chain
      AND nightly_step_index = current_index
      AND status = 'pending';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION enqueue_nightly_sync_chain()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stockholm_now TIMESTAMP;
  chain_id TEXT;
BEGIN
  stockholm_now := timezone('Europe/Stockholm', now());

  IF EXTRACT(HOUR FROM stockholm_now) < 1 THEN
    RETURN;
  END IF;

  chain_id := 'nightly-sync-' || to_char(stockholm_now::date, 'YYYY-MM-DD');

  IF EXISTS (
    SELECT 1
    FROM sync_jobs
    WHERE nightly_chain_id = chain_id
  ) THEN
    RETURN;
  END IF;

  INSERT INTO sync_jobs (
    status,
    progress,
    current_step,
    total_items,
    processed_items,
    step_name,
    batch_phase,
    batch_offset,
    dispatch_lock,
    payload,
    started_by,
    nightly_chain_id,
    nightly_step_index
  )
  VALUES
    (
      'pending', 0, 'Waiting for Customers...', 0, 0,
      'customers', 'list', 0, false,
      jsonb_build_object('step_name','customers','step_label','Customers'),
      NULL,
      chain_id, 0
    ),
    (
      'pending', 0, 'Waiting for Invoices...', 0, 0,
      'invoices', 'list', 0, false,
      jsonb_build_object('step_name','invoices','step_label','Invoices','sync_mode','full'),
      NULL,
      chain_id, 1
    ),
    (
      'pending', 0, 'Waiting for Time Reports...', 0, 0,
      'time-reports', 'list', 0, false,
      jsonb_build_object('step_name','time-reports','step_label','Time Reports'),
      NULL,
      chain_id, 2
    ),
    (
      'pending', 0, 'Waiting for Contracts...', 0, 0,
      'contracts', 'list', 0, false,
      jsonb_build_object('step_name','contracts','step_label','Contracts'),
      NULL,
      chain_id, 3
    ),
    (
      'pending', 0, 'Waiting for Articles...', 0, 0,
      'articles', 'list', 0, false,
      jsonb_build_object('step_name','articles','step_label','Articles'),
      NULL,
      chain_id, 4
    ),
    (
      'pending', 0, 'Waiting for Generate KPIs...', 0, 0,
      'generate-kpis', 'list', 0, false,
      jsonb_build_object('step_name','generate-kpis','step_label','Generate KPIs'),
      NULL,
      chain_id, 5
    );
END;
$$;

SELECT cron.unschedule('enqueue-nightly-sync-chain');

SELECT cron.schedule(
  'enqueue-nightly-sync-chain',
  '0 23 * * *',
  $$SELECT enqueue_nightly_sync_chain()$$
);

SELECT cron.schedule(
  'advance-nightly-chain',
  '* * * * *',
  $$SELECT advance_nightly_chain()$$
);
