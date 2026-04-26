-- Allows trusted Edge Functions to return an AI assist when the provider
-- request fails before the user receives usable generation output.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO service_role;

CREATE OR REPLACE FUNCTION private.refund_ai_generation_for_user(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  updated_used integer;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.users
  SET
    ai_generations_used = greatest(coalesce(ai_generations_used, 0) - 1, 0),
    updated_at = now()
  WHERE id = p_user_id
    AND coalesce(ai_generations_used, 0) > 0
  RETURNING ai_generations_used
  INTO updated_used;

  RETURN updated_used IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.refund_ai_generation_for_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.refund_ai_generation_for_user(uuid) FROM anon;
REVOKE ALL ON FUNCTION private.refund_ai_generation_for_user(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION private.refund_ai_generation_for_user(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.refund_ai_generation_for_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, private
AS $$
  SELECT private.refund_ai_generation_for_user(p_user_id);
$$;

REVOKE ALL ON FUNCTION public.refund_ai_generation_for_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_ai_generation_for_user(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.refund_ai_generation_for_user(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refund_ai_generation_for_user(uuid) TO service_role;
