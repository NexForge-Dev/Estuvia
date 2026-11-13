// Progressão e desbloqueio de rodadas e missões — critérios de aceitação 1–15.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-prog-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
process.env.RATE_LIMIT_SCALE = '20';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

const { createApp } = await import('../server/app.js');
const { flush } = await import('../server/store.js');
const engine = await import('../server/journey-engine.js');

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

const today = new Date().toISOString().slice(0, 10);
const nextMonday = () => { const d = new Date(); d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7)); return d.toISOString().slice(0, 10); };
const round = (j, n) => j.rodadas.find((r) => r.numero === n);
const find = (j, id) => j.rodadas.flatMap((r) => r.missoes).find((m) => m.id === id);

// Executa uma missão como o estudante faria: marca os objetivos manuais e confirma a conclusão.
async function doMission(req, jid, id, { evidencia } = {}) {
  const m = (await req('GET', `/journeys/${jid}/missions/${id}`)).data.mission;
  assert.ok(!m.bloqueada, `missão ${id} deveria estar liberada`);
  for (const o of m.objetivos.filter((x) => !x.feito)) {
    if (o.tipo === 'check') await req('PUT', `/journeys/${jid}/missions/${id}/objectives/${o.id}`, { feito: true });
    if (o.tipo === 'data') await req('PUT', `/journeys/${jid}/missions/${id}/objectives/${o.id}`, { valor: today });
    if (o.tipo === 'texto') await req('PUT', `/journeys/${jid}/missions/${id}/objectives/${o.id}`, { valor: 'ok' });
    // Escolha validada no servidor (ex.: fase do DUA): a primeira opção aceita para o perfil.
    if (o.tipo === 'escolha') {
      for (const [v] of o.opcoes) if ((await req('PUT', `/journeys/${jid}/missions/${id}/objectives/${o.id}`, { valor: v })).status === 200) break;
    }
  }
  const r = await req('POST', `/journeys/${jid}/missions/${id}/complete`, { confirmo: true, ...(evidencia ? { evidencia } : {}) });
  assert.equal(r.status, 200, `concluir ${id}: ${JSON.stringify(r.data.error)}`);
  return r.data;
}

const PROFILE = { nacionalidade: 'Brasileira', paisResidencia: 'Brasil', estado: 'BA', formacao: 'Arquitetura', instituicao: 'UFBA', espanhol: 'B2', onboardingConcluido: true };
let req;
let jid;

test('acesso: manual é público; conteúdo da jornada e catálogo exigem conta', async () => {
  const anon = client();
  assert.equal((await anon('GET', '/content/manual')).status, 200);
  assert.equal((await anon('GET', '/content/catalog')).status, 401);
  assert.equal((await anon('GET', '/content/sources')).status, 401);
  const pub = (await anon('GET', '/content/journey')).data;
  assert.ok(pub.rounds.every((r) => r.missoes.length === 0), 'sem conta: só a visão geral das rodadas');
});

test('1–3: usuário novo começa na Rodada 1; rodadas futuras bloqueadas e sem conteúdo detalhado', async () => {
  req = client();
  assert.equal((await req('POST', '/auth/register', { nome: 'Ana Souza', email: 'ana@exemplo.com', senha: 'segura123', aceite: true, maiorIdade: true })).status, 201);
  await req('PUT', '/me/profile', PROFILE);
  const r = await req('POST', '/journeys', { programaId: 'ugr-demo-arq', anoAcademico: '2027/28' });
  assert.equal(r.status, 201);
  const j = r.data.journey;
  jid = j.id;
  assert.equal(j.rodadaAtual, 1);
  assert.equal(round(j, 1).desbloqueada, true);
  for (const n of [2, 3, 4, 5, 6, 7, 8]) assert.equal(round(j, n).desbloqueada, false, `Rodada ${n} bloqueada`);
  assert.equal(round(j, 3).missoes.length, 0, 'missões da Rodada 3 não são enviadas');
  assert.ok(round(j, 2).desbloqueio.faltam.some((f) => f.id === '1.3'), 'card explica o que falta');
  const prev = (await req('GET', `/journeys/${jid}/missions/2.1`)).data.mission;
  assert.equal(prev.bloqueada, true);
  assert.equal(prev.objetivos, undefined, 'sem checklist executável');
  assert.equal(prev.definicao, undefined, 'sem guia nem ferramentas');
  assert.ok(prev.previa.objetivo && prev.rodadaDesbloqueio.texto);
});

test('o navegador não consegue avançar uma missão bloqueada', async () => {
  assert.equal((await req('PUT', `/journeys/${jid}/missions/2.1/objectives/validade`, { feito: true })).status, 409);
  assert.equal((await req('PUT', `/journeys/${jid}/missions/2.1/state`, { execucao: 'fazendo' })).status, 409);
  assert.equal((await req('POST', `/journeys/${jid}/missions/2.1/complete`, { confirmo: true })).status, 409);
  assert.equal((await req('PUT', `/journeys/${jid}/missions/2.1/state`, { status: 'concluida' })).status, 400, 'estado não é um campo editável');
});

test('10: trilhas financeiras e preparação do visto funcionam em paralelo', async () => {
  const j = (await req('GET', `/journeys/${jid}`)).data.journey;
  assert.equal(find(j, '9.1').status, 'disponivel', 'financiamento desde a Rodada 1');
  assert.ok(['disponivel', 'em-andamento', 'atencao'].includes(find(j, '5.1').status), 'consulado pode ser identificado antes da Rodada 5');
  assert.ok(find(j, '5.1').trilha, 'marcada como trilha paralela');
  assert.equal(find(j, '5.7'), undefined, 'a solicitação formal do visto continua oculta');
  assert.equal(find(j, '6.1').status, 'bloqueada', 'pesquisa de moradia é paralela, mas depende de ter um mestrado (1.3)');
});

test('4–7: missões e rodada desbloqueadas pelos pré-requisitos, com eventos de feedback', async () => {
  await doMission(req, jid, '1.1');
  const d12 = await doMission(req, jid, '1.2');
  assert.ok(d12.events.some((e) => e.tipo === 'desbloqueio' && e.missoes.some((m) => m.id === '1.3')), '1.3 liberada');
  const done = d12.events.find((e) => e.tipo === 'missao-concluida');
  assert.ok(done.resultado && done.journeyId === jid, 'feedback com o resultado da missão');
  await doMission(req, jid, '1.3');
  const fin = (await req('GET', `/finance?journeyId=${jid}`)).data;
  await req('PUT', '/finance', { custos: { matricula: { valor: 1500, moeda: 'EUR' } } });
  await req('POST', '/finance/resources', { tipo: Object.keys(fin.tiposRecurso)[0], descricao: 'Poupança', valor: 9000, moeda: 'EUR', status: 'disponivel' });
  const before = (await req('GET', `/journeys/${jid}`)).data.journey;
  assert.equal(round(before, 2).desbloqueada, false, 'ainda falta o planejamento financeiro');
  const r = await doMission(req, jid, '1.5');
  assert.ok(r.events.some((e) => e.tipo === 'rodada-desbloqueada' && e.numero === 2), 'evento de nova rodada');
  assert.equal(round(r.journey, 2).desbloqueada, true);
  assert.equal(find(r.journey, '2.1').status, 'disponivel');
  assert.equal(round(r.journey, 1).status === 'concluida', false, '1.4 ainda pendente: a rodada não fecha');
});

test('8: a Agenda AI considera as novas missões e nunca agenda as bloqueadas', async () => {
  const s = (await req('POST', '/planner/suggest', { semana: nextMonday() })).data;
  const titles = [...s.proposta, ...s.naoAgendadas].map((x) => x.titulo).join('\n');
  assert.match(titles, /Missão 2\.1/, 'missão recém-desbloqueada entra no planejamento');
  assert.doesNotMatch(titles, /Missão 3\.\d/, 'Rodada 3 bloqueada fica de fora');
  assert.doesNotMatch(titles, /Missão 5\.7/, 'solicitação do visto bloqueada fica de fora');
});

test('9: prazos oficiais aparecem mesmo com a rodada bloqueada', async () => {
  const fake = (user) => (user.journeys || []).map((jr) => ({ journeyId: jr.id, missaoId: '3.2', data: '2099-03-01', titulo: 'Fase 1 do DUA (prazo oficial de teste)', fonteUrl: 'https://example.org' }));
  engine.registerOfficialDeadlines(fake);
  const j = (await req('GET', `/journeys/${jid}`)).data.journey;
  assert.equal(round(j, 3).desbloqueada, false);
  assert.ok(j.prazos.some((p) => p.missao === '3.2' && p.origem === 'oficial'), 'o prazo não é escondido pelo bloqueio');
});

test('12: recarregar não apaga o estado; recálculo é idempotente', async () => {
  const a = (await req('GET', `/journeys/${jid}`)).data;
  const b = (await req('GET', `/journeys/${jid}`)).data;
  assert.deepEqual(b.events, [], 'nenhum desbloqueio duplicado');
  const other = client();
  await other('POST', '/auth/login', { email: 'ana@exemplo.com', senha: 'segura123' });
  const c = (await other('GET', `/journeys/${jid}`)).data.journey;
  assert.equal(round(c, 2).desbloqueada, true);
  assert.equal(find(c, '1.5').status, 'concluida');
  assert.deepEqual(a.journey.rodadas.map((r) => r.desbloqueada), c.rodadas.map((r) => r.desbloqueada));
});

test('13: duas jornadas do mesmo usuário progridem de forma independente', async () => {
  const r = await req('POST', '/journeys', { programaId: 'ugr-demo-eng', anoAcademico: '2027/28' });
  const j2 = r.data.journey;
  assert.equal(round(j2, 2).desbloqueada, false, 'a outra jornada começa do início');
  assert.equal(find(j2, '1.2').status, 'disponivel');
  const j1 = (await req('GET', `/journeys/${jid}`)).data.journey;
  assert.equal(round(j1, 2).desbloqueada, true);
});

test('14: missão não aplicável não impede a progressão', async () => {
  await doMission(req, jid, '1.4');
  for (const id of ['2.1', '2.2', '2.3']) await doMission(req, jid, id);
  await req('PUT', '/me/documents', { passaporte: 'pronto', diploma: 'pronto', historico: 'pronto' });
  const mid = (await req('GET', `/journeys/${jid}`)).data.journey;
  assert.equal(find(mid, '2.5').status, 'nao-aplicavel', 'o mestrado de arquitetura (demo) não exige certificado');
  await doMission(req, jid, '2.4');
  await req('PUT', `/journeys/${jid}/missions/2.6/state`, { naoAplicavel: true });
  const r = await doMission(req, jid, '2.7');
  assert.equal(round(r.journey, 2).status, 'concluida');
  assert.ok(r.events.some((e) => e.tipo === 'rodada-concluida' && e.numero === 2));
  assert.ok(r.events.some((e) => e.tipo === 'rodada-desbloqueada' && e.numero === 3));
  const g = (await req('GET', `/journeys/${jid}/missions/3.6`)).data.mission;
  assert.equal(g.status, 'bloqueada', '3.6 ainda depende de 3.5');
  const m31 = (await req('GET', `/journeys/${jid}/missions/3.1`)).data.mission;
  assert.ok(m31.definicao.comoExecutar.length, 'conteúdo completo liberado na rodada desbloqueada');
});

test('15: decisão externa pendente não vira conclusão; evidência exigida no envio', async () => {
  for (const id of ['3.1', '3.2', '3.3', '3.4', '3.5']) await doMission(req, jid, id);
  const m = (await req('GET', `/journeys/${jid}/missions/3.6`)).data.mission;
  for (const o of m.objetivos.filter((x) => x.tipo === 'check')) await req('PUT', `/journeys/${jid}/missions/3.6/objectives/${o.id}`, { feito: true });
  const sit = await req('PUT', `/journeys/${jid}/missions/3.6/objectives/situacao`, { valor: 'aguardando' });
  assert.ok(sit.data.events.some((e) => e.tipo === 'rodada-desbloqueada' && e.numero === 4), 'registrar o envio libera a Rodada 4');
  assert.equal((await req('POST', `/journeys/${jid}/missions/3.6/complete`, { confirmo: true })).status, 400, 'sem a referência do comprovante');
  const r = await doMission(req, jid, '3.6', { evidencia: 'Comprovante DUA nº 12345' });
  const j = r.journey;
  assert.equal(find(j, '4.1').status, 'bloqueada', 'admissão ainda não registrada');
  assert.ok(find(j, '4.1').bloqueioExterno);
  assert.notEqual(find(j, '3.9').status, 'concluida', 'acompanhar a adjudicação não é concluído sozinho');
  assert.equal((await req('GET', `/journeys/${jid}/missions/3.6`)).data.mission.evidencia.valor, 'Comprovante DUA nº 12345');
});

test('SKIPPED: missão opcional pode ser ignorada conscientemente', async () => {
  const r = await req('PUT', `/journeys/${jid}/missions/3.8/state`, { ignorada: true });
  assert.equal(r.status, 200);
  assert.equal(find(r.data.journey, '3.8').status, 'ignorada');
  assert.equal(find(r.data.journey, '3.8').codigo, 'SKIPPED');
  assert.equal((await req('PUT', `/journeys/${jid}/missions/3.6/state`, { ignorada: true })).status, 400, 'obrigatória não pode ser ignorada');
});

test('chegada só pode ser registrada depois do visto aprovado', async () => {
  assert.equal((await req('POST', `/journeys/${jid}/arrival`, { dataEntrada: today, confirmo: true })).status, 409);
});

test('11: estudante que já está na Espanha registra o progresso anterior e chega à TIE', async () => {
  const c = client();
  await c('POST', '/auth/register', { nome: 'Bruno Lima', email: 'bruno@exemplo.com', senha: 'segura123', aceite: true, maiorIdade: true });
  await c('PUT', '/me/profile', PROFILE);
  const j0 = (await c('POST', '/journeys', { programaId: 'ugr-demo-eng', anoAcademico: '2026/27' })).data;
  assert.ok(j0.etapas.some((e) => e.id === 'na-espanha'));
  const id = j0.journey.id;
  assert.equal((await c('POST', `/journeys/${id}/prior-progress`, { etapa: 'na-espanha', dataEntrada: today })).status, 400, 'exige confirmação');
  assert.equal((await c('POST', `/journeys/${id}/prior-progress`, { etapa: 'na-espanha', confirmo: true })).status, 400, 'exige data de entrada');
  const future = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  assert.equal((await c('POST', `/journeys/${id}/prior-progress`, { etapa: 'na-espanha', dataEntrada: future, confirmo: true })).status, 400, 'data futura');
  const r = await c('POST', `/journeys/${id}/prior-progress`, { etapa: 'na-espanha', dataEntrada: today, confirmo: true });
  assert.equal(r.status, 200);
  const j = r.data.journey;
  assert.ok(r.data.declaradas.includes('3.6'));
  assert.equal(find(j, '3.6').status, 'concluida');
  assert.equal(find(j, '3.6').declarada, true, 'identificada como declarada pelo estudante');
  assert.equal(j.situacao.visto, 'aprovado');
  assert.equal(round(j, 7).desbloqueada, true);
  assert.equal(round(j, 8).desbloqueada, true);
  assert.ok(['disponivel', 'atencao'].includes(find(j, '8.1').status), 'TIE liberada sem refazer a candidatura');
  assert.equal(round(j, 7).status === 'concluida', false, 'a chegada continua para o estudante executar');
  for (const mid of ['8.1', '8.2']) await doMission(c, id, mid);
  const after = (await c('GET', `/journeys/${id}`)).data.journey;
  assert.notEqual(find(after, '8.3').status, 'bloqueada', 'a TIE não espera as tarefas da Rodada 7');
  assert.ok(after.prazos.some((p) => p.missao?.startsWith('8.')), 'prazo da TIE calculado a partir da entrada');
});

test('motor: recordUnlocks é idempotente e rodadas registradas não voltam a bloquear', () => {
  const user = { profile: PROFILE, journeys: [], documents: {} };
  const jr = { id: 'j1', programaId: 'ugr-demo-eng', anoAcademico: '2027/28', missions: {}, dados: {} };
  const first = engine.recordUnlocks(jr, engine.computeJourney(user, jr));
  assert.ok(first.some((e) => e.entidade === 'rodada:1'));
  assert.equal(engine.recordUnlocks(jr, engine.computeJourney(user, jr)).length, 0);
  jr.situacao = { adjudicacao: 'aguardando' };
  engine.recordUnlocks(jr, engine.computeJourney(user, jr));
  assert.equal(round(engine.computeJourney(user, jr), 4).desbloqueada, true);
  jr.situacao.adjudicacao = 'nao-enviada';
  assert.equal(round(engine.computeJourney(user, jr), 4).desbloqueada, true, 'desbloqueio registrado é persistente');
  assert.equal(new Set(jr.desbloqueios.map((e) => e.entidade)).size, jr.desbloqueios.length, 'sem duplicatas');
});

test('complexidade adaptativa e risco separados por missão', async () => {
  const j = (await req('GET', `/journeys/${jid}`)).data.journey;
  assert.equal(find(j, '1.2').complexidade, 'simples');
  assert.equal(find(j, '3.6').complexidade, 'complexa');
  assert.equal(find(j, '3.6').risco, 'alto');
  assert.equal(find(j, '7.6'), undefined, 'rodada bloqueada continua oculta');
  const d = (await req('GET', `/journeys/${jid}/missions/3.6`)).data.mission;
  assert.ok(d.riscoInfo.texto, 'risco explicado mesmo em linguagem curta');
});

test('requisito já atendido: passaporte e documentos sem burocracia, com histórico próprio e reversível', async () => {
  const c = client();
  await c('POST', '/auth/register', { nome: 'Carla Dias', email: 'carla@exemplo.com', senha: 'segura123', aceite: true, maiorIdade: true });
  await c('PUT', '/me/profile', PROFILE);
  const q = (await c('GET', '/journeys/requirements')).data;
  assert.ok(q.perguntas.some((p) => p.id === 'passaporte'));
  assert.equal((await c('PUT', '/journeys/requirements', { respostas: { passaporte: 'talvez' } })).status, 400);
  await c('PUT', '/journeys/requirements', { respostas: { passaporte: 'tenho', historico: 'tenho' } });
  const id = (await c('POST', '/journeys', { programaId: 'ugr-demo-eng', anoAcademico: '2027/28' })).data.journey.id;
  await doMission(c, id, '1.1');
  await doMission(c, id, '1.2');
  await doMission(c, id, '1.3');
  const fin = (await c('GET', `/finance?journeyId=${id}`)).data;
  await c('PUT', '/finance', { custos: { matricula: { valor: 1500, moeda: 'EUR' } } });
  await c('POST', '/finance/resources', { tipo: Object.keys(fin.tiposRecurso)[0], descricao: 'Poupança', valor: 9000, moeda: 'EUR', status: 'disponivel' });
  const r = await doMission(c, id, '1.5');
  const m21 = find(r.journey, '2.1');
  assert.equal(m21.status, 'concluida');
  assert.equal(m21.conclusao, 'requisito-atendido', 'diferente de "concluída na plataforma"');
  assert.equal(m21.statusLabel, 'Requisito já atendido');
  assert.equal(find(r.journey, '2.2').status, 'disponivel', 'diploma não declarado continua como missão');
  assert.equal((await c('GET', '/me')).data.user.documents.passaporte, 'pronto');
  const undo = await c('PUT', '/journeys/requirements', { respostas: { passaporte: 'verificar' } });
  assert.equal(undo.status, 200);
  const after = (await c('GET', `/journeys/${id}`)).data.journey;
  assert.notEqual(find(after, '2.1').status, 'concluida', 'corrigir a resposta desfaz só o que ela marcou');
  assert.equal(find(after, '1.2').status, 'concluida', 'missões feitas na plataforma continuam');
});
