// Regressões da auditoria de backend, 2ª rodada (2026-11-17): "hoje" no fuso do estudante, regras de
// jornada (ano duplicado, exclusão), conta excluída no meio da requisição, corrida no limite de arquivos,
// fluxo SSE do assistente e exclusão de arquivos no Storage que falha (LGPD).
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-audit2-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;
process.env.MENTOR_PROVIDER = 'none';

const { ASIA_B2 } = await import('./fixtures/programas-reais.js');
const { createApp } = await import('../server/app.js');
const { flush, users, audit } = await import('../server/store.js');
const { updateUser, AccountGoneError } = await import('../server/routes/guards.js');
const { safeLocal } = await import('../server/routes/assistant.js');
const { purgeUserDocuments, removeFile } = await import('../server/routes/documents.js');
const { deleteDocument, deleteMedia } = await import('../server/storage.js');
const { deleteMediaFile } = await import('../server/routes/community.js');

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
  const req = async (method, url, body, { raw, type } = {}) => {
    const headers = { 'Content-Type': type || 'application/json', 'X-Requested-With': 'travessia' };
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(base + url, { method, headers, body: raw || (body ? JSON.stringify(body) : undefined) });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  };
  return req;
}
async function student(email) {
  const req = client();
  assert.equal((await req('POST', '/auth/register', { nome: 'Ana Teste', email, senha: 'segura123', aceite: true, maiorIdade: true })).status, 201);
  return req;
}

test('"hoje" segue o fuso do estudante: às 22h de Brasília ainda é hoje (UTC já é amanhã)', async () => {
  const req = await student('fuso@exemplo.com');
  // Próximo instante 01:30 UTC = 22:30 do dia anterior em São Paulo (fuso padrão da Agenda).
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 1, 30));
  const hojeBrasil = new Date(target.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
  const prazo = new Date(target.getTime() + 30 * 86400e3).toISOString().slice(0, 10);
  const post = await req('POST', '/community/posts', {
    tipo: 'oportunidade', categoria: 'bolsas', texto: 'Bolsa com prazo oficial.',
    oportunidade: { instituicao: 'Universidad de Granada', titulo: 'Bolsa de teste', prazo: hojeBrasil, linkOficial: 'https://www.ugr.es/bolsa' },
  });
  assert.equal(post.status, 201, JSON.stringify(post.data));
  mock.timers.enable({ apis: ['Date'], now: target.getTime() });
  try {
    // A sessão emitida no relógio real pode expirar no salto do relógio: entra de novo no horário simulado.
    assert.equal((await req('POST', '/auth/login', { email: 'fuso@exemplo.com', senha: 'segura123' })).status, 200);
    const lembrete = await req('POST', '/documents/passaporte/reminder', { tipo: 'revisar', data: hojeBrasil });
    assert.equal(lembrete.status, 200, JSON.stringify(lembrete.data));
    const agenda = await req('POST', `/community/posts/${post.data.post.id}/agenda`);
    assert.equal(agenda.status, 201, 'o prazo é hoje no Brasil: ainda não passou');
  } finally {
    mock.timers.reset();
  }
  assert.ok(prazo > hojeBrasil);
});

test('PUT da jornada sem mestrado não pode duplicar universidade + ano (mesma regra da criação)', async () => {
  const req = await student('ano@exemplo.com');
  assert.equal((await req('POST', '/journeys', { universidadeId: 'ugr', anoAcademico: '2027/28' })).status, 201);
  const b = await req('POST', '/journeys', { universidadeId: 'ugr', anoAcademico: '2028/29' });
  assert.equal(b.status, 201);
  assert.equal((await req('PUT', `/journeys/${b.data.journey.id}`, { anoAcademico: '2027/28' })).status, 409);
  assert.equal((await req('PUT', `/journeys/${b.data.journey.id}`, { anoAcademico: '2029/30' })).status, 200);
});

test('excluir a jornada limpa as referências em oportunidades e no alerta de preço', async () => {
  const req = await student('apaga-jornada@exemplo.com');
  const { data: { journey } } = await req('POST', '/journeys', { programaId: ASIA_B2 });
  const u = users.findByEmail('apaga-jornada@exemplo.com');
  await users.update(u.id, (x) => {
    x.opportunities = [{ id: 'op1', postId: 'p1', journeyId: journey.id, missao: { objetivos: [] }, atividades: [] }];
    x.travel = { ...(x.travel || {}), alertaPreco: { ativo: true, teto: 3000, journeyId: journey.id } };
  });
  assert.equal((await req('DELETE', `/journeys/${journey.id}`)).status, 200);
  const after = users.findById(u.id);
  assert.equal(after.opportunities[0].journeyId, null);
  assert.equal(after.travel.alertaPreco.journeyId, null);
});

test('conta excluída no meio da requisição: 401 limpo, não 500', async () => {
  await assert.rejects(updateUser('nao-existe', () => {}), AccountGoneError);
  const req = await student('sumiu@exemplo.com');
  const original = users.update;
  users.update = async () => null; // simula a exclusão entre a autenticação e a gravação
  try {
    const r = await req('PUT', '/planner/availability', { dias: [1], janelas: [{ inicio: '19:00', fim: '20:00' }], horasSemanais: 3, preferencia: 'curtas', fuso: 'America/Sao_Paulo' });
    assert.equal(r.status, 401);
    const f = await req('PUT', '/finance', { perfil: 'equilibrado' });
    assert.equal(f.status, 401);
  } finally {
    users.update = original;
  }
});

test('envios simultâneos não furam o limite de 80 arquivos', async () => {
  const req = await student('limite@exemplo.com');
  assert.equal((await req('POST', '/documents/consent', { aceito: true, versao: '2026-11-13' })).status, 200);
  const u = users.findByEmail('limite@exemplo.com');
  await users.update(u.id, (x) => {
    x.docFiles = Array.from({ length: 79 }, (_, i) => ({ id: `f${i}`, docId: 'passaporte', serie: `f${i}`, versao: 1, nome: 'a.pdf', mime: 'application/pdf', ext: 'pdf', tamanho: 10, papel: 'original', criadoEm: new Date().toISOString() }));
  });
  const pdf = Buffer.from('%PDF-1.4\n%%EOF');
  const [a, b] = await Promise.all([
    req('POST', '/documents/passaporte/files', null, { raw: pdf, type: 'application/pdf' }),
    req('POST', '/documents/passaporte/files', null, { raw: pdf, type: 'application/pdf' }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [201, 409]);
  assert.equal(users.findById(u.id).docFiles.length, 80);
});

test('assistente: falha da base local encerra o SSE com evento de erro', () => {
  const sent = [];
  const out = safeLocal(() => { throw new Error('quebrou'); }, (ev, data) => sent.push([ev, data]));
  assert.equal(out, null);
  assert.equal(sent[0][0], 'error');
  assert.deepEqual(safeLocal(() => ({ texto: 'ok' }), () => {}), { texto: 'ok' });
});

test('LGPD: falha do Storage ao apagar arquivos tenta de novo e fica registrada como exclusão pendente', async () => {
  let tentativas = 0;
  const ok = await purgeUserDocuments('estudante-x', { purge: async () => { tentativas += 1; throw new Error('Storage fora do ar'); } });
  assert.equal(ok, false);
  assert.equal(tentativas, 2, 'tenta de novo uma vez');
  assert.ok(audit.recent(50).some((e) => e.action === 'storage.purge-pending' && e.tipo === 'documentos' && e.userId === 'estudante-x'));
  let segunda = 0;
  assert.equal(await purgeUserDocuments('estudante-y', { purge: async () => { segunda += 1; if (segunda === 1) throw new Error('instável'); } }), true);

  assert.equal(await deleteMediaFile({ id: 'img1', ext: 'png', ownerId: 'estudante-x' }, { del: async () => { throw new Error('Storage fora do ar'); } }), false);
  assert.ok(audit.recent(50).some((e) => e.action === 'storage.purge-pending' && e.tipo === 'midia' && e.mediaId === 'img1'));

  // A exclusão da conta pedida pelo estudante continua funcionando.
  const req = await student('lgpd@exemplo.com');
  assert.equal((await req('DELETE', '/me', { senha: 'segura123' })).status, 200);
  assert.equal(users.findByEmail('lgpd@exemplo.com'), null);
});

test('LGPD: falha ao apagar um arquivo avulso fica registrada; arquivo já inexistente não é falha', async () => {
  assert.equal(await removeFile('estudante-z', { id: 'arq1' }, { del: async () => { throw new Error('Storage fora do ar'); } }), false);
  assert.ok(audit.recent(50).some((e) => e.action === 'storage.purge-pending' && e.tipo === 'documento' && e.fileId === 'arq1'));
  // Disco local: apagar o que não existe não lança (ENOENT é ignorado), outros erros sobem.
  await deleteDocument('estudante-z', 'nao-existe');
  await deleteMedia('nao-existe', 'png');
});
