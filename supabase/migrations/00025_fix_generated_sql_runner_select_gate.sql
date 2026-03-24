CREATE OR REPLACE FUNCTION public.run_generated_sql(query_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_query text;
  lowered_query text;
  result jsonb;
BEGIN
  normalized_query := regexp_replace(trim(query_text), ';+$', '');

  IF normalized_query = '' THEN
    RAISE EXCEPTION 'Query cannot be empty';
  END IF;

  lowered_query := lower(ltrim(normalized_query));

  IF NOT (lowered_query LIKE 'select%' OR lowered_query LIKE 'with%') THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;

  IF lowered_query ~ '(^|[^a-z])(insert|update|delete|drop|alter|truncate|grant|revoke|create)([^a-z]|$)' THEN
    RAISE EXCEPTION 'Forbidden SQL keyword in query';
  END IF;

  PERFORM set_config('statement_timeout', '5000', true);

  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (%s) t',
    normalized_query
  ) INTO result;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.run_generated_sql(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_generated_sql(text) TO service_role;
