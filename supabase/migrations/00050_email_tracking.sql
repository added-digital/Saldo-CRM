-- Email open + click tracking. Adds a public-facing tracking_id token to
-- sent_emails (separate from the row's primary key for a small layer of
-- obscurity) and a per-event log table for opens, clicks, and any future
-- recipient-side events (bounce, unsubscribe, etc.).

ALTER TABLE sent_emails
  ADD COLUMN IF NOT EXISTS tracking_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS idx_sent_emails_tracking_id
  ON sent_emails(tracking_id);

CREATE TABLE IF NOT EXISTS email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_email_id UUID NOT NULL REFERENCES sent_emails(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('open', 'click')),
  target_url TEXT,
  user_agent TEXT,
  ip_address INET,
  referrer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_events_sent_email_id
  ON email_events(sent_email_id);
CREATE INDEX IF NOT EXISTS idx_email_events_type_created
  ON email_events(event_type, created_at DESC);

ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;

-- The user who sent the email can read its events. INSERTs come from the
-- admin client in /api/track/* routes (recipients aren't authenticated when
-- they open/click), so no INSERT policy is needed for the authenticated
-- role — the admin client bypasses RLS entirely.
DROP POLICY IF EXISTS email_events_owner_read ON email_events;
CREATE POLICY email_events_owner_read
  ON email_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sent_emails se
      WHERE se.id = email_events.sent_email_id
        AND se.user_id = auth.uid()
    )
  );
