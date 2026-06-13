-- Bot state table — single-row JSON blob, no RLS (service-role access only)
create table if not exists public.bot_state (
  id          text primary key default 'singleton',
  state       jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);
