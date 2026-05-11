
ALTER TABLE public.configuracoes ADD COLUMN IF NOT EXISTS mp_access_token text DEFAULT '';

CREATE TABLE IF NOT EXISTS public.pix_cobrancas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  militar_id uuid NOT NULL,
  periodo date NOT NULL,
  valor numeric NOT NULL,
  txid text NOT NULL UNIQUE,
  mp_payment_id text,
  qr_code_base64 text,
  copia_cola text,
  ticket_url text,
  status text NOT NULL DEFAULT 'pending',
  paid_amount numeric,
  paid_at timestamptz,
  needs_review boolean NOT NULL DEFAULT false,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pix_cobrancas_militar_periodo_idx ON public.pix_cobrancas(militar_id, periodo);
CREATE INDEX IF NOT EXISTS pix_cobrancas_status_idx ON public.pix_cobrancas(status);
CREATE INDEX IF NOT EXISTS pix_cobrancas_paid_at_idx ON public.pix_cobrancas(paid_at DESC);

ALTER TABLE public.pix_cobrancas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin all pix_cobrancas" ON public.pix_cobrancas
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER pix_cobrancas_updated_at BEFORE UPDATE ON public.pix_cobrancas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.pix_cobrancas;
