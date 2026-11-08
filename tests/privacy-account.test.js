// LGPD/RGPD na prática: a exportação traz tudo o que é guardado sobre a pessoa (sem credenciais nem dados de
// terceiros) e a exclusão da conta apaga do disco os arquivos da carteira e as imagens da comunidade.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.RADAR_DATA_FILE = path.join(tmp, 'radar.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
process.env.DOCS_DIR = path.join(tmp, 'docfiles');
process.env.DOC_RULES_FILE = path.join(tmp, 'document-rules.json');
process.env.RADAR_SCHEDULER = 'off';

const { createApp } = await import('../server/app.js');
const { flush, users, community } = await import('../server/store.js');
const { CONSENT_VERSION } = await import('../server/routes/documents.js');

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
    const buf = Buffer.from(await res.arrayBuffer());
    let data;
    try { data = JSON.parse(buf.toString('utf8')); } catch { data = buf; }
    return { status: res.status, data, headers: res.headers };
  };
}
async function account(nome, email) {
  const req = client();
  const r = await req('POST', '/auth/register', { nome, email, senha: 'segura123', aceite: true });
  assert.equal(r.status, 201);
  await users.update(r.data.user.id, (u) => { u.createdAt = '2026-01-01T00:00:00.000Z'; });
  return { req, id: r.data.user.id };
}
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const filesIn = (dir) => { try { return fs.readdirSync(dir, { recursive: true }).filter((f) => fs.statSync(path.join(dir, f)).isFile()); } catch { return []; } };

test('exportação completa, sem credenciais nem dados de terceiros; exclusão apaga arquivos do disco', async () => {
  const eva = await account('Eva Privada', 'eva@privada.dev');
  const leo = await account('Leo Vizinho', 'leo@privada.dev');

  // Carteira: consentimento + arquivo cifrado.
  assert.equal((await eva.req('POST', '/documents/consent', { aceito: true, versao: CONSENT_VERSION })).status, 200);
  const doc = await eva.req('POST', '/documents/rg-cin/files', PDF, { 'Content-Type': 'application/pdf', 'X-File-Name': 'rg.pdf' });
  assert.equal(doc.status, 201);
  // Comunidade: imagem + publicação + comentário; Leo curte a publicação dela e ela curte a dele.
  const img = await eva.req('POST', '/community/media', PNG, { 'Content-Type': 'image/png' });
  assert.equal(img.status, 201);
  const post = await eva.req('POST', '/community/posts', { tipo: 'publicacao', categoria: 'experiencias', texto: 'Cheguei em Granada!', imagens: [img.data.id] });
  assert.equal(post.status, 201);
  const leoPost = await leo.req('POST', '/community/posts', { tipo: 'publicacao', categoria: 'experiencias', texto: 'Dica de moradia perto da UGR.' });
  assert.equal((await eva.req('POST', `/community/posts/${leoPost.data.post.id}/comments`, { texto: 'Valeu pela dica!' })).status, 201);
  await leo.req('POST', `/community/posts/${post.data.post.id}/like`);
  await eva.req('POST', `/community/posts/${leoPost.data.post.id}/like`);
  // Campos guardados por outros módulos que a lista fixa antiga deixava de fora.
  await users.update(eva.id, (u) => { u.conquistas = { 'perfil-completo': { em: '2026-10-01' } }; u.housingSearch = { cidade: 'Granada' }; u.lastIp = '203.0.113.7'; });

  const ex = await eva.req('GET', '/me/export');
  assert.equal(ex.status, 200);
  const e = ex.data;
  assert.equal(e.passwordHash, undefined);
  assert.equal(e.tokenVersion, undefined);
  assert.ok(!JSON.stringify(e).includes('scrypt$'), 'nenhum hash de senha');
  assert.deepEqual(e.conquistas, { 'perfil-completo': { em: '2026-10-01' } });
  assert.deepEqual(e.housingSearch, { cidade: 'Granada' });
  assert.equal(e.lastIp, '203.0.113.7');
  assert.ok(e.consentAt, 'data do aceite dos termos');
  assert.ok(e.atividade.some((a) => a.action === 'register'), 'registros de acesso da própria conta');
  assert.equal(e.docFiles.length, 1);
  assert.equal(e.docFiles[0].iv, undefined);
  assert.equal(e.docFiles[0].tag, undefined);
  // Comunidade: o que ela fez, sem os ids de quem curtiu.
  assert.equal(e.comunidade.publicacoes.length, 1);
  assert.equal(e.comunidade.publicacoes[0].curtidas, 1);
  assert.ok(!JSON.stringify(e).includes(leo.id), 'o id de outro estudante não vaza na exportação');
  assert.deepEqual(e.comunidade.curtiu, [leoPost.data.post.id]);
  assert.equal(e.comunidade.comentarios.length, 1);
  assert.equal(e.comunidade.imagens.length, 1);

  assert.equal(filesIn(process.env.DOCS_DIR).length, 1);
  assert.equal(filesIn(process.env.MEDIA_DIR).length, 1);

  // Exclusão exige a senha.
  assert.equal((await eva.req('DELETE', '/me', { senha: 'errada123' })).status, 401);
  assert.equal((await eva.req('DELETE', '/me', {})).status, 401);
  assert.equal((await eva.req('DELETE', '/me', { senha: 'segura123' })).status, 200);
  await new Promise((r) => setTimeout(r, 50)); // remoção das imagens não é aguardada pela rota

  assert.equal(users.findById(eva.id), null);
  assert.equal(filesIn(process.env.DOCS_DIR).length, 0, 'arquivos da carteira apagados do disco');
  assert.equal(filesIn(process.env.MEDIA_DIR).length, 0, 'imagens da comunidade apagadas do disco');
  community.read((c) => {
    assert.ok(!c.posts.some((p) => p.autorId === eva.id));
    assert.ok(!c.comments.some((x) => x.autorId === eva.id));
    assert.ok(!c.posts.some((p) => p.curtidas.includes(eva.id) || p.salvos.includes(eva.id)));
    assert.ok(!c.media.some((m) => m.ownerId === eva.id));
  });
  // A sessão antiga deixa de valer.
  assert.equal((await eva.req('GET', '/me')).status, 401);
});
