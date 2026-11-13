// Carteira ↔ missões e rodadas: o documento que a missão manda conseguir entra em Documentos,
// e as listas seguem sempre a ordem necessários → opcionais → contingência.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wallet-missions-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.RADAR_DATA_FILE = path.join(tmp, 'radar.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
process.env.DOCS_DIR = path.join(tmp, 'docfiles');
process.env.RADAR_SCHEDULER = 'off';

const { createApp } = await import('../server/app.js');
const { flush, users } = await import('../server/store.js');

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

let cookie = '';
const req = async (method, url, body, extra = {}) => {
  const headers = { 'X-Requested-With': 'travessia', ...(body !== undefined && !Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}), ...extra, ...(cookie ? { Cookie: cookie } : {}) };
  const res = await fetch(base + url, { method, headers, body: Buffer.isBuffer(body) ? body : body !== undefined ? JSON.stringify(body) : undefined });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return { status: res.status, data: await res.json().catch(() => null) };
};
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const RANK = { requerido: 0, recomendado: 1, condicional: 2, verificar: 3 };
let uid;
let jid;

test('setup', async () => {
  uid = (await req('POST', '/auth/register', { nome: 'Davi Melo', email: 'davi@missoes.dev', senha: 'segura123', aceite: true })).data.user.id;
  await req('PUT', '/me/profile', { paisResidencia: 'Brasil', estado: 'SP' });
  jid = (await req('POST', '/journeys', { programaId: 'ugr-demo-eng', anoAcademico: '2027/28', duracaoMeses: 12 })).data.journey.id;
  await req('POST', '/documents/consent', { aceito: true, versao: '2026-11-13' });
});

test('concluir a missão 2.1 (Preparar meu passaporte) guarda o passaporte como pronto na Carteira, na hora', async () => {
  // A Rodada 2 libera depois da Rodada 1: o estudante já concluiu as missões dela.
  const em = new Date().toISOString();
  await users.update(uid, (u) => { for (const id of ['1.1', '1.2', '1.3', '1.4', '1.5']) u.journeys[0].missions[id] = { objetivos: {}, concluidaEm: em }; });
  const m = (await req('GET', `/journeys/${jid}/missions/2.1`)).data.mission;
  assert.equal(m.bloqueada, undefined, `2.1 liberada (status: ${m.status})`);
  assert.ok(m.docsCarteira >= 1, 'a missão sabe que usa documentos da Carteira');
  for (const o of m.objetivos.filter((x) => !x.tipo || x.tipo === 'check')) await req('PUT', `/journeys/${jid}/missions/2.1/objectives/${o.id}`, { feito: true });
  const done = await req('POST', `/journeys/${jid}/missions/2.1/complete`, { confirmo: true });
  assert.equal(done.status, 200, JSON.stringify(done.data));
  // Sem abrir a Carteira antes: o status já está gravado.
  assert.equal(users.findById(uid).documents.passaporte, 'pronto');
  const ev = done.data.events.find((e) => e.tipo === 'carteira');
  assert.ok(ev, 'a tela recebe o aviso "guardado na Carteira"');
  assert.deepEqual(ev.documentos.map((d) => d.id), ['passaporte']);
  const p = (await req('GET', `/documents/passaporte?journeyId=${jid}`)).data.documento;
  assert.equal(p.estado, 'pronto');
  assert.equal(p.evidencias.porMissao, '2.1');
  const m21 = p.missoes.find((x) => x.id === '2.1');
  assert.equal(m21.rodada.numero, 2, 'a Carteira mostra a rodada da missão');
  assert.equal(m21.prepara, true);
});

test('arquivo enviado na missão vai para a Carteira (categoria certa) e fica ligado à missão', async () => {
  const up = await req('POST', `/documents/historico/files?missao=2.3&journeyId=${jid}`, PDF, { 'Content-Type': 'application/pdf', 'X-File-Name': 'historico.pdf' });
  assert.equal(up.status, 201);
  assert.equal(up.data.documento.categoria, 'academicos');
  assert.equal(users.findById(uid).docFiles.find((f) => f.docId === 'historico').missaoId, '2.3');
  // Aparece na Carteira (Minha pasta) e na missão, sem duplicar.
  const files = (await req('GET', '/documents/files')).data.arquivos;
  assert.equal(files.filter((f) => f.docId === 'historico').length, 1);
  const m = (await req('GET', `/documents/missions/${jid}/2.3`)).data;
  assert.equal(m.necessarios.find((v) => v.id === 'historico').anexos, 1);
});

test('missão e Carteira sempre na ordem: necessários → opcionais → contingência', async () => {
  const m = (await req('GET', `/documents/missions/${jid}/2.6`)).data;
  assert.deepEqual(Object.keys(m).slice(1, 4), ['necessarios', 'opcionais', 'contingencia']);
  assert.ok(m.contingencia.some((v) => v.id === 'carta-motivacao'), 'carta de motivação só se o programa pedir');
  assert.ok(m.necessarios.every((v) => v.exigencia === 'requerido'));
  for (const cat of ['pessoais', 'academicos', 'candidatura', 'viagem']) {
    const itens = (await req('GET', `/documents/list?categoria=${cat}&journeyId=${jid}`)).data.itens;
    const ranks = itens.map((v) => RANK[v.exigencia]);
    assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), `ordem em ${cat}`);
    assert.ok(itens.every((v) => ['necessarios', 'opcionais', 'contingencia'].includes(v.grupo)));
  }
});

test('rodada: documentos da rodada inteira, sem repetir, com o que já está na Carteira', async () => {
  const r = (await req('GET', `/documents/rounds/${jid}/2`)).data;
  assert.equal(r.rodada, 2);
  assert.ok(r.total >= 5);
  assert.ok(r.prontos >= 1, 'passaporte pronto pela missão 2.1');
  assert.ok(!r.faltam.some((v) => v.id === 'passaporte'));
  assert.ok(r.faltam.some((v) => v.id === 'diploma'));
  assert.equal(new Set(r.faltam.map((v) => v.id)).size, r.faltam.length, 'sem duplicatas');
  assert.equal((await req('GET', `/documents/rounds/${jid}/99`)).status, 404);
});
