-- 0002: uma tabela por entidade (substitui as linhas JSON únicas de estuvia_state).
--
-- Modelo híbrido: cada linha guarda o objeto completo em `data` (fonte de verdade, lida pelo servidor)
-- e colunas tipadas com os campos que se consultam, filtram ou precisam ser únicos (e-mail, dono, datas).
-- As colunas tipadas são preenchidas pelo servidor a cada gravação (server/entities.js).
--
-- Controle de concorrência: `version` por linha (gravação otimista em estuvia_apply). Leitura incremental:
-- `txid` (transação que gravou) + xmin do snapshot, para nunca perder uma transação que confirmou atrasada;
-- `seq` global ordena as mudanças e evita reaplicar o que a instância já tem.
-- `ins_seq` guarda a ordem de inserção (as listas em memória dependem da ordem).
--
-- Idempotente e não destrutiva: estuvia_state continua existindo como cópia de segurança.
-- Na primeira subida com estas tabelas vazias, o servidor importa o conteúdo de estuvia_state.

create sequence if not exists public.estuvia_seq;

-- ---------------------------------------------------------------- base principal

create table if not exists public.users (
  id text primary key,
  email text not null unique,
  role text,
  blocked boolean not null default false,
  token_version integer,
  onboarding_concluido boolean not null default false,
  created_at timestamptz,
  consent_at timestamptz,
  last_seen_at timestamptz,
  data jsonb not null,
  version bigint not null default 1,
  seq bigint not null,
  ins_seq bigint not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.community_posts (
  id text primary key,
  autor_id text references public.users(id) on delete cascade,
  grupo_id text,
  tipo text,
  categoria text,
  estado_moderacao text,
  criado_em timestamptz,
  data jsonb not null,
  version bigint not null default 1,
  seq bigint not null,
  ins_seq bigint not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.community_comments (
  id text primary key,
  post_id text references public.community_posts(id) on delete cascade,
  autor_id text references public.users(id) on delete cascade,
  estado_moderacao text,
  criado_em timestamptz,
  data jsonb not null,
  version bigint not null default 1,
  seq bigint not null,
  ins_seq bigint not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.community_groups (
  id text primary key,
  nome text,
  tipo text,
  universidade_id text,
  oficial boolean not null default false,
  criado_em timestamptz,
  data jsonb not null,
  version bigint not null default 1,
  seq bigint not null,
  ins_seq bigint not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.community_reports (
  id text primary key,
  alvo text,
  alvo_id text,
  autor_id text references public.users(id) on delete set null,
  status text,
  criado_em timestamptz,
  data jsonb not null,
  version bigint not null default 1,
  seq bigint not null,
  ins_seq bigint not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.community_media (
  id text primary key,
  owner_id text references public.users(id) on delete cascade,
  post_id text,
  mime text,
  tamanho integer,
  criado_em timestamptz,
  data jsonb not null,
  version bigint not null default 1,
  seq bigint not null,
  ins_seq bigint not null,
  updated_at timestamptz not null default now()
);

-- Registro de segurança/auditoria. Sem chave estrangeira: o registro sobrevive à exclusão da conta.
create table if not exists public.audit_log (
  id text primary key,
  at timestamptz,
  action text,
  user_id text,
  data jsonb not null,
  version bigint not null default 1,
  seq bigint not null,
  ins_seq bigint not null,
  updated_at timestamptz not null default now()
);

-- Uso dos módulos: uma linha por dia (id "day:AAAA-MM-DD") e linhas avulsas para os demais contadores (ex.: "ai").
create table if not exists public.analytics (
  id text primary key,
  dia date,
  data jsonb not null,
  version bigint not null default 1,
  seq bigint not null,
  ins_seq bigint not null,
  updated_at timestamptz not null default now()
);

-- Metadados do banco (linha "main": marcação de ambiente DEV × PROD).
create table if not exists public.estuvia_meta (
  id text primary key,
  ambiente text,
  data jsonb not null,
  version bigint not null default 1,
  seq bigint not null,
  ins_seq bigint not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- Radar de Oportunidades

create table if not exists public.radar_sources (
  id text primary key,
  titulo text,
  instituicao text,
  url text,
  metodo text,
  estado text,
  ativa boolean,
  ultima_consulta timestamptz,
  data jsonb not null,
  version bigint not null default 1, seq bigint not null, ins_seq bigint not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.radar_snapshots (
  id text primary key,
  source_id text,
  chave text,
  versao integer,
  hash text,
  coletado_em timestamptz,
  data jsonb not null,
  version bigint not null default 1, seq bigint not null, ins_seq bigint not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.radar_programs (
  id text primary key,
  universidade_id text,
  nome text,
  codigo text,
  tipo_titulo text,
  source_id text,
  verificado_em timestamptz,
  data jsonb not null,
  version bigint not null default 1, seq bigint not null, ins_seq bigint not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.radar_opportunities (
  id text primary key,
  program_id text,
  universidade_id text,
  tipo text,
  ano_academico text,
  procedimento_id text,
  criada_em timestamptz,
  data jsonb not null,
  version bigint not null default 1, seq bigint not null, ins_seq bigint not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.radar_windows (
  id text primary key,
  procedimento_id text,
  ano_academico text,
  fase integer,
  abertura text,
  encerramento text,
  source_id text,
  data jsonb not null,
  version bigint not null default 1, seq bigint not null, ins_seq bigint not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.radar_events (
  id text primary key,
  procedimento_id text,
  ano_academico text,
  fase integer,
  tipo text,
  inicio text,
  fim text,
  source_id text,
  data jsonb not null,
  version bigint not null default 1, seq bigint not null, ins_seq bigint not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.radar_availability (
  id text primary key,
  opportunity_id text,
  data jsonb not null,
  version bigint not null default 1, seq bigint not null, ins_seq bigint not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.radar_revisions (
  id text primary key,
  entidade text,
  entidade_id text,
  campo text,
  em timestamptz,
  data jsonb not null,
  version bigint not null default 1, seq bigint not null, ins_seq bigint not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.radar_reviews (
  id text primary key,
  tipo text,
  source_id text,
  status text,
  criada_em timestamptz,
  data jsonb not null,
  version bigint not null default 1, seq bigint not null, ins_seq bigint not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.radar_runs (
  id text primary key,
  source_id text,
  inicio timestamptz,
  fim timestamptz,
  resultado text,
  data jsonb not null,
  version bigint not null default 1, seq bigint not null, ins_seq bigint not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.radar_subscriptions (
  id text primary key,
  user_id text references public.users(id) on delete cascade,
  opportunity_id text,
  ativa boolean,
  criada_em timestamptz,
  data jsonb not null,
  version bigint not null default 1, seq bigint not null, ins_seq bigint not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.radar_alerts (
  id text primary key,
  user_id text references public.users(id) on delete cascade,
  subscription_id text,
  opportunity_id text,
  data jsonb not null,
  version bigint not null default 1, seq bigint not null, ins_seq bigint not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.radar_agenda_links (
  id text primary key,
  user_id text references public.users(id) on delete cascade,
  planner_event_id text,
  opportunity_id text,
  data jsonb not null,
  version bigint not null default 1, seq bigint not null, ins_seq bigint not null,
  updated_at timestamptz not null default now()
);

-- Exclusões, para que as outras instâncias do servidor também removam a linha da memória.
create table if not exists public.estuvia_deleted (
  seq bigint primary key default nextval('public.estuvia_seq'),
  txid xid8 not null default pg_current_xact_id(),
  tbl text not null,
  row_id text not null,
  deleted_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- triggers, índices e permissões

create or replace function public.estuvia_entity_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  new.seq := nextval('public.estuvia_seq');
  new.txid := pg_current_xact_id();
  new.updated_at := now();
  if tg_op = 'INSERT' then new.ins_seq := new.seq; else new.ins_seq := old.ins_seq; end if;
  return new;
end $$;

create or replace function public.estuvia_entity_deleted() returns trigger
language plpgsql set search_path = public as $$
begin
  insert into public.estuvia_deleted (tbl, row_id) values (tg_table_name, old.id);
  return old;
end $$;

-- Lista única das tabelas de entidades (usada pelos triggers, permissões e pelas funções abaixo).
create or replace function public.estuvia_entity_tables() returns text[]
language sql immutable as $$
  select array[
    'users', 'community_posts', 'community_comments', 'community_groups', 'community_reports', 'community_media',
    'audit_log', 'analytics', 'estuvia_meta',
    'radar_sources', 'radar_snapshots', 'radar_programs', 'radar_opportunities', 'radar_windows', 'radar_events',
    'radar_availability', 'radar_revisions', 'radar_reviews', 'radar_runs', 'radar_subscriptions', 'radar_alerts',
    'radar_agenda_links'
  ]::text[]
$$;

do $$
declare t text;
begin
  foreach t in array public.estuvia_entity_tables() loop
    execute format('alter table public.%I add column if not exists txid xid8', t);
    execute format('create index if not exists %I on public.%I (txid)', t || '_txid_idx', t);
    execute format('drop trigger if exists estuvia_stamp on public.%I', t);
    execute format('create trigger estuvia_stamp before insert or update on public.%I for each row execute function public.estuvia_entity_stamp()', t);
    execute format('drop trigger if exists estuvia_deleted on public.%I', t);
    execute format('create trigger estuvia_deleted after delete on public.%I for each row execute function public.estuvia_entity_deleted()', t);
    execute format('create index if not exists %I on public.%I (seq)', t || '_seq_idx', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end $$;

create index if not exists users_email_lower_idx on public.users (lower(email));
create index if not exists community_posts_autor_idx on public.community_posts (autor_id);
create index if not exists community_comments_post_idx on public.community_comments (post_id);
create index if not exists community_comments_autor_idx on public.community_comments (autor_id);
create index if not exists community_media_owner_idx on public.community_media (owner_id);
create index if not exists community_reports_autor_idx on public.community_reports (autor_id);
create index if not exists audit_log_user_idx on public.audit_log (user_id, at);
create index if not exists radar_programs_univ_idx on public.radar_programs (universidade_id);
create index if not exists radar_opportunities_program_idx on public.radar_opportunities (program_id);
create index if not exists radar_subscriptions_user_idx on public.radar_subscriptions (user_id);
create index if not exists radar_alerts_user_idx on public.radar_alerts (user_id);
create index if not exists radar_agenda_links_user_idx on public.radar_agenda_links (user_id);
create index if not exists estuvia_deleted_txid_idx on public.estuvia_deleted (txid);

alter table public.estuvia_deleted enable row level security;
revoke all on table public.estuvia_deleted from public, anon, authenticated;
grant select, insert, delete on table public.estuvia_deleted to service_role;
grant usage, select on sequence public.estuvia_seq to service_role;

-- ---------------------------------------------------------------- gravação atômica com versão por linha
-- p_ops: [{ "t": tabela, "id": id, "v": versão esperada (null = inserir), "row": {colunas}, "del": true|false }]
-- Tudo ou nada: qualquer conflito de versão desfaz a transação inteira e levanta "estuvia_conflict".

create or replace function public.estuvia_apply(p_ops jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  op jsonb;
  t text;
  rid text;
  v bigint;
  r jsonb;
  cols text;
  n integer;
begin
  for op in select value from jsonb_array_elements(p_ops) loop
    t := op->>'t';
    rid := op->>'id';
    v := (op->>'v')::bigint;
    if not (t = any(public.estuvia_entity_tables())) then
      raise exception 'estuvia: tabela desconhecida %', t;
    end if;
    if coalesce((op->>'del')::boolean, false) then
      execute format('delete from public.%I where id = $1 and ($2::bigint is null or version = $2)', t) using rid, v;
      get diagnostics n = row_count;
      if n = 0 and v is not null then
        execute format('select count(*) from public.%I where id = $1', t) into n using rid;
        if n > 0 then raise exception 'estuvia_conflict: % % (exclusão)', t, rid; end if;
      end if;
    elsif v is null then
      r := (op->'row') || jsonb_build_object('id', rid, 'version', 1);
      begin
        execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)', t, t) using r;
      exception when unique_violation then
        -- id já existente (outra instância inseriu) ou e-mail duplicado em users.
        raise exception 'estuvia_conflict: % % (inserção: %)', t, rid, sqlerrm;
      end;
    else
      r := (op->'row') || jsonb_build_object('id', rid, 'version', v + 1);
      select string_agg(format('%I = (s.x).%I', k, k), ', ') into cols
        from jsonb_object_keys(r) k where k <> 'id';
      execute format('update public.%I t set %s from (select jsonb_populate_record(null::public.%I, $1) as x) s where t.id = $2 and t.version = $3',
                     t, cols, t) using r, rid, v;
      get diagnostics n = row_count;
      if n = 0 then raise exception 'estuvia_conflict: % % (versão %)', t, rid, v; end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- leitura incremental
-- Devolve as linhas gravadas por transações com txid >= p_since (e as exclusões), das tabelas pedidas.
-- O cursor devolvido é o xmin do snapshot atual: toda transação ainda não visível agora terá txid >= ele,
-- então nada se perde; o que vier repetido é descartado pelo servidor comparando `seq`.
-- p_since = 0 devolve tudo (carga inicial).

create or replace function public.estuvia_changes(p_since bigint, p_tables text[]) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  t text;
  cur bigint;
  rows jsonb;
  out_rows jsonb := '{}'::jsonb;
  dels jsonb;
begin
  cur := pg_snapshot_xmin(pg_current_snapshot())::text::bigint;
  foreach t in array p_tables loop
    if not (t = any(public.estuvia_entity_tables())) then
      raise exception 'estuvia: tabela desconhecida %', t;
    end if;
    execute format(
      'select coalesce(jsonb_agg(jsonb_build_object(''id'', id, ''version'', version, ''seq'', seq, ''data'', data) order by ins_seq), ''[]''::jsonb)
         from public.%I where txid >= $1::text::xid8', t) into rows using p_since;
    if jsonb_array_length(rows) > 0 then out_rows := out_rows || jsonb_build_object(t, rows); end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('t', tbl, 'id', row_id, 'seq', seq) order by seq), '[]'::jsonb) into dels
    from public.estuvia_deleted where txid >= p_since::text::xid8 and tbl = any(p_tables);
  return jsonb_build_object('seq', cur, 'rows', out_rows, 'deleted', dels);
end $$;

revoke all on function public.estuvia_apply(jsonb) from public, anon, authenticated;
revoke all on function public.estuvia_changes(bigint, text[]) from public, anon, authenticated;
grant execute on function public.estuvia_apply(jsonb) to service_role;
grant execute on function public.estuvia_changes(bigint, text[]) to service_role;
grant execute on function public.estuvia_entity_tables() to service_role;
