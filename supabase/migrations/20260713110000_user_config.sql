-- Per-user, non-secret dashboard preferences consumed by /api/config.
create table if not exists public.user_config (
  user_id uuid not null references auth.users(id) on delete cascade,
  config_key text not null,
  config_value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, config_key),
  constraint user_config_key_format check (
    char_length(config_key) between 1 and 64
    and config_key ~ '^[a-z_]+$'
  )
);

create index if not exists user_config_user_id_idx on public.user_config(user_id);

alter table public.user_config enable row level security;

drop policy if exists "user_config_select_own" on public.user_config;
create policy "user_config_select_own" on public.user_config
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "user_config_insert_own" on public.user_config;
create policy "user_config_insert_own" on public.user_config
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "user_config_update_own" on public.user_config;
create policy "user_config_update_own" on public.user_config
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "user_config_delete_own" on public.user_config;
create policy "user_config_delete_own" on public.user_config
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop trigger if exists set_user_config_updated_at on public.user_config;
create trigger set_user_config_updated_at
  before update on public.user_config
  for each row execute function public.set_updated_at();
