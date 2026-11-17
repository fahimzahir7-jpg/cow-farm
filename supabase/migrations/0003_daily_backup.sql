-- Daily backup by email (edge function supabase/functions/daily-backup)
alter table public.settings add column if not exists backup_email text;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.backup_config (
  id int primary key default 1 check (id = 1),
  token text not null default encode(gen_random_bytes(24), 'hex')
);
insert into private.backup_config (id) values (1) on conflict do nothing;

create or replace function public.backup_token() returns text
language sql stable security definer set search_path = private, public as $$
  select token from private.backup_config where id = 1
$$;
revoke all on function public.backup_token() from public, anon, authenticated;
grant execute on function public.backup_token() to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Every day at 19:30 UTC (midnight in Kabul)
select cron.schedule(
  'cow-farm-daily-backup',
  '30 19 * * *',
  $cron$
  select net.http_post(
    url := 'https://swmgpovmnqjtpikqzlng.supabase.co/functions/v1/daily-backup',
    headers := jsonb_build_object('Content-Type','application/json','x-backup-token',(select token from private.backup_config where id = 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
