ALTER TABLE public.militares RENAME COLUMN identificacao TO posto;
ALTER TABLE public.militares RENAME COLUMN nome TO nome_guerra;
ALTER TABLE public.militares ADD CONSTRAINT militares_telefone_unique UNIQUE (telefone);