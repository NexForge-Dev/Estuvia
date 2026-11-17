// Regressões da auditoria de backend (2026-11-17): datas inexistentes, corridas de cadastro e de
// redefinição de senha, chaves do protótipo, histórico da IA, Mentor × rota da jornada e exportação.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-audit-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
process.env.ADMIN_EMAIL = 'chefe-audit@exemplo.com';
process.env.ADMIN_PASSWORD = 'admin-seguro-123';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;
process.env.MENTOR_PROVIDER = 'none';

const { ASIA_B2 } = await import('./fixtures/programas-reais.js');
const { createApp } = await import('../server/app.js');
const { flush, users, audit } = await import('../server/store.js');
const { isCalendarDate } = await import('../server/routes/validators.js');
const { cleanHistory } = await import('../server/routes/assistant.js');
const { recentHistory } = await import('../server/mentor/orchestrator.js');
const { executeTool, makeCtx } = await import('../server/mentor/tools/index.js');
const { ensureAdminAccount } = await import('../server/admin-seed.js');

let server;
let base;
before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  await ensureAdminAccount();
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
const signup = (email) => ({ nome: 'Ana Teste', email, senha: 'segura123', aceite: true, maiorIdade: true });
async function student(email) {
  const req = client();
  assert.equal((await req('POST', '/auth/register', signup(email))).status, 201);
  return req;
}

test('isCalendarDate só aceita dias que existem', () => {
  for (const ok of ['2026-11-17', '2028-02-29']) assert.equal(isCalendarDate(ok), true, ok);
  for (const no of ['2026-13-01', '2026-02-31', '2027-02-29', '2026-00-10', '2026-1-1', '', null]) assert.equal(isCalendarDate(no), false, String(no));
});

test('data inexistente é recusada (antes era gravada e derrubava a tela de viagem com 500)', async () => {
  const req = await student('datas@exemplo.com');
  const { data: { journey } } = await req('POST', '/journeys', { programaId: ASIA_B2 });
  assert.equal((await req('PUT', '/travel/profile', { dataIda: '2027-13-45' })).status, 400);
  assert.equal((await req('POST', '/travel/quotes', { rota: 'GRU-MAD', dataViagem: '2027-02-30' })).status, 400);
  assert.equal((await req('GET', '/travel')).status, 200);
  assert.equal((await req('POST', '/planner/suggest', { semana: '2026-13-01' })).status, 400);
  assert.equal((await req('POST', '/planner/replan', { semana: '2026-13-01' })).status, 400);
  assert.equal((await req('POST', '/planner', { titulo: 'x', categoria: 'pessoal', data: '2026-02-31', inicio: '10:00', fim: '11:00' })).status, 400);
  assert.equal((await req('PUT', `/journeys/${journey.id}`, { inicioAulas: '2027-09-31' })).status, 400);
  assert.equal((await req('PUT', '/finance', { partida: '2027-13-01' })).status, 400);
  assert.equal((await req('POST', '/living/housing', { nome: 'Quarto', tipo: 'quarto', aluguel: 300, entrada: '2027-13-01' })).status, 400);
  // Data válida continua funcionando.
  assert.equal((await req('PUT', '/travel/profile', { dataIda: '2027-08-20' })).status, 200);
  assert.equal((await req('POST', '/planner/suggest', { semana: '2026-11-16' })).status, 200);
});

test('cadastro duplo simultâneo cria uma conta só', async () => {
  const [a, b] = await Promise.all([client()('POST', '/auth/register', signup('duplo@exemplo.com')), client()('POST', '/auth/register', signup('duplo@exemplo.com'))]);
  assert.deepEqual([a.status, b.status].sort(), [201, 409]);
  assert.equal(users.all().filter((u) => u.email === 'duplo@exemplo.com').length, 1);
});

test('link de redefinição usado duas vezes ao mesmo tempo: só um vence', async () => {
  await student('reset-corrida@exemplo.com');
  const token = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const u = users.findByEmail('reset-corrida@exemplo.com');
  await users.update(u.id, (x) => { x.passwordReset = { hash, expiresAt: Date.now() + 3600e3 }; });
  const [a, b] = await Promise.all([
    client()('POST', '/auth/reset-password', { token, senha: 'novasenha1' }),
    client()('POST', '/auth/reset-password', { token, senha: 'outrasenha2' }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 400]);
});

test('ids como "__proto__" não viram objeto do protótipo (antes: 500)', async () => {
  const req = await student('proto@exemplo.com');
  assert.equal((await req('POST', '/mentor/actions/__proto__/confirm', {})).status, 410);
  assert.equal((await req('POST', '/mentor/actions/__proto__/cancel', {})).status, 200);
  const admin = client();
  assert.equal((await admin('POST', '/auth/login', { email: 'chefe-audit@exemplo.com', senha: 'admin-seguro-123' })).status, 200);
  const list = await admin('GET', '/admin/users?filtro=__proto__');
  assert.equal(list.status, 200);
  assert.equal(list.data.filtro, 'todos');
});

test('papel de arquivo desconhecido herdado do protótipo é recusado', async () => {
  const req = await student('papel@exemplo.com');
  assert.equal((await req('POST', '/documents/consent', { aceito: true, versao: '2026-11-13' })).status, 200);
  // O cliente de teste só envia JSON: monta a requisição binária com o mesmo cookie.
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'travessia' }, body: JSON.stringify({ email: 'papel@exemplo.com', senha: 'segura123' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const up = await fetch(`${base}/documents/passaporte/files?papel=constructor`, {
    method: 'POST', headers: { 'Content-Type': 'application/pdf', 'X-Requested-With': 'travessia', Cookie: cookie }, body: Buffer.from('%PDF-1.4\n%%EOF'),
  });
  assert.equal(up.status, 400);
});

test('histórico da IA sempre começa por "user"', () => {
  const h = [{ role: 'assistant', content: 'oi' }, { role: 'assistant', content: 'tudo bem?' }, { role: 'user', content: 'quero ajuda' }, { role: 'assistant', content: 'claro' }];
  assert.deepEqual(cleanHistory(h).map((m) => m.role), ['user', 'assistant']);
  assert.deepEqual(cleanHistory([{ role: 'assistant', content: 'só eu' }]), []);
  const long = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? 'user' : 'assistant', content: `m${i}` }));
  const r = recentHistory(long);
  assert.equal(r[0].role, 'user');
  assert.ok(r.length <= 10);
});

test('Mentor registra a chegada como a rota: requisitos "só na Espanha" valem na mesma gravação', async () => {
  const req = await student('mentor-chegada@exemplo.com');
  const { data: { journey } } = await req('POST', '/journeys', { programaId: ASIA_B2 });
  const u = users.findByEmail('mentor-chegada@exemplo.com');
  await users.update(u.id, (x) => {
    x.requisitos = { ...(x.requisitos || {}), tie: 'tenho' };
    const j = x.journeys.find((jj) => jj.id === journey.id);
    j.situacao = { ...(j.situacao || {}), adjudicacao: 'admitido', visto: 'aprovado' };
  });
  const r = await executeTool(makeCtx(users.findById(u.id), { journeyId: journey.id }), 'register_arrival', { journeyId: journey.id, dataEntrada: '2026-09-01' });
  assert.equal(r.ok, true, JSON.stringify(r.erro));
  const saved = users.findById(u.id).journeys.find((j) => j.id === journey.id);
  assert.equal(saved.dados.dataEntrada, '2026-09-01');
  assert.ok(saved.missions['8.1']?.requisitoAtendido, 'TIE declarada conclui as missões da Rodada 8 já na gravação do Mentor');
  // Data inexistente é recusada pela ferramenta.
  const bad = await executeTool(makeCtx(users.findById(u.id), { journeyId: journey.id }), 'register_arrival', { journeyId: journey.id, dataEntrada: '2026-02-30' });
  assert.equal(bad.ok, false);
});

test('exportação: tentativas de login de terceiros saem sem IP e navegador', async () => {
  const req = await student('export@exemplo.com');
  await audit.log({ action: 'login-failed', email: 'export@exemplo.com', ip: '203.0.113.9', ua: 'Navegador do estranho' });
  const r = await req('GET', '/me/export');
  assert.equal(r.status, 200);
  const failed = r.data.atividade.find((e) => e.action === 'login-failed');
  assert.ok(failed && failed.at);
  assert.equal(failed.ip, undefined);
  assert.equal(failed.ua, undefined);
  const own = r.data.atividade.find((e) => e.action === 'register');
  assert.ok(own && 'ip' in own, 'os próprios acessos continuam com IP');
});

test('exclusão de conta tem o limite de tentativas de senha (authLimiter)', async () => {
  const req = await student('apagar@exemplo.com');
  let last;
  for (let i = 0; i < 25; i += 1) {
    last = await req('DELETE', '/me', { senha: 'errada000' });
    if (last.status === 429) break;
  }
  assert.equal(last.status, 429);
});
