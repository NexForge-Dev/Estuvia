// Bloqueio por conta depois de 10 senhas erradas em 15 min: vale entre instâncias porque fica no registro do estudante.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-lock-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.RADAR_DATA_FILE = path.join(tmp, 'radar.json');
process.env.RADAR_SCHEDULER = 'off';
process.env.RATE_LIMIT_SCALE = '10'; // o limite por IP não interfere: o teste é do bloqueio por conta

const { createApp } = await import('../server/app.js');
const { flush, users } = await import('../server/store.js');
const { initRadar } = await import('../server/radar/service.js');

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
const EMAIL = 'lia@lock.dev';
const SENHA = 'segura123';

test('10 senhas erradas bloqueiam a conta por 15 min, mesmo com a senha certa', async () => {
  assert.equal((await post('/auth/register', { nome: 'Lia Costa', email: EMAIL, senha: SENHA, aceite: true, maiorIdade: true })).status, 201);
  for (let i = 0; i < 9; i++) assert.equal((await post('/auth/login', { email: EMAIL, senha: `errada${i}x` })).status, 401);
  // A 9ª falha ainda não bloqueia; a senha certa zera o contador.
  assert.equal((await post('/auth/login', { email: EMAIL, senha: SENHA })).status, 200);
  assert.equal(users.findByEmail(EMAIL).loginFalhas, undefined);
  for (let i = 0; i < 10; i++) await post('/auth/login', { email: EMAIL, senha: `errada${i}y` });
  const locked = await post('/auth/login', { email: EMAIL, senha: SENHA });
  assert.equal(locked.status, 429);
  assert.match(locked.data.error, /Esqueci minha senha/);
  assert.ok(users.findByEmail(EMAIL).loginLock?.ate, 'o bloqueio fica no registro (persistido)');
});

test('o bloqueio vence sozinho e o login certo limpa o registro', async () => {
  users.findByEmail(EMAIL).loginLock.ate = new Date(Date.now() - 1000).toISOString();
  const r = await post('/auth/login', { email: EMAIL, senha: SENHA });
  assert.equal(r.status, 200);
  assert.equal(users.findByEmail(EMAIL).loginLock, undefined);
});

test('e-mail sem conta continua respondendo 401 (sem bloqueio a revelar)', async () => {
  for (let i = 0; i < 12; i++) assert.equal((await post('/auth/login', { email: 'ninguem@lock.dev', senha: `x${i}errada` })).status, 401);
});
