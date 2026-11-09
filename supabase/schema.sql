-- Estuvia's current Express stores use complex, versioned JSON state.
-- Apply this once in Supabase SQL Editor before setting DB_PROVIDER=supabase.
create table if not exists public.estuvia_state (
  id text primary key check (id in ('main', 'radar')),
  state jsonb not null,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);

alter table public.estuvia_state enable row level security;
revoke all on table public.estuvia_state from public, anon, authenticated;
grant select, insert, update on table public.estuvia_state to service_role;
