ALTER TABLE time_reports
ADD COLUMN IF NOT EXISTS entry_type TEXT NOT NULL DEFAULT 'time';

ALTER TABLE time_reports
ADD COLUMN IF NOT EXISTS registration_code TEXT;

ALTER TABLE time_reports
ADD COLUMN IF NOT EXISTS registration_type TEXT;

ALTER TABLE time_reports
ADD COLUMN IF NOT EXISTS source_endpoint TEXT;

CREATE INDEX IF NOT EXISTS idx_time_reports_entry_type ON time_reports(entry_type);
