
-- 1. Fix permissive RLS on cobranca tables (restrict to admin)
DROP POLICY IF EXISTS "auth all" ON public.cobranca_agendamentos;
DROP POLICY IF EXISTS "auth all" ON public.cobranca_logs;

CREATE POLICY "admin all cobranca_agendamentos" ON public.cobranca_agendamentos
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin all cobranca_logs" ON public.cobranca_logs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 2. Explicit write-deny on user_roles for authenticated/anon (only service_role can mutate)
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated, anon, PUBLIC;
GRANT ALL ON public.user_roles TO service_role;

CREATE POLICY "no self insert user_roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "no self update user_roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "no self delete user_roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (false);

-- 3. Lock down SECURITY DEFINER function execution to definer-time only (RLS policies still work)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
