DROP POLICY IF EXISTS storage_crm_files_select ON storage.objects;
CREATE POLICY storage_crm_files_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'crm-files'
    AND (storage.foldername(name))[1] = 'files'
    AND get_user_role() = 'admin'
  );

DROP POLICY IF EXISTS storage_crm_files_insert ON storage.objects;
CREATE POLICY storage_crm_files_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'crm-files'
    AND (storage.foldername(name))[1] = 'files'
    AND get_user_role() = 'admin'
  );

DROP POLICY IF EXISTS storage_crm_files_update ON storage.objects;
CREATE POLICY storage_crm_files_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'crm-files'
    AND (storage.foldername(name))[1] = 'files'
    AND get_user_role() = 'admin'
  )
  WITH CHECK (
    bucket_id = 'crm-files'
    AND (storage.foldername(name))[1] = 'files'
    AND get_user_role() = 'admin'
  );

DROP POLICY IF EXISTS storage_crm_files_delete ON storage.objects;
CREATE POLICY storage_crm_files_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'crm-files'
    AND (storage.foldername(name))[1] = 'files'
    AND get_user_role() = 'admin'
  );
