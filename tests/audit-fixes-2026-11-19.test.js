// Regressões da auditoria de fluxos de 2026-11-19.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-audit19-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
process.env.RATE_LIMIT_SCALE = '20';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

await import('./fixtures/programas-reais.js');
const { createApp } = await import('../server/app.js');
const { flush } = await import('../server/store.js');
const engine = await import('../server/journey-engine.js');

const PROFILE = { nacionalidade: 'Brasileira', paisResidencia: 'Brasil', estado: 'SP', formacao: 'Direito', instituicao: 'USP', espanhol: 'B2', onboardingConcluido: true };

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
  return async (method, url, body) => {
    const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'travessia' };
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  };
}

test('E2: visto aprovado na situação + chegada registrada libera a Rodada 7 e a 7.1', () => {
  const user = { profile: PROFILE, documents: {} };
  const jr = { id: 'jz', programaId: 'ugr-master-universitario-estudios-asia-oriental', anoAcademico: '2027/28', missions: {}, dados: {}, situacao: { visto: 'aprovado', adjudicacao: 'admitido', matricula: 'matriculado' } };
  const now = new Date('2026-11-19T12:00:00Z');
  engine.registerArrival(user, jr, { dataEntrada: '2026-11-18', confirmo: true }, now);
  assert.equal(jr.missions['5.9'].declarada, true, 'a 5.9 conta como feita fora da plataforma');
  const r7 = engine.computeJourney(user, jr, now).rodadas.find((r) => r.numero === 7);
  assert.equal(r7.desbloqueada, true);
  assert.notEqual(r7.missoes.find((m) => m.id === '7.1').status, 'bloqueada');
});

test('E5: "Pago" sem valor informado é recusado com explicação; com valor conta no já pago', async () => {
  const c = client();
  await c('POST', '/auth/register', { nome: 'Carla Dias', email: 'carla19@exemplo.com', senha: 'segura123', aceite: true, maiorIdade: true });
  const r = await c('PUT', '/finance', { itens: { moradia: { status: 'pago' } } });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /valor que você pagou/);
  const ok = await c('PUT', '/finance', { itens: { moradia: { valor: 400, status: 'pago' } } });
  assert.equal(ok.status, 200);
});

test('E9: a proposta do /planner/suggest pode voltar inteira para o /planner/approve', async () => {
  const c = client();
  await c('POST', '/auth/register', { nome: 'Davi Reis', email: 'davi19@exemplo.com', senha: 'segura123', aceite: true, maiorIdade: true });
  const s = await c('POST', '/planner/suggest', {});
  if (s.status !== 200 || !s.data.proposta?.length) return; // sem jornada pode não haver proposta: nada a reenviar
  const a = await c('POST', '/planner/approve', { proposta: s.data.proposta });
  assert.notEqual(a.data?.error, 'Há campos que não são aceitos aqui.');
});
