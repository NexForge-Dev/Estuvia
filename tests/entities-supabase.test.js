// Tabelas por entidade (supabase/migrations/0002_entidades.sql) contra um Postgres real (PGlite, em memória),
// executando as mesmas funções SQL que o Supabase executa. Simula duas instâncias do servidor (como na Vercel)
// importando o módulo store.js duas vezes.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-entities-'));
Object.assign(process.env, {
  DB_PROVIDER: 'supabase', STORAGE_PROVIDER: 'local', APP_ENV: 'development',
  SUPABASE_URL: 'https://testeref.supabase.co', SUPABASE_SECRET_KEY: 'chave-de-teste',
  SUPABASE_PROD_PROJECT_REF: '', SUPABASE_DEV_PROJECT_REF: '',
  DATA_FILE: path.join(tmp, 'db.json'), RADAR_DATA_FILE: path.join(tmp, 'radar.json'), MEDIA_DIR: path.join(tmp, 'media'),
});

const MIGRATIONS = ['0001_estuvia_state.sql', '0002_entidades.sql']
  .map((f) => fs.readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8')).join('\n');

async function newDatabase() {
  const pg = new PGlite();
  await pg.exec('create role anon; create role authenticated; create role service_role;');
  await pg.exec(MIGRATIONS);
  return pg;
}

// Mesmo contrato de database.rpc(): conflitos de versão chegam com code = ESTUVIA_CONFLICT.
const rpcFor = (pg) => async (name, args) => {
  try {
    if (name === 'estuvia_apply') return (await pg.query('select public.estuvia_apply($1::jsonb) as r', [JSON.stringify(args.p_ops)])).rows[0].r;
    if (name === 'estuvia_changes') return (await pg.query('select public.estuvia_changes($1::bigint, $2::text[]) as r', [args.p_since, args.p_tables])).rows[0].r;
    throw new Error(`rpc desconhecida: ${name}`);
  } catch (e) {
    const err = new Error(e.message);
    if (/estuvia_conflict/.test(e.message)) err.code = 'ESTUVIA_CONFLICT';
    throw err;
  }
};
const legacyFor = (pg) => async (id) => (await pg.query('select state from public.estuvia_state where id = $1', [id])).rows[0]?.state ?? null;

const database = await import('../server/database.js');
const { stable } = await import('../server/entities.js');
let instance = 0;
const newInstance = () => import(`../server/store.js?instancia=${++instance}`);

const LEGACY_MAIN = {
  meta: { ambiente: 'development', marcadoEm: '2026-11-01T00:00:00.000Z' },
  users: [
    { id: 'u1', email: 'ana@exemplo.test', passwordHash: 'h', tokenVersion: 0, createdAt: '2026-11-01T10:00:00.000Z',
      profile: { apelido: 'Ana', onboardingConcluido: true }, journeys: [{ id: 'j1', rodadas: [1, 2] }], finance: { itens: { b: 2, a: 1 } } },
    { id: 'u2', email: 'bia@exemplo.test', passwordHash: 'h', tokenVersion: 3, createdAt: 'data inválida', profile: {} },
  ],
  audit: [{ id: 'a1', at: '2026-11-01T10:00:00.000Z', action: 'login', userId: 'u1', ip: '1.2.3.4' }],
  community: {
    posts: [{ id: 'p1', autorId: 'u1', titulo: 'Oi', curtidas: ['u2'], salvos: [], criadoEm: '2026-11-02T00:00:00.000Z', moderacao: { estado: 'publicado' } }],
    comments: [{ id: 'c1', postId: 'p1', autorId: 'u2', texto: 'Olá', criadoEm: '2026-11-02T01:00:00.000Z' }],
    groups: [{ id: 'g1', nome: 'Granada', oficial: true, membros: ['u1'] }], reports: [], media: [],
  },
  analytics: { days: { '2026-11-10': { missao: { visitas: 3 } } }, ai: { mentor: { ok: 2 } } },
};

let pg;
let A;
let B;
before(async () => {
  pg = await newDatabase();
  database.setRpcForTests(rpcFor(pg));
  database.setLegacyReaderForTests(legacyFor(pg));
  await pg.query(`insert into public.estuvia_state (id, state) values ('main', $1::jsonb)`, [JSON.stringify(LEGACY_MAIN)]);
  A = await newInstance();
  await A.initStore(); // primeira instância: importa de estuvia_state
  B = await newInstance();
  await B.initStore(); // segunda: já encontra as tabelas preenchidas
});

const one = async (sql, params) => (await pg.query(sql, params)).rows[0];

test('importa estuvia_state para as tabelas com colunas tipadas, sem apagar a linha antiga', async () => {
  const u1 = await one(`select email, token_version, onboarding_concluido, created_at, data->'profile'->>'apelido' as apelido, version from public.users where id = 'u1'`);
  assert.equal(u1.email, 'ana@exemplo.test');
  assert.equal(u1.onboarding_concluido, true);
  assert.equal(u1.apelido, 'Ana');
  assert.equal(Number(u1.version), 1);
  assert.equal((await one(`select created_at from public.users where id = 'u2'`)).created_at, null, 'data inválida vira null na coluna, sem quebrar a gravação');
  assert.equal((await one(`select autor_id from public.community_posts where id = 'p1'`)).autor_id, 'u1');
  assert.equal((await one(`select post_id from public.community_comments where id = 'c1'`)).post_id, 'p1');
  assert.equal((await one(`select count(*)::int as n from public.analytics`)).n, 2);
  assert.equal((await one(`select dia::text as dia from public.analytics where id = 'day:2026-11-10'`)).dia, '2026-11-10');
  assert.equal((await one(`select ambiente from public.estuvia_meta where id = 'main'`)).ambiente, 'development');
  assert.equal((await one(`select count(*)::int as n from public.estuvia_state`)).n, 1, 'linha antiga preservada');
});

test('a segunda instância lê das tabelas exatamente o que foi importado', () => {
  const expected = structuredClone(LEGACY_MAIN.users);
  assert.equal(stable(B.users.all()), stable(expected));
  assert.equal(B.community.read((c) => c.comments[0].texto), 'Olá');
  assert.equal(B.analytics.read((a) => a.days['2026-11-10'].missao.visitas), 3);
  assert.equal(B.analytics.read((a) => a.ai.mentor.ok), 2);
});

test('conta criada numa instância aparece na outra após syncStore (o bug do login)', async () => {
  await A.users.create({ id: 'u3', email: 'caio@exemplo.test', passwordHash: 'h', tokenVersion: 0, profile: {} });
  assert.equal(B.users.findById('u3'), null, 'antes de sincronizar a outra instância não conhece a conta');
  await B.syncStore();
  assert.equal(B.users.findById('u3')?.email, 'caio@exemplo.test');
});

test('gravação envia só a linha alterada e incrementa a versão dela', async () => {
  const before = await one(`select version from public.users where id = 'u2'`);
  await B.users.update('u3', (u) => { u.profile.apelido = 'Caio'; });
  assert.equal(Number((await one(`select version from public.users where id = 'u3'`)).version), 2);
  assert.equal(Number((await one(`select version from public.users where id = 'u2'`)).version), Number(before.version), 'outras linhas intactas');
  await A.syncStore();
  assert.equal(A.users.findById('u3').profile.apelido, 'Caio');
});

test('conflito: gravação sobre versão velha é recusada, desfeita na memória e a instância se recupera', async () => {
  await A.users.update('u1', (u) => { u.profile.apelido = 'Ana A'; });
  await assert.rejects(B.users.update('u1', (u) => { u.profile.apelido = 'Ana B'; }), (e) => e.code === 'ESTUVIA_CONFLICT');
  assert.equal(B.users.findById('u1').profile.apelido, 'Ana', 'mudança recusada desfeita na memória de B');
  await B.syncStore();
  assert.equal(B.users.findById('u1').profile.apelido, 'Ana A');
  await B.users.update('u1', (u) => { u.profile.cidade = 'Granada'; });
  await A.syncStore();
  assert.deepEqual([A.users.findById('u1').profile.apelido, A.users.findById('u1').profile.cidade], ['Ana A', 'Granada']);
});

test('e-mail duplicado entre instâncias é barrado pelo banco', async () => {
  await assert.rejects(B.users.create({ id: 'u9', email: 'caio@exemplo.test', passwordHash: 'h', tokenVersion: 0, profile: {} }), (e) => e.code === 'ESTUVIA_CONFLICT');
  assert.equal(B.users.findById('u9'), null, 'inserção recusada removida da memória');
  await B.users.update('u3', (u) => { u.profile.ok = true; }); // a instância continua gravando normalmente
});

test('mudança feita no usuário fora de users.update (ex.: uso da IA) também é salva', async () => {
  await A.syncStore();
  A.users.findById('u1').aiUso = { mentor: { mensagens: 1 } };
  A.analytics.mutate((a) => { a.ai.mentor.ok += 1; });
  await A.flush();
  assert.equal((await one(`select data->'aiUso'->'mentor'->>'mensagens' as n from public.users where id = 'u1'`)).n, '1');
  assert.equal((await one(`select data->'mentor'->>'ok' as n from public.analytics where id = 'ai'`)).n, '3');
});

test('comunidade e exclusão de conta se propagam entre instâncias', async () => {
  await A.community.mutate((c) => { c.posts.push({ id: 'p2', autorId: 'u3', titulo: 'Novo', curtidas: [], salvos: [], criadoEm: new Date().toISOString() }); });
  await B.syncStore();
  assert.ok(B.community.read((c) => c.posts.some((p) => p.id === 'p2')));
  await B.community.mutate((c) => { c.posts = c.posts.filter((p) => p.autorId !== 'u3'); });
  await B.users.remove('u3');
  assert.equal((await one(`select count(*)::int as n from public.users where id = 'u3'`)).n, 0);
  await A.syncStore();
  assert.equal(A.users.findById('u3'), null);
  assert.ok(!A.community.read((c) => c.posts.some((p) => p.id === 'p2')));
});

test('ordem das listas é preservada ao recarregar (auditoria)', async () => {
  for (let i = 0; i < 5; i += 1) await A.audit.log({ action: `teste-${i}`, userId: 'u1' });
  const C = await newInstance();
  await C.initStore();
  assert.deepEqual(C.audit.recent(5).map((e) => e.action), ['teste-4', 'teste-3', 'teste-2', 'teste-1', 'teste-0']);
});

test('Radar: importa para as tabelas radar_* e descarta inscrições de usuários inexistentes', async () => {
  const radarLegacy = {
    programs: [{ id: 'prog1', universidadeId: 'ugr', nome: 'Máster X', verificadoEm: '2026-11-01T00:00:00.000Z' }],
    opportunities: [{ id: 'op1', programId: 'prog1', anoAcademico: '2026-2027' }],
    subscriptions: [{ id: 's1', userId: 'u1', opportunityId: 'op1', ativa: true }, { id: 's2', userId: 'fantasma', opportunityId: 'op1' }],
    windows: [{ id: 'w1', fase: 1, abertura: '2027-02-01', encerramento: '2027-03-01' }],
  };
  await pg.query(`insert into public.estuvia_state (id, state) values ('radar', $1::jsonb)`, [JSON.stringify(radarLegacy)]);
  const radar = await import('../server/radar/db.js');
  radar.resetForTests();
  // O Radar consulta os usuários do store.js "oficial" (o que o servidor inicia); as instâncias A/B são cópias.
  await (await import('../server/store.js')).initStore();
  await radar.initRadarStore();
  assert.equal((await one(`select nome from public.radar_programs where id = 'prog1'`)).nome, 'Máster X');
  assert.equal((await one(`select count(*)::int as n from public.radar_subscriptions`)).n, 1, 'inscrição sem usuário ficou de fora');
  assert.equal((await one(`select fase from public.radar_windows where id = 'w1'`)).fase, 1);
  radar.data().programs.push({ id: 'prog2', universidadeId: 'ugr', nome: 'Máster Y' });
  await radar.save();
  assert.equal((await one(`select count(*)::int as n from public.radar_programs`)).n, 2);
  assert.ok(radar.radarStoreHealth().ok);
});

test('barreira DEV × PROD: banco marcado como produção não é aberto (nem importado) em desenvolvimento', async () => {
  const pg2 = await newDatabase();
  database.setRpcForTests(rpcFor(pg2));
  database.setLegacyReaderForTests(legacyFor(pg2));
  await pg2.query(`insert into public.estuvia_state (id, state) values ('main', $1::jsonb)`, [JSON.stringify({ ...LEGACY_MAIN, meta: { ambiente: 'production' } })]);
  const D = await newInstance();
  await assert.rejects(D.initStore(), /marcado como "production"/);
  assert.equal((await pg2.query('select count(*)::int as n from public.users')).rows[0].n, 0, 'nada importado');
  database.setRpcForTests(rpcFor(pg));
  database.setLegacyReaderForTests(legacyFor(pg));
});

test('sem as tabelas (0002 não aplicada) a mensagem diz o que fazer', async () => {
  database.setRpcForTests(async () => { const e = new Error('Could not find the function public.estuvia_changes'); e.code = 'ESTUVIA_NO_SCHEMA'; throw e; });
  const E = await newInstance();
  await assert.rejects(E.initStore(), /aplique supabase\/migrations\/0002_entidades\.sql/);
  database.setRpcForTests(rpcFor(pg));
});
