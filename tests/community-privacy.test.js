// Comunidade: denúncia só do que se pode ver, id de moderador não exposto ao autor, imagens não publicadas
// podem ser descartadas e expiram (não ficam guardadas nem travam o limite de envios).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'community-privacy-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.RADAR_DATA_FILE = path.join(tmp, 'radar.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
process.env.DOCS_DIR = path.join(tmp, 'docfiles');
process.env.RADAR_SCHEDULER = 'off';
process.env.MODERATOR_EMAILS = 'mod@privacidade.dev';
process.env.RATE_LIMIT_SCALE = '10';

const { createApp } = await import('../server/app.js');
const { flush, users, community } = await import('../server/store.js');

let server;
let base;
let ana; let bia; let mod;
before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  ana = await account('Ana Autora', 'ana@privacidade.dev');
  bia = await account('Bia Leitora', 'bia@privacidade.dev');
  mod = await account('Moderadora', 'mod@privacidade.dev', { role: 'moderador' });
});
after(async () => {
  server.close();
  await flush();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function client() {
  let cookie = '';
  return async (method, url, body, extra = {}) => {
    const headers = { 'X-Requested-With': 'travessia', ...(body !== undefined && !Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}), ...extra };
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(base + url, { method, headers, body: Buffer.isBuffer(body) ? body : body !== undefined ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  };
}
async function account(nome, email, extra) {
  const req = client();
  const r = await req('POST', '/auth/register', { nome, email, senha: 'segura123', aceite: true, maiorIdade: true });
  assert.equal(r.status, 201);
  await users.update(r.data.user.id, (u) => { u.createdAt = '2026-01-01T00:00:00.000Z'; Object.assign(u, extra); });
  return { req, id: r.data.user.id };
}
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const media = () => { try { return fs.readdirSync(process.env.MEDIA_DIR); } catch { return []; } };


test('denúncia: conteúdo oculto, em revisão ou comentário não publicado não pode ser denunciado (404)', async () => {
  const p = await ana.req('POST', '/community/posts', { tipo: 'publicacao', categoria: 'experiencias', texto: 'Relato que a moderação vai ocultar.' });
  assert.equal(p.status, 201);
  const pid = p.data.post.id;
  const cm = await ana.req('POST', `/community/posts/${pid}/comments`, { texto: 'Comentário que vai para revisão.' });
  assert.equal((await mod.req('POST', `/community/mod/posts/${pid}/moderation`, { acao: 'ocultar', nota: 'Fora do tema.' })).status, 200);
  assert.equal((await bia.req('POST', `/community/posts/${pid}/report`, { motivo: 'spam' })).status, 404);

  const q = await ana.req('POST', '/community/posts', { tipo: 'publicacao', categoria: 'experiencias', texto: 'Relato visível para todos.' });
  const c2 = await ana.req('POST', `/community/posts/${q.data.post.id}/comments`, { texto: 'Comentário em revisão.' });
  await community.mutate((c) => { c.comments.find((x) => x.id === c2.data.comentario.id).moderacao.estado = 'em-revisao'; });
  assert.equal((await bia.req('POST', `/community/comments/${c2.data.comentario.id}/report`, { motivo: 'spam' })).status, 404);
  // O que está visível continua denunciável.
  assert.equal((await bia.req('POST', `/community/posts/${q.data.post.id}/report`, { motivo: 'spam' })).status, 201);
  assert.ok(cm.status === 201);
});

test('autor vê o estado e a nota da moderação, mas não o id de quem moderou', async () => {
  const p = await ana.req('POST', '/community/posts', { tipo: 'publicacao', categoria: 'experiencias', texto: 'Outro relato a ser ocultado.' });
  await mod.req('POST', `/community/mod/posts/${p.data.post.id}/moderation`, { acao: 'ocultar', nota: 'Dados pessoais no texto.' });
  const mine = await ana.req('GET', `/community/posts/${p.data.post.id}`);
  assert.equal(mine.status, 200);
  assert.equal(mine.data.post.moderacao.estado, 'oculto');
  assert.equal(mine.data.post.moderacao.nota, 'Dados pessoais no texto.');
  assert.equal(mine.data.post.moderacao.por, undefined);
  assert.ok(!JSON.stringify(mine.data).includes(mod.id));
  // A moderação continua vendo quem decidiu.
  assert.equal((await mod.req('GET', `/community/posts/${p.data.post.id}`)).data.post.moderacao.por, mod.id);
});

test('imagem não publicada: descartável pela dona, expira em 24 h e não trava novos envios', async () => {
  const before = media().length;
  const up = await ana.req('POST', '/community/media', PNG, { 'Content-Type': 'image/png' });
  assert.equal(up.status, 201);
  assert.equal(media().length, before + 1);
  assert.equal((await bia.req('DELETE', `/community/media/${up.data.id}`)).status, 404, 'só a dona descarta');
  assert.equal((await ana.req('DELETE', `/community/media/${up.data.id}`)).status, 200);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(media().length, before);

  // Imagem já publicada não pode ser descartada por esta rota.
  const pub = await ana.req('POST', '/community/media', PNG, { 'Content-Type': 'image/png' });
  await ana.req('POST', '/community/posts', { tipo: 'publicacao', categoria: 'experiencias', texto: 'Com foto.', imagens: [pub.data.id] });
  assert.equal((await ana.req('DELETE', `/community/media/${pub.data.id}`)).status, 404);

  // 12 pendentes travam o envio; envelhecidas (> 24 h), somem do disco e o envio volta a funcionar.
  for (let i = 0; i < 12; i += 1) assert.equal((await bia.req('POST', '/community/media', PNG, { 'Content-Type': 'image/png' })).status, 201);
  assert.equal((await bia.req('POST', '/community/media', PNG, { 'Content-Type': 'image/png' })).status, 429);
  const old = new Date(Date.now() - 25 * 3600000).toISOString();
  await community.mutate((c) => { c.media.filter((m) => m.ownerId === bia.id).forEach((m) => { m.criadoEm = old; }); });
  const countBefore = media().length;
  assert.equal((await bia.req('POST', '/community/media', PNG, { 'Content-Type': 'image/png' })).status, 201);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(media().length, countBefore - 12 + 1);
  assert.ok(community.read((c) => c.media.some((m) => m.id === pub.data.id)), 'a imagem publicada não expira');
});
