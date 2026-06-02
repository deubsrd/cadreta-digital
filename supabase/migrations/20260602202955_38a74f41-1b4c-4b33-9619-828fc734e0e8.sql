ALTER TABLE public.militares DROP CONSTRAINT IF EXISTS militares_telefone_unique;
ALTER TABLE public.militares ADD CONSTRAINT militares_user_telefone_unique UNIQUE (user_id, telefone);