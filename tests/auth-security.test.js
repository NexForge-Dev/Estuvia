// Recuperação de senha em produção: a resposta não pode revelar quem tem conta, nem quando o provedor de
// e-mail está ausente (antes: e-mail com conta → 503, sem conta → 200), e uma conta recebe no máximo
// um e-mail por minuto.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-authsec-'));
process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = 'j'.repeat(48);
process.env.DOCUMENTS_KEY = 'd'.repeat(48);
process.env.ALLOWED_ORIGIN = 'https://app.exemplo.test';
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.RADAR_DATA_FILE = path.join(tmp, 'radar.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
process.env.DOCS_DIR = path.join(tmp, 'docfiles');
process.env.DOC_RULES_FILE = path.join(tmp, 'document-rules.json');
process.env.RADAR_SCHEDULER = 'off';
delete process.env.ADMIN_EMAIL;
delete process.env.ADMIN_PASSWORD;
delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_FROM;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;
process.env.MENTOR_PROVIDER = 'none';

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
  globalThis.fetch = realFetch;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const call = async (method, url, body) => {
  const res = await realFetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'travessia' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};

test('produção sem provedor de e-mail: mesma resposta para e-mail com e sem conta', async () => {
  assert.equal((await call('POST', '/auth/register', { nome: 'Ana Prod', email: 'ana@prod.dev', senha: 'segura123', aceite: true, maiorIdade: true })).status, 201);
  const comConta = await call('POST', '/auth/forgot-password', { email: 'ana@prod.dev' });
  const semConta = await call('POST', '/auth/forgot-password', { email: 'ninguem@prod.dev' });
  assert.equal(comConta.status, 503);
  assert.equal(semConta.status, comConta.status);
  assert.deepEqual(semConta.data, comConta.data);
});

test('no máximo um e-mail de redefinição por minuto por conta, com resposta igual', async () => {
  process.env.RESEND_API_KEY = 'test-key';
  process.env.EMAIL_FROM = 'Estuvia <no-reply@example.test>';
  try {
    const first = await call('POST', '/auth/forgot-password', { email: 'ana@prod.dev' });
    assert.equal(first.status, 200);
    assert.equal(sent.length, 1);
    assert.ok(sent[0].text.includes('https://app.exemplo.test/#/redefinir-senha/'), 'link usa só a origem configurada');
    const again = await call('POST', '/auth/forgot-password', { email: 'ana@prod.dev' });
    assert.equal(again.status, 200);
    assert.deepEqual(again.data, first.data);
    assert.equal(sent.length, 1, 'segundo pedido dentro de 1 min não envia outro e-mail');
  } finally {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
  }
});
