-- =============================================
-- Cobrança recorrente agendada (até 5 disparos)
-- =============================================

-- Telefone do admin nas configurações
ALTER TABLE public.configuracoes
  ADD COLUMN IF NOT EXISTS admin_phone TEXT DEFAULT '';

-- Tabela de agendamentos
CREATE TABLE IF NOT EXISTS public.cobranca_agendamentos (
  id              SERIAL PRIMARY KEY,
  ativo           BOOLEAN NOT NULL DEFAULT true,
  scheduled_at    TIMESTAMPTZ,                        -- data/hora exata do disparo (null = desativado)
  intervalo_min   INT NOT NULL DEFAULT 30,            -- segundos mínimos entre mensagens
  intervalo_max   INT NOT NULL DEFAULT 120,           -- segundos máximos entre mensagens
  executado_at    TIMESTAMPTZ,                        -- preenchido após execução
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed: 5 linhas vazias
INSERT INTO public.cobranca_agendamentos (id, ativo, scheduled_at)
VALUES (1, false, null), (2, false, null), (3, false, null), (4, false, null), (5, false, null)
ON CONFLICT (id) DO NOTHING;

-- Tabela de logs de cada disparo
CREATE TABLE IF NOT EXISTS public.cobranca_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id  INT NOT NULL REFERENCES public.cobranca_agendamentos(id),
  militar_id      UUID NOT NULL REFERENCES public.militares(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'enviado',    -- enviado | pulado_pago | erro
  erro_msg        TEXT,
  enviado_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cob_logs_agendamento ON public.cobranca_logs(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_cob_logs_militar ON public.cobranca_logs(militar_id);

-- updated_at trigger para agendamentos
CREATE TRIGGER trg_cob_ag_updated BEFORE UPDATE ON public.cobranca_agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.cobranca_agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cobranca_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all" ON public.cobranca_agendamentos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth all" ON public.cobranca_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- service_role precisa de acesso (Edge Functions usam service_role)
CREATE POLICY "service all" ON public.cobranca_agendamentos FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service all" ON public.cobranca_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- pg_cron: chama a Edge Function a cada minuto
-- (requer extensão pg_cron ativa no projeto Supabase — ativar em Database > Extensions)
-- Substitua <PROJECT_REF> e <ANON_KEY> pelas suas credenciais após aplicar a migration.
-- Descomente as linhas abaixo após confirmar que pg_cron está ativo:
/*
SELECT cron.schedule(
  'cadreta-cobranca-scheduler',
  '* * * * *',
  $$
    SELECT net.http_post(
      url    := 'https://<PROJECT_REF>.supabase.co/functions/v1/cobranca-scheduler',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
      body   := '{}'::jsonb
    );
  $$
);
*/
