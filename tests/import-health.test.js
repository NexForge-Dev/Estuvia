// Coletor do DUA (importação feita fora da Vercel): Status do admin e aviso por e-mail quando para.
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-import-health-'));
Object.assign(process.env, {
  DATA_FILE: path.join(tmp, 'db.json'),
  RADAR_DATA_FILE: path.join(tmp, 'radar.json'),
  RADAR_SCHEDULER: 'off',
  RADAR_IMPORT_ONLY_HOSTS: 'www.juntadeandalucia.es',
  ADMIN_EMAIL: 'admin@coletor.dev',
  ADMIN_PASSWORD: 'segura123segura',
  RESEND_API_KEY: 're_teste',
  EMAIL_FROM: 'Estuvia <noreply@coletor.dev>',
});

const { flush, audit } = await import('../server/store.js');
const radarDb = await import('../server/radar/db.js');
const service = await import('../server/radar/service.js');
const { importHealth, alertStaleImport } = await import('../server/radar/import-health.js');
const { systemStatus } = await import('../server/system-status.js');

const realFetch = globalThis.fetch;
const sent = [];
before(async () => {
  await service.initRadar();
  globalThis.fetch = async (url, opts) => {
    if (String(url).startsWith('https://api.resend.com/')) { sent.push(JSON.parse(opts.body)); return new Response('{}', { status: 200 }); }
    return realFetch(url, opts);
  };
});
after(async () => {
  globalThis.fetch = realFetch;
  mock.restoreAll();
  await Promise.all([flush(), radarDb.flushRadar()]);
  fs.rmSync(tmp, { recursive: true, force: true });
});

const juntaSources = () => radarDb.data().sources.filter((s) => s.metodo === 'html-publico' && s.ativa && new URL(s.url).hostname === 'www.juntadeandalucia.es');
const setLast = (hoursAgo) => { for (const s of juntaSources()) s.ultimaVerificacaoOk = hoursAgo === null ? null : new Date(Date.now() - hoursAgo * 3600e3).toISOString(); };
const status = async () => (await systemStatus()).servicos.find((s) => s.id === 'coletor-dua');

test('coletor em dia: Status ok e nenhum e-mail', async () => {
  assert.ok(juntaSources().length >= 3, 'há fontes da Junta no registro');
  setLast(2);
  juntaSources()[0].ultimaVerificacaoOk = new Date(Date.now() - 30 * 3600e3).toISOString(); // uma fonte velha não basta
  const h = importHealth();
  assert.equal(h.atrasado, false);
  assert.equal(h.horasSemImportar, 2);
  assert.equal((await status()).estado, 'ok');
  assert.deepEqual(await alertStaleImport(), { alerta: false });
  assert.equal(sent.length, 0);
});

test('mais de 24 h sem importação: Status com erro e um e-mail para o admin, sem repetir em 20 h', async () => {
  setLast(30);
  assert.equal(importHealth().atrasado, true);
  const st = await status();
  assert.equal(st.estado, 'erro');
  assert.match(st.detalhe, /Coletor do DUA parado.*há 30 h/);

  assert.deepEqual(await alertStaleImport(), { alerta: true });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ['admin@coletor.dev']);
  assert.match(sent[0].subject, /coletor do DUA parado/);

  assert.equal((await alertStaleImport()).motivo, 'já avisado');
  assert.equal(sent.length, 1);

  // 21 h depois, ainda parado: avisa de novo.
  assert.deepEqual(await alertStaleImport(Date.now() + 21 * 3600e3), { alerta: true });
  assert.equal(sent.length, 2);
  assert.equal(audit.recent(10, (e) => e.action === 'radar.import-stale-alert').length, 2);
});

test('nunca importado também conta como parado', async () => {
  setLast(null);
  const h = importHealth();
  assert.equal(h.ultimaImportacao, null);
  assert.equal(h.atrasado, true);
  assert.match((await status()).detalhe, /Nenhuma importação/);
});

test('sem RADAR_IMPORT_ONLY_HOSTS o item não aparece', async () => {
  process.env.RADAR_IMPORT_ONLY_HOSTS = '';
  try {
    assert.equal(importHealth().ativo, false);
    assert.equal(await status(), undefined);
    assert.deepEqual(await alertStaleImport(), { alerta: false });
  } finally {
    process.env.RADAR_IMPORT_ONLY_HOSTS = 'www.juntadeandalucia.es';
  }
});
