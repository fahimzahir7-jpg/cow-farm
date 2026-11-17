-- Profit taken out by a partner (money paid out of the farm's earnings, in AFN).
-- Different from a capital withdrawal: it does not change the partner's capital share.
create table public.profit_withdrawals (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete restrict,
  withdrawal_date date not null,
  amount_afn numeric(14,2) not null check (amount_afn > 0),
  note text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.profit_withdrawals (partner_id, withdrawal_date);
alter table public.profit_withdrawals enable row level security;
create policy "profit_withdrawals read" on public.profit_withdrawals for select to authenticated using (public.my_role() is not null);
create policy "profit_withdrawals insert" on public.profit_withdrawals for insert to authenticated with check (public.can_write());
create policy "profit_withdrawals update" on public.profit_withdrawals for update to authenticated using (public.can_write()) with check (public.can_write());
create policy "profit_withdrawals delete" on public.profit_withdrawals for delete to authenticated using (public.can_write());
