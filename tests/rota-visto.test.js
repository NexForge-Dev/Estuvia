// Caminho do pedido de autorização de estudos (Missão 5.10): consulado (padrão) ou já na Espanha.
// A escolha liga as etapas de um caminho, desliga as do outro, ajusta documentos e o prazo da TIE.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-rota-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
process.env.RATE_LIMIT_SCALE = '20';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

const { createApp } = await import('../server/app.js');
const { flush } = await import('../server/store.js');

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
async function req(method, url, body) {
  const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'travessia' };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

let jid;
const missao = async (id) => (await req("GET", `/journeys/${jid}/missions/${id}`)).data.mission;
const doc = async (id) => (await req('GET', `/documents/${id}?journeyId=${jid}`)).data.documento;
const rota = (valor) => req('PUT', `/journeys/${jid}/missions/5.10/objectives/rota`, { valor });
const ENTRADA = '2026-09-01';
const concluir = async (id) => {
  const m = (await req('GET', `/journeys/${jid}/missions/${id}`)).data.mission;
  for (const o of m.objetivos.filter((x) => !x.feito && x.tipo === 'check')) await req('PUT', `/journeys/${jid}/missions/${id}/objectives/${o.id}`, { feito: true });
  return req('POST', `/journeys/${jid}/missions/${id}/complete`, { confirmo: true });
};

test('setup: estudante de 12 meses em SP, admitida', async () => {
  assert.equal((await req('POST', '/auth/register', { nome: 'Rita Rota', email: 'rita@rota.dev', senha: 'segura123', aceite: true, maiorIdade: true })).status, 201);
  await req('PUT', '/me/profile', { nacionalidade: 'Brasileira', paisResidencia: 'Brasil', estado: 'SP', onboardingConcluido: true });
  jid = (await req('POST', '/journeys', { programaId: 'ugr-demo-eng', anoAcademico: '2027/28', duracaoMeses: 12 })).data.journey.id;
  await req('POST', '/documents/consent', { aceito: true, versao: '2026-11-13' });
  assert.equal((await req('PUT', `/journeys/${jid}/situacao`, { campo: 'adjudicacao', valor: 'admitido' })).status, 200);
});

test('padrão (consulado): etapas do consulado valem, as do pedido na Espanha não; atestado e visto exigidos; chegada exige visto', async () => {
  assert.notEqual((await missao('5.7')).status, 'nao-aplicavel');
  const m710 = await missao('7.10');
  assert.equal(m710.status, 'nao-aplicavel');
  assert.match(m710.motivoNaoAplicavel, /consulado/);
  assert.equal((await doc('atestado')).exigencia, 'requerido');
  assert.equal((await doc('formulario')).exigencia, 'requerido');
  assert.equal((await doc('ex00')).exigencia, 'nao-necessario');
  assert.equal((await req('POST', `/journeys/${jid}/arrival`, { dataEntrada: ENTRADA, confirmo: true })).status, 409);
});

test('opção inválida é recusada', async () => {
  assert.equal((await rota('outro-lugar')).status, 400);
});

test('pedido na Espanha: chega sem visto, desliga o consulado, liga 7.10–7.12, troca documentos e o prazo da TIE', async () => {
  assert.equal((await rota('espanha')).status, 200);
  assert.equal((await req('POST', `/journeys/${jid}/arrival`, { dataEntrada: ENTRADA, confirmo: true })).status, 200);
  for (const id of ['5.1', '5.2', '5.3', '5.7', '5.8', '5.9']) {
    const m = await missao(id);
    assert.equal(m.status, 'nao-aplicavel', id);
    assert.match(m.motivoNaoAplicavel, /já na Espanha/);
  }
  // Requisitos de fundo continuam nos dois caminhos.
  for (const id of ['5.4', '5.5', '5.6']) assert.notEqual((await missao(id)).status, 'nao-aplicavel', id);

  const m710 = await missao('7.10');
  assert.notEqual(m710.status, 'nao-aplicavel');
  assert.equal(m710.prazo.data, '2026-09-29', 'estimativa: 28 dias depois da entrada');

  assert.equal((await doc('atestado')).exigencia, 'nao-necessario');
  assert.equal((await doc('formulario')).exigencia, 'nao-necessario');
  assert.equal((await doc('ex00')).exigencia, 'requerido');
  assert.equal((await doc('taxa-autorizacao-estudos')).exigencia, 'requerido');

  // TIE: o prazo vem da resolução (declarado), nunca calculado da entrada; e espera a resolução (7.12).
  assert.equal((await missao('8.2')).prazo, null);
  assert.ok((await missao('8.1')).bloqueadaPor.some((b) => b.id === '7.12'));
});

test('resolução: prazo de dois meses contado do pedido', async () => {
  assert.equal((await concluir('7.1')).status, 200);
  assert.equal((await concluir('7.10')).status, 200);
  assert.equal((await req('PUT', `/journeys/${jid}/missions/7.11/objectives/data`, { valor: '2026-09-15' })).status, 200);
  assert.equal((await missao('7.12')).prazo.data, '2026-11-15');
});

test('voltar ao consulado restaura o caminho padrão', async () => {
  assert.equal((await rota('consulado')).status, 200);
  assert.equal((await missao('7.10')).status, 'nao-aplicavel');
  assert.notEqual((await missao('5.7')).status, 'nao-aplicavel');
  assert.equal((await doc('atestado')).exigencia, 'requerido');
  assert.equal((await missao('8.2')).prazo.data, '2026-10-01');
});
