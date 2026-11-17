// Entrada serverless (api/index.js): etapas independentes em paralelo e /api/health sem esperar a carga completa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-boot-'));
Object.assign(process.env, {
  DB_PROVIDER: 'json', STORAGE_PROVIDER: 'local',
  DATA_FILE: path.join(tmp, 'db.json'), RADAR_DATA_FILE: path.join(tmp, 'radar.json'), MEDIA_DIR: path.join(tmp, 'media'),
  DOC_RULES_FILE: path.join(tmp, 'document-rules.json'),
});

const entry = await import('../api/index.js');

function fakeRes() {
  return { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.body = b; } };
}

test('/api/health numa instância fria responde sem esperar a carga e dispara a inicialização', async () => {
  const res = fakeRes();
  await entry.default({ method: 'GET', url: '/api/health' }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { ok: true });
  assert.equal(res.headers['cache-control'], 'no-store');
  const app = await entry.boot(); // a mesma inicialização já em andamento
  assert.equal(typeof app, 'function');
  assert.equal(await entry.boot(), app, 'uma inicialização por instância');
});
