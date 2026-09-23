-- Keep the RLS helper callable by policies while removing SECURITY DEFINER
-- from the exposed public RPC. The privileged implementation lives in a
-- non-API schema, uses a fixed empty search_path, and schema-qualifies access.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated;

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users AS admins
    WHERE admins.user_id = (SELECT auth.uid())
  );
$function$;
REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_admin() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.is_admin();
$function$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

ALTER FUNCTION public.set_updated_at() SET search_path = pg_catalog;

ALTER POLICY "admin users can read own record" ON public.admin_users
  USING (user_id = (SELECT auth.uid()));

ALTER POLICY admin_manage_visitors ON public.visitor_logs
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));
