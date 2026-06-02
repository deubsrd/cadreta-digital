-- Remove a constraint antiga que forçava id = 1
ALTER TABLE public.configuracoes DROP CONSTRAINT IF EXISTS single_row;

-- Garante unique constraint em configuracoes por user_id (só adiciona se não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'configuracoes_user_id_unique' 
    AND conrelid = 'public.configuracoes'::regclass
  ) THEN
    ALTER TABLE public.configuracoes 
      ADD CONSTRAINT configuracoes_user_id_unique UNIQUE (user_id);
  END IF;
END $$;