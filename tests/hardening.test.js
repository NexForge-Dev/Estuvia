import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Base isolada. ADMIN_PASSWORD fraca de propósito: a conta admin NÃO é criada, e o e-mail
// configurado não pode virar admin só porque alguém se cadastrou com ele.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-hard-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
process.env.ADMIN_EMAIL = 'chefe@exemplo.com';
process.env.ADMIN_PASSWORD = 'curta1';
process.env.RADAR_SCHEDULER = 'off';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;
process.env.MENTOR_PROVIDER = 'none';

const { createApp } = await import('../server/app.js');
const { flush } = await import('../server/store.js');
const { ensureAdminAccount } = await import('../server/admin-seed.js');

let server;
let base;
before(async () => {
  assert.equal(await ensureAdminAccount(), null);
  server = createApp().listen(0);
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
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
}

test('o e-mail do ADMIN_EMAIL é reservado: cadastro com ele é recusado', async () => {
  const r = await client()('POST', '/auth/register', { nome: 'Intruso', email: 'Chefe@Exemplo.com', senha: 'segura123', aceite: true, maiorIdade: true });
  assert.equal(r.status, 409);
});

test('papel vem só do servidor: e-mail parecido com o da equipe não dá acesso ao painel', async () => {
  const c = client();
  assert.equal((await c('POST', '/auth/register', { nome: 'Bia', email: 'bia@exemplo.com', senha: 'segura123', aceite: true, maiorIdade: true })).status, 201);
  const me = await c('GET', '/me');
  assert.equal(me.data.user.admin, false);
  assert.equal((await c('GET', '/admin/overview')).status, 403);
  assert.equal((await c('POST', '/admin/users/x/role', { papel: 'moderador' })).status, 403);
});

test('falha ao gravar a base vira erro 500 (nunca "salvo"), o servidor segue de pé e /health avisa', async () => {
  const c = client();
  assert.equal((await c('POST', '/auth/register', { nome: 'Caio', email: 'caio@exemplo.com', senha: 'segura123', aceite: true, maiorIdade: true })).status, 201);
  await flush();
  // Um diretório no lugar do arquivo faz o rename atômico falhar.
  fs.rmSync(process.env.DATA_FILE);
  fs.mkdirSync(process.env.DATA_FILE);
  const r = await c('PUT', '/me/profile', { nome: 'Caio Novo' });
  assert.equal(r.status, 500);
  assert.doesNotMatch(JSON.stringify(r.data), /EISDIR|EPERM|rename|db\.json/);
  const health = await c('GET', '/health');
  assert.equal(health.status, 503);
  assert.equal(health.data.ok, false);

  fs.rmSync(process.env.DATA_FILE, { recursive: true });
  assert.equal((await c('PUT', '/me/profile', { nome: 'Caio Novo' })).status, 200);
  assert.equal((await c('GET', '/health')).status, 200);
  assert.match(fs.readFileSync(process.env.DATA_FILE, 'utf8'), /Caio Novo/);
});
