-- Fila de cobranças pendentes de envio
-- Cada linha = um WhatsApp a ser enviado
-- O scheduler processa N itens por vez respeitando os delays
CREATE TABLE IF NOT EXISTS public.cobranca_fila (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agendamento_id  INT NOT NULL REFERENCES public.cobranca_agendamentos(id),
  militar_id      UUID NOT NULL REFERENCES public.militares(id) ON DELETE CASCADE,
  mensagem        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pendente', -- pendente | enviado | erro | pulado
  tentativas      INT NOT NULL DEFAULT 0,
  erro_msg        TEXT,
  proxima_tentativa_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  enviado_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fila_status ON public.cobranca_fila(status, proxima_tentativa_at);
CREATE INDEX IF NOT EXISTS idx_fila_user   ON public.cobranca_fila(user_id);

ALTER TABLE public.cobranca_fila ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant fila"   ON public.cobranca_fila FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "service fila"  ON public.cobranca_fila FOR ALL TO service_role  USING (true) WITH CHECK (true);
