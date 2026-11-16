// Garantia: a plataforma não tem mestrados demonstrativos. Toda jornada aponta para um mestrado do Radar
// (fichas oficiais do Distrito Único Andaluz); IDs dos antigos exemplos do protótipo são recusados.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-semdemo-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

const { PROGRAMAS, DIBUJO_B1, ASIA_B2 } = await import('./fixtures/programas-reais.js');
const catalog = await import('../server/content/catalog.js');
const { SOURCES } = await import('../server/content/sources.js');
const { createApp } = await import('../server/app.js');
const { flush } = await import('../server/store.js');

let server;
let base;
before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  server.close();
  await flush();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const ANTIGOS = ['ugr-demo-eng', 'ugr-demo-arq', 'ugr-demo-ciencias', 'us-demo-adm', 'uma-demo-tur'];

test('catálogo local só tem universidades; não existe programa nem fonte demonstrativa', () => {
  assert.equal(catalog.PROGRAMS, undefined);
  for (const id of ANTIGOS) assert.equal(catalog.programById(id), null, id);
  assert.ok(!SOURCES.some((s) => s.id === 'DEMO' || s.tipo === 'demo'));
});

test('fixture dos testes: só mestrados reais do DUA, com código e fonte oficial', () => {
  for (const p of Object.values(PROGRAMAS)) {
    assert.equal(p.radar, true, p.id);
    assert.equal('demo' in p, false, p.id);
    assert.match(p.duaCodigo, /^\d{6}$/, p.id);
    assert.ok(['O30', 'O10'].includes(p.idioma.fonte), p.id);
  }
  assert.equal(PROGRAMAS[ASIA_B2].idioma.nivel, 'B2');
  // A ficha oficial 407101 escreve "B1 ACRDITADO" (erro de digitação): continua sendo comprovação exigida.
  assert.match(PROGRAMAS[DIBUJO_B1].idioma.texto, /ACRDITADO/);
  assert.equal(PROGRAMAS[DIBUJO_B1].idioma.certificado, true);
});

test('API recusa criar jornada com ID de exemplo do protótipo', async () => {
  let cookie = '';
  const req = async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'travessia', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, data: await res.json() };
  };
  assert.equal((await req('POST', '/auth/register', { nome: 'Caio Real', email: 'caio-real@exemplo.com', senha: 'segura123', aceite: true, maiorIdade: true })).status, 201);
  for (const id of ANTIGOS) assert.equal((await req('POST', '/journeys', { programaId: id, anoAcademico: '2027/28' })).status, 400, id);
  const cat = await req('GET', '/content/catalog');
  assert.equal(cat.status, 200);
  assert.equal(cat.data.programs, undefined);
  assert.equal(cat.data.universities.length, 10);
});

test('migração: jornada antiga com mestrado de exemplo fica com o mestrado a definir na mesma universidade', async () => {
  const { dropRemovedDemoPrograms } = await import('../server/store.js');
  const data = { users: [
    { id: 'a', choices: ['ugr-demo-eng', ASIA_B2, 'uma-demo-tur'], journeys: [{ id: 'j1', programaId: 'ugr-demo-eng', universidadeId: 'ugr' }, { id: 'j2', programaId: 'uma-demo-tur' }, { id: 'j3', programaId: ASIA_B2, universidadeId: 'ugr' }] },
    { id: 'b', choices: [], journeys: [{ id: 'j4', programaId: null, universidadeId: 'us' }] },
  ] };
  assert.equal(dropRemovedDemoPrograms(data), 1);
  const [a, b] = data.users;
  assert.deepEqual(a.journeys.map((j) => [j.programaId, j.universidadeId]), [[null, 'ugr'], [null, 'uma'], [ASIA_B2, 'ugr']]);
  assert.deepEqual(a.choices, [ASIA_B2]);
  assert.equal(b.updatedAt, undefined, 'quem não tinha exemplo não é tocado');
  assert.equal(dropRemovedDemoPrograms(data), 0, 'idempotente');
});
