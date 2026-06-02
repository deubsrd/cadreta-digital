
-- Add user_id columns
ALTER TABLE public.militares       ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.compras         ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.pagamentos      ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.itens           ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.item_price_history ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.pix_cobrancas   ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.cobranca_agendamentos ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.cobranca_logs   ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.configuracoes   ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Backfill existing rows to first user
DO $$
DECLARE first_user UUID;
BEGIN
  SELECT id INTO first_user FROM auth.users ORDER BY created_at ASC LIMIT 1;
  IF first_user IS NOT NULL THEN
    UPDATE public.militares             SET user_id = first_user WHERE user_id IS NULL;
    UPDATE public.compras               SET user_id = first_user WHERE user_id IS NULL;
    UPDATE public.pagamentos            SET user_id = first_user WHERE user_id IS NULL;
    UPDATE public.itens                 SET user_id = first_user WHERE user_id IS NULL;
    UPDATE public.item_price_history    SET user_id = first_user WHERE user_id IS NULL;
    UPDATE public.pix_cobrancas         SET user_id = first_user WHERE user_id IS NULL;
    UPDATE public.cobranca_agendamentos SET user_id = first_user WHERE user_id IS NULL;
    UPDATE public.cobranca_logs         SET user_id = first_user WHERE user_id IS NULL;
    UPDATE public.configuracoes         SET user_id = first_user WHERE user_id IS NULL;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_militares_user    ON public.militares(user_id);
CREATE INDEX IF NOT EXISTS idx_compras_user      ON public.compras(user_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_user   ON public.pagamentos(user_id);
CREATE INDEX IF NOT EXISTS idx_itens_user        ON public.itens(user_id);
CREATE INDEX IF NOT EXISTS idx_pix_user          ON public.pix_cobrancas(user_id);
CREATE INDEX IF NOT EXISTS idx_cob_ag_user       ON public.cobranca_agendamentos(user_id);
CREATE INDEX IF NOT EXISTS idx_cob_logs_user     ON public.cobranca_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_configuracoes_user ON public.configuracoes(user_id);

-- Drop old policies
DROP POLICY IF EXISTS "auth all" ON public.militares;
DROP POLICY IF EXISTS "admin all militares" ON public.militares;
DROP POLICY IF EXISTS "auth all" ON public.compras;
DROP POLICY IF EXISTS "admin all compras" ON public.compras;
DROP POLICY IF EXISTS "auth all" ON public.pagamentos;
DROP POLICY IF EXISTS "admin all pagamentos" ON public.pagamentos;
DROP POLICY IF EXISTS "auth all" ON public.configuracoes;
DROP POLICY IF EXISTS "admin all config" ON public.configuracoes;
DROP POLICY IF EXISTS "admin all itens" ON public.itens;
DROP POLICY IF EXISTS "admin all item_price_history" ON public.item_price_history;
DROP POLICY IF EXISTS "admin all pix_cobrancas" ON public.pix_cobrancas;
DROP POLICY IF EXISTS "auth all" ON public.cobranca_agendamentos;
DROP POLICY IF EXISTS "admin all cobranca_agendamentos" ON public.cobranca_agendamentos;
DROP POLICY IF EXISTS "service all" ON public.cobranca_agendamentos;
DROP POLICY IF EXISTS "auth all" ON public.cobranca_logs;
DROP POLICY IF EXISTS "admin all cobranca_logs" ON public.cobranca_logs;
DROP POLICY IF EXISTS "service all" ON public.cobranca_logs;

-- New tenant policies
CREATE POLICY "tenant militares"            ON public.militares            FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "tenant compras"              ON public.compras              FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "tenant pagamentos"           ON public.pagamentos           FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "tenant configuracoes"        ON public.configuracoes        FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "tenant itens"                ON public.itens                FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "tenant item_price_history"   ON public.item_price_history   FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "tenant pix_cobrancas"        ON public.pix_cobrancas        FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "tenant cobranca_agendamentos" ON public.cobranca_agendamentos FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "tenant cobranca_logs"        ON public.cobranca_logs        FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "service cobranca_agendamentos" ON public.cobranca_agendamentos FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service cobranca_logs"       ON public.cobranca_logs        FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Unique constraint on configuracoes.user_id (replace single_row)
ALTER TABLE public.configuracoes DROP CONSTRAINT IF EXISTS single_row;
ALTER TABLE public.configuracoes DROP CONSTRAINT IF EXISTS configuracoes_user_id_unique;
ALTER TABLE public.configuracoes ADD CONSTRAINT configuracoes_user_id_unique UNIQUE (user_id);

-- Provisioning trigger for new users
CREATE OR REPLACE FUNCTION public.handle_new_user_setup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.configuracoes (user_id, pix_key, pix_nome, mensagem_template, frequencia_cobranca_dias, horario_cobranca, z_api_instance, z_api_token, z_api_client_token)
  VALUES (NEW.id, '', '', 'Olá, {nome}. Sua fatura referente ao mês de {mes} já está disponível.' || chr(10) || 'Valor total: R$ {valor}.' || chr(10) || 'Resumo das compras:' || chr(10) || '{resumo}' || chr(10) || 'Por favor realize o pagamento via PIX:' || chr(10) || '{pix}' || chr(10) || 'Após o pagamento, envie o comprovante. Obrigado!', 3, '09:00', '', '', '')
  ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.cobranca_agendamentos (user_id, ativo, scheduled_at, intervalo_min, intervalo_max)
  VALUES (NEW.id, false, null, 30, 120), (NEW.id, false, null, 30, 120), (NEW.id, false, null, 30, 120), (NEW.id, false, null, 30, 120), (NEW.id, false, null, 30, 120);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_setup();
