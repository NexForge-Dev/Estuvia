import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Modo produção: listas de e-mail não concedem papéis e a senha do admin precisa de ≥ 12 caracteres.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-prod-'));
process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = 'x'.repeat(48);
process.env.DOCUMENTS_KEY = 'k'.repeat(48);
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
process.env.MODERATOR_EMAILS = 'mod@exemplo.com';
process.env.RADAR_ADMIN_EMAILS = 'radar@exemplo.com';
process.env.ADMIN_EMAIL = 'chefe@exemplo.com';
process.env.ADMIN_PASSWORD = 'senha12345'; // 10 caracteres: aceita em dev, recusada em produção
process.env.RADAR_SCHEDULER = 'off';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;
process.env.MENTOR_PROVIDER = 'none';

const { createApp } = await import('../server/app.js');
const { flush, users } = await import('../server/store.js');
const { ensureAdminAccount } = await import('../server/admin-seed.js');

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

function client() {
  let cookie = '';
  return async (method, url, body) => {
    const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'travessia' };
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, data: await res.json().catch(() => ({})), setCookie: set };
  };
}

test('produção: senha curta do admin não cria a conta', async () => {
  assert.equal(await ensureAdminAccount(), null);
  assert.equal(users.findByEmail('chefe@exemplo.com'), null);
});

test('produção: MODERATOR_EMAILS e RADAR_ADMIN_EMAILS não concedem papel a quem se cadastra', async () => {
  const mod = client();
  const r = await mod('POST', '/auth/register', { nome: 'Mod Falso', email: 'mod@exemplo.com', senha: 'segura123', aceite: true, maiorIdade: true });
  assert.equal(r.status, 201);
  assert.match(r.setCookie, /HttpOnly/i);
  assert.match(r.setCookie, /Secure/i);
  assert.match(r.setCookie, /SameSite=Strict/i);
  assert.equal(r.data.user.moderador, false);

  const radar = client();
  await radar('POST', '/auth/register', { nome: 'Radar Falso', email: 'radar@exemplo.com', senha: 'segura123', aceite: true, maiorIdade: true });
  assert.equal((await radar('GET', '/radar/admin')).status, 403);
});
