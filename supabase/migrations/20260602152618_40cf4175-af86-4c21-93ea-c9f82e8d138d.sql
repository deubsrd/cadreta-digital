ALTER TABLE public.configuracoes DROP CONSTRAINT IF EXISTS configuracoes_user_id_unique;
ALTER TABLE public.configuracoes ADD CONSTRAINT configuracoes_user_id_unique UNIQUE (user_id);

ALTER TABLE public.configuracoes DROP CONSTRAINT IF EXISTS single_row;

ALTER TABLE public.configuracoes ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.configuracoes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY;

SELECT setval(
  pg_get_serial_sequence('public.configuracoes', 'id'),
  COALESCE((SELECT MAX(id) FROM public.configuracoes), 0) + 1,
  false
);