-- Mail send batches. One row represents a single email "send action" — the
-- email body, subject, template etc. stored once. Per-recipient outcomes live
-- in sent_emails (with batch_id FK). This avoids storing the full body N
-- times when one email is sent to N recipients.

CREATE TABLE IF NOT EXISTS mail_send_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body_preview TEXT,
  body_html TEXT,
  template_key TEXT,
  delivery_mode TEXT,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mail_send_batches_user_id_sent_at
  ON mail_send_batches(user_id, sent_at DESC);

DROP TRIGGER IF EXISTS mail_send_batches_set_updated_at ON mail_send_batches;
CREATE TRIGGER mail_send_batches_set_updated_at
  BEFORE UPDATE ON mail_send_batches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE mail_send_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mail_send_batches_owner_rw ON mail_send_batches;
CREATE POLICY mail_send_batches_owner_rw
  ON mail_send_batches
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Link sent_emails to the batch. Nullable for legacy rows that pre-date this
-- migration; new rows written by /api/email will always have it set.
ALTER TABLE sent_emails
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES mail_send_batches(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_sent_emails_batch_id ON sent_emails(batch_id);
