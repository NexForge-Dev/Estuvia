import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'travessia-conq-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

const { default: express } = await import('express');
const { default: cookieParser } = await import('cookie-parser');
const { createApp } = await import('../server/app.js');
const { flush } = await import('../server/store.js');
const { default: achievementsRoutes } = await import('../server/routes/achievements.js');
const { PROGRAMS } = await import('../server/content/catalog.js');
const { ACHIEVEMENTS } = await import('../server/content/achievements.js');
const { evaluate, syncRecord, markSeen } = await import('../server/achievements-engine.js');

let server;
let base;

before(async () => {
  // Monta a rota na frente do app (funciona com ou sem o registro em server/app.js).
  const app = express();
  app.use('/api/achievements', express.json(), cookieParser(), achievementsRoutes);
  app.use(createApp());
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  server.close();
  await flush();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function client() {
  let cookie = '';
  return async (method, url, body) => {
    const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'travessia' };
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, data: await res.json() };
  };
}

const won = (data) => new Set(data.conquistas.filter((a) => a.conquistada).map((a) => a.id));

test('toda conquista do catálogo tem regra, nível e categoria válidos', () => {
  const list = evaluate({ profile: {} });
  assert.equal(list.length, ACHIEVEMENTS.length);
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
  list.forEach((a) => {
    assert.equal(a.conquistada, false, a.id);
    assert.ok(['bronze', 'prata', 'ouro'].includes(a.nivel), a.id);
    assert.ok(a.pontos > 0 && a.categoriaLabel, a.id);
  });
});

test('registro guarda a primeira data e a celebração vista', () => {
  const list = [{ id: 'a', conquistada: true }, { id: 'b', conquistada: false }];
  const { registro, changed } = syncRecord({}, list, '2026-10-24T10:00:00.000Z');
  assert.ok(changed);
  assert.deepEqual(registro, { a: { em: '2026-10-24T10:00:00.000Z' } });
  assert.equal(syncRecord(registro, list).changed, false);
  assert.ok(markSeen(registro, ['a', 'b']).a.vistaEm);
  assert.equal(markSeen(registro, ['b']).b, undefined);
});

test('vaga e visto registrados na situação da jornada liberam conquistas', async () => {
  const req = client();
  assert.equal((await req('POST', '/auth/register', { nome: 'Ana Souza', email: 'ana@exemplo.com', senha: 'segura123', aceite: true })).status, 201);

  let r = await req('GET', '/achievements');
  assert.equal(r.status, 200);
  assert.equal(r.data.resumo.conquistadas, 0);

  const jr = await req('POST', '/journeys', { programaId: PROGRAMS[0].id });
  assert.equal(jr.status, 201);
  const jid = jr.data.journey.id;

  r = await req('GET', '/achievements');
  assert.ok(won(r.data).has('primeiro-passo'));
  assert.deepEqual(r.data.novas.map((a) => a.id), ['primeiro-passo']);
  assert.ok(r.data.novas[0].em);

  for (const [campo, valor] of [['adjudicacao', 'admitido'], ['matricula', 'vaga-confirmada'], ['visto', 'aprovado']]) {
    assert.equal((await req('PUT', `/journeys/${jid}/situacao`, { campo, valor })).status, 200);
  }
  r = await req('GET', '/achievements');
  ['candidatura-enviada', 'admitido', 'vaga-garantida', 'visto-aprovado'].forEach((id) => assert.ok(won(r.data).has(id), id));
  assert.equal(won(r.data).has('matriculado'), false);

  // Celebração vista não se repete.
  assert.equal((await req('POST', '/achievements/seen', { ids: r.data.novas.map((a) => a.id) })).status, 200);
  r = await req('GET', '/achievements');
  assert.equal(r.data.novas.length, 0);

  // Corrigir a situação desfaz a conquista (o estado vem dos fatos, não de um contador).
  await req('PUT', `/journeys/${jid}/situacao`, { campo: 'visto', valor: 'em-analise' });
  r = await req('GET', '/achievements');
  assert.equal(won(r.data).has('visto-aprovado'), false);

  assert.equal((await req('POST', '/achievements/seen', { ids: ['inexistente'] })).status, 400);
});

test('conquistas exigem login', async () => {
  assert.equal((await client()('GET', '/achievements')).status, 401);
});
