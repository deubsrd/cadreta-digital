DROP POLICY IF EXISTS "admin all item_price_history" ON public.item_price_history;
DROP POLICY IF EXISTS "tenant item_price_history" ON public.item_price_history;
DROP POLICY IF EXISTS "service item_price_history" ON public.item_price_history;

CREATE POLICY "tenant item_price_history" ON public.item_price_history
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "service item_price_history" ON public.item_price_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.log_item_price_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT') OR (NEW.preco_avista IS DISTINCT FROM OLD.preco_avista) OR (NEW.preco_fiado IS DISTINCT FROM OLD.preco_fiado) THEN
    INSERT INTO public.item_price_history (item_id, preco_avista, preco_fiado, user_id)
    VALUES (NEW.id, NEW.preco_avista, NEW.preco_fiado, NEW.user_id);
  END IF;
  RETURN NEW;
END $$;