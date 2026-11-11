-- 0001: estado versionado do Estuvia (JSONB com controle otimista de versão).
-- Idempotente: pode ser aplicada em um projeto novo (produção) ou existente (desenvolvimento) sem perder dados.
-- Aplicar no SQL Editor do projeto, uma vez, antes de usar DB_PROVIDER=supabase.
create table if not exists public.estuvia_state (
  id text primary key check (id in ('main', 'radar')),
  state jsonb not null,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);

-- Só o servidor (chave secret / service_role) acessa. Nada exposto às chaves públicas.
alter table public.estuvia_state enable row level security;
revoke all on table public.estuvia_state from public, anon, authenticated;
grant select, insert, update on table public.estuvia_state to service_role;
