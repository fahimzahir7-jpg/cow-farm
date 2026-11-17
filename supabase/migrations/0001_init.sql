-- Cow farm records: initial schema
-- Money is stored in AFN unless the column name says _usd.

create extension if not exists pgcrypto;

-- People who can log in -------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'viewer' check (role in ('admin','manager','viewer')),
  language text not null default 'en' check (language in ('en','fa','ps')),
  created_at timestamptz not null default now()
);

-- Partners who put money in ---------------------------------------------------
create table public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Capital contributions (positive) or withdrawals (negative), in USD
create table public.capital_entries (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete restrict,
  entry_date date not null,
  amount_usd numeric(14,2) not null,
  note text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- Single-row settings
create table public.settings (
  id int primary key default 1 check (id = 1),
  afn_per_usd numeric(10,2) not null default 70,
  calf_share numeric(4,2) not null default 0.5 check (calf_share >= 0 and calf_share <= 1),
  rate_updated_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1);

-- Animals: cows and calves ----------------------------------------------------
create table public.animals (
  id uuid primary key default gen_random_uuid(),
  tag text not null,                    -- ear tag / short name shown everywhere
  name text,
  kind text not null default 'cow' check (kind in ('cow','calf','bull')),
  sex text check (sex in ('f','m')),
  breed text,
  mother_id uuid references public.animals(id) on delete set null,
  origin text not null default 'bought' check (origin in ('bought','came_with_mother','born_on_farm')),
  acquired_on date not null,
  purchase_price_afn numeric(14,2) not null default 0,
  birth_date date,
  status text not null default 'active' check (status in ('active','sold','dead')),
  exit_date date,
  sale_price_afn numeric(14,2),
  buyer text,
  notes text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'active' or exit_date is not null)
);
create unique index animals_tag_active on public.animals (lower(tag)) where status = 'active';

-- Daily milk per cow (kg)
create table public.milk_records (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid not null references public.animals(id) on delete cascade,
  record_date date not null,
  kg numeric(6,2) not null check (kg >= 0),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (animal_id, record_date)
);

-- Milk sold to shops
create table public.milk_sales (
  id uuid primary key default gen_random_uuid(),
  sale_date date not null,
  buyer text not null,
  kg numeric(8,2) not null check (kg >= 0),
  price_per_kg_afn numeric(10,2) not null check (price_per_kg_afn >= 0),
  amount_afn numeric(14,2) generated always as (kg * price_per_kg_afn) stored,
  paid boolean not null default true,
  note text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- Staff with salary accounts. Payments are 'wages' expenses with employee_id set.
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  job text,
  monthly_salary_afn numeric(14,2) not null default 0 check (monthly_salary_afn >= 0),
  start_date date not null default current_date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Expenses. animal_id set = cost for that animal only (e.g. vet).
-- animal_id null = shared cost, split across animals on the farm each day
-- of the period [period_start, period_end].
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category text not null check (category in ('feed','rent','wages','electricity','water','vet','transport','repairs','other')),
  amount_afn numeric(14,2) not null check (amount_afn >= 0),
  animal_id uuid references public.animals(id) on delete set null,
  employee_id uuid references public.employees(id) on delete set null,
  period_start date not null,
  period_end date not null,
  note text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create index on public.milk_records (record_date);
create index on public.milk_sales (sale_date);
create index on public.expenses (period_start, period_end);
create index on public.capital_entries (entry_date);

-- Roles -----------------------------------------------------------------------
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.can_write() returns boolean
language sql stable set search_path = public as $$ select coalesce(public.my_role() in ('admin','manager'), false) $$;

create or replace function public.is_admin() returns boolean
language sql stable set search_path = public as $$ select coalesce(public.my_role() = 'admin', false) $$;

-- Row level security ----------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.partners enable row level security;
alter table public.capital_entries enable row level security;
alter table public.settings enable row level security;
alter table public.animals enable row level security;
alter table public.milk_records enable row level security;
alter table public.milk_sales enable row level security;
alter table public.expenses enable row level security;
alter table public.employees enable row level security;

-- Everyone logged in with a profile can read everything
do $$
declare t text;
begin
  foreach t in array array['profiles','partners','capital_entries','settings','animals','milk_records','milk_sales','expenses','employees'] loop
    execute format('create policy "%1$s read" on public.%1$I for select to authenticated using (public.my_role() is not null)', t);
  end loop;
  -- Day-to-day records: manager or admin can write
  foreach t in array array['animals','milk_records','milk_sales','expenses','employees'] loop
    execute format('create policy "%1$s insert" on public.%1$I for insert to authenticated with check (public.can_write())', t);
    execute format('create policy "%1$s update" on public.%1$I for update to authenticated using (public.can_write()) with check (public.can_write())', t);
    execute format('create policy "%1$s delete" on public.%1$I for delete to authenticated using (public.can_write())', t);
  end loop;
  -- Money structure: admin only
  foreach t in array array['partners','capital_entries','settings','profiles'] loop
    execute format('create policy "%1$s admin insert" on public.%1$I for insert to authenticated with check (public.is_admin())', t);
    execute format('create policy "%1$s admin update" on public.%1$I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('create policy "%1$s admin delete" on public.%1$I for delete to authenticated using (public.is_admin())', t);
  end loop;
end $$;

-- Users may change their own language
create policy "profiles self language" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = public.my_role());

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
create trigger animals_touch before update on public.animals for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.settings for each row execute function public.touch_updated_at();

-- Daily exchange rate refresh: any logged-in user's app may store the latest
-- AFN per USD rate, but only a sane value and only through this function.
create or replace function public.set_exchange_rate(rate numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is null then raise exception 'not allowed'; end if;
  if rate is null or rate < 20 or rate > 500 then raise exception 'rate out of range'; end if;
  update public.settings set afn_per_usd = round(rate, 2), rate_updated_at = now() where id = 1;
end $$;
revoke all on function public.set_exchange_rate(numeric) from public, anon;
grant execute on function public.set_exchange_rate(numeric) to authenticated;
revoke all on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated;

create index on public.expenses (employee_id);

-- Seed the two partners
insert into public.partners (name) values ('Haji Zahir'), ('Alawodin');
insert into public.capital_entries (partner_id, entry_date, amount_usd, note)
  select id, date '2026-04-17', 12000, 'Initial investment (about 7 months before 2026-11-17)' from public.partners;
