// Comparação lado a lado das opções salvas (Missão 3.4).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-compare-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

const { compareChoices } = await import('../server/journey-engine.js');
const { missionById } = await import('../server/content/rounds.js');
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

test('uma linha por opção, na ordem do estudante, com idioma e universidade', () => {
  const rows = compareChoices({ profile: { espanhol: 'B2' }, choices: ['us-demo-adm', 'ugr-demo-eng', 'nao-existe'] });
  assert.deepEqual(rows.map((r) => [r.posicao, r.id]), [[1, 'us-demo-adm'], [2, 'ugr-demo-eng'], [3, 'nao-existe']]);
  assert.equal(rows[0].universidade.sigla, 'US');
  assert.ok(rows[0].idioma?.status, 'idioma vem da elegibilidade da Missão 1.4');
  assert.equal(rows[0].temFichaDua, false);
  assert.equal(rows[0].graduacao, null, 'sem ficha do DUA: sem comparação de graduação');
  assert.equal(rows[2].indisponivel, true);
  assert.deepEqual(compareChoices({ profile: {} }), []);
});

test('Missão 3.4 oferece a comparação como ferramenta', () => {
  assert.equal(missionById('3.4').ferramenta, 'comparar-opcoes');
});

test('GET /me/choices/compare devolve as opções salvas do usuário logado', async () => {
  let cookie = '';
  const req = async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'travessia', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, data: await res.json() };
  };
  assert.equal((await req('GET', '/me/choices/compare')).status, 401);
  assert.equal((await req('POST', '/auth/register', { nome: 'Bia Compara', email: 'bia-compara@exemplo.com', senha: 'segura123', aceite: true, maiorIdade: true })).status, 201);
  assert.deepEqual((await req('GET', '/me/choices/compare')).data.opcoes, []);
  assert.equal((await req('PUT', '/me/choices', { choices: ['ugr-demo-arq', 'uma-demo-tur'] })).status, 200);
  const r = await req('GET', '/me/choices/compare');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.opcoes.map((o) => o.id), ['ugr-demo-arq', 'uma-demo-tur']);
  assert.equal(r.data.opcoes[1].universidade.sigla, 'UMA');
});
