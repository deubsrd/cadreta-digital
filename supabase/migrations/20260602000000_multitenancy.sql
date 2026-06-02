-- ================================================================
-- MULTI-TENANCY: isolamento por user_id
-- Cada usuário autenticado vê e gerencia apenas os próprios dados
-- ================================================================

-- 1. Adiciona user_id em todas as tabelas principais
ALTER TABLE public.militares       ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.compras         ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.pagamentos      ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.itens           ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.item_price_history ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.pix_cobrancas   ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.cobranca_agendamentos ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.cobranca_logs   ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- configuracoes: troca id fixo = 1 por user_id como PK
ALTER TABLE public.configuracoes   ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Associa dados existentes ao primeiro usuário do banco
--    (preserva os dados do deubsrd@gmail.com)
DO $$
DECLARE first_user UUID;
BEGIN
  SELECT id INTO first_user FROM auth.users ORDER BY created_at ASC LIMIT 1;
  IF first_user IS NOT NULL THEN
    UPDATE public.militares            SET user_id = first_user WHERE user_id IS NULL;
    UPDATE public.compras              SET user_id = first_user WHERE user_id IS NULL;
    UPDATE public.pagamentos           SET user_id = first_user WHERE user_id IS NULL;
    UPDATE public.itens                SET user_id = first_user WHERE user_id IS NULL;
    UPDATE public.item_price_history   SET user_id = first_user WHERE user_id IS NULL;
    UPDATE public.pix_cobrancas        SET user_id = first_user WHERE user_id IS NULL;
    UPDATE public.cobranca_agendamentos SET user_id = first_user WHERE user_id IS NULL;
    UPDATE public.cobranca_logs        SET user_id = first_user WHERE user_id IS NULL;
    UPDATE public.configuracoes        SET user_id = first_user WHERE user_id IS NULL;
  END IF;
END $$;

-- 3. Torna user_id NOT NULL após preencher dados existentes
ALTER TABLE public.militares            ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.compras              ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.pagamentos           ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.itens                ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.item_price_history   ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.pix_cobrancas        ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.cobranca_agendamentos ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.cobranca_logs        ALTER COLUMN user_id SET NOT NULL;
-- configuracoes fica nullable para permitir lookup por user_id sem constraint na linha legada

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_militares_user           ON public.militares(user_id);
CREATE INDEX IF NOT EXISTS idx_compras_user             ON public.compras(user_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_user          ON public.pagamentos(user_id);
CREATE INDEX IF NOT EXISTS idx_itens_user               ON public.itens(user_id);
CREATE INDEX IF NOT EXISTS idx_pix_user                 ON public.pix_cobrancas(user_id);
CREATE INDEX IF NOT EXISTS idx_cob_ag_user              ON public.cobranca_agendamentos(user_id);
CREATE INDEX IF NOT EXISTS idx_cob_logs_user            ON public.cobranca_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_configuracoes_user       ON public.configuracoes(user_id);

-- 4. Remove políticas antigas (baseadas em has_role) e cria novas por user_id
-- militares
DROP POLICY IF EXISTS "auth all" ON public.militares;
DROP POLICY IF EXISTS "admin all militares" ON public.militares;
CREATE POLICY "tenant militares" ON public.militares FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- compras
DROP POLICY IF EXISTS "auth all" ON public.compras;
DROP POLICY IF EXISTS "admin all compras" ON public.compras;
CREATE POLICY "tenant compras" ON public.compras FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- pagamentos
DROP POLICY IF EXISTS "auth all" ON public.pagamentos;
DROP POLICY IF EXISTS "admin all pagamentos" ON public.pagamentos;
CREATE POLICY "tenant pagamentos" ON public.pagamentos FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- configuracoes
DROP POLICY IF EXISTS "auth all" ON public.configuracoes;
DROP POLICY IF EXISTS "admin all config" ON public.configuracoes;
CREATE POLICY "tenant configuracoes" ON public.configuracoes FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- itens
DROP POLICY IF EXISTS "admin all itens" ON public.itens;
CREATE POLICY "tenant itens" ON public.itens FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- item_price_history
DROP POLICY IF EXISTS "admin all item_price_history" ON public.item_price_history;
CREATE POLICY "tenant item_price_history" ON public.item_price_history FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- pix_cobrancas
DROP POLICY IF EXISTS "admin all pix_cobrancas" ON public.pix_cobrancas;
CREATE POLICY "tenant pix_cobrancas" ON public.pix_cobrancas FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- cobranca_agendamentos
DROP POLICY IF EXISTS "auth all" ON public.cobranca_agendamentos;
DROP POLICY IF EXISTS "service all" ON public.cobranca_agendamentos;
CREATE POLICY "tenant cobranca_agendamentos" ON public.cobranca_agendamentos FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "service cobranca_agendamentos" ON public.cobranca_agendamentos FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- cobranca_logs
DROP POLICY IF EXISTS "auth all" ON public.cobranca_logs;
DROP POLICY IF EXISTS "service all" ON public.cobranca_logs;
CREATE POLICY "tenant cobranca_logs" ON public.cobranca_logs FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "service cobranca_logs" ON public.cobranca_logs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 5. Trigger: ao criar conta, provisiona configuracoes e 5 agendamentos para o novo usuário
CREATE OR REPLACE FUNCTION public.handle_new_user_setup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Cria configurações padrão
  INSERT INTO public.configuracoes (user_id, pix_key, pix_nome, mensagem_template,
    frequencia_cobranca_dias, horario_cobranca, z_api_instance, z_api_token, z_api_client_token)
  VALUES (
    NEW.id, '', '', 
    'Olá, {nome}. Sua fatura referente ao mês de {mes} já está disponível.' || chr(10) ||
    'Valor total: R$ {valor}.' || chr(10) ||
    'Resumo das compras:' || chr(10) || '{resumo}' || chr(10) ||
    'Por favor realize o pagamento via PIX:' || chr(10) || '{pix}' || chr(10) ||
    'Após o pagamento, envie o comprovante. Obrigado!',
    3, '09:00', '', '', ''
  );
  -- Cria 5 agendamentos de cobrança
  INSERT INTO public.cobranca_agendamentos (user_id, ativo, scheduled_at, intervalo_min, intervalo_max)
  VALUES
    (NEW.id, false, null, 30, 120),
    (NEW.id, false, null, 30, 120),
    (NEW.id, false, null, 30, 120),
    (NEW.id, false, null, 30, 120),
    (NEW.id, false, null, 30, 120);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_setup();

-- 6. Unique constraint em configuracoes por user_id
--    (substitui a constraint single_row que forçava id = 1)
ALTER TABLE public.configuracoes DROP CONSTRAINT IF EXISTS single_row;
ALTER TABLE public.configuracoes ADD CONSTRAINT configuracoes_user_id_unique UNIQUE (user_id);
