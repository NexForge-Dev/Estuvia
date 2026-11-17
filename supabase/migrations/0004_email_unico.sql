-- 0004: e-mail único sem diferenciar maiúsculas e minúsculas.
--
-- A 0002 criou users.email como "unique" (diferencia maiúsculas) e um índice comum em lower(email).
-- O servidor já grava todo e-mail em minúsculas, mas o banco não garantia isso: uma gravação fora do
-- servidor (SQL Editor, script) com "Ana@x.com" passaria ao lado de "ana@x.com".
-- Esta migration troca o índice comum por um índice ÚNICO em lower(email).
--
-- Antes de criar o índice, confere se já existem duplicados. Se existirem, para com uma mensagem
-- listando os e-mails e não muda nada: resolva os duplicados à mão e rode de novo.
--
-- Idempotente e não destrutiva. Aplicar no SQL Editor de cada projeto, depois da 0003.

do $$
declare
  dups text;
begin
  select string_agg(e, ', ') into dups
    from (select lower(email) as e from public.users group by lower(email) having count(*) > 1) d;
  if dups is not null then
    raise exception 'estuvia 0004: e-mails duplicados (ignorando maiúsculas): %. Resolva antes de aplicar.', dups;
  end if;
end $$;

create unique index if not exists users_email_lower_key on public.users (lower(email));
drop index if exists public.users_email_lower_idx;
