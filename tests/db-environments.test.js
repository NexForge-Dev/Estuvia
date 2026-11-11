// Separação DEV × PROD: o servidor nunca abre o banco do outro ambiente (por URL ou por marcação no banco)
// e produção só se marca sozinha num banco vazio.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { checkDatabaseEnvironment, projectRef } = await import('../server/database.js');
const base = { prodRef: 'prodref', devRef: 'devref' };

test('referência do projeto vem do subdomínio', () => {
  assert.equal(projectRef('https://abcxyz.supabase.co'), 'abcxyz');
  assert.equal(projectRef('não é url'), '');
});

test('desenvolvimento nunca abre o projeto de produção', () => {
  const r = checkDatabaseEnvironment({ ...base, appEnv: 'development', ref: 'prodref' });
  assert.equal(r.ok, false);
  assert.match(r.erro, /PRODUÇÃO/);
  assert.equal(checkDatabaseEnvironment({ ...base, appEnv: 'test', ref: 'prodref' }).ok, false);
});

test('produção nunca abre o projeto de desenvolvimento', () => {
  const r = checkDatabaseEnvironment({ ...base, appEnv: 'production', ref: 'devref' });
  assert.equal(r.ok, false);
  assert.match(r.erro, /DESENVOLVIMENTO/);
});

test('marcação gravada no banco prevalece sobre qualquer configuração', () => {
  assert.equal(checkDatabaseEnvironment({ appEnv: 'development', ref: 'x', marker: 'production' }).ok, false);
  assert.equal(checkDatabaseEnvironment({ appEnv: 'production', ref: 'x', marker: 'development', users: 0 }).ok, false);
  assert.deepEqual(checkDatabaseEnvironment({ appEnv: 'production', ref: 'x', marker: 'production', users: 9 }), { ok: true });
});

test('produção só se marca sozinha num banco vazio; com dados, só avisa', () => {
  assert.equal(checkDatabaseEnvironment({ ...base, appEnv: 'production', ref: 'novo', users: 0 }).marcar, 'production');
  const comDados = checkDatabaseEnvironment({ ...base, appEnv: 'production', ref: 'antigo', users: 7 });
  assert.equal(comDados.ok, true);
  assert.equal(comDados.marcar, undefined);
  assert.match(comDados.aviso, /sem marcação/);
  const dev = checkDatabaseEnvironment({ ...base, appEnv: 'development', ref: 'devref', users: 0 });
  assert.equal(dev.marcar, undefined, 'desenvolvimento nunca se marca sozinho');
});
