-- Revoga execução direta via API das funções SECURITY DEFINER.
-- Funções de gatilho não exigem privilégio EXECUTE do usuário para disparar,
-- e has_role não é chamada por nenhuma policy atual (as policies usam user_id = auth.uid())
-- nem pelo código do aplicativo.

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_setup() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_item_price_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;