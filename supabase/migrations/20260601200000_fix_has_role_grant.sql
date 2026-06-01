-- Restaura execução de has_role para authenticated
-- O REVOKE anterior da migration 87aa376c quebrou todas as políticas RLS
-- que dependem de has_role (militares, compras, pagamentos, configuracoes etc.)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
