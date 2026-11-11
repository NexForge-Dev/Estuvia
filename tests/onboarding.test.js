// Onboarding reformulado: destino sem mestrado obrigatório, definição posterior do mestrado, duplicidade,
// início por período, TIE pela duração, "não sei" (idioma/orçamento), "preciso verificar" (documentos),
// conclusão validada no servidor e integração do orçamento com o planejador financeiro.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-onb-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
process.env.RATE_LIMIT_SCALE = '20';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

const { createApp } = await import('../server/app.js');
const { flush, users } = await import('../server/store.js');
const engine = await import('../server/journey-engine.js');
const { radarPrograms } = await import('../server/radar/service.js');
const geo = await import('../public/js/data/geo.js');

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
let n = 0;
async function student() {
  const c = client();
  n += 1;
  assert.equal((await c('POST', '/auth/register', { nome: `Aluna ${n}`, email: `onb${n}@exemplo.com`, senha: 'segura123', aceite: true })).status, 201);
  return c;
}
const find = (j, id) => j.rodadas.flatMap((r) => r.missoes).find((m) => m.id === id);
const FULL = {
  nacionalidade: 'Brasil', paisResidencia: 'Brasil', estado: 'BA', formacao: 'Graduação concluída', instituicao: 'UFBA - Universidade Federal da Bahia',
  area: 'Engenharia Civil', espanhol: 'nao-sei', certificadoEspanhol: 'nenhum', certificadoNivel: '', ingles: 'B2', orcamentoSituacao: 'informado', orcamentoDisponivel: 15000,
};

test('geo: divisões por país, UF do Brasil como sigla e nomes de país compatíveis com o motor', () => {
  assert.equal(geo.countryCode('Brasil'), 'BR');
  assert.equal(geo.countryCode('Brasileira'), 'BR', 'valor antigo do campo livre');
  assert.equal(geo.countryName('BR'), 'Brasil', 'o motor compara paisResidencia com "Brasil"');
  assert.ok(geo.divisionsFor('Brasil').options.some((o) => o.value === 'BA'));
  assert.equal(geo.divisionsFor('Brasil').options.length, 27);
  assert.equal(geo.divisionsFor('México').options.length, 32);
  assert.ok(geo.divisionsFor('Espanha').options.some((o) => o.value === 'Granada' && o.group === 'Andalucía'));
  assert.equal(geo.divisionsFor('Estados Unidos').options.length, 51);
  assert.equal(geo.divisionsFor('Japão'), null, 'sem lista relevante: nenhum campo artificial');
  for (const d of Object.values(geo.DIVISIONS)) for (const o of d.options) assert.ok(o.value.length <= 40, `${o.value} cabe em profile.estado`);
});

test('progress-stages informa quantas missões cada etapa reconhece', async () => {
  const c = await student();
  const { etapas } = (await c('GET', '/journeys/progress-stages')).data;
  assert.equal(etapas[0].id, 'inicio');
  assert.equal(etapas[0].missoes, 0);
  assert.ok(etapas.every((e, i) => i === 0 || e.missoes >= etapas[i - 1].missoes), 'contagem acumulada');
});

test('jornada sem mestrado: destino = universidade; duplicidade por universidade + ano', async () => {
  const c = await student();
  assert.equal((await c('POST', '/journeys', { anoAcademico: '2027/28' })).status, 400, 'sem universidade nem mestrado');
  const r = await c('POST', '/journeys', { universidadeId: 'ugr', anoAcademico: '2027/28', duracaoMeses: 12, inicioAulas: '2027-09-01', inicioAulasAproximado: true });
  assert.equal(r.status, 201);
  const j = r.data.journey;
  assert.equal(j.destino.programa, null);
  assert.equal(j.destino.universidade.id, 'ugr');
  assert.equal(j.destino.inicioAulas, '2027-09-01');
  assert.equal(j.destino.inicioAulasAproximado, true);
  assert.equal(j.prazos.find((p) => p.titulo === 'Início das aulas')?.rotulo, 'Início das aulas (mês previsto)');
  assert.equal(j.rodadaAtual, 1);
  assert.ok(find(j, '1.1'), 'jornada gerada com as missões');
  assert.equal((await c('POST', '/journeys', { universidadeId: 'ugr', anoAcademico: '2027/28' })).status, 409, 'mesma universidade e ano, ainda sem mestrado');
  assert.equal((await c('POST', '/journeys', { universidadeId: 'ugr', anoAcademico: '2028/29' })).status, 201, 'outro ano é outra jornada');
  assert.equal((await c('POST', '/journeys', { universidadeId: 'us', programaId: 'ugr-demo-eng', anoAcademico: '2027/28' })).status, 400, 'mestrado de outra universidade');
});

test('definir o mestrado depois: mesma universidade, sem duplicar, Missão 1.3 reconhece', async () => {
  const c = await student();
  const jid = (await c('POST', '/journeys', { universidadeId: 'ugr', anoAcademico: '2027/28' })).data.journey.id;
  // A 1.3 ainda está bloqueada pela 1.2 (a API só mostra a prévia): o objetivo automático é conferido no motor.
  const objetivo = () => { const u = users.findByEmail(`onb${n}@exemplo.com`); return engine.missionDetail(u, u.journeys.find((x) => x.id === jid), '1.3').objetivos.find((o) => o.id === 'programa').feito; };
  assert.equal(objetivo(), false);
  assert.equal((await c('PUT', `/journeys/${jid}/program`, { programaId: 'inexistente' })).status, 400);
  const other = radarPrograms().find((p) => p.universidadeId !== 'ugr');
  if (other) assert.equal((await c('PUT', `/journeys/${jid}/program`, { programaId: other.id })).status, 400, 'outra universidade');
  const r = await c('PUT', `/journeys/${jid}/program`, { programaId: 'ugr-demo-eng' });
  assert.equal(r.status, 200);
  assert.equal(r.data.journey.destino.programa.id, 'ugr-demo-eng');
  assert.equal(objetivo(), true, 'Missão 1.3: "Mestrado desta jornada definido"');
  assert.ok((await c('GET', '/me')).data.user.choices.includes('ugr-demo-eng'));
  const second = (await c('POST', '/journeys', { universidadeId: 'ugr', anoAcademico: '2028/29' })).data.journey.id;
  assert.equal((await c('PUT', `/journeys/${second}/program`, { programaId: 'ugr-demo-eng' })).status, 409, 'o mesmo mestrado não vira duas jornadas');
  assert.equal((await c('POST', '/journeys', { programaId: 'ugr-demo-eng', anoAcademico: '2027/28' })).status, 409, 'regra antiga por mestrado preservada');
});

test('duração da estadia controla a TIE (regra > 6 meses preservada)', async () => {
  const c = await student();
  const curta = (await c('POST', '/journeys', { universidadeId: 'uma', anoAcademico: '2027/28', duracaoMeses: 6 })).data.journey;
  assert.equal(find(curta, '8.1').status, 'nao-aplicavel');
  const longa = (await c('POST', '/journeys', { universidadeId: 'us', anoAcademico: '2027/28', duracaoMeses: 12 })).data.journey;
  assert.notEqual(find(longa, '8.1').status, 'nao-aplicavel');
  const semDuracao = (await c('POST', '/journeys', { universidadeId: 'uco', anoAcademico: '2027/28', duracaoMeses: null })).data.journey;
  assert.notEqual(find(semDuracao, '8.1').status, 'nao-aplicavel', 'sem duração: atenção, nunca "não aplicável"');
});

test('progresso anterior funciona em jornada sem mestrado (estudante já na Espanha)', async () => {
  const c = await student();
  await c('PUT', '/me/profile', FULL);
  const jid = (await c('POST', '/journeys', { universidadeId: 'uca', anoAcademico: '2026/27', duracaoMeses: 12 })).data.journey.id;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  const r = await c('POST', `/journeys/${jid}/prior-progress`, { etapa: 'na-espanha', confirmo: true, dataEntrada: today });
  assert.equal(r.status, 200);
  assert.ok(r.data.journey.progressoAnterior.missoes > 0);
  assert.equal(r.data.journey.chegada, today);
});

test('respostas válidas de "não sei" e "preciso verificar"; níveis inválidos rejeitados', async () => {
  const c = await student();
  assert.equal((await c('PUT', '/me/profile', { espanhol: 'nao-sei', ingles: 'nao-sei' })).status, 200);
  assert.equal((await c('PUT', '/me/profile', { certificadoNivel: 'nativo' })).status, 400, 'certificado só de A1 a C2');
  assert.equal((await c('PUT', '/me/profile', { orcamentoSituacao: 'talvez' })).status, 400);
  for (const doc of ['passaporte', 'diploma', 'historico', 'tie']) {
    assert.equal((await c('PUT', '/journeys/requirements', { respostas: { [doc]: 'verificar' } })).status, 200, `${doc}: verificar`);
  }
  const jid = (await c('POST', '/journeys', { universidadeId: 'ugr', anoAcademico: '2027/28' })).data.journey.id;
  let j = (await c('GET', `/journeys/${jid}`)).data.journey;
  assert.notEqual(find(j, '2.3')?.conclusao, 'requisito-atendido', '"verificar" não conclui a missão');
  await c('PUT', '/journeys/requirements', { respostas: { historico: 'tenho' } });
  j = (await c('GET', `/journeys/${jid}`)).data.journey;
  assert.equal(find(j, '2.3').conclusao, 'requisito-atendido', '"tenho" continua concluindo como requisito atendido');
  assert.equal((await c('GET', '/me')).data.user.documents.historico, 'pronto', 'documento declarado entra na Carteira');
});

test('conclusão do onboarding: o servidor exige o essencial e é idempotente', async () => {
  const c = await student();
  let r = await c('POST', '/me/onboarding/complete', {});
  assert.equal(r.status, 422);
  assert.ok(r.data.faltam.includes('nacionalidade') && r.data.faltam.includes('jornada'));
  assert.equal((await c('GET', '/me')).data.user.profile.onboardingConcluido, undefined, 'nada marcado antes dos dados');
  await c('PUT', '/me/profile', { ...FULL, estado: '' });
  await c('PUT', '/journeys/requirements', { respostas: { passaporte: 'tenho', diploma: 'aguardando', historico: 'verificar' } });
  await c('POST', '/journeys', { universidadeId: 'ugr', anoAcademico: '2027/28' });
  r = await c('POST', '/me/onboarding/complete', {});
  assert.equal(r.status, 422);
  assert.deepEqual(r.data.faltam, ['estado'], 'residente no Brasil precisa da UF (consulado)');
  await c('PUT', '/me/profile', { estado: 'BA' });
  r = await c('POST', '/me/onboarding/complete', {});
  assert.equal(r.status, 200);
  assert.equal(r.data.user.profile.onboardingConcluido, true);
  assert.equal((await c('POST', '/me/onboarding/complete', {})).status, 200, 'repetir não quebra');
});

test('conclusão aceita "não sei" do orçamento, mas não orçamento ausente', async () => {
  const c = await student();
  await c('PUT', '/me/profile', { ...FULL, orcamentoSituacao: undefined, orcamentoDisponivel: null });
  await c('PUT', '/journeys/requirements', { respostas: { passaporte: 'preciso', diploma: 'nao', historico: 'preciso' } });
  await c('POST', '/journeys', { universidadeId: 'us', anoAcademico: '2027/28' });
  let r = await c('POST', '/me/onboarding/complete', {});
  assert.deepEqual(r.data.faltam, ['orçamento']);
  await c('PUT', '/me/profile', { orcamentoSituacao: 'nao-sei', orcamentoDisponivel: null });
  r = await c('POST', '/me/onboarding/complete', {});
  assert.equal(r.status, 200);
  const fin = (await c('GET', '/finance')).data;
  assert.equal(fin.plano.orcamentoDeclarado.situacao, 'nao-sei');
  assert.equal(fin.plano.orcamentoDeclarado.valor, null, 'ausência nunca vira zero');
});

test('orçamento informado aparece no planejador como referência (não como recurso)', async () => {
  const c = await student();
  await c('PUT', '/me/profile', FULL);
  await c('POST', '/journeys', { universidadeId: 'ugr', anoAcademico: '2027/28', duracaoMeses: 12 });
  const fin = (await c('GET', '/finance')).data.plano;
  assert.equal(fin.orcamentoDeclarado.situacao, 'informado');
  assert.equal(fin.orcamentoDeclarado.valor, 15000);
  assert.equal(typeof fin.orcamentoDeclarado.diferenca, 'number');
  assert.equal(fin.confirmados, 0, 'o valor declarado não entra nos recursos comprovados');
  assert.equal(fin.informouRecursos, false);
});
