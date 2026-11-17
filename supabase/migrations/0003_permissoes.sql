-- 0003: fecha permissões que sobraram para as chaves públicas (anon / authenticated).
--
-- No Supabase, objetos criados no schema public recebem por padrão (default privileges) acesso de anon e
-- authenticated. A 0002 já revoga as tabelas e as funções estuvia_apply / estuvia_changes, mas não:
--   - a sequência estuvia_seq (USAGE, SELECT, UPDATE: nextval/setval);
--   - as funções auxiliares estuvia_entity_tables, estuvia_entity_stamp e estuvia_entity_deleted
--     (EXECUTE vem também de PUBLIC, padrão do Postgres para funções).
-- Nenhuma delas é alcançável com dano pela API REST hoje, mas o servidor só usa a chave secret (service_role):
-- nada deve sobrar para as chaves públicas.
--
-- Idempotente e não destrutiva (só revoke/grant). Aplicar no SQL Editor de cada projeto, depois da 0002.

revoke all on sequence public.estuvia_seq from public, anon, authenticated;
grant usage, select on sequence public.estuvia_seq to service_role;

revoke all on function public.estuvia_entity_tables() from public, anon, authenticated;
revoke all on function public.estuvia_entity_stamp() from public, anon, authenticated;
revoke all on function public.estuvia_entity_deleted() from public, anon, authenticated;
grant execute on function public.estuvia_entity_tables() to service_role;
