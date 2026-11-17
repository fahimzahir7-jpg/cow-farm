-- Capital is now recorded in AFN (USD is only shown beside it at the current rate).
-- Existing USD entries are converted at the rate on the day of this change.
alter table public.capital_entries rename column amount_usd to amount_afn;
update public.capital_entries
  set amount_afn = round(amount_afn * (select afn_per_usd from public.settings where id = 1)),
      note = coalesce(note || ' ', '') || '(converted from USD at ' || (select afn_per_usd from public.settings where id = 1) || ')';

-- Several backup recipients
alter table public.settings add column if not exists backup_emails text[] not null default '{}';
update public.settings set backup_emails = array[backup_email] where backup_email is not null and backup_email <> '';
alter table public.settings drop column if exists backup_email;
