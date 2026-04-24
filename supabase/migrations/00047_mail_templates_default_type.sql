ALTER TABLE mail_templates
  DROP CONSTRAINT IF EXISTS mail_templates_template_type_check;

ALTER TABLE mail_templates
  ADD CONSTRAINT mail_templates_template_type_check
  CHECK (template_type IN ('plain', 'plain_os', 'default'));
