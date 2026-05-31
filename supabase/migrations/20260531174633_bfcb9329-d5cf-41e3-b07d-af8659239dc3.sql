CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

ALTER TABLE public.configuracoes
  ADD COLUMN IF NOT EXISTS admin_phone TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS public.cobranca_agendamentos (
  id              SERIAL PRIMARY KEY,
  ativo           BOOLEAN NOT NULL DEFAULT true,
  scheduled_at    TIMESTAMPTZ,
  intervalo_min   INT NOT NULL DEFAULT 30,
  intervalo_max   INT NOT NULL DEFAULT 120,
  executado_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cobranca_agendamentos TO authenticated;
GRANT ALL ON public.cobranca_agendamentos TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.cobranca_agendamentos_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.cobranca_agendamentos_id_seq TO service_role;

INSERT INTO public.cobranca_agendamentos (id, ativo, scheduled_at)
VALUES (1, false, null), (2, false, null), (3, false, null), (4, false, null), (5, false, null)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.cobranca_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id  INT NOT NULL REFERENCES public.cobranca_agendamentos(id),
  militar_id      UUID NOT NULL REFERENCES public.militares(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'enviado',
  erro_msg        TEXT,
  enviado_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cobranca_logs TO authenticated;
GRANT ALL ON public.cobranca_logs TO service_role;

CREATE INDEX IF NOT EXISTS idx_cob_logs_agendamento ON public.cobranca_logs(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_cob_logs_militar ON public.cobranca_logs(militar_id);

DROP TRIGGER IF EXISTS trg_cob_ag_updated ON public.cobranca_agendamentos;
CREATE TRIGGER trg_cob_ag_updated BEFORE UPDATE ON public.cobranca_agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.cobranca_agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cobranca_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth all" ON public.cobranca_agendamentos;
DROP POLICY IF EXISTS "auth all" ON public.cobranca_logs;
DROP POLICY IF EXISTS "service all" ON public.cobranca_agendamentos;
DROP POLICY IF EXISTS "service all" ON public.cobranca_logs;

CREATE POLICY "auth all" ON public.cobranca_agendamentos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth all" ON public.cobranca_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service all" ON public.cobranca_agendamentos FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service all" ON public.cobranca_logs FOR ALL TO service_role USING (true) WITH CHECK (true);