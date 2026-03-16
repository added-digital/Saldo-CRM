ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_group_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_accruals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoices_select ON invoices;
CREATE POLICY invoices_select ON invoices FOR SELECT USING (has_scope('customers'));

DROP POLICY IF EXISTS invoices_manage ON invoices;
CREATE POLICY invoices_manage ON invoices FOR ALL USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS invoice_rows_select ON invoice_rows;
CREATE POLICY invoice_rows_select ON invoice_rows FOR SELECT USING (has_scope('customers'));

DROP POLICY IF EXISTS invoice_rows_manage ON invoice_rows;
CREATE POLICY invoice_rows_manage ON invoice_rows FOR ALL USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS article_registry_select ON article_registry;
CREATE POLICY article_registry_select ON article_registry FOR SELECT USING (has_scope('customers'));

DROP POLICY IF EXISTS article_registry_manage ON article_registry;
CREATE POLICY article_registry_manage ON article_registry FOR ALL USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS article_group_mappings_select ON article_group_mappings;
CREATE POLICY article_group_mappings_select ON article_group_mappings FOR SELECT USING (has_scope('customers'));

DROP POLICY IF EXISTS article_group_mappings_manage ON article_group_mappings;
CREATE POLICY article_group_mappings_manage ON article_group_mappings FOR ALL USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS cost_centers_select ON cost_centers;
CREATE POLICY cost_centers_select ON cost_centers FOR SELECT USING (has_scope('customers'));

DROP POLICY IF EXISTS cost_centers_manage ON cost_centers;
CREATE POLICY cost_centers_manage ON cost_centers FOR ALL USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS time_reports_select ON time_reports;
CREATE POLICY time_reports_select ON time_reports FOR SELECT USING (has_scope('customers'));

DROP POLICY IF EXISTS time_reports_manage ON time_reports;
CREATE POLICY time_reports_manage ON time_reports FOR ALL USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS contract_accruals_select ON contract_accruals;
CREATE POLICY contract_accruals_select ON contract_accruals FOR SELECT USING (has_scope('customers'));

DROP POLICY IF EXISTS contract_accruals_manage ON contract_accruals;
CREATE POLICY contract_accruals_manage ON contract_accruals FOR ALL USING (get_user_role() = 'admin');

ALTER TABLE customer_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_contact_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_document_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_contacts_select ON customer_contacts;
CREATE POLICY customer_contacts_select ON customer_contacts FOR SELECT USING (has_scope('customers'));

DROP POLICY IF EXISTS customer_contacts_insert ON customer_contacts;
CREATE POLICY customer_contacts_insert ON customer_contacts FOR INSERT WITH CHECK (has_scope('customers'));

DROP POLICY IF EXISTS customer_contacts_update ON customer_contacts;
CREATE POLICY customer_contacts_update ON customer_contacts FOR UPDATE USING (has_scope('customers'));

DROP POLICY IF EXISTS customer_contacts_delete ON customer_contacts;
CREATE POLICY customer_contacts_delete ON customer_contacts FOR DELETE USING (has_scope('customers'));

DROP POLICY IF EXISTS customer_contact_links_select ON customer_contact_links;
CREATE POLICY customer_contact_links_select ON customer_contact_links FOR SELECT USING (has_scope('customers'));

DROP POLICY IF EXISTS customer_contact_links_insert ON customer_contact_links;
CREATE POLICY customer_contact_links_insert ON customer_contact_links FOR INSERT WITH CHECK (has_scope('customers'));

DROP POLICY IF EXISTS customer_contact_links_delete ON customer_contact_links;
CREATE POLICY customer_contact_links_delete ON customer_contact_links FOR DELETE USING (has_scope('customers'));

DROP POLICY IF EXISTS customer_activities_select ON customer_activities;
CREATE POLICY customer_activities_select ON customer_activities FOR SELECT USING (has_scope('customers'));

DROP POLICY IF EXISTS customer_activities_insert ON customer_activities;
CREATE POLICY customer_activities_insert ON customer_activities FOR INSERT WITH CHECK (has_scope('customers'));

DROP POLICY IF EXISTS customer_activities_update ON customer_activities;
CREATE POLICY customer_activities_update ON customer_activities FOR UPDATE USING (has_scope('customers'));

DROP POLICY IF EXISTS customer_activities_delete ON customer_activities;
CREATE POLICY customer_activities_delete ON customer_activities FOR DELETE USING (has_scope('customers'));

DROP POLICY IF EXISTS customer_services_select ON customer_services;
CREATE POLICY customer_services_select ON customer_services FOR SELECT USING (has_scope('customers'));

DROP POLICY IF EXISTS customer_services_insert ON customer_services;
CREATE POLICY customer_services_insert ON customer_services FOR INSERT WITH CHECK (has_scope('customers'));

DROP POLICY IF EXISTS customer_services_update ON customer_services;
CREATE POLICY customer_services_update ON customer_services FOR UPDATE USING (has_scope('customers'));

DROP POLICY IF EXISTS customer_services_delete ON customer_services;
CREATE POLICY customer_services_delete ON customer_services FOR DELETE USING (has_scope('customers'));

DROP POLICY IF EXISTS customer_document_links_select ON customer_document_links;
CREATE POLICY customer_document_links_select ON customer_document_links FOR SELECT USING (has_scope('customers'));

DROP POLICY IF EXISTS customer_document_links_insert ON customer_document_links;
CREATE POLICY customer_document_links_insert ON customer_document_links FOR INSERT WITH CHECK (has_scope('customers'));

DROP POLICY IF EXISTS customer_document_links_delete ON customer_document_links;
CREATE POLICY customer_document_links_delete ON customer_document_links FOR DELETE USING (has_scope('customers'));

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_price_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_customer_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_settings_select ON app_settings;
CREATE POLICY app_settings_select ON app_settings FOR SELECT USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS app_settings_manage ON app_settings;
CREATE POLICY app_settings_manage ON app_settings FOR ALL USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS license_price_list_select ON license_price_list;
CREATE POLICY license_price_list_select ON license_price_list FOR SELECT USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS license_price_list_manage ON license_price_list;
CREATE POLICY license_price_list_manage ON license_price_list FOR ALL USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS license_customer_config_select ON license_customer_config;
CREATE POLICY license_customer_config_select ON license_customer_config FOR SELECT USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS license_customer_config_manage ON license_customer_config;
CREATE POLICY license_customer_config_manage ON license_customer_config FOR ALL USING (get_user_role() = 'admin');
