-- Migration: padronização de telefones existentes na tabela militares
-- Formato alvo: +55 DD NNNNNNNNN
-- Esta migration é segura para reexecutar (idempotente por usar UPDATE com WHERE).

-- Função auxiliar temporária para normalizar telefones durante a migration.
-- Será removida ao final para não poluir o schema.
CREATE OR REPLACE FUNCTION _tmp_normalize_phone(raw TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits TEXT;
  ddd    TEXT;
  numero TEXT;
BEGIN
  IF raw IS NULL OR raw = '' THEN RETURN raw; END IF;

  -- Remove tudo que não for dígito
  digits := regexp_replace(raw, '[^0-9]', '', 'g');

  -- Remove DDI 55 se já estiver presente e o número for maior que 11 dígitos
  IF digits LIKE '55%' AND length(digits) > 11 THEN
    digits := substring(digits FROM 3);
  END IF;

  -- Valida: número local deve ter 10 ou 11 dígitos
  IF length(digits) < 10 OR length(digits) > 11 THEN
    -- Número não reconhecido: mantém o original para não corromper dados
    RETURN raw;
  END IF;

  ddd    := substring(digits FROM 1 FOR 2);
  numero := substring(digits FROM 3);

  RETURN '+55 ' || ddd || ' ' || numero;
END;
$$;

-- Atualiza todos os registros que ainda não estão no formato canônico.
-- Critério: não começa com "+55 " — isso preserva registros já corretos.
UPDATE public.militares
SET    telefone = _tmp_normalize_phone(telefone)
WHERE  telefone IS NOT NULL
  AND  telefone NOT LIKE '+55 %';

-- Remove a função temporária após uso
DROP FUNCTION IF EXISTS _tmp_normalize_phone(TEXT);
