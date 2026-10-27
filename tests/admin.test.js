import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Base isolada; a conta admin vem das variáveis abaixo (o dotenv não sobrescreve variáveis já definidas).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-admin-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
process.env.ADMIN_EMAIL = 'chefe@exemplo.com';
process.env.ADMIN_PASSWORD = 'admin-seguro-123';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;
process.env.MENTOR_PROVIDER = 'none';

const { createApp } = await import('../server/app.js');
const { flush } = await import('../server/store.js');
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
    const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'travessia', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0' };
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
}

const admin = client();
const aluno = client();
let alunoId;

test('conta admin do .env entra e é marcada como admin', async () => {
  const r = await admin('POST', '/auth/login', { email: 'chefe@exemplo.com', senha: 'admin-seguro-123' });
  assert.equal(r.status, 200);
  const me = await admin('GET', '/me');
  assert.equal(me.data.user.admin, true);
});

test('estudante comum não acessa o painel', async () => {
  const r = await aluno('POST', '/auth/register', { nome: 'Ana Souza', email: 'ana@exemplo.com', senha: 'segura123', aceite: true });
  assert.equal(r.status, 201);
  alunoId = r.data.user.id;
  assert.equal(r.data.user.admin, false);
  assert.equal((await aluno('GET', '/me')).status, 200); // registra atividade
  assert.equal((await aluno('GET', '/admin/overview')).status, 403);
});

test('painel mostra quem está online, usuários e eventos', async () => {
  const o = await admin('GET', '/admin/overview');
  assert.equal(o.status, 200);
  assert.equal(o.data.totais.usuarios, 1); // o admin não entra nos números
  assert.ok(o.data.online.some((u) => u.email === 'ana@exemplo.com'));
  assert.equal(o.data.dias.length, 30);
  assert.ok(o.data.eventos.some((e) => e.action === 'register' && e.email === 'ana@exemplo.com'));

  const list = await admin('GET', '/admin/users?q=ana');
  assert.equal(list.data.users.length, 1);
  assert.equal(list.data.users[0].dispositivo.browser, 'Chrome');
  assert.equal(list.data.users[0].passwordHash, undefined);

  const d = await admin('GET', `/admin/users/${alunoId}`);
  assert.equal(d.data.user.email, 'ana@exemplo.com');
  assert.ok(d.data.eventos.length >= 1);
});

test('uso por módulo: acessos, pessoas, tempo médio; caminhos desconhecidos e o admin são ignorados', async () => {
  assert.equal((await aluno('POST', '/track', { path: '/agenda' })).status, 204);
  await aluno('POST', '/track', { path: '/documentos/passaporte', prev: { path: '/agenda', ms: 42_000 } });
  await aluno('POST', '/track', { path: '/agenda', prev: { path: '/documentos/passaporte', ms: 8_000 } });
  await aluno('POST', '/track', { path: '/qualquer-coisa?email=x' });
  await admin('POST', '/track', { path: '/agenda' });
  assert.equal((await aluno('POST', '/track', { path: '/agenda', extra: 1 })).status, 400);

  const o = await admin('GET', '/admin/overview?periodo=7');
  const [top, second] = o.data.uso.modulos;
  assert.equal(o.data.uso.periodoDias, 7);
  assert.deepEqual([top.id, top.acessos, top.pessoas, top.tempoMedioSeg], ['agenda', 2, 1, 42]);
  assert.deepEqual([second.id, second.acessos, second.tempoMedioSeg], ['documentos', 1, 8]);
  assert.equal(o.data.uso.totalAcessos, 3);
  assert.equal(o.data.online.find((u) => u.email === 'ana@exemplo.com').modulo, 'Agenda');

  const d = await admin('GET', `/admin/users/${alunoId}`);
  assert.deepEqual(d.data.user.modulos[0], { id: 'agenda', nome: 'Agenda', acessos: 2, tempoTotalSeg: 42 });
});

test('status da IA: mostra configuração e o teste não chama a rede sem IA configurada', async () => {
  const st = await admin('GET', '/admin/ai');
  assert.equal(st.status, 200);
  assert.equal(st.data.mentor.provedorConfigurado, 'none');
  assert.equal(st.data.mentor.ativo, false);
  assert.equal(st.data.assistente.ativo, false);
  assert.equal(st.data.assistente.chave, null);
  const chk = await admin('POST', '/admin/ai/check');
  assert.equal(chk.status, 200);
  assert.equal(chk.data.mentor.ok, null);
  assert.equal(chk.data.assistente.ok, null);
  assert.equal((await aluno('GET', '/admin/ai')).status, 403);
});

test('acompanhamento: inscrição, progresso e alertas por aluno; filtros da lista', async () => {
  const r = await aluno('POST', '/journeys', { programaId: 'ugr-demo-eng', anoAcademico: '2027/28' });
  assert.equal(r.status, 201);
  const jid = r.data.journey.id;
  assert.equal((await aluno('PUT', `/journeys/${jid}/situacao`, { campo: 'adjudicacao', valor: 'aguardando' })).status, 200);

  const d = await admin('GET', `/admin/users/${alunoId}`);
  const rel = d.data.relatorio;
  assert.equal(rel.jornadas.length, 1);
  assert.equal(rel.jornadas[0].inscricao.candidatura, 'aguardando');
  assert.equal(rel.jornadas[0].inscricao.candidaturaLabel, 'Aguardando resultado');
  assert.equal(typeof rel.jornadas[0].progresso, 'number');
  assert.equal(rel.engajamento.diasSemEntrar, 0);
  assert.ok(rel.documentos.lista.length > 0);
  assert.ok(rel.alertas.some((a) => /onboarding/.test(a.texto)));

  const o = await admin('GET', '/admin/overview');
  assert.equal(o.data.inscricoes.jornadas, 1);
  assert.equal(o.data.inscricoes.candidatura.aguardando.total, 1);

  const enviadas = await admin('GET', '/admin/users?filtro=candidatura-enviada');
  assert.equal(enviadas.data.users.length, 1);
  assert.equal(enviadas.data.users[0].inscricao.candidatura, 'aguardando');
  assert.equal((await admin('GET', '/admin/users?filtro=admitidos')).data.users.length, 0);
  assert.equal((await admin('GET', '/admin/users?filtro=inativos')).data.users.length, 0);
});

test('anotações do admin: criar, listar e apagar; o aluno não vê', async () => {
  const c = await admin('POST', `/admin/users/${alunoId}/notes`, { texto: 'Liguei, vai mandar o diploma.' });
  assert.equal(c.status, 201);
  assert.equal(c.data.notas[0].texto, 'Liguei, vai mandar o diploma.');
  const me = await aluno('GET', '/me');
  assert.equal(JSON.stringify(me.data).includes('diploma.'), false);
  const exp = await aluno('GET', '/me/export');
  assert.equal(JSON.stringify(exp.data).includes('Liguei'), false);
  const del = await admin('DELETE', `/admin/users/${alunoId}/notes/${c.data.notas[0].id}`);
  assert.equal(del.data.notas.length, 0);
});

test('suspender derruba a sessão e impede login; reativar libera', async () => {
  assert.equal((await admin('POST', `/admin/users/${alunoId}/block`, { bloqueado: true })).status, 200);
  assert.equal((await aluno('GET', '/me')).status, 401);
  const login = await aluno('POST', '/auth/login', { email: 'ana@exemplo.com', senha: 'segura123' });
  assert.equal(login.status, 403);

  assert.equal((await admin('POST', `/admin/users/${alunoId}/block`, { bloqueado: false })).status, 200);
  assert.equal((await aluno('POST', '/auth/login', { email: 'ana@exemplo.com', senha: 'segura123' })).status, 200);
});

test('encerrar sessões obriga novo login; admin não pode ser suspenso', async () => {
  assert.equal((await admin('POST', `/admin/users/${alunoId}/logout`)).status, 200);
  assert.equal((await aluno('GET', '/me')).status, 401);
  const me = await admin('GET', '/me');
  assert.equal((await admin('POST', `/admin/users/${me.data.user.id}/block`, { bloqueado: true })).status, 400);
});

test('status do sistema e logs: só o admin vê; serviços com estado e métricas da API', async () => {
  for (const url of ['/admin/status', '/admin/logs']) assert.ok([401, 403].includes((await aluno('GET', url)).status), url);
  const s = (await admin('GET', '/admin/status?horas=1')).data;
  assert.ok(['ok', 'aviso', 'erro'].includes(s.geral));
  const ids = s.servicos.map((x) => x.id);
  for (const id of ['api', 'base', 'mentor', 'assistente', 'sessoes']) assert.ok(ids.includes(id), id);
  assert.equal(s.servicos.find((x) => x.id === 'mentor').estado, 'desligado');
  assert.ok(s.servicos.every((x) => !x.chave || x.chave.startsWith('••••')), 'chaves sempre mascaradas');
  assert.ok(s.metricas.requisicoes > 0);
  console.warn('[teste] aviso para o painel de logs');
  const l = (await admin('GET', '/admin/logs?nivel=aviso&q=painel de logs')).data;
  assert.ok(l.logs.some((x) => x.mensagem.includes('aviso para o painel de logs')));
  assert.ok(l.logs.every((x) => x.nivel === 'aviso'));
});
