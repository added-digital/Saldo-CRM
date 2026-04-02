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

  FOR job IN
    SELECT sj.id, sj.step_name, sj.batch_phase, sj.batch_offset, sj.payload
    FROM sync_jobs AS sj
    WHERE sj.status IN ('pending', 'processing')
      AND sj.dispatch_lock = false
      AND sj.step_name IS NOT NULL
      AND sj.batch_phase IS NOT NULL
      AND (
        (sj.payload->>'nightly_chain_id') IS NULL
        OR COALESCE(
          CASE
            WHEN (sj.payload->>'nightly_step_index') ~ '^[0-9]+$' THEN (sj.payload->>'nightly_step_index')::INT
            ELSE NULL
          END,
          0
        ) = 0
        OR EXISTS (
          SELECT 1
          FROM sync_jobs AS prev
          WHERE prev.status = 'completed'
            AND prev.payload->>'nightly_chain_id' = sj.payload->>'nightly_chain_id'
            AND CASE
              WHEN (prev.payload->>'nightly_step_index') ~ '^[0-9]+$' THEN (prev.payload->>'nightly_step_index')::INT
              ELSE NULL
            END = (
              COALESCE(
                CASE
                  WHEN (sj.payload->>'nightly_step_index') ~ '^[0-9]+$' THEN (sj.payload->>'nightly_step_index')::INT
                  ELSE NULL
                END,
                0
              ) - 1
            )
        )
      )
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
        'sync_mode', COALESCE(job.payload->>'sync_mode', 'full')
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      )
    );
  END LOOP;
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
    WHERE payload->>'nightly_chain_id' = chain_id
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
    started_by
  )
  VALUES
    (
      'pending', 0, 'Waiting for Customers...', 0, 0,
      'customers', 'list', 0, false,
      jsonb_build_object('step_name','customers','step_label','Customers','nightly_chain_id',chain_id,'nightly_step_index',0),
      NULL
    ),
    (
      'pending', 0, 'Waiting for Invoices...', 0, 0,
      'invoices', 'list', 0, false,
      jsonb_build_object('step_name','invoices','step_label','Invoices','nightly_chain_id',chain_id,'nightly_step_index',1,'sync_mode','full'),
      NULL
    ),
    (
      'pending', 0, 'Waiting for Time Reports...', 0, 0,
      'time-reports', 'list', 0, false,
      jsonb_build_object('step_name','time-reports','step_label','Time Reports','nightly_chain_id',chain_id,'nightly_step_index',2),
      NULL
    ),
    (
      'pending', 0, 'Waiting for Contracts...', 0, 0,
      'contracts', 'list', 0, false,
      jsonb_build_object('step_name','contracts','step_label','Contracts','nightly_chain_id',chain_id,'nightly_step_index',3),
      NULL
    ),
    (
      'pending', 0, 'Waiting for Articles...', 0, 0,
      'articles', 'list', 0, false,
      jsonb_build_object('step_name','articles','step_label','Articles','nightly_chain_id',chain_id,'nightly_step_index',4),
      NULL
    ),
    (
      'pending', 0, 'Waiting for Generate KPIs...', 0, 0,
      'generate-kpis', 'list', 0, false,
      jsonb_build_object('step_name','generate-kpis','step_label','Generate KPIs','nightly_chain_id',chain_id,'nightly_step_index',5),
      NULL
    );
END;
$$;

SELECT cron.schedule(
  'enqueue-nightly-sync-chain',
  '*/5 * * * *',
  $$SELECT enqueue_nightly_sync_chain()$$
);
