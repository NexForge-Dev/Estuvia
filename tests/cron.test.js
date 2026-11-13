// Coleta agendada do Radar na Vercel: GET /api/cron/radar com o segredo do cron.
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-cron-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.RADAR_DATA_FILE = path.join(tmp, 'radar.json');
process.env.RADAR_SCHEDULER = 'off';
const SECRET = 'cron-secret-de-teste-0123456789';
process.env.CRON_SECRET = SECRET;

const { createApp } = await import('../server/app.js');
const { flush } = await import('../server/store.js');
const radarDb = await import('../server/radar/db.js');
const service = await import('../server/radar/service.js');
const { runScheduled, lastScheduledRun } = await import('../server/radar/scheduler.js');
const { systemStatus } = await import('../server/system-status.js');

let server;
let base;
const realFetch = globalThis.fetch;
before(async () => {
  await service.initRadar();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  mock.restoreAll();
  server.close();
  await Promise.all([flush(), radarDb.flushRadar()]);
  fs.rmSync(tmp, { recursive: true, force: true });
});

const get = async (url, headers = {}) => {
  const res = await realFetch(base + url, { headers });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const future = () => new Date(Date.now() + 86400000).toISOString();
const past = () => new Date(Date.now() - 60000).toISOString();
const htmlSources = () => radarDb.data().sources.filter((s) => s.metodo === 'html-publico' && s.ativa);

// As fontes oficiais não são chamadas de verdade: a rede "cai" e a execução registra o erro.
function offline() {
  mock.method(globalThis, 'fetch', async (url, opts) => {
    if (String(url).startsWith('http://127.0.0.1')) return realFetch(url, opts);
    throw new Error('rede desligada no teste');
  });
}

test('sem o segredo certo, a rota recusa; sem fontes vencidas, não coleta nada', async () => {
  assert.equal((await get('/cron/radar')).status, 401);
  assert.equal((await get('/cron/radar', { Authorization: 'Bearer errado' })).status, 401);
  for (const s of radarDb.data().sources) s.proximaVerificacao = future();
  const r = await get('/cron/radar', { Authorization: `Bearer ${SECRET}` });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.executadas, []);
  assert.equal(r.data.pendentes, 0);
});

test('roda as fontes vencidas, a mais atrasada primeiro, e marca a execução como agendada', async () => {
  offline();
  const [a, b] = htmlSources();
  for (const s of radarDb.data().sources) s.proximaVerificacao = future();
  a.proximaVerificacao = past();
  b.proximaVerificacao = new Date(Date.now() - 3600000).toISOString(); // mais atrasada
  const r = await get('/cron/radar', { Authorization: `Bearer ${SECRET}` });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.executadas.map((x) => x.fonte), [b.id, a.id]);
  assert.equal(lastScheduledRun()?.origem, 'agendada');
  mock.restoreAll();
});

test('orçamento de tempo: depois da primeira, só começa outra se couber', async () => {
  offline();
  for (const s of htmlSources()) s.proximaVerificacao = past();
  const r = await runScheduled({ budgetMs: 0 });
  assert.equal(r.executadas.length, 1, 'a primeira sempre roda');
  assert.ok(r.pendentes >= 1, 'as demais ficam para a próxima chamada');
  mock.restoreAll();
});

test('Status do admin: com CRON_SECRET e coleta recente, o Radar aparece como automático', async () => {
  const st = await systemStatus();
  const radar = st.servicos.find((s) => s.id === 'radar');
  assert.notEqual(radar.estado, 'desligado');
});
