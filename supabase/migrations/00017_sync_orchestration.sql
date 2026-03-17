ALTER TABLE sync_jobs
  ADD COLUMN IF NOT EXISTS step_name TEXT,
  ADD COLUMN IF NOT EXISTS batch_phase TEXT DEFAULT 'list',
  ADD COLUMN IF NOT EXISTS batch_offset INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dispatch_lock BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_dispatched_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sync_jobs_dispatch
  ON sync_jobs(status, dispatch_lock)
  WHERE status IN ('pending', 'processing');

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

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
    SELECT id, step_name, batch_phase, batch_offset
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
        'offset', job.batch_offset
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      )
    );
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'process-sync-queue',
  '* * * * *',
  $$SELECT process_sync_queue()$$
);

SELECT cron.schedule(
  'cleanup-cron-logs',
  '0 3 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - INTERVAL '3 days'$$
);
