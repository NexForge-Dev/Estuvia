// Recuperação de senha por e-mail: resposta que não revela contas, token de uso único com validade,
// troca de senha encerra sessões e o token nunca aparece na exportação de dados.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reset-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.RADAR_DATA_FILE = path.join(tmp, 'radar.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
process.env.DOCS_DIR = path.join(tmp, 'docfiles');
process.env.DOC_RULES_FILE = path.join(tmp, 'document-rules.json');
process.env.RADAR_SCHEDULER = 'off';
process.env.RESEND_API_KEY = 'test-key';
process.env.EMAIL_FROM = 'Estuvia <no-reply@example.test>';

// Provedor de e-mail falso: captura o que seria enviado ao Resend, sem rede.
const sent = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://api.resend.com/')) {
    sent.push(JSON.parse(init.body));
    return new Response('{"id":"x"}', { status: 200 });
  }
  return realFetch(url, init);
};

const { createApp } = await import('../server/app.js');
const { flush, users } = await import('../server/store.js');

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
  globalThis.fetch = realFetch;
  fs.rmSync(tmp, { recursive: true, force: true });
});

function client() {
  let cookie = '';
  return async (method, url, body) => {
    const headers = { 'X-Requested-With': 'travessia', 'Content-Type': 'application/json' };
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(base + url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, data: await res.json().catch(() => null) };
  };
}

test('recuperação de senha: resposta neutra, token de uso único, sessões encerradas', async () => {
  const ana = client();
  assert.equal((await ana('POST', '/auth/register', { nome: 'Ana Reset', email: 'ana@reset.dev', senha: 'antiga123', aceite: true })).status, 201);

  // E-mail inexistente: mesma resposta, nada enviado.
  const ghost = await client()('POST', '/auth/forgot-password', { email: 'ninguem@reset.dev' });
  assert.equal(ghost.status, 200);
  assert.equal(sent.length, 0);

  const r = await client()('POST', '/auth/forgot-password', { email: 'ANA@reset.dev' });
  assert.equal(r.status, 200);
  assert.equal(r.data.message, ghost.data.message);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ['ana@reset.dev']);
  const token = sent[0].text.match(/#\/redefinir-senha\/([\w-]+)/)[1];
  // Só o hash fica na base.
  const stored = users.findByEmail('ana@reset.dev').passwordReset;
  assert.ok(stored.hash && stored.hash !== token);

  // O token não aparece na exportação.
  const exp = await ana('GET', '/me/export');
  assert.equal(exp.status, 200);
  assert.equal(exp.data.passwordReset, undefined);

  assert.equal((await client()('POST', '/auth/reset-password', { token: 'x'.repeat(43), senha: 'nova12345' })).status, 400);
  assert.equal((await client()('POST', '/auth/reset-password', { token, senha: 'curta' })).status, 400);
  assert.equal((await client()('POST', '/auth/reset-password', { token, senha: 'nova12345' })).status, 200);
  // Uso único.
  assert.equal((await client()('POST', '/auth/reset-password', { token, senha: 'outra12345' })).status, 400);

  // A sessão antiga caiu; a senha antiga não entra mais; a nova entra.
  assert.equal((await ana('GET', '/me')).status, 401);
  assert.equal((await client()('POST', '/auth/login', { email: 'ana@reset.dev', senha: 'antiga123' })).status, 401);
  assert.equal((await client()('POST', '/auth/login', { email: 'ana@reset.dev', senha: 'nova12345' })).status, 200);
});

test('token expirado é recusado', async () => {
  assert.equal((await client()('POST', '/auth/register', { nome: 'Bia Reset', email: 'bia@reset.dev', senha: 'antiga123', aceite: true })).status, 201);
  const before = sent.length;
  assert.equal((await client()('POST', '/auth/forgot-password', { email: 'bia@reset.dev' })).status, 200);
  const token = sent[before].text.match(/#\/redefinir-senha\/([\w-]+)/)[1];
  await users.update(users.findByEmail('bia@reset.dev').id, (u) => { u.passwordReset.expiresAt = Date.now() - 1000; });
  assert.equal((await client()('POST', '/auth/reset-password', { token, senha: 'nova12345' })).status, 400);
});
