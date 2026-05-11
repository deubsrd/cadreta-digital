
-- Militares
CREATE TABLE public.militares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  identificacao TEXT NOT NULL,
  telefone TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.compras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  militar_id UUID NOT NULL REFERENCES public.militares(id) ON DELETE CASCADE,
  data_compra DATE NOT NULL DEFAULT CURRENT_DATE,
  itens TEXT NOT NULL,
  valor NUMERIC(10,2) NOT NULL CHECK (valor >= 0),
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_compras_militar ON public.compras(militar_id);
CREATE INDEX idx_compras_data ON public.compras(data_compra);

CREATE TABLE public.pagamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  militar_id UUID NOT NULL REFERENCES public.militares(id) ON DELETE CASCADE,
  periodo DATE NOT NULL, -- primeiro dia do mês de referência
  valor NUMERIC(10,2) NOT NULL CHECK (valor >= 0),
  pago_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(militar_id, periodo)
);
CREATE INDEX idx_pagamentos_militar ON public.pagamentos(militar_id);

CREATE TABLE public.configuracoes (
  id INT PRIMARY KEY DEFAULT 1,
  pix_key TEXT DEFAULT '',
  pix_nome TEXT DEFAULT '',
  mensagem_template TEXT DEFAULT 'Olá, {nome}. Sua fatura referente ao mês de {mes} já está disponível.\nValor total: R$ {valor}.\nResumo das compras:\n{resumo}\nPor favor realize o pagamento via PIX:\n{pix}\nApós o pagamento, envie o comprovante. Obrigado!',
  frequencia_cobranca_dias INT NOT NULL DEFAULT 3,
  horario_cobranca TIME NOT NULL DEFAULT '09:00',
  z_api_instance TEXT DEFAULT '',
  z_api_token TEXT DEFAULT '',
  z_api_client_token TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO public.configuracoes (id) VALUES (1);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_militares_updated BEFORE UPDATE ON public.militares
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_compras_updated BEFORE UPDATE ON public.compras
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_config_updated BEFORE UPDATE ON public.configuracoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS - admin app, qualquer usuário autenticado é admin
ALTER TABLE public.militares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth all" ON public.militares FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth all" ON public.compras FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth all" ON public.pagamentos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth all" ON public.configuracoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
