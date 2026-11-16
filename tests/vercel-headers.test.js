// Na Vercel, HTML, JS, CSS e imagens saem direto da CDN, sem passar pelo Express: os cabeçalhos de segurança
// desses arquivos vêm do vercel.json. Este teste garante que eles continuam iguais aos do helmet (server/security.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-vercel-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

const { createApp } = await import('../server/app.js');
const { flush } = await import('../server/store.js');
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

let server;
let base;
before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.close();
  await flush();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const estaticos = () => {
  const regra = vercel.headers.find((h) => h.source === '/((?!api/).*)');
  assert.ok(regra, 'regra de cabeçalhos para os arquivos estáticos');
  return Object.fromEntries(regra.headers.map((h) => [h.key.toLowerCase(), h.value]));
};

test('vercel.json aplica aos arquivos estáticos os mesmos cabeçalhos de segurança do servidor', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  const h = estaticos();
  for (const key of ['content-security-policy', 'cross-origin-opener-policy', 'cross-origin-resource-policy', 'origin-agent-cluster',
    'referrer-policy', 'x-content-type-options', 'x-frame-options', 'x-dns-prefetch-control', 'x-permitted-cross-domain-policies']) {
    assert.equal(h[key], res.headers.get(key), `${key} diverge entre vercel.json e o helmet`);
  }
});

test('a regra não cobre /api (lá o Express aplica os cabeçalhos) e bloqueia recursos que o app não usa', () => {
  const re = /^\/((?!api\/).*)$/;
  assert.ok(re.test('/'));
  assert.ok(re.test('/js/app.js'));
  assert.ok(!re.test('/api/health'));
  const pp = estaticos()['permissions-policy'];
  for (const f of ['camera=()', 'microphone=()', 'geolocation=()']) assert.ok(pp.includes(f), f);
  assert.ok(!/clipboard-write=\(\)|web-share=\(\)/.test(pp), 'copiar e compartilhar continuam permitidos');
});
