
CREATE TABLE public.itens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL,
  categoria text,
  preco_avista numeric NOT NULL DEFAULT 0,
  preco_fiado numeric NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all itens" ON public.itens FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER itens_updated BEFORE UPDATE ON public.itens FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.item_price_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES public.itens(id) ON DELETE CASCADE,
  preco_avista numeric NOT NULL,
  preco_fiado numeric NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.item_price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all item_price_history" ON public.item_price_history FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.log_item_price_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT') OR (NEW.preco_avista IS DISTINCT FROM OLD.preco_avista) OR (NEW.preco_fiado IS DISTINCT FROM OLD.preco_fiado) THEN
    INSERT INTO public.item_price_history (item_id, preco_avista, preco_fiado)
    VALUES (NEW.id, NEW.preco_avista, NEW.preco_fiado);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER itens_price_log AFTER INSERT OR UPDATE ON public.itens
FOR EACH ROW EXECUTE FUNCTION public.log_item_price_change();

ALTER TABLE public.compras
  ADD COLUMN item_id uuid REFERENCES public.itens(id) ON DELETE SET NULL,
  ADD COLUMN quantidade integer NOT NULL DEFAULT 1,
  ADD COLUMN pago_na_hora boolean NOT NULL DEFAULT false;
