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
    SELECT id, step_name, batch_phase, batch_offset, payload
    FROM sync_jobs
    WHERE status IN ('pending', 'processing')
      AND dispatch_lock = false
      AND step_name IS NOT NULL
      AND batch_phase IS NOT NULL
    ORDER BY created_at ASC
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
