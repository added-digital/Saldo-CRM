INSERT INTO storage.buckets (id, name, public)
VALUES ('crm-files', 'crm-files', false)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'storage_crm_files_select'
  ) THEN
    CREATE POLICY storage_crm_files_select
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'crm-files'
        AND (storage.foldername(name))[1] = 'Tjänster'
        AND get_user_role() = 'admin'
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'storage_crm_files_insert'
  ) THEN
    CREATE POLICY storage_crm_files_insert
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'crm-files'
        AND (storage.foldername(name))[1] = 'Tjänster'
        AND get_user_role() = 'admin'
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'storage_crm_files_update'
  ) THEN
    CREATE POLICY storage_crm_files_update
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'crm-files'
        AND (storage.foldername(name))[1] = 'Tjänster'
        AND get_user_role() = 'admin'
      )
      WITH CHECK (
        bucket_id = 'crm-files'
        AND (storage.foldername(name))[1] = 'Tjänster'
        AND get_user_role() = 'admin'
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'storage_crm_files_delete'
  ) THEN
    CREATE POLICY storage_crm_files_delete
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'crm-files'
        AND (storage.foldername(name))[1] = 'Tjänster'
        AND get_user_role() = 'admin'
      );
  END IF;
END
$$;
