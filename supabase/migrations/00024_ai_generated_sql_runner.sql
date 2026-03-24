CREATE OR REPLACE FUNCTION public.run_generated_sql(query_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_query text;
  result jsonb;
BEGIN
  normalized_query := regexp_replace(trim(query_text), ';+\s*$', '');

  IF normalized_query = '' THEN
    RAISE EXCEPTION 'Query cannot be empty';
  END IF;

  IF normalized_query !~* '^\s*(select|with)\b' THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;

  IF normalized_query ~* '\b(insert|update|delete|drop|alter|truncate|grant|revoke|create)\b' THEN
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
