// Integridade da camada de banco: migrations num Postgres vazio (PGlite) com os privilégios padrão do Supabase,
// permissões das chaves públicas, coerência entre SQL, código e backup, e as defesas locais (arquivo JSON).
// Não conecta em nenhum banco remoto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-db-integrity-'));
const dataFile = path.join(tmp, 'db.json');
fs.writeFileSync(dataFile, '{"users": [ {"id": "u1", "email": "a@b.c"} '); // JSON truncado (base ilegível)
fs.writeFileSync(path.join(tmp, 'radar.json'), '{"programs": [ {"id": "p-antigo"} '); // idem para o Radar
Object.assign(process.env, {
  DB_PROVIDER: 'json', STORAGE_PROVIDER: 'local', APP_ENV: 'test',
  // Projeto de PRODUÇÃO na URL e SEM a referência no .env: a barreira precisa valer mesmo assim.
  SUPABASE_URL: 'https://trdpcjvyfieumxakhwop.supabase.co', SUPABASE_PROD_PROJECT_REF: '', SUPABASE_DEV_PROJECT_REF: '',
  DATA_FILE: dataFile, RADAR_DATA_FILE: path.join(tmp, 'radar.json'), MEDIA_DIR: path.join(tmp, 'media'),
});

const sqlFile = (f) => fs.readFileSync(new URL(`../supabase/${f}`, import.meta.url), 'utf8');
const MIGRATIONS = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();

const { COLUMNS, pgSafe } = await import('../server/entities.js');
const database = await import('../server/database.js');
const { writeFileAtomic } = await import('../server/storage.js');

// Privilégios padrão que o Supabase dá a objetos novos no schema public.
const SUPABASE_DEFAULTS = `
  create role anon; create role authenticated; create role service_role bypassrls;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;`;

async function migratedDatabase({ twice = false } = {}) {
  const pg = new PGlite();
  await pg.exec(SUPABASE_DEFAULTS);
  await pg.exec(sqlFile('schema.sql')); // projeto antigo: schema.sql aplicado antes das migrations
  for (let i = 0; i < (twice ? 2 : 1); i++) for (const f of MIGRATIONS) await pg.exec(sqlFile(`migrations/${f}`));
  return pg;
}
const rows = async (pg, sql) => (await pg.query(sql)).rows;

test('migrations aplicam em ordem num banco vazio e de novo por cima (idempotentes)', async () => {
  assert.deepEqual(MIGRATIONS.slice(0, 3), ['0001_estuvia_state.sql', '0002_entidades.sql', '0003_permissoes.sql']);
  const pg = await migratedDatabase({ twice: true });
  const [{ n }] = await rows(pg, `select count(*)::int as n from pg_trigger where tgname = 'estuvia_stamp'`);
  assert.equal(n, Object.keys(COLUMNS).length, 'um trigger por tabela, sem duplicar');
});

test('chaves públicas (anon / authenticated) não têm acesso a nada; toda tabela tem RLS e nenhuma policy', async () => {
  const pg = await migratedDatabase();
  for (const role of ['anon', 'authenticated']) {
    assert.deepEqual(await rows(pg, `select table_name, privilege_type from information_schema.role_table_grants where grantee = '${role}'`), [], `${role}: tabelas`);
    assert.deepEqual(await rows(pg, `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'S' and (has_sequence_privilege('${role}', c.oid, 'USAGE') or has_sequence_privilege('${role}', c.oid, 'UPDATE'))`), [], `${role}: sequências`);
    assert.deepEqual(await rows(pg, `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('${role}', p.oid, 'EXECUTE')`), [], `${role}: funções`);
  }
  assert.deepEqual(await rows(pg, `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`), [], 'tabela sem RLS');
  assert.deepEqual(await rows(pg, 'select tablename, policyname from pg_policies'), [], 'policy permissiva');

  // A chave anon não lê nem grava, nem pelas funções.
  await assert.rejects(pg.transaction(async (tx) => { await tx.query('set local role anon'); await tx.query('select * from public.users'); }), /permission denied/);
  await assert.rejects(pg.transaction(async (tx) => { await tx.query('set local role anon'); await tx.query(`select public.estuvia_changes(0, array['users'])`); }), /permission denied/);
  await assert.rejects(pg.transaction(async (tx) => { await tx.query('set local role anon'); await tx.query(`select nextval('public.estuvia_seq')`); }), /permission denied/);
  // E a service_role (chave secret do servidor) continua gravando e lendo depois da 0003.
  await pg.transaction(async (tx) => {
    await tx.query('set local role service_role');
    await tx.query(`select public.estuvia_apply($1::jsonb)`, [JSON.stringify([{ t: 'users', id: 'u1', v: null, row: { ...COLUMNS.users({ email: 'a@b.c' }), data: { id: 'u1' } } }])]);
    await tx.query(`select public.estuvia_apply($1::jsonb)`, [JSON.stringify([{ t: 'users', id: 'u1', v: 1, del: true }])]);
    const r = (await tx.query(`select public.estuvia_changes(0, array['users']) as r`)).rows[0].r;
    assert.equal(r.deleted.length, 1);
  });
});

test('as listas de tabelas batem: SQL (estuvia_entity_tables), código (COLUMNS) e backup (db-backup.mjs)', async () => {
  const pg = await migratedDatabase();
  const [{ t }] = await rows(pg, 'select public.estuvia_entity_tables() as t');
  assert.deepEqual([...t].sort(), Object.keys(COLUMNS).sort());
  const backup = fs.readFileSync(new URL('../scripts/db-backup.mjs', import.meta.url), 'utf8');
  const lista = backup.match(/const TABLES = \[([\s\S]*?)\];/)[1].match(/'([a-z_]+)'/g).map((s) => s.slice(1, -1));
  assert.deepEqual(lista.sort(), Object.keys(COLUMNS).sort(), 'db-backup.mjs cobre todas as tabelas de entidades');
});

test('toda coluna tipada que o código grava existe na tabela', async () => {
  const pg = await migratedDatabase();
  const amostra = { email: 'x', autorId: 'u', criadoEm: '2026-01-01', ownerId: 'u', userId: 'u', profile: {} };
  for (const [tabela, colunas] of Object.entries(COLUMNS)) {
    const existentes = new Set((await rows(pg, `select column_name from information_schema.columns where table_schema = 'public' and table_name = '${tabela}'`)).map((r) => r.column_name));
    for (const c of [...Object.keys(colunas(amostra, 'day:2026-01-01')), 'id', 'data', 'version', 'seq', 'ins_seq', 'txid']) {
      assert.ok(existentes.has(c), `${tabela}.${c}`);
    }
  }
});

test('valores que o Postgres recusaria viram null na coluna tipada (a gravação não falha)', () => {
  assert.equal(COLUMNS.analytics(null, 'day:2026-13-45').dia, null);
  assert.equal(COLUMNS.analytics(null, 'day:2026-02-30').dia, null);
  assert.equal(COLUMNS.analytics(null, 'day:2026-02-28').dia, '2026-02-28');
  assert.equal(COLUMNS.users({ createdAt: 8.64e15 }).created_at, null, 'ano +275760');
  assert.equal(COLUMNS.users({ createdAt: '2026-11-17T10:00:00Z' }).created_at, '2026-11-17T10:00:00.000Z');
  assert.deepEqual(pgSafe({ ['a\u0000']: ['x\u0000y', 'z\udc00'], n: 1 }), { a: ['xy', 'z�'], n: 1 });
});

test('barreira DEV × PROD vale para o projeto de produção mesmo sem SUPABASE_PROD_PROJECT_REF no .env', () => {
  assert.throws(() => database.assertProjectAllowed(), /PRODUÇÃO \(trdpcjvyfieumxakhwop\)/);
});

test('base JSON ilegível: guarda uma cópia antes de seguir vazia (a próxima gravação não apaga o que havia)', async () => {
  const store = await import('../server/store.js');
  assert.equal(store.users.all().length, 0);
  const copias = fs.readdirSync(tmp).filter((f) => f.startsWith('db.json.ilegivel-'));
  assert.equal(copias.length, 1);
  assert.match(fs.readFileSync(path.join(tmp, copias[0]), 'utf8'), /"a@b.c"/);
});

test('gravação atômica: tenta de novo quando o Windows recusa o rename por um instante, e limpa o temporário', async () => {
  const file = path.join(tmp, 'atomico.json');
  fs.writeFileSync(file, 'antigo');
  let falhas = 2;
  const rename = async (a, b) => {
    if (falhas-- > 0) throw Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' });
    return fs.promises.rename(a, b);
  };
  await writeFileAtomic(file, 'novo', {}, { rename });
  assert.equal(fs.readFileSync(file, 'utf8'), 'novo');

  const sempre = async () => { throw Object.assign(new Error('EPERM'), { code: 'EPERM' }); };
  await assert.rejects(writeFileAtomic(file, 'outro', {}, { rename: sempre, tries: 3 }), /EPERM/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'novo', 'original intacto');
  assert.deepEqual(fs.readdirSync(tmp).filter((f) => f.endsWith('.tmp')), [], 'sem temporário largado');

  // Gravações simultâneas do mesmo arquivo não disputam o mesmo temporário.
  await Promise.all(Array.from({ length: 10 }, (_, i) => writeFileAtomic(file, `v${i}`)));
  assert.match(fs.readFileSync(file, 'utf8'), /^v\d$/);
});

test('Radar: radar.json ilegível é copiado antes de seguir vazio, e a gravação seguinte é atômica e legível', async () => {
  const radar = await import('../server/radar/db.js');
  assert.equal(radar.data().programs.length, 0);
  const copias = fs.readdirSync(tmp).filter((f) => f.startsWith('radar.json.ilegivel-'));
  assert.equal(copias.length, 1);
  assert.match(fs.readFileSync(path.join(tmp, copias[0]), 'utf8'), /p-antigo/);
  radar.data().programs.push({ id: 'p-novo' });
  await radar.save();
  assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, 'radar.json'), 'utf8')).programs[0].id, 'p-novo');
  assert.deepEqual(fs.readdirSync(tmp).filter((f) => f.endsWith('.tmp')), []);
});

test('0004: e-mail é único ignorando maiúsculas, e a migration recusa base com duplicados', async () => {
  const pg = await migratedDatabase();
  const ins = (id, email) => pg.transaction(async (tx) => {
    await tx.query('set local role service_role');
    await tx.query(`select public.estuvia_apply($1::jsonb)`, [JSON.stringify([{ t: 'users', id, v: null, row: { ...COLUMNS.users({ email }), data: { id } } }])]);
  });
  await ins('u1', 'ana@x.com');
  await assert.rejects(ins('u2', 'Ana@X.com'), /estuvia_conflict/);

  // Base antiga com duplicado: a 0004 para com mensagem clara e não muda nada.
  const old = new PGlite();
  await old.exec(SUPABASE_DEFAULTS);
  for (const f of MIGRATIONS.filter((f) => f < '0004')) await old.exec(sqlFile(`migrations/${f}`));
  await old.exec(`insert into public.users (id, email, data) values ('a', 'bia@x.com', '{}'), ('b', 'BIA@x.com', '{}')`);
  await assert.rejects(old.exec(sqlFile('migrations/0004_email_unico.sql')), /duplicados.*bia@x\.com/);
  assert.equal((await rows(old, `select count(*)::int as n from pg_indexes where indexname = 'users_email_lower_idx'`))[0].n, 1, 'índice antigo continua lá');
});
