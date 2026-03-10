INSERT INTO scopes (key, label, description) VALUES
  ('customers', 'Customer Management', 'View and manage customer records synced from Fortnox'),
  ('teams', 'Team Management', 'View team structure and members'),
  ('reports', 'Reports', 'Access reporting and analytics dashboards'),
  ('integrations', 'Integrations', 'View integration status and sync logs')
ON CONFLICT (key) DO NOTHING;
