-- =====================================================
-- Migration 00004: Row Level Security Policies
-- =====================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE fortnox_connection ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION has_scope(scope_key TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_scopes us
    JOIN scopes s ON s.id = us.scope_id
    WHERE us.user_id = auth.uid() AND s.key = scope_key
  ) OR get_user_role() = 'admin';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS profiles_update_own ON profiles;
CREATE POLICY profiles_update_own ON profiles FOR UPDATE USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS profiles_update_admin ON profiles;
CREATE POLICY profiles_update_admin ON profiles FOR UPDATE USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS teams_select ON teams;
CREATE POLICY teams_select ON teams FOR SELECT USING (true);

DROP POLICY IF EXISTS teams_insert ON teams;
CREATE POLICY teams_insert ON teams FOR INSERT WITH CHECK (get_user_role() = 'admin');

DROP POLICY IF EXISTS teams_update ON teams;
CREATE POLICY teams_update ON teams FOR UPDATE USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS teams_delete ON teams;
CREATE POLICY teams_delete ON teams FOR DELETE USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS scopes_select ON scopes;
CREATE POLICY scopes_select ON scopes FOR SELECT USING (true);

DROP POLICY IF EXISTS scopes_manage ON scopes;
CREATE POLICY scopes_manage ON scopes FOR ALL USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS user_scopes_select ON user_scopes;
CREATE POLICY user_scopes_select ON user_scopes FOR SELECT USING (true);

DROP POLICY IF EXISTS user_scopes_manage ON user_scopes;
CREATE POLICY user_scopes_manage ON user_scopes FOR ALL USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS customers_select ON customers;
CREATE POLICY customers_select ON customers FOR SELECT USING (has_scope('customers'));

DROP POLICY IF EXISTS customers_update ON customers;
CREATE POLICY customers_update ON customers FOR UPDATE USING (has_scope('customers'));

DROP POLICY IF EXISTS fortnox_select ON fortnox_connection;
CREATE POLICY fortnox_select ON fortnox_connection FOR SELECT USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS fortnox_manage ON fortnox_connection;
CREATE POLICY fortnox_manage ON fortnox_connection FOR ALL USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS audit_select ON audit_log;
CREATE POLICY audit_select ON audit_log FOR SELECT USING (get_user_role() = 'admin');
