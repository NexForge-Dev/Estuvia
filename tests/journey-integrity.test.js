// Integridade da jornada: reabrir, duplicidade, decisões externas, autorização por usuário,
// Agenda (aprovar/replanejar) e prazos por fuso horário.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-integ-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
process.env.RATE_LIMIT_SCALE = '20';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

const { createApp } = await import('../server/app.js');
const { flush, users } = await import('../server/store.js');
const engine = await import('../server/journey-engine.js');
const agenda = await import('../server/agenda-engine.js');

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

const PROFILE = { nacionalidade: 'Brasileira', paisResidencia: 'Brasil', estado: 'SP', formacao: 'Direito', instituicao: 'USP', espanhol: 'B2', onboardingConcluido: true };
const find = (j, id) => j.rodadas.flatMap((r) => r.missoes).find((m) => m.id === id);
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const nextMonday = () => { const d = new Date(); d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7)); return d.toISOString().slice(0, 10); };

async function student(nome, email) {
  const c = client();
  assert.equal((await c('POST', '/auth/register', { nome, email, senha: 'segura123', aceite: true })).status, 201);
  await c('PUT', '/me/profile', PROFILE);
  const me = (await c('GET', '/me')).data.user;
  return { c, uid: me.id };
}

async function doMission(c, jid, id) {
  const m = (await c('GET', `/journeys/${jid}/missions/${id}`)).data.mission;
  for (const o of m.objetivos.filter((x) => !x.feito && x.tipo === 'check')) await c('PUT', `/journeys/${jid}/missions/${id}/objectives/${o.id}`, { feito: true });
  return c('POST', `/journeys/${jid}/missions/${id}/complete`, { confirmo: true });
}

let ana;
let bia;
let jidA;

test('setup: duas estudantes com uma jornada cada', async () => {
  ana = await student('Ana Teste', 'ana.integ@exemplo.com');
  bia = await student('Bia Teste', 'bia.integ@exemplo.com');
  jidA = (await ana.c('POST', '/journeys', { programaId: 'ugr-demo-eng', anoAcademico: '2027/28' })).data.journey.id;
  assert.ok(jidA);
  assert.equal((await bia.c('POST', '/journeys', { programaId: 'ugr-demo-eng', anoAcademico: '2027/28' })).status, 201);
});

test('concluir duas vezes não duplica nada e explica que já está concluída', async () => {
  const r1 = await doMission(ana.c, jidA, '1.2');
  assert.equal(r1.status, 200);
  const antes = (await ana.c('GET', '/achievements')).data.resumo.pontos;
  const r2 = await ana.c('POST', `/journeys/${jidA}/missions/1.2/complete`, { confirmo: true });
  assert.equal(r2.status, 409);
  assert.match(r2.data.error, /já está concluída/);
  const concluidaEm = users.findById(ana.uid).journeys[0].missions['1.2'].concluidaEm;
  assert.equal(concluidaEm, r1.data.mission.concluidaEm, 'data da conclusão preservada');
  assert.equal((await ana.c('GET', '/achievements')).data.resumo.pontos, antes, 'sem pontos em dobro');
});

test('reabrir: dependentes voltam a esperar, rodada registrada não fecha e pontos não duplicam ao reconcluir', async () => {
  await doMission(ana.c, jidA, '1.3');
  let j = (await ana.c('GET', `/journeys/${jidA}`)).data.journey;
  assert.notEqual(find(j, '1.4').status, 'bloqueada');
  const re = await ana.c('POST', `/journeys/${jidA}/missions/1.3/reopen`, {});
  assert.equal(re.status, 200);
  j = re.data.journey;
  assert.notEqual(find(j, '1.3').status, 'concluida');
  assert.equal(find(j, '1.4').status, 'bloqueada', 'dependente aberta volta a aguardar a dependência');
  assert.ok(find(j, '1.4').bloqueadaPor.some((b) => b.id === '1.3'), 'explica o pré-requisito');
  assert.equal((await ana.c('POST', `/journeys/${jidA}/missions/1.3/reopen`, {})).status, 409, 'reabrir de novo é recusado');
  const p1 = (await ana.c('GET', '/achievements')).data.conquistas.find((a) => a.id === 'dez-missoes').progresso.atual;
  assert.equal((await ana.c('POST', `/journeys/${jidA}/missions/1.3/complete`, { confirmo: true })).status, 200);
  const p2 = (await ana.c('GET', '/achievements')).data.conquistas.find((a) => a.id === 'dez-missoes').progresso.atual;
  assert.equal(p2, p1 + 1, 'reconcluir conta uma vez só');
});

test('reabrir "requisito já atendido" não finge que reabriu: orienta a corrigir a resposta', async () => {
  await ana.c('PUT', '/journeys/requirements', { respostas: { passaporte: 'tenho' } });
  const j = (await ana.c('GET', `/journeys/${jidA}`)).data.journey;
  assert.equal(find(j, '2.1').conclusao, 'requisito-atendido');
  const r = await ana.c('POST', `/journeys/${jidA}/missions/2.1/reopen`, {});
  assert.equal(r.status, 409);
  assert.match(r.data.error, /O que eu já tenho/);
  await ana.c('PUT', '/journeys/requirements', { respostas: { passaporte: 'verificar' } });
});

test('autorização: uma estudante não lê nem altera a jornada ou a Agenda da outra', async () => {
  const ev = (await ana.c('POST', '/planner', { titulo: 'Estudar', categoria: 'pessoal', data: nextMonday(), inicio: '08:00', fim: '09:00' })).data.event;
  const tries = [
    ['GET', `/journeys/${jidA}`], ['PUT', `/journeys/${jidA}`, { anoAcademico: '2028/29' }], ['DELETE', `/journeys/${jidA}`],
    ['GET', `/journeys/${jidA}/missions/1.1`], ['POST', `/journeys/${jidA}/missions/1.1/complete`, { confirmo: true }],
    ['POST', `/journeys/${jidA}/missions/1.2/reopen`, {}], ['PUT', `/journeys/${jidA}/situacao`, { campo: 'adjudicacao', valor: 'aguardando' }],
    ['POST', `/journeys/${jidA}/prior-progress`, { etapa: 'mestrado-escolhido', confirmo: true }],
    ['POST', `/journeys/${jidA}/missions/1.1/notes`, { texto: 'invasão' }], ['POST', `/journeys/${jidA}/contacts`, { nome: 'X Y', fonteUrl: 'https://ugr.es' }],
    ['PUT', `/planner/events/${ev.id}`, { titulo: 'x', categoria: 'pessoal', data: nextMonday(), inicio: '08:00', fim: '09:00' }], ['DELETE', `/planner/events/${ev.id}`],
  ];
  for (const [m, url, body] of tries) assert.equal((await bia.c(m, url, body)).status, 404, `${m} ${url}`);
  assert.equal((await bia.c('POST', '/planner', { titulo: 'x', categoria: 'pessoal', data: nextMonday(), inicio: '08:00', fim: '09:00', journeyId: jidA })).status, 400);
  assert.equal((await bia.c('POST', '/planner/approve', { itens: [{ titulo: 'x', categoria: 'pessoal', data: nextMonday(), inicio: '08:00', fim: '09:00', journeyId: jidA }] })).status, 400, 'aprovar também valida a jornada');
  const a = users.findById(ana.uid);
  assert.equal(a.journeys[0].anoAcademico, '2027/28');
  assert.ok(a.planner.some((e) => e.id === ev.id && e.titulo === 'Estudar'));
  assert.ok(!a.journeys[0].missions['1.1']?.anotacoes?.length);
});

test('decisões externas: matrícula e visto não podem ser registrados antes da admissão', async () => {
  const r1 = await ana.c('PUT', `/journeys/${jidA}/situacao`, { campo: 'visto', valor: 'aprovado' });
  assert.equal(r1.status, 409);
  assert.equal((await ana.c('PUT', `/journeys/${jidA}/situacao`, { campo: 'matricula', valor: 'matriculado' })).status, 409);
  const won = (await ana.c('GET', '/achievements')).data.conquistas.filter((a) => a.conquistada).map((a) => a.id);
  assert.ok(!won.includes('visto-aprovado') && !won.includes('matriculado'), 'nenhuma conquista oficial autodeclarada sem base');
  // Voltar ao estado inicial é sempre permitido (correção de um engano).
  assert.equal((await ana.c('PUT', `/journeys/${jidA}/situacao`, { campo: 'visto', valor: 'preparacao' })).status, 200);
  const j = (await ana.c('GET', `/journeys/${jidA}`)).data.journey;
  assert.equal(j.situacao.visto, 'preparacao');
  assert.equal(users.findById(ana.uid).journeys[0].situacaoRegistro?.visto?.origem, 'declarado', 'registro marca a origem como declarada pelo estudante');
});

test('resultados adversos: não admitido, lista de espera e visto indeferido ficam representados', async () => {
  const { c } = await student('Caio Teste', 'caio.integ@exemplo.com');
  const id = (await c('POST', '/journeys', { programaId: 'ugr-demo-arq', anoAcademico: '2027/28' })).data.journey.id;
  let r = await c('PUT', `/journeys/${id}/situacao`, { campo: 'adjudicacao', valor: 'nao-admitido' });
  assert.equal(r.status, 200);
  assert.equal(find(r.data.journey, '4.1').status, 'bloqueada');
  assert.ok(find(r.data.journey, '4.1').bloqueioExterno, 'matrícula espera uma admissão, sem culpar o estudante');
  r = await c('PUT', `/journeys/${id}/situacao`, { campo: 'adjudicacao', valor: 'lista-espera' });
  assert.notEqual(find(r.data.journey, '3.10').status, 'nao-aplicavel');
  // Saiu da lista de espera e foi admitido: "Já fui admitido(a)" precisa atualizar a situação.
  r = await c('POST', `/journeys/${id}/prior-progress`, { etapa: 'admitido', confirmo: true });
  assert.equal(r.status, 200);
  assert.equal(r.data.journey.situacao.adjudicacao, 'admitido');
  assert.equal(find(r.data.journey, '4.1').bloqueioExterno, false);
  r = await c('PUT', `/journeys/${id}/situacao`, { campo: 'visto', valor: 'indeferido' });
  assert.equal(r.status, 200);
  assert.equal(find(r.data.journey, '5.9').status, 'bloqueada', 'conferir o visto não abre com indeferimento');
  // Novo pedido aprovado: "Já tenho o visto aprovado" sobe a situação.
  r = await c('POST', `/journeys/${id}/prior-progress`, { etapa: 'visto-aprovado', confirmo: true });
  assert.equal(r.data.journey.situacao.visto, 'aprovado');
});

test('anotações não podem ser registradas em missão bloqueada', async () => {
  const r = await ana.c('POST', `/journeys/${jidA}/missions/4.1/notes`, { texto: 'lembrete' });
  assert.equal(r.status, 409);
});

test('contatos acadêmicos têm limite por jornada', async () => {
  const { c } = await student('Duda Teste', 'duda.integ@exemplo.com');
  const id = (await c('POST', '/journeys', { programaId: 'ugr-demo-arq', anoAcademico: '2027/28' })).data.journey.id;
  let last;
  for (let i = 0; i < 31; i++) last = await c('POST', `/journeys/${id}/contacts`, { nome: `Prof ${i}`, fonteUrl: 'https://www.ugr.es/x' });
  assert.equal(last.status, 409);
  assert.equal(users.findById((await c('GET', '/me')).data.user.id).journeys[0].contatos.length, 30);
});

test('Agenda: aprovar duas vezes não duplica; replanejar preserva o que o estudante criou ou editou', async () => {
  const { c, uid } = await student('Eva Teste', 'eva.integ@exemplo.com');
  await c('POST', '/journeys', { programaId: 'ugr-demo-eng', anoAcademico: '2027/28' });
  await c('PUT', '/planner/availability', { dias: [1, 2, 3, 4, 5], janelas: [{ inicio: '09:00', fim: '12:00' }], horasSemanais: 6, preferencia: 'curtas', fuso: 'America/Sao_Paulo' });
  const semana = nextMonday();
  const s = (await c('POST', '/planner/suggest', { semana })).data;
  assert.ok(s.proposta.length >= 3);
  const itens = s.proposta.map(({ prioridadeLabel, ...x }) => Object.fromEntries(Object.entries(x).filter(([, v]) => v != null)));
  const a1 = await c('POST', '/planner/approve', { itens });
  assert.equal(a1.status, 201);
  assert.equal(a1.data.criados, itens.length);
  const a2 = await c('POST', '/planner/approve', { itens });
  assert.equal(a2.data.criados, 0, 'clique duplo não duplica blocos');
  assert.equal(users.findById(uid).planner.length, itens.length);

  const manual = (await c('POST', '/planner', { titulo: 'Aula de espanhol', categoria: 'pessoal', data: addDays(semana, 1), inicio: '14:00', fim: '15:00' })).data.event;
  const editado = users.findById(uid).planner.find((e) => e.origem === 'agenda-ai' && e.titulo.startsWith('Missão'));
  const { id: _i, origem: _o, criadoEm: _c, ...campos } = editado;
  assert.equal((await c('PUT', `/planner/events/${editado.id}`, { ...campos, inicio: '16:00', fim: '16:45' })).status, 200);
  const rp = await c('POST', '/planner/replan', { semana });
  assert.equal(rp.status, 200);
  const ids = new Set(rp.data.events.map((e) => e.id));
  assert.ok(ids.has(manual.id), 'compromisso manual preservado');
  assert.ok(ids.has(editado.id), 'bloco editado pelo estudante preservado');
  assert.ok(rp.data.events.filter((e) => e.origem === 'agenda-ai').length < itens.length, 'blocos não editados liberados para replanejar');
  const again = rp.data.proposta.map(({ prioridadeLabel, ...x }) => Object.fromEntries(Object.entries(x).filter(([, v]) => v != null)));
  await c('POST', '/planner/approve', { itens: again });
  const keys = users.findById(uid).planner.map((e) => `${e.data}|${e.inicio}`);
  assert.equal(new Set(keys).size, keys.length, 'nenhum horário duplicado após replanejar e aprovar');
});

test('prazos: dias restantes por data de calendário em Madri ("hoje" é 0, ontem é -1)', () => {
  const user = { profile: PROFILE, documents: {} };
  const jr = { id: 'jx', programaId: 'ugr-demo-eng', anoAcademico: '2027/28', missions: { '3.9': { prazo: '2026-11-10' } }, dados: {} };
  const dias = (now) => engine.computeJourney(user, jr, new Date(now)).prazos.find((p) => p.missao === '3.9').diasRestantes;
  assert.equal(dias('2026-11-09T10:00:00Z'), 1, 'véspera');
  assert.equal(dias('2026-11-10T10:00:00Z'), 0, 'dia do prazo');
  assert.equal(dias('2026-11-10T23:30:00Z'), -1, 'já passou da meia-noite em Madri');
  assert.equal(dias('2026-11-11T10:00:00Z'), -1);
});

test('chegada: data de hoje em Madri é aceita mesmo antes da virada em UTC', () => {
  const user = { profile: PROFILE, documents: {} };
  const jr = { id: 'jy', programaId: 'ugr-demo-eng', missions: {}, dados: {}, situacao: { visto: 'aprovado', adjudicacao: 'admitido' } };
  // 23:30 UTC de 09/11 = 00:30 de 10/11 em Madri: quem acabou de desembarcar informa 10/11.
  engine.registerArrival(user, jr, { dataEntrada: '2026-11-10', confirmo: true }, new Date('2026-11-09T23:30:00Z'));
  assert.equal(jr.dados.dataEntrada, '2026-11-10');
  assert.throws(() => engine.registerArrival(user, jr, { dataEntrada: '2026-11-11', confirmo: true }, new Date('2026-11-09T23:30:00Z')), /futuro/);
});

test('Agenda: "hoje" segue o fuso do estudante, não o UTC', () => {
  // 01:30 UTC de 10/11 ainda é 22:30 de 09/11 em São Paulo.
  assert.equal(agenda.todayFor({ agenda: { disponibilidade: { fuso: 'America/Sao_Paulo' } } }, new Date('2026-11-10T01:30:00Z')), '2026-11-09');
  assert.equal(agenda.todayFor({}, new Date('2026-11-10T01:30:00Z')), '2026-11-09', 'padrão: America/Sao_Paulo');
  assert.equal(agenda.todayFor({ agenda: { disponibilidade: { fuso: 'Europe/Madrid' } } }, new Date('2026-11-09T23:30:00Z')), '2026-11-10');
});
