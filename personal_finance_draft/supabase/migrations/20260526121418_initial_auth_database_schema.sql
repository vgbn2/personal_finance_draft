-- Mirrors remote Supabase migration 20260526121418_initial_auth_database_schema.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  risk_profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  base_currency text not null default 'USD',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolios_base_currency_len check (char_length(base_currency) = 3)
);

create table if not exists public.holdings (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  asset_class text not null default 'equity',
  quantity numeric not null default 0,
  average_cost numeric,
  provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint holdings_symbol_not_blank check (length(btrim(symbol)) > 0),
  constraint holdings_quantity_nonnegative check (quantity >= 0)
);

create table if not exists public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  family text not null default 'equity',
  notes text,
  created_at timestamptz not null default now(),
  constraint watchlist_symbol_not_blank check (length(btrim(symbol)) > 0),
  unique (user_id, symbol, family)
);

create table if not exists public.saved_backtests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  strategy text not null,
  parameters jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  artifact_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  severity text not null default 'info',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_events_severity_check check (severity in ('debug', 'info', 'warn', 'error'))
);

create index if not exists portfolios_user_id_idx on public.portfolios(user_id);
create index if not exists holdings_user_id_idx on public.holdings(user_id);
create index if not exists holdings_portfolio_id_idx on public.holdings(portfolio_id);
create index if not exists watchlist_items_user_id_idx on public.watchlist_items(user_id);
create index if not exists saved_backtests_user_id_idx on public.saved_backtests(user_id);
create index if not exists audit_events_user_id_created_at_idx on public.audit_events(user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.portfolios enable row level security;
alter table public.holdings enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.saved_backtests enable row level security;
alter table public.audit_events enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name'))
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name),
        updated_at = now();
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_portfolios_updated_at on public.portfolios;
create trigger set_portfolios_updated_at
  before update on public.portfolios
  for each row execute function public.set_updated_at();

drop trigger if exists set_holdings_updated_at on public.holdings;
create trigger set_holdings_updated_at
  before update on public.holdings
  for each row execute function public.set_updated_at();

drop trigger if exists set_saved_backtests_updated_at on public.saved_backtests;
create trigger set_saved_backtests_updated_at
  before update on public.saved_backtests
  for each row execute function public.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "portfolios_select_own" on public.portfolios;
create policy "portfolios_select_own" on public.portfolios
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "portfolios_insert_own" on public.portfolios;
create policy "portfolios_insert_own" on public.portfolios
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "portfolios_update_own" on public.portfolios;
create policy "portfolios_update_own" on public.portfolios
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "portfolios_delete_own" on public.portfolios;
create policy "portfolios_delete_own" on public.portfolios
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "holdings_select_own" on public.holdings;
create policy "holdings_select_own" on public.holdings
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "holdings_insert_own" on public.holdings;
create policy "holdings_insert_own" on public.holdings
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.portfolios p
      where p.id = portfolio_id and p.user_id = (select auth.uid())
    )
  );

drop policy if exists "holdings_update_own" on public.holdings;
create policy "holdings_update_own" on public.holdings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.portfolios p
      where p.id = portfolio_id and p.user_id = (select auth.uid())
    )
  );

drop policy if exists "holdings_delete_own" on public.holdings;
create policy "holdings_delete_own" on public.holdings
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "watchlist_select_own" on public.watchlist_items;
create policy "watchlist_select_own" on public.watchlist_items
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "watchlist_insert_own" on public.watchlist_items;
create policy "watchlist_insert_own" on public.watchlist_items
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "watchlist_update_own" on public.watchlist_items;
create policy "watchlist_update_own" on public.watchlist_items
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "watchlist_delete_own" on public.watchlist_items;
create policy "watchlist_delete_own" on public.watchlist_items
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "saved_backtests_select_own" on public.saved_backtests;
create policy "saved_backtests_select_own" on public.saved_backtests
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "saved_backtests_insert_own" on public.saved_backtests;
create policy "saved_backtests_insert_own" on public.saved_backtests
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "saved_backtests_update_own" on public.saved_backtests;
create policy "saved_backtests_update_own" on public.saved_backtests
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "saved_backtests_delete_own" on public.saved_backtests;
create policy "saved_backtests_delete_own" on public.saved_backtests
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "audit_events_select_own" on public.audit_events;
create policy "audit_events_select_own" on public.audit_events
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "audit_events_insert_own" on public.audit_events;
create policy "audit_events_insert_own" on public.audit_events
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.portfolios to authenticated;
grant select, insert, update, delete on public.holdings to authenticated;
grant select, insert, update, delete on public.watchlist_items to authenticated;
grant select, insert, update, delete on public.saved_backtests to authenticated;
grant select, insert on public.audit_events to authenticated;
