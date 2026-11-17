// Hash de senha com parâmetros da OWASP (scrypt N=2^15, r=8, p=3) e migração transparente do formato antigo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-hash-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.RADAR_DATA_FILE = path.join(tmp, 'radar.json');
process.env.RADAR_SCHEDULER = 'off';
process.env.RATE_LIMIT_SCALE = '10';

const { createApp } = await import('../server/app.js');
const { flush, users } = await import('../server/store.js');
const { initRadar } = await import('../server/radar/service.js');
const { hashPassword, verifyPassword, needsRehash } = await import('../server/security.js');

let server;
let base;
before(async () => {
  await initRadar();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  server.close();
  await flush();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const post = async (url, body) => {
  const res = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'travessia' }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};

// Hash no formato antigo (scrypt$sal$hash, N=2^14), como o servidor gravava até 2026-11-17.
async function legacyHash(password) {
  const salt = crypto.randomBytes(16);
  const hash = await promisify(crypto.scrypt)(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

test('hash novo usa os parâmetros atuais e confere a senha', async () => {
  const h = await hashPassword('segura123');
  assert.match(h, /^scrypt\$ln=15,r=8,p=3\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.equal(await verifyPassword('segura123', h), true);
  assert.equal(await verifyPassword('errada123', h), false);
  assert.equal(needsRehash(h), false);
});

test('hash antigo continua valendo e é marcado para refazer', async () => {
  const h = await legacyHash('segura123');
  assert.equal(await verifyPassword('segura123', h), true);
  assert.equal(await verifyPassword('errada123', h), false);
  assert.equal(needsRehash(h), true);
});

test('hash malformado ou com parâmetros absurdos é recusado sem travar', async () => {
  for (const bad of ['', 'bcrypt$x$y', 'scrypt$', 'scrypt$ln=30,r=8,p=1$aa$bb', 'scrypt$ln=15,r=8$aa$bb', 'scrypt$ln=15,r=8,p=3$aa$']) {
    assert.equal(await verifyPassword('segura123', bad), false, bad);
    assert.equal(needsRehash(bad), false, bad);
  }
});

test('login com hash antigo refaz o hash sem derrubar a sessão', async () => {
  const EMAIL = 'rehash@hash.dev';
  assert.equal((await post('/auth/register', { nome: 'Ana Reis', email: EMAIL, senha: 'segura123', aceite: true, maiorIdade: true })).status, 201);
  const u = users.findByEmail(EMAIL);
  u.passwordHash = await legacyHash('segura123');
  const versao = u.tokenVersion;

  assert.equal((await post('/auth/login', { email: EMAIL, senha: 'errada123' })).status, 401);
  assert.equal(needsRehash(users.findByEmail(EMAIL).passwordHash), true, 'senha errada não refaz o hash');

  assert.equal((await post('/auth/login', { email: EMAIL, senha: 'segura123' })).status, 200);
  const depois = users.findByEmail(EMAIL);
  assert.match(depois.passwordHash, /^scrypt\$ln=15,r=8,p=3\$/);
  assert.equal(depois.tokenVersion, versao, 'sessões abertas continuam válidas');
  assert.equal((await post('/auth/login', { email: EMAIL, senha: 'segura123' })).status, 200);
});
