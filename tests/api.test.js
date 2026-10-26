import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Base isolada e IA desligada: os testes nunca tocam dados reais nem chamam a API externa.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
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

function client() {
  let cookie = '';
  return async (method, url, body, { csrf = true } = {}) => {
    const headers = { 'Content-Type': 'application/json' };
    if (csrf) headers['X-Requested-With'] = 'travessia';
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  };
}

const USER = { nome: 'Maria Silva', email: 'maria@exemplo.com', senha: 'segura123', aceite: true };
const nextMonday = () => { const d = new Date(); d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7)); return d.toISOString().slice(0, 10); };
const flat = (j) => j.rodadas.flatMap((r) => r.missoes);
const find = (j, id) => flat(j).find((m) => m.id === id);
let req;
let jid;

// ---------- Autenticação e segurança ----------

test('cadastro cria sessão segura e não expõe hash', async () => {
  req = client();
  const r = await req('POST', '/auth/register', USER);
  assert.equal(r.status, 201);
  assert.equal(r.data.user.passwordHash, undefined);
  assert.match(r.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(r.headers.get('set-cookie'), /SameSite=Strict/i);
});

test('cadastro rejeita duplicado, senha fraca e falta de aceite; login com erro genérico', async () => {
  const c = client();
  assert.equal((await c('POST', '/auth/register', USER)).status, 409);
  assert.equal((await c('POST', '/auth/register', { ...USER, email: 'x@y.com', senha: 'curta' })).status, 400);
  assert.equal((await c('POST', '/auth/register', { ...USER, email: 'z@y.com', aceite: false })).status, 400);
  const wrong = await c('POST', '/auth/login', { email: USER.email, senha: 'errada999' });
  const ghost = await c('POST', '/auth/login', { email: 'ninguem@x.com', senha: 'errada999' });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.data.error, ghost.data.error);
});

test('rotas privadas exigem login, CSRF exigido e cabeçalhos de segurança presentes', async () => {
  assert.equal((await client()('GET', '/journeys')).status, 401);
  assert.equal((await req('PUT', '/me/profile', { apelido: 'Mari' }, { csrf: false })).status, 403);
  const r = await fetch(`${base}/health`);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r.headers.get('x-powered-by'), null);
});

// ---------- Jornada, rodadas e missões ----------

test('1–2: criar jornada Brasil → Granada com mestrado e requisitos aplicados', async () => {
  const p = await req('PUT', '/me/profile', { nacionalidade: 'Brasileira', paisResidencia: 'Brasil', estado: 'BA', formacao: 'Engenharia Civil', instituicao: 'UFBA', espanhol: 'B1', onboardingConcluido: true });
  assert.equal(p.status, 200);
  assert.equal((await req('PUT', '/me/profile', { isAdmin: true })).status, 400, 'campos extras são rejeitados');
  const r = await req('POST', '/journeys', { programaId: 'ugr-demo-eng', anoAcademico: '2027/28' });
  assert.equal(r.status, 201);
  const j = r.data.journey;
  jid = j.id;
  assert.equal(j.destino.universidade.sigla, 'UGR');
  assert.equal(j.rodadas.length, 9, '8 rodadas + trilha financeira');
  assert.equal(find(j, '3.10'), undefined, 'Rodada 3 ainda bloqueada: as missões dela não são enviadas ao navegador');
  assert.ok(find(j, '9.1').status === 'disponivel', 'trilha financeira é paralela desde o início');
  assert.equal((await req('POST', '/journeys', { programaId: 'ugr-demo-eng', anoAcademico: '2027/28' })).status, 409);
  assert.equal((await req('POST', '/journeys', { programaId: 'inexistente', anoAcademico: '2027/28' })).status, 400);
});

test('3: a Rodada 3 (DUA) começa bloqueada e só mostra a prévia', async () => {
  const j = (await req('GET', `/journeys/${jid}`)).data.journey;
  const r3 = j.rodadas[2];
  assert.equal(r3.desbloqueada, false);
  assert.equal(r3.ocultas, 10, '10 missões do processo DUA, ainda ocultas');
  assert.ok(r3.desbloqueio.texto);
  const d = (await req('GET', `/journeys/${jid}/missions/3.6`)).data.mission;
  assert.equal(d.bloqueada, true);
  assert.equal(d.definicao, undefined, 'sem guia, checklist nem ferramentas');
  assert.ok(d.previa.objetivo);
});

test('4/12: concluir missão exige objetivos + confirmação e atualiza dependentes, rodada e jornada', async () => {
  const blocked = await req('PUT', `/journeys/${jid}/missions/1.4/objectives/acesso`, { feito: true });
  assert.equal(blocked.status, 409, '1.4 depende de 1.3');
  await req('PUT', `/journeys/${jid}/missions/1.2/objectives/catalogo`, { feito: true });
  assert.equal((await req('POST', `/journeys/${jid}/missions/1.2/complete`, { confirmo: true })).status, 409, 'objetivos pendentes');
  await req('PUT', `/journeys/${jid}/missions/1.2/objectives/portal`, { feito: true });
  assert.equal((await req('POST', `/journeys/${jid}/missions/1.2/complete`, { confirmo: false })).status, 400, 'sem confirmação explícita');
  const before = (await req('GET', `/journeys/${jid}`)).data.journey;
  const r = await req('POST', `/journeys/${jid}/missions/1.2/complete`, { confirmo: true });
  assert.equal(r.status, 200);
  assert.equal(find(r.data.journey, '1.2').status, 'concluida');
  assert.notEqual(find(r.data.journey, '1.3').status, 'bloqueada', '1.3 desbloqueada');
  assert.ok(r.data.events.some((e) => e.tipo === 'missao-concluida'));
  assert.ok(r.data.events.some((e) => e.tipo === 'desbloqueio'));
  assert.ok(r.data.journey.progresso > before.progresso);
  assert.equal((await req('PUT', `/journeys/${jid}/missions/1.2/objectives/catalogo`, { feito: false })).status, 409, 'concluída exige reabrir');
  assert.equal((await req('PUT', `/journeys/${jid}/missions/1.2/objectives/auto`, { feito: true })).status, 404);
});

test('5/13: decisões externas — aguardando resultado, depois admissão destaca matrícula', async () => {
  let r = await req('PUT', `/journeys/${jid}/situacao`, { campo: 'adjudicacao', valor: 'aguardando' });
  assert.equal(find(r.data.journey, '4.1').status, 'bloqueada');
  assert.ok(find(r.data.journey, '4.1').bloqueadaPor.some((b) => b.externo), 'bloqueio externo, não falha do estudante');
  r = await req('PUT', `/journeys/${jid}/situacao`, { campo: 'adjudicacao', valor: 'admitido' });
  assert.equal(r.status, 200);
  const m41 = find(r.data.journey, '4.1');
  assert.equal(m41.status, 'disponivel');
  assert.equal(m41.prioridade, 'critica', 'confirmação/matrícula vira prioridade crítica');
  assert.ok(r.data.events.some((e) => e.tipo === 'urgente'));
  assert.equal((await req('PUT', `/journeys/${jid}/situacao`, { campo: 'adjudicacao', valor: 'xyz' })).status, 400);
  r = await req('PUT', `/journeys/${jid}/situacao`, { campo: 'adjudicacao', valor: 'lista-espera' });
  assert.equal(find(r.data.journey, '3.10').status !== 'nao-aplicavel', true, 'missão condicional de lista de espera aparece');
  await req('PUT', `/journeys/${jid}/situacao`, { campo: 'adjudicacao', valor: 'admitido' });
});

test('14: visto aprovado libera conferência e prioriza viagem', async () => {
  const r = await req('PUT', `/journeys/${jid}/situacao`, { campo: 'visto', valor: 'aprovado' });
  assert.equal(find(r.data.journey, '5.9').status, 'disponivel');
  assert.equal(find(r.data.journey, '5.9').prioridade, 'critica', 'conferir o visto vira prioridade');
  assert.equal(find(r.data.journey, '6.3').status, 'bloqueada', 'passagem ainda depende da escolha do mestrado (1.3)');
});

test('estado de execução e "aguardando terceiros" são registrados sem concluir a missão', async () => {
  let r = await req('PUT', `/journeys/${jid}/missions/2.3/state`, { execucao: 'fazendo' });
  assert.equal(r.data.mission.status, 'em-andamento');
  r = await req('PUT', `/journeys/${jid}/missions/2.3/state`, { aguardando: true });
  assert.equal(r.data.mission.status, 'aguardando');
  assert.equal(r.data.mission.concluidaEm, null);
  assert.equal((await req('PUT', `/journeys/${jid}/missions/2.3/state`, { execucao: 'invalido' })).status, 400);
});

test('6: contato acadêmico exige link oficial https', async () => {
  assert.equal((await req('POST', `/journeys/${jid}/contacts`, { nome: 'Coord.', fonteUrl: 'http://x.com' })).status, 400);
  const r = await req('POST', `/journeys/${jid}/contacts`, { nome: 'Coordenação do máster', fonteUrl: 'https://masteres.ugr.es/', email: '' });
  assert.equal(r.status, 201);
  assert.equal(r.data.contatos.length, 1);
});

// ---------- Financiamento ----------

test('7–9: falta de recursos gera caminhos; bolsa concedida atualiza o simulador', async () => {
  let f = (await req('GET', `/finance?journeyId=${jid}`)).data;
  assert.equal(f.plano.iprem.mensal, 600);
  assert.equal(f.plano.exigenciaVisto, 600 * f.plano.meses, 'exigência parametrizada pelo IPREM do ano');
  f = (await req('PUT', `/finance?journeyId=${jid}`, { custos: { alimentacao: { valor: 250, moeda: 'EUR' }, matricula: { valor: 2000, moeda: 'EUR' } } })).data;
  f = (await req('POST', `/finance/resources?journeyId=${jid}`, { tipo: 'poupanca', descricao: 'Poupança', valor: 3000, moeda: 'EUR', status: 'disponivel' })).data;
  assert.ok(f.plano.deficit > 0);
  assert.ok(f.plano.caminhos.some((c) => c.id === 'bolsas'));
  f = (await req('POST', `/finance/resources?journeyId=${jid}`, { tipo: 'familiar', descricao: 'Apoio do padrasto', valor: 4000, moeda: 'EUR', status: 'previsto' })).data;
  assert.equal(f.plano.confirmados, 3000, 'recurso previsto não conta como disponível');
  f = (await req('POST', `/finance/scholarships?journeyId=${jid}`, { catalogId: 'auip-garcia-lorca', prazo: '2027-03-01' })).data;
  const app = f.candidaturas[0];
  assert.equal(app.tarefas.length, 5, 'tarefas de candidatura criadas');
  f = (await req('PUT', `/finance/scholarships/${app.id}?journeyId=${jid}`, { status: 'concedida', valorTotal: 9000 })).data;
  assert.equal(f.plano.confirmados, 12000, 'cobertura concedida entra nos recursos');
  assert.ok(f.candidaturas[0].tarefas.some((t) => t.texto.startsWith('Aceitar a bolsa')));
});

test('moradia escolhida e rota escolhida entram no orçamento', async () => {
  let l = (await req('POST', '/living/housing', { nome: 'Quarto Realejo', tipo: 'quarto', aluguel: 350, caucao: 350, adicionais: 40 })).data;
  l = (await req('PUT', `/living/housing/${l.housing[0].id}`, { status: 'escolhida', checklist: { contrato: true } })).data;
  assert.equal(l.housing[0].checklist.contrato, true);
  l = (await req('POST', '/living/travel/routes', { rota: 'Brasil → Madri → Granada', voo: 900, bagagem: 80, terrestre: 40 })).data;
  await req('PUT', `/living/travel/routes/${l.travel.opcoes[0].id}`, { escolhida: true });
  const f = (await req('GET', `/finance?journeyId=${jid}`)).data;
  const line = (id) => f.plano.linhas.find((x) => x.id === id);
  assert.equal(line('moradia').valor, 390);
  assert.equal(line('caucao').valor, 350);
  assert.equal(line('passagens').valor, 1020);
});

// ---------- Agenda AI ----------

test('10–11: Agenda AI propõe a semana, aprova, replaneja e nunca conclui missões', async () => {
  await req('PUT', '/planner/availability', { dias: [1, 2, 3, 4, 5], janelas: [{ inicio: '09:00', fim: '11:00' }], horasSemanais: 5, preferencia: 'curtas', fuso: 'America/Sao_Paulo' });
  await req('POST', `/finance/scholarships?journeyId=${jid}`, { catalogId: 'fundacion-carolina', prazo: '2027-02-15' });
  const semana = nextMonday();
  const s = (await req('POST', '/planner/suggest', { semana })).data;
  assert.ok(s.proposta.length > 0);
  assert.ok(s.resumo.planejadoMin <= 5 * 60);
  assert.ok(s.proposta.some((p) => p.prioridade === 'critica'), 'prioridade crítica entra primeiro');
  const ap = await req('POST', '/planner/approve', { itens: s.proposta.map(({ prioridadeLabel, ...x }) => Object.fromEntries(Object.entries(x).filter(([, v]) => v != null))) });
  assert.equal(ap.status, 201);
  assert.ok(ap.data.events.every((e) => e.origem === 'agenda-ai' || e.origem === 'estudante'));
  const focus = (await req('POST', '/planner/suggest', { semana, journeyId: jid, missaoId: '4.1' })).data;
  assert.ok(focus.proposta.every((p) => p.missaoId === '4.1'), 'organizar uma missão específica');
  const rp = (await req('POST', '/planner/replan', { semana })).data;
  assert.ok(Array.isArray(rp.removidos));
  const j = (await req('GET', `/journeys/${jid}`)).data.journey;
  assert.notEqual(find(j, '4.1').status, 'concluida', 'agenda não conclui missão');
  assert.ok(ap.data.deadlines.some((d) => d.bolsaId), 'prazo da bolsa aparece na agenda');
});

test('assistente offline responde ações rápidas com dados da jornada e propõe ações', async () => {
  const r = await req('POST', '/assistant/ask', { acao: 'semdinheiro', journeyId: jid });
  assert.equal(r.status, 200);
  assert.match(r.data, /event: done/);
  const next = await req('POST', '/assistant/ask', { pergunta: 'Qual é a minha próxima missão?', journeyId: jid });
  assert.match(next.data, /próxima missão/i);
  assert.match(next.data, /acoes/);
});

// ---------- Persistência e privacidade ----------

test('15: sair e entrar de novo mantém o progresso', async () => {
  await req('POST', '/auth/logout');
  assert.equal((await req('GET', `/journeys/${jid}`)).status, 401);
  await req('POST', '/auth/login', { email: USER.email, senha: USER.senha });
  const j = (await req('GET', `/journeys/${jid}`)).data.journey;
  assert.equal(find(j, '1.2').status, 'concluida');
  assert.equal(j.situacao.adjudicacao, 'admitido');
});

test('documentos aceitam os 6 status e exportação inclui jornadas', async () => {
  assert.equal((await req('PUT', '/me/documents', { historico: 'correcao' })).status, 200);
  assert.equal((await req('PUT', '/me/documents', { historico: 'validado' })).status, 400);
  const ex = await req('GET', '/me/export');
  assert.equal(ex.data.journeys.length, 1);
});

test('logout geral invalida sessões e exclusão de conta exige senha', async () => {
  const other = client();
  await other('POST', '/auth/login', { email: USER.email, senha: USER.senha });
  await req('POST', '/auth/logout-all');
  assert.equal((await other('GET', '/me')).status, 401);
  const again = client();
  await again('POST', '/auth/login', { email: USER.email, senha: USER.senha });
  assert.equal((await again('DELETE', '/me', { senha: 'errada' })).status, 401);
  assert.equal((await again('DELETE', '/me', { senha: USER.senha })).status, 200);
  assert.equal((await again('POST', '/auth/login', { email: USER.email, senha: USER.senha })).status, 401);
});
