-- Sent email log. One row per recipient (a grouped/separate send to N people
-- becomes N rows). Populated by /api/email after Microsoft Graph confirms the
-- send. Read-only from the app; users only ever see their own rows.

CREATE TABLE IF NOT EXISTS sent_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body_preview TEXT,
  body_html TEXT,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  recipient_type TEXT NOT NULL CHECK (
    recipient_type IN ('customers', 'contacts', 'manual')
  ),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES customer_contacts(id) ON DELETE SET NULL,
  template_key TEXT,
  delivery_mode TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  error_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sent_emails_user_id_sent_at
  ON sent_emails(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_sent_emails_customer_id
  ON sent_emails(customer_id);
CREATE INDEX IF NOT EXISTS idx_sent_emails_contact_id
  ON sent_emails(contact_id);

DROP TRIGGER IF EXISTS sent_emails_set_updated_at ON sent_emails;
CREATE TRIGGER sent_emails_set_updated_at
  BEFORE UPDATE ON sent_emails
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE sent_emails ENABLE ROW LEVEL SECURITY;

-- Per-user history for v1: each user only sees rows they themselves sent.
-- Org-wide visibility for admins/team-leads can be added later as a separate
-- policy without breaking existing access.
DROP POLICY IF EXISTS sent_emails_owner_rw ON sent_emails;
CREATE POLICY sent_emails_owner_rw
  ON sent_emails
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
