-- Refresh the AFN per USD rate every day at 02:00 UTC (edge function refresh-rate)
select cron.schedule('cow-farm-refresh-rate', '0 2 * * *', $c$
  select net.http_post(url := 'https://swmgpovmnqjtpikqzlng.supabase.co/functions/v1/refresh-rate',
    headers := jsonb_build_object('Content-Type','application/json','x-backup-token',(select token from private.backup_config where id = 1)),
    body := '{}'::jsonb, timeout_milliseconds := 30000);
$c$);
