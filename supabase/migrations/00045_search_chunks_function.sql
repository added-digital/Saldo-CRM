CREATE OR REPLACE FUNCTION public.search_chunks(
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  chunk_id UUID,
  document_id UUID,
  chunk_text TEXT,
  file_name TEXT,
  document_type TEXT,
  similarity DOUBLE PRECISION,
  storage_path TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    dc.id AS chunk_id,
    d.id AS document_id,
    dc.chunk_text,
    d.file_name,
    d.document_type,
    1 - (dc.embedding <=> query_embedding) AS similarity,
    d.storage_path
  FROM document_chunks dc
  INNER JOIN documents d ON d.id = dc.document_id
  ORDER BY dc.embedding <=> query_embedding
  LIMIT GREATEST(match_count, 1);
$$;

REVOKE ALL ON FUNCTION public.search_chunks(vector, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_chunks(vector, int) TO service_role;
