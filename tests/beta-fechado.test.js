// Beta fechado: convite no cadastro, contato de suporte, link de nova senha pelo admin e prazo dos registros de acesso.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-beta-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.RADAR_DATA_FILE = path.join(tmp, 'radar.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
process.env.DOCS_DIR = path.join(tmp, 'docfiles');
process.env.RADAR_SCHEDULER = 'off';
process.env.ADMIN_EMAIL = 'chefe@beta.dev';
process.env.ADMIN_PASSWORD = 'admin-seguro-123';
process.env.INVITE_CODES = 'granada-2027, Curto1, SEVILHA-2027';
process.env.SUPPORT_EMAIL = 'ajuda@beta.dev';
delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_FROM;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

const { createApp } = await import('../server/app.js');
const { flush, users, audit, ACCESS_DAYS, AUDIT_CAPS } = await import('../server/store.js');
const { ensureAdminAccount } = await import('../server/admin-seed.js');

let server;
let base;
before(async () => {
  await ensureAdminAccount();
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
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
}
const novo = (email, convite) => client()('POST', '/auth/register', { nome: 'Ana Beta', email, senha: 'segura123', aceite: true, maiorIdade: true, ...(convite === undefined ? {} : { convite }) });

test('cadastro só com convite válido, sem revelar quem já tem conta', async () => {
  assert.equal((await novo('ana@beta.dev')).status, 403);
  assert.equal((await novo('ana@beta.dev', '')).status, 403);
  assert.equal((await novo('ana@beta.dev', 'granada-2028')).status, 403);
  assert.equal((await novo('ana@beta.dev', 'curto1')).status, 403, 'código com menos de 8 caracteres não vale');
  assert.ok(!users.findByEmail('ana@beta.dev'));
  assert.equal((await novo('ana@beta.dev', ' Granada-2027 ')).status, 201);
  assert.equal((await novo('bia@beta.dev', 'sevilha-2027')).status, 201);
  // Mesmo e-mail já cadastrado: sem convite a resposta é a do convite (403), não "já existe" (409).
  assert.equal((await novo('ana@beta.dev', 'errado-errado')).status, 403);
  assert.equal((await novo('ana@beta.dev', 'granada-2027')).status, 409);
});

test('o site informa que há convite e o contato, sem mostrar os códigos', async () => {
  const r = await client()('GET', '/content/app');
  assert.equal(r.data.convite, true);
  assert.equal(r.data.suporte, 'ajuda@beta.dev');
  assert.doesNotMatch(JSON.stringify(r.data), /granada|sevilha/i);
});

test('só códigos inválidos = cadastro fechado; sem a variável = aberto', () => {
  const ver = (codes) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', "const { config } = await import('./server/config.js'); console.log(JSON.stringify([config.inviteOnly, config.inviteCodes.length]))"], { cwd: path.join(import.meta.dirname, '..'), env: { ...process.env, INVITE_CODES: codes }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n').at(-1));
  assert.deepEqual(ver('abc'), [true, 0]);
  assert.deepEqual(ver(' , '), [false, 0]);
  assert.deepEqual(ver(''), [false, 0]);
});

test('conta suspensa: a mensagem diz como falar com a equipe', async () => {
  const bia = users.findByEmail('bia@beta.dev');
  await users.update(bia.id, (u) => { u.blocked = true; });
  const r = await client()('POST', '/auth/login', { email: 'bia@beta.dev', senha: 'segura123' });
  assert.equal(r.status, 403);
  assert.match(r.data.error, /ajuda@beta\.dev/);
});

test('admin gera link de nova senha: pede a senha dele, funciona uma vez e fica registrado', async () => {
  const ana = users.findByEmail('ana@beta.dev');
  const aluno = client();
  await aluno('POST', '/auth/login', { email: 'ana@beta.dev', senha: 'segura123' });
  const url = `/admin/users/${ana.id}/reset-link`;
  assert.equal((await client()('POST', url, { senha: 'admin-seguro-123' })).status, 401);
  assert.equal((await aluno('POST', url, { senha: 'segura123' })).status, 403);

  const admin = client();
  await admin('POST', '/auth/login', { email: 'chefe@beta.dev', senha: 'admin-seguro-123' });
  assert.equal((await admin('POST', url, {})).status, 403);
  assert.equal((await admin('POST', url, { senha: 'errada123' })).status, 403);
  assert.equal(users.findById(ana.id).passwordReset, undefined);
  assert.equal((await admin('POST', `/admin/users/${users.findByEmail('chefe@beta.dev').id}/reset-link`, { senha: 'admin-seguro-123' })).status, 400);
  assert.equal((await admin('POST', `/admin/users/${users.findByEmail('bia@beta.dev').id}/reset-link`, { senha: 'admin-seguro-123' })).status, 400);

  const r = await admin('POST', url, { senha: 'admin-seguro-123' });
  assert.equal(r.status, 200);
  const token = r.data.link.split('/#/redefinir-senha/')[1];
  assert.ok(token.length > 20);
  assert.ok(!JSON.stringify(users.findById(ana.id)).includes(token), 'só o hash é guardado');
  assert.equal(audit.recent(1, (e) => e.action === 'admin-reset-link' && e.targetId === ana.id).length, 1);
  assert.equal((await aluno('GET', '/me')).status, 200, 'gerar o link não muda nada na conta');

  assert.equal((await client()('POST', '/auth/reset-password', { token, senha: 'novaSenha456' })).status, 200);
  assert.equal((await aluno('GET', '/me')).status, 401, 'a troca encerra as sessões');
  assert.equal((await client()('POST', '/auth/login', { email: 'ana@beta.dev', senha: 'novaSenha456' })).status, 200);
  assert.equal((await client()('POST', '/auth/reset-password', { token, senha: 'outraSenha789' })).status, 400);
});

test('link do admin não impede o aluno de pedir o dele por e-mail', async () => {
  const ana = users.findByEmail('ana@beta.dev');
  await users.update(ana.id, (u) => { u.passwordReset = { hash: 'do-admin', expiresAt: Date.now() + 3600000, admin: true }; });
  assert.equal((await client()('POST', '/auth/forgot-password', { email: 'ana@beta.dev' })).status, 200);
  assert.notEqual(users.findById(ana.id).passwordReset.hash, 'do-admin');
});

test('registros de acesso: somem depois do prazo e não são apagados por tentativas em massa', async () => {
  const dias = (n) => new Date(Date.now() - n * 86400000).toISOString();
  await audit.log({ action: 'login', userId: 'recente', at: dias(ACCESS_DAYS - 3) });
  for (let i = 0; i < AUDIT_CAPS.tentativa + 150; i += 1) await audit.log({ action: 'login-failed', email: 'x@beta.dev' });
  assert.equal(audit.recent(1, (e) => e.userId === 'recente').length, 1);
  assert.ok(audit.recent(30000, (e) => e.action === 'login-failed').length <= AUDIT_CAPS.tentativa);

  await audit.log({ action: 'admin-block', userId: 'antigo-admin', at: dias(ACCESS_DAYS + 30) });
  await audit.log({ action: 'login', userId: 'antigo', at: dias(ACCESS_DAYS + 5) });
  await audit.log({ action: 'login', userId: 'agora' });
  assert.equal(audit.recent(1, (e) => e.userId === 'antigo').length, 0);
  assert.equal(audit.recent(1, (e) => e.userId === 'recente').length, 1);
  assert.equal(audit.recent(1, (e) => e.userId === 'agora').length, 1);
  assert.equal(audit.recent(1, (e) => e.userId === 'antigo-admin').length, 1, 'a trilha administrativa não vence por prazo');
});

test('imagem de compartilhamento existe e tem o tamanho declarado', () => {
  const png = fs.readFileSync(new URL('../public/img/og.png', import.meta.url));
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  assert.match(fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8'), /og:image" content="https:\/\/[^"]+\/img\/og\.png"/);
});
