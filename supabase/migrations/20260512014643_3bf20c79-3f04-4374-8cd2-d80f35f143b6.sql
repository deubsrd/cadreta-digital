CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$ BEGIN
  PERFORM cron.unschedule('cobranca-automatica-hourly');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'cobranca-automatica-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mcipqkmqqzpelrzzreuo.supabase.co/functions/v1/cobranca-automatica',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);