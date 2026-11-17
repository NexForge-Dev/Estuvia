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

const MIGRATIONS = ['0001_estuvia_state.sql', '0002_entidades.sql', '0003_permissoes.sql']
  .map((f) => fs.readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8')).join('\n');

async function newDatabase() {
  const pg = new PGlite();
  await pg.exec('create role anon; create role authenticated; create role service_role bypassrls;'); // como no Supabase
  await pg.exec(MIGRATIONS);
  return pg;
}

// Como o servidor no Supabase: tudo roda com o papel service_role (a chave secret), não como superusuário,
// para que as permissões das migrations também sejam testadas.
const asService = (pg, sql, params) => pg.transaction(async (tx) => {
  await tx.query('set local role service_role');
  return (await tx.query(sql, params)).rows;
});
// Mesmo contrato de database.rpc(): os erros passam pela mesma classificação (database.rpcError).
const rpcFor = (pg) => async (name, args) => {
  try {
    if (name === 'estuvia_apply') return (await asService(pg, 'select public.estuvia_apply($1::jsonb) as r', [JSON.stringify(args.p_ops)]))[0].r;
    if (name === 'estuvia_changes') return (await asService(pg, 'select public.estuvia_changes($1::bigint, $2::text[]) as r', [args.p_since, args.p_tables]))[0].r;
    throw new Error(`rpc desconhecida: ${name}`);
  } catch (e) {
    throw database.rpcError(e.message);
  }
};
// Mesmo SELECT paginado de database.readEntityPage (o Supabase faz isso pela API REST).
const pageFor = (pg) => async (table, after, limit) => {
  if (!/^[a-z_]+$/.test(table)) throw new Error('tabela inválida');
  return asService(pg, `select id, version, seq, ins_seq, data from public.${table} where ins_seq > $1 order by ins_seq limit $2`, [after, limit]);
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
  database.setPageReaderForTests(pageFor(pg));
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

test('conflito: gravação sobre versão velha traz a versão nova e reaplica a mudança (nada se perde, sem erro)', async () => {
  await A.users.update('u1', (u) => { u.profile.cidade = 'Granada'; });
  // B ainda tem a versão antiga de u1: o banco recusa, B sincroniza e aplica a mesma mutação sobre a versão de A.
  const u = await B.users.update('u1', (x) => { x.profile.apelido = 'Ana B'; });
  assert.deepEqual([u.profile.apelido, u.profile.cidade], ['Ana B', 'Granada']);
  const row = await one(`select data->'profile'->>'apelido' as a, data->'profile'->>'cidade' as c from public.users where id = 'u1'`);
  assert.deepEqual([row.a, row.c], ['Ana B', 'Granada'], 'as duas mudanças estão no banco');
  await A.syncStore();
  assert.deepEqual([A.users.findById('u1').profile.apelido, A.users.findById('u1').profile.cidade], ['Ana B', 'Granada']);
});

test('duas instâncias curtindo o mesmo post ao mesmo tempo: as duas curtidas ficam', async () => {
  await A.syncStore();
  await B.syncStore();
  const like = (inst, uid) => inst.community.mutate((c) => { const p = c.posts.find((x) => x.id === 'p1'); if (!p.curtidas.includes(uid)) p.curtidas.push(uid); });
  await Promise.all([like(A, 'u1'), like(B, 'u3')]);
  const { curtidas } = await one(`select data->'curtidas' as curtidas from public.community_posts where id = 'p1'`);
  assert.deepEqual([...curtidas].sort(), ['u1', 'u2', 'u3']);
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

test('carga paginada (várias páginas por tabela) traz exatamente o mesmo que a carga de uma vez', async () => {
  for (let i = 0; i < 7; i++) await A.users.create({ id: `pag${i}`, email: `pag${i}@exemplo.test`, passwordHash: 'h', tokenVersion: 0, profile: { apelido: `P${i}` } });
  process.env.ENTITY_PAGE_ROWS = '2';
  try {
    const paged = await newInstance();
    await paged.initStore();
    database.setPageReaderForTests(null);
    database.setRpcForTests(rpcFor(pg));
    const once = await newInstance(); // sem leitor paginado: estuvia_changes com tudo
    await once.initStore();
    database.setPageReaderForTests(pageFor(pg));
    assert.deepEqual(paged.users.all().map((u) => u.id), once.users.all().map((u) => u.id), 'mesma ordem');
    assert.equal(stable(paged.users.all()), stable(once.users.all()));
    assert.ok(paged.users.findById('pag6'));
    // Depois da carga paginada, o sync incremental continua funcionando.
    await A.users.update('pag6', (u) => { u.profile.apelido = 'Mudou'; });
    await paged.syncStore();
    assert.equal(paged.users.findById('pag6').profile.apelido, 'Mudou');

    // Sync que estoura o tempo-limite (mudanças demais de uma vez): recarrega em páginas, inclusive exclusões.
    await A.users.update('pag5', (u) => { u.profile.apelido = 'Grande'; });
    await A.users.remove('pag4');
    const normal = rpcFor(pg);
    database.setRpcForTests(async (name, args) => {
      if (name === 'estuvia_changes' && args.p_since !== Number.MAX_SAFE_INTEGER) throw new Error('Supabase: canceling statement due to statement timeout');
      return normal(name, args);
    });
    await paged.syncStore();
    database.setRpcForTests(normal);
    assert.equal(paged.users.findById('pag5').profile.apelido, 'Grande');
    assert.equal(paged.users.findById('pag4'), null, 'exclusão feita em outra instância também chega');
    await paged.syncStore(); // e o sync incremental volta a funcionar depois
  } finally {
    delete process.env.ENTITY_PAGE_ROWS;
    database.setRpcForTests(rpcFor(pg));
  }
});

test('barreira DEV × PROD: banco marcado como produção não é aberto (nem importado) em desenvolvimento', async () => {
  const pg2 = await newDatabase();
  database.setRpcForTests(rpcFor(pg2));
  database.setPageReaderForTests(pageFor(pg2));
  database.setLegacyReaderForTests(legacyFor(pg2));
  await pg2.query(`insert into public.estuvia_state (id, state) values ('main', $1::jsonb)`, [JSON.stringify({ ...LEGACY_MAIN, meta: { ambiente: 'production' } })]);
  const D = await newInstance();
  await assert.rejects(D.initStore(), /marcado como "production"/);
  assert.equal((await pg2.query('select count(*)::int as n from public.users')).rows[0].n, 0, 'nada importado');
  database.setRpcForTests(rpcFor(pg));
  database.setPageReaderForTests(pageFor(pg));
  database.setLegacyReaderForTests(legacyFor(pg));
});

test('sem as tabelas (0002 não aplicada) a mensagem diz o que fazer', async () => {
  database.setRpcForTests(async () => { const e = new Error('Could not find the function public.estuvia_changes'); e.code = 'ESTUVIA_NO_SCHEMA'; throw e; });
  const E = await newInstance();
  await assert.rejects(E.initStore(), /aplique supabase\/migrations\/0002_entidades\.sql/);
  database.setRpcForTests(rpcFor(pg));
});

test('texto com NUL ou surrogate solto (recusados pelo jsonb) é gravado limpo e não trava as gravações seguintes', async () => {
  await A.syncStore();
  await A.users.update('u1', (u) => { u.profile.bio = 'a\u0000b \ud800 c'; u.profile['ch\u0000ave'] = 1; });
  const row = await one(`select data->'profile'->>'bio' as bio, data->'profile' ? 'chave' as chave from public.users where id = 'u1'`);
  assert.equal(row.bio, 'ab \ufffd c');
  assert.equal(row.chave, true);
  await A.users.update('u2', (u) => { u.profile.depois = true; }); // a instância segue gravando
  assert.equal((await one(`select data->'profile'->>'depois' as d from public.users where id = 'u2'`)).d, 'true');
  assert.ok(A.storeHealth().ok);
});

test('chave estrangeira violada (post excluído por outra instância) vira conflito: desfeito e a instância se recupera', async () => {
  await A.syncStore();
  await B.syncStore();
  await A.community.mutate((c) => { c.posts.push({ id: 'pfk', autorId: 'u1', curtidas: [], salvos: [] }); });
  await B.syncStore();
  await A.community.mutate((c) => { c.posts = c.posts.filter((p) => p.id !== 'pfk'); });
  // B ainda não sabe da exclusão e comenta no post.
  await assert.rejects(B.community.mutate((c) => { c.comments.push({ id: 'cfk', postId: 'pfk', autorId: 'u2', texto: 'oi' }); }), (e) => e.code === 'ESTUVIA_CONFLICT');
  assert.ok(!B.community.read((c) => c.comments.some((x) => x.id === 'cfk')), 'comentário órfão saiu da memória');
  await B.syncStore();
  await B.users.update('u2', (u) => { u.profile.fk = 'ok'; }); // sem isto, toda gravação seguinte de B falharia
  assert.equal((await one(`select data->'profile'->>'fk' as v from public.users where id = 'u2'`)).v, 'ok');
});

test('conflito desfaz mudanças de outra requisição na fila: as duas são reaplicadas e gravadas (nenhuma responde "salvo" sem estar salva)', async () => {
  await A.syncStore();
  await B.syncStore();
  await A.users.update('u1', (u) => { u.profile.fila = 'A'; });
  // Duas requisições em B antes de a fila andar: a primeira conflita (u1 velho) e desfaz também a segunda (u2).
  const p1 = B.users.update('u1', (u) => { u.profile.fila = 'B'; });
  const p2 = B.users.update('u2', (u) => { u.profile.fila = 'B2'; });
  await Promise.all([p1, p2]);
  assert.equal((await one(`select data->'profile'->>'fila' as v from public.users where id = 'u1'`)).v, 'B');
  assert.equal((await one(`select data->'profile'->>'fila' as v from public.users where id = 'u2'`)).v, 'B2');
});

test('conflito que persiste depois das novas tentativas chega como ESTUVIA_CONFLICT (a rota responde 409)', async () => {
  await A.syncStore();
  await B.syncStore();
  await A.community.mutate((c) => { c.posts.push({ id: 'pgone', autorId: 'u1', curtidas: [], salvos: [] }); });
  await B.syncStore();
  await A.community.mutate((c) => { c.posts = c.posts.filter((p) => p.id !== 'pgone'); });
  // Mutação "cega" (não confere se o post existe): toda tentativa viola a chave estrangeira.
  await assert.rejects(B.community.mutate((c) => { c.comments.push({ id: 'cgone', postId: 'pgone', autorId: 'u2', texto: 'oi' }); }), (e) => e.code === 'ESTUVIA_CONFLICT');
  await B.users.update('u2', (u) => { u.profile.depoisDoConflito = true; });
  assert.ok(B.storeHealth);
});

test('Radar: conflito desfaz mudanças de outra chamada na fila: ela também recebe erro (não responde "salvo")', async () => {
  const R1 = await import('../server/radar/db.js'); // já iniciado no teste do Radar acima
  const R2 = await import('../server/radar/db.js?instancia=r2');
  await R2.initRadarStore(); // segunda instância: lê as tabelas radar_*
  R1.data().programs.find((p) => p.id === 'prog1').nome = 'Máster X (R1)';
  await R1.save();
  // R2 ainda tem prog1 na versão velha. Duas chamadas antes de a fila andar: a primeira conflita.
  R2.data().programs.find((p) => p.id === 'prog1').nome = 'Máster X (R2)';
  const p1 = R2.save();
  R2.data().programs.find((p) => p.id === 'prog2').nome = 'Máster Y (R2)';
  const p2 = R2.save();
  await assert.rejects(p1, (e) => e.code === 'ESTUVIA_CONFLICT');
  await assert.rejects(p2, (e) => e.code === 'ESTUVIA_CONFLICT');
  assert.equal(R2.data().programs.find((p) => p.id === 'prog2').nome, 'Máster Y', 'mudança desfeita na memória');
  assert.equal((await one(`select nome from public.radar_programs where id = 'prog2'`)).nome, 'Máster Y');
  await R2.syncRadarStore();
  R2.data().programs.find((p) => p.id === 'prog2').nome = 'Máster Y2';
  await R2.save(); // depois do conflito, volta a gravar
  assert.equal((await one(`select nome from public.radar_programs where id = 'prog2'`)).nome, 'Máster Y2');
});

test('Radar: escrita de estudante (mutateRadar) sobre versão velha traz a nova e reaplica, sem erro', async () => {
  const R1 = await import('../server/radar/db.js');
  const R2 = await import('../server/radar/db.js?instancia=r2');
  await R1.syncRadarStore();
  await R2.syncRadarStore();
  R1.data().programs.find((p) => p.id === 'prog1').nome = 'Máster X (R1 de novo)';
  await R1.save();
  // R2 ainda tem prog1 velho: a primeira tentativa conflita, a segunda grava sobre a versão de R1.
  await R2.mutateRadar((d) => { d.programs.find((p) => p.id === 'prog1').descricaoEstudante = 'nota de R2'; });
  const row = await one(`select nome, data->>'descricaoEstudante' as nota from public.radar_programs where id = 'prog1'`);
  assert.deepEqual([row.nome, row.nota], ['Máster X (R1 de novo)', 'nota de R2'], 'as duas mudanças ficaram');
});

test('Radar lido em paralelo com a base principal: gravações só liberadas depois dela, e falha nela barra o Radar', async () => {
  // Base principal ainda carregando: a leitura do Radar termina, mas initRadarStore só resolve depois dela.
  const R3 = await import('../server/radar/db.js?instancia=r3');
  let liberar;
  const main = new Promise((r) => { liberar = r; });
  let pronto = false;
  const radar = R3.initRadarStore(main).then(() => { pronto = true; });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(pronto, false, 'não libera o Radar antes da base principal');
  liberar();
  await radar;
  assert.equal(R3.data().programs.find((p) => p.id === 'prog2')?.nome, 'Máster Y2', 'leu as tabelas radar_*');

  // Base principal falhou (ex.: barreira DEV × PROD): o Radar falha junto e não grava nada.
  const R4 = await import('../server/radar/db.js?instancia=r4');
  await assert.rejects(R4.initRadarStore(Promise.reject(new Error('barreira'))), /barreira/);
  R4.data().programs.find((p) => p.id === 'prog2').nome = 'não pode gravar';
  await R4.save().catch(() => {}); // sem sincronizador liberado: nada vai ao banco
  assert.equal((await one(`select nome from public.radar_programs where id = 'prog2'`)).nome, 'Máster Y2');
});
