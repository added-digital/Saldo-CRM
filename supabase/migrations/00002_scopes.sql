-- =====================================================
-- Migration 00002: Scopes & User Scopes
-- =====================================================

CREATE TABLE IF NOT EXISTS scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_scopes (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  scope_id UUID REFERENCES scopes(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_user_scopes_user_id ON user_scopes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_scopes_scope_id ON user_scopes(scope_id);
