// Backup automático: cópia, restauração num Postgres real (PGlite), arquivos, retenção e falhas.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { COLUMNS } from '../server/entities.js';
import { TABLES, MIGRATIONS, dumpDatabase, verifyDump, restoreSql, copyStorage, saveCopy, readCopy, listCopies, prune, suspicious, copyName } from '../scripts/backup/lib.mjs';

const migrationsDir = fileURLToPath(new URL('../supabase/migrations', import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-backup-'));
const dirFor = (n) => { const d = path.join(tmp, n); fs.mkdirSync(d, { recursive: true }); return d; };

let pg;
before(async () => {
  pg = new PGlite();
  await pg.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  for (const f of MIGRATIONS) await pg.exec(fs.readFileSync(path.join(migrationsDir, f), 'utf8'));
  const users = Array.from({ length: 450 }, (_, i) => ({ id: `u${i}`, email: `u${i}@t.dev`, nome: i === 3 ? "D'Ávila \\ $$ \"aspas\"\n🎓" : `N${i}`, finance: { b: 2, a: 1 } }));
  for (const u of users) await pg.query('insert into public.users (id, email, data, created_at) values ($1, $2, $3, now())', [u.id, u.email, JSON.stringify(u)]);
  await pg.query("update public.users set data = data || '{\"x\": 1}', version = 7 where id = 'u5'");
  await pg.query("insert into public.community_posts (id, autor_id, data) values ('z-primeiro', 'u1', '{\"id\":\"z-primeiro\"}'), ('a-depois', 'u2', '{\"id\":\"a-depois\"}')");
  await pg.query("insert into public.community_comments (id, post_id, autor_id, data) values ('c1', 'z-primeiro', 'u2', '{\"id\":\"c1\"}')");
  await pg.query("insert into public.estuvia_meta (id, ambiente, data) values ('main', 'production', '{\"ambiente\":\"production\"}')");
});
after(async () => { await pg.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

// Cliente com o mesmo contrato do supabase-js usado pelo backup.
const from = (table) => {
  const q = { last: null, n: 1000 };
  const api = {
    select: () => api, order: () => api, limit: (n) => { q.n = n; return api; }, gt: (_c, v) => { q.last = v; return api; },
    then: (ok, fail) => pg.query(`select to_jsonb(t) as r from public.${table} t where $1::text is null or id collate "C" > $1 order by id collate "C" limit $2`, [q.last, q.n])
      .then(({ rows }) => ok({ data: rows.map((x) => x.r), error: null }), fail),
  };
  return api;
};
const storage = (files, { baixados = [], erro = null } = {}) => ({
  getBucket: async (b) => ({ error: erro || (b === 'estuvia-documents' ? null : { message: 'Bucket not found', status: 404 }) }),
  from: () => ({
    list: async (prefix) => {
      if (!prefix) return { data: [...new Set(Object.keys(files).map((k) => k.split('/')[0]))].map((name) => ({ name, id: null })), error: null };
      return { data: Object.entries(files).filter(([k]) => k.startsWith(`${prefix}/`)).map(([k, f]) => ({ id: k, name: k.slice(prefix.length + 1), updated_at: f.em, metadata: { size: f.size ?? f.body.length } })), error: null };
    },
    download: async (k) => { baixados.push(k); return { data: new Blob([files[k].body]), error: null }; },
  }),
});

test('a lista de tabelas do backup cobre todas as entidades', () => {
  assert.deepEqual([...TABLES].sort(), Object.keys(COLUMNS).sort());
  assert.deepEqual(MIGRATIONS, fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort(), 'migration nova precisa entrar na conferência');
});

test('copia, restaura num Postgres vazio e o conteúdo, a versão e a ordem são iguais', async () => {
  const dump = await dumpDatabase({ from }, { projeto: 'ref' });
  assert.equal(dump.tabelas.users.length, 450, 'mais de duas páginas, sem pular linha');
  assert.deepEqual(dump.tabelas.community_posts.map((p) => p.id), ['z-primeiro', 'a-depois'], 'ordem de inserção');
  const r = await verifyDump(dump, { migrationsDir });
  assert.equal(r.users.linhas, 450);
  assert.equal(r.community_comments.linhas, 1);
});

test('a conferência acusa cópia incompleta', async () => {
  const dump = await dumpDatabase({ from }, { projeto: 'ref' });
  const semPai = structuredClone(dump);
  semPai.tabelas.community_posts = [];
  await assert.rejects(verifyDump(semPai, { migrationsDir }), /foreign key/, 'comentário sem post');
  const repetida = structuredClone(dump);
  repetida.tabelas.users.push(repetida.tabelas.users[0]);
  await assert.rejects(verifyDump(repetida, { migrationsDir }), /duplicate key/);
});

test('o SQL de restauração recusa um banco que já tem usuários, sem mudar nada', async () => {
  const dump = await dumpDatabase({ from }, { projeto: 'ref' });
  await assert.rejects(pg.exec(restoreSql(dump)), /já tem usuários/);
  await pg.exec('rollback');
  assert.equal((await pg.query('select count(*)::int as n from public.users')).rows[0].n, 450);
});

test('arquivos: baixa só o que mudou; erro de acesso e download cortado não viram cópia vazia', async () => {
  const dir = dirFor('arquivos-dir');
  const files = { 'u1/a.bin': { em: '2026-11-01', body: 'aaa' }, 'u1/b.bin': { em: '2026-11-01', body: 'bbb' } };
  const primeira = await copyStorage({ storage: storage(files) }, ['estuvia-documents', 'estuvia-meta'], dir);
  assert.equal(primeira.length, 2);
  files['u1/b.bin'] = { em: '2026-11-02', body: 'BBBB' };
  const baixados = [];
  const segunda = await copyStorage({ storage: storage(files, { baixados }) }, ['estuvia-documents'], dir, primeira);
  assert.deepEqual(baixados, ['u1/b.bin']);
  assert.notEqual(segunda.find((f) => f.nome === 'u1/b.bin').sha256, primeira.find((f) => f.nome === 'u1/b.bin').sha256);
  await assert.rejects(copyStorage({ storage: storage(files, { erro: { message: 'Invalid API key', status: 401 } }) }, ['estuvia-documents'], dir), /Invalid API key/);
  await assert.rejects(copyStorage({ storage: storage({ 'u1/c.bin': { em: 'x', body: 'cc', size: 99 } }) }, ['estuvia-documents'], dir), /2 de 99 bytes/);
});

test('cópia em disco: ida e volta, detecção de corrupção e cópia interrompida ignorada', () => {
  const dir = dirFor('disco');
  const dump = { projeto: 'ref', geradoEm: 'x', tabelas: { users: [{ id: 'u1' }] } };
  saveCopy(dir, 'copia-2026-11-24T10-00-00', dump, { projeto: 'ref', tabelas: {}, arquivos: [] });
  assert.deepEqual(readCopy(dir, 'copia-2026-11-24T10-00-00').dump, dump);
  fs.mkdirSync(path.join(dir, 'copia-2026-11-25T10-00-00.parcial'));
  fs.mkdirSync(path.join(dir, 'copia-2026-11-26T10-00-00'));
  assert.equal(listCopies(dir).length, 1);
  fs.appendFileSync(path.join(dir, 'copia-2026-11-24T10-00-00', 'banco.json.gz'), 'x');
  assert.throws(() => readCopy(dir, 'copia-2026-11-24T10-00-00'), /corrompido/);
});

test('retenção: apaga o que passou do prazo, mantém as 3 mais novas e os arquivos ainda usados', () => {
  const dir = dirFor('retencao');
  const [velho, atual] = ['a'.repeat(64), 'b'.repeat(64)];
  fs.mkdirSync(path.join(dir, 'arquivos'));
  for (const s of [velho, atual]) fs.writeFileSync(path.join(dir, 'arquivos', s), s);
  const dia = (n) => new Date(Date.UTC(2026, 10, 24) - n * 86400000);
  for (const n of [40, 35, 20, 10, 0]) saveCopy(dir, copyName(dia(n)), { tabelas: {} }, { arquivos: [{ sha256: n >= 35 ? velho : atual, bucket: 'b', nome: 'x' }] });
  assert.equal(prune(dir, { dias: 30, agora: Number(dia(0)) }).length, 2);
  assert.equal(listCopies(dir).length, 3);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'arquivos')), [atual]);
  assert.equal(prune(dir, { dias: 1, agora: Number(dia(-400)) }).length, 0, 'nunca fica com menos de 3 cópias');
});

test('queda brusca de dados é sinalizada', () => {
  const t = (n) => ({ linhas: n });
  assert.deepEqual(suspicious({ users: t(10), audit_log: t(50) }, { users: t(4), audit_log: t(0) }), ['users: 10 → 4', 'audit_log: 50 → 0']);
  assert.deepEqual(suspicious({ users: t(10) }, { users: t(9) }), []);
  assert.deepEqual(suspicious(null, { users: t(1) }), []);
});
