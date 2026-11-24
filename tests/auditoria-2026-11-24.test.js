// Auditoria de 24/11/2026 (antes da apresentação): cada teste reproduz um problema confirmado na auditoria.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-aud24-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.RADAR_DATA_FILE = path.join(tmp, 'radar.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
process.env.DOCS_DIR = path.join(tmp, 'docfiles');
process.env.DOC_RULES_FILE = path.join(tmp, 'document-rules.json');
process.env.RADAR_SCHEDULER = 'off';
process.env.RATE_LIMIT_SCALE = '20';
process.env.MODERATOR_EMAILS = 'mod@aud24.dev';

const { createApp } = await import('../server/app.js');
const { flush, users, audit, analytics, community, AUDIT_CAPS } = await import('../server/store.js');
const { initRadar } = await import('../server/radar/service.js');
const { pdfHasActiveContent } = await import('../server/routes/documents.js');
const { DUA_MASTERES } = await import('../server/content/application-procedures.js');

let server;
let base;
before(async () => {
  await initRadar();
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
async function account(nome, email) {
  const req = client();
  const r = await req('POST', '/auth/register', { nome, email, senha: 'segura123', aceite: true, maiorIdade: true });
  assert.equal(r.status, 201);
  await users.update(r.data.user.id, (u) => { u.createdAt = '2026-01-01T00:00:00.000Z'; });
  return Object.assign(req, { id: r.data.user.id });
}

// ---------- Documentos ----------

const objStm = (body, dict) => Buffer.concat([
  Buffer.from(`%PDF-1.5\n5 0 obj\n<< /Type /ObjStm /N 1 /First 4 ${dict} /Length ${body.length} >>\nstream\n`, 'latin1'),
  body, Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1'),
]);
const deflate = (s) => zlib.deflateSync(Buffer.from(s, 'latin1'));

test('PDF: a conferência é linear (arquivo de 8 MB feito para travar termina rápido)', () => {
  const MB8 = 8 * 1024 * 1024;
  const ataques = [
    '<', '<<', '>>stream', 'stream\n', '/', '<< /Type /ObjStm /Filter /FlateDecode >> stream\n',
  ].map((s) => Buffer.from('%PDF-' + s.repeat(Math.floor(MB8 / s.length)), 'latin1'));
  const t = Buffer.concat([ataques.at(-1), Buffer.from('endstream')]);
  for (const buf of [...ataques, t]) {
    const t0 = performance.now();
    pdfHasActiveContent(buf);
    const ms = performance.now() - t0;
    assert.ok(ms < 3000, `${Math.round(ms)} ms para ${buf.subarray(5, 20).toString('latin1')}`);
  }
});

test('PDF: preditor e dicionário longo não escondem conteúdo ativo; fluxo comum continua aceito', () => {
  const mau = '1 0 << /OpenAction 2 0 R >>';
  assert.equal(pdfHasActiveContent(objStm(deflate(mau), '/Filter /FlateDecode /DecodeParms << /Predictor 12 /Columns 4 >>')), true);
  assert.equal(pdfHasActiveContent(objStm(deflate(mau), `/Filter /FlateDecode /X (${'a'.repeat(9000)})`)), true);
  assert.equal(pdfHasActiveContent(objStm(deflate('1 0 << /Type /Catalog /Pages 2 0 R >>'), '/Filter /FlateDecode')), false);
  // Fluxo de conteúdo comum antes do fluxo de objetos.
  const comum = Buffer.concat([Buffer.from('%PDF-1.5\n1 0 obj << /Length 4 /Filter /FlateDecode >>\nstream\n'), deflate('BT ET'), Buffer.from('\nendstream\nendobj\n'), objStm(deflate('1 0 << /Type /Page >>'), '/Filter /FlateDecode').subarray(9)]);
  assert.equal(pdfHasActiveContent(comum), false);
});

test('Minha pasta: o botão Baixar junta download=1 à assinatura do link', () => {
  const src = fs.readFileSync(new URL('../public/js/components/documents/MyFolder.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\$\{f\.url\}\?download=1/);
  assert.match(src, /includes\('\?'\) \? '&' : '\?'\}download=1/);
});

// ---------- Registro e conta ----------

test('a atividade de um estudante não apaga a trilha administrativa', async () => {
  await audit.log({ action: 'admin-block', userId: 'adm', targetId: 'x' });
  await audit.log({ action: 'login', userId: 'adm' });
  for (let i = 0; i < AUDIT_CAPS.atividade + 150; i += 1) await audit.log({ action: 'requirements.updated', userId: 'aluno' });
  assert.equal(audit.recent(1, (e) => e.action === 'admin-block').length, 1);
  assert.equal(audit.recent(1, (e) => e.action === 'login' && e.userId === 'adm').length, 1);
  assert.ok(audit.recent(20000, (e) => e.action === 'requirements.updated').length <= AUDIT_CAPS.atividade);
});

test('login: 40 tentativas ao mesmo tempo não passam pelo bloqueio', async () => {
  await account('Ana Paralela', 'ana@aud24.dev');
  const senhas = [...Array(39).keys()].map((i) => `errada${i}x`).concat('segura123');
  const rs = await Promise.all(senhas.map((senha) => client()('POST', '/auth/login', { email: 'ana@aud24.dev', senha })));
  assert.ok(rs.filter((r) => r.status === 401).length <= 10, 'no máximo 10 senhas conferidas');
  assert.equal(rs.at(-1).status, 429);
});

test('trocar a senha cancela o link de redefinição pendente', async () => {
  const req = await account('Bia Troca', 'bia@aud24.dev');
  await users.update(req.id, (u) => { u.passwordReset = { hash: 'x', expiresAt: Date.now() + 3600000 }; });
  assert.equal((await req('POST', '/auth/change-password', { atual: 'segura123', nova: 'outraSegura456' })).status, 200);
  assert.equal(users.findById(req.id).passwordReset, undefined);
});

test('excluir a conta tira o id da pessoa das estatísticas de uso', async () => {
  const req = await account('Caio Sai', 'caio@aud24.dev');
  analytics.mutate((a) => { a.days['2026-11-24'] = { inicio: { v: 1, u: [req.id], t: 0, n: 0 } }; });
  assert.equal((await req('DELETE', '/me', { senha: 'segura123' })).status, 200);
  assert.ok(!JSON.stringify(analytics.read((a) => a)).includes(req.id));
});

// ---------- Comunidade ----------

const future = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
const OP = {
  tipo: 'oportunidade', categoria: 'bolsas', texto: 'Saiu o edital, confiram no site oficial.',
  local: { universidadeId: 'ugr', pais: 'Espanha' },
  oportunidade: { instituicao: 'Universidad de Granada', titulo: 'Ajudas de mobilidade 2027', prazo: future, requisitos: ['Estar matriculado'], linkOficial: 'https://www.ugr.es/ayudas-2027' },
};

test('mudar só o título ou o local de um post verificado devolve o post para verificação', async () => {
  const autor = await account('Davi Autor', 'davi@aud24.dev');
  const r = await autor('POST', '/community/posts', { ...OP, titulo: 'Bolsa aberta' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const id = r.data.post.id;
  const verificar = () => community.mutate((c) => { c.posts.find((p) => p.id === id).verificacao.status = 'verificada'; });
  const status = () => community.read((c) => c.posts.find((p) => p.id === id).verificacao.status);
  await verificar();
  assert.equal((await autor('PUT', `/community/posts/${id}`, { ...OP, titulo: 'Bolsa aberta' })).status, 200);
  assert.equal(status(), 'verificada', 'salvar sem mudar nada mantém o selo');
  assert.equal((await autor('PUT', `/community/posts/${id}`, { ...OP, titulo: 'Pague a taxa em outro site' })).status, 200);
  assert.equal(status(), 'em-verificacao');
  await verificar();
  assert.equal((await autor('PUT', `/community/posts/${id}`, { ...OP, titulo: 'Pague a taxa em outro site', local: { pais: 'Portugal' } })).status, 200);
  assert.equal(status(), 'em-verificacao');
});

test('dados pessoais são mascarados no edital, na cidade e no nome do grupo; a moderação remove grupos', async () => {
  const autor = await account('Eva Autora', 'eva@aud24.dev');
  const r = await autor('POST', '/community/posts', {
    ...OP, local: { cidade: 'CPF 123.456.789-09', pais: 'Espanha' },
    oportunidade: { ...OP.oportunidade, titulo: 'Vaga, fale com eva@gmail.com', instituicao: 'Instituto 123.456.789-09', linkOficial: 'https://www.us.es/vaga-x' },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const json = JSON.stringify(r.data.post);
  assert.ok(!json.includes('eva@gmail.com') && !json.includes('123.456.789-09'), json);

  const g = await autor('POST', '/community/groups', { nome: 'Grupo da eva@gmail.com', tipo: 'pais', pais: 'Espanha' });
  assert.equal(g.status, 201);
  assert.ok(!JSON.stringify(g.data).includes('eva@gmail.com'));
  const gid = g.data.grupo.id;
  assert.equal((await autor('DELETE', `/community/mod/groups/${gid}`)).status, 403, 'quem não modera não remove');
  const mod = await account('Moderadora', 'mod@aud24.dev');
  assert.equal((await mod('DELETE', `/community/mod/groups/${gid}`)).status, 200);
  const oficial = community.read((c) => c.groups.find((x) => x.oficial));
  if (oficial) assert.equal((await mod('DELETE', `/community/mod/groups/${oficial.id}`)).status, 404, 'grupo da plataforma fica');
});

test('spam no título também vai para revisão', async () => {
  const { spamSignals } = await import('../server/community-engine.js');
  const autor = { createdAt: '2026-01-01T00:00:00.000Z' };
  const noTexto = spamSignals({ texto: 'ganhe dinheiro fácil', links: [], autor, recentes: [] });
  const noTitulo = spamSignals({ texto: 'oi', outros: ['ganhe dinheiro fácil'], links: [], autor, recentes: [] });
  assert.equal(noTitulo.score, noTexto.score);
});

// ---------- Conteúdo conferido no BOJA em 24/11/2026 ----------

test('DUA: equivalência de nota nas três fases; última adjudicação sem reserva; adiamento pela coordenação', () => {
  const eq = DUA_MASTERES.documentos.find((d) => d.docId === 'equivalencia-nota');
  assert.deepEqual(eq.fases, [1, 2, 3]);
  assert.match(DUA_MASTERES.regras.find((x) => x.id === 'resultas').texto, /última adjudicação.*não há reserva/);
  assert.match(DUA_MASTERES.fases.find((f) => f.fase === 2).quem.texto, /coordenação do máster/);
  const rounds = fs.readFileSync(new URL('../server/content/rounds.js', import.meta.url), 'utf8');
  assert.doesNotMatch(rounds, /foram 3 dias úteis por lista/);
});
