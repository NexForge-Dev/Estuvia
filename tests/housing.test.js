// Meu Novo Lar: custos, comparação, "Conferir antes de pagar", integração com o planejamento financeiro e missões.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-lar-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
process.env.RATE_LIMIT_SCALE = '20';
process.env.FX_PROVIDER = 'off';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

const { housingCosts, compareHousing, safetySummary } = await import('../server/housing-engine.js');
const { createApp } = await import('../server/app.js');
const { flush } = await import('../server/store.js');

test('9: custos — mensal, entrada, total da estadia; desconhecido não vira zero', () => {
  const c = housingCosts({ aluguel: 320, adicionais: 40, caucao: 640, taxaAgencia: 100 }, 10);
  assert.equal(c.mensal, 360);
  assert.equal(c.inicial, 320 + 640 + 100, '1º aluguel + caução + taxa');
  assert.equal(c.totalEstadia, 360 * 10 + 100, 'caução fica fora do gasto definitivo');
  assert.equal(c.caucaoReembolsavel, 640);
  const u = housingCosts({ aluguel: 300 }, 12);
  assert.equal(u.contasDesconhecidas, true);
  assert.equal(u.caucao, null);
  assert.equal(u.inicialParcial, true);
  assert.equal(housingCosts({ aluguel: 300, contasIncluidas: true }, 12).contasDesconhecidas, false);
});

test('8: comparação aponta diferenças sem eleger a mais barata', () => {
  const cmp = compareHousing([
    { id: 'a', nome: 'Realejo', aluguel: 300, adicionais: 40, caucao: 600 },
    { id: 'b', nome: 'Centro', aluguel: 380, adicionais: 40, caucao: 380 },
  ], 10);
  assert.ok(cmp.diferencas.some((t) => /Realejo custa € 80 a menos por mês que Centro, mas exige uma caução € 220 maior/.test(t)));
  assert.ok(cmp.diferencas.some((t) => /€ 800/.test(t)), 'diferença na estadia inteira');
  assert.match(cmp.aviso, /não é automaticamente a melhor/);
});

test('14: "Conferir antes de pagar" separa conferido, alerta e não sei', () => {
  const s = safetySummary({ checklist: { identidade: true, contrato: true }, sinais: { antecipado: true } });
  assert.equal(s.confirmadas, 2);
  assert.equal(s.nivel, 'alerta');
  assert.equal(s.alertas.length, 1);
  const all = safetySummary({ checklist: { identidade: true, contrato: true, imovel: true, pagamento: true, caucao: true, antecipado: true } });
  assert.equal(all.nivel, 'conferido', 'conferido ≠ seguro (a interface nunca diz "seguro")');
});

let server; let base;
before(async () => { server = createApp().listen(0); await new Promise((r) => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}/api`; });
after(async () => { server.close(); await flush(); fs.rmSync(tmp, { recursive: true, force: true }); });
function client() {
  let cookie = '';
  return async (method, url, body) => {
    const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'travessia' };
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, data: await res.json().catch(() => null) };
  };
}

test('3/5/6/10/11/16/18: fluxo completo pela API', async () => {
  const c = client();
  await c('POST', '/auth/register', { nome: 'Nina Reis', email: 'nina@exemplo.com', senha: 'segura123', aceite: true, maiorIdade: true });
  await c('PUT', '/me/profile', { nacionalidade: 'Brasileira', paisResidencia: 'Brasil', estado: 'BA', formacao: 'Letras', espanhol: 'B2', onboardingConcluido: true });
  const jid = (await c('POST', '/journeys', { programaId: 'ugr-demo-arq', anoAcademico: '2027/28' })).data.journey.id;

  let d = (await c('GET', '/living')).data;
  assert.equal(d.destino.cidade, 'Granada', 'destino vem da jornada');
  assert.equal(d.destino.meses, 18);
  assert.ok(d.destino.faixas.quarto.length === 3, 'faixas de preço só onde há fonte (UGR)');
  assert.ok(d.destino.busca.sites.length >= 3 && d.destino.busca.oficial.url.startsWith('https://internacional.ugr.es'));
  assert.equal(d.housing.length, 0);

  d = (await c('PUT', '/living/search', { tipo: 'quarto', orcamentoMax: 300, preferencias: ['universidade', 'contas'] })).data;
  assert.deepEqual(d.busca.preferencias, ['universidade', 'contas']);

  // Por link, só com o essencial.
  let r = await c('POST', '/living/housing', { nome: 'Quarto Realejo', aluguel: 300, tipo: 'quarto', bairro: 'Realejo', link: 'https://www.spotahome.com/es/s/granada' });
  assert.equal(r.status, 201);
  const a = r.data.criado;
  assert.equal(r.data.housing.find((x) => x.id === a).fonte, 'Spotahome', 'só o nome do site, nada é baixado');
  assert.equal(r.data.housing.find((x) => x.id === a).status, 'quero-conhecer');
  assert.equal((await c('POST', '/living/housing', { nome: 'X', aluguel: 1, tipo: 'quarto', link: 'http://inseguro.com' })).status, 400);
  r = await c('POST', '/living/housing', { nome: 'Piso Centro', aluguel: 380, tipo: 'quarto', caucao: 380, contasIncluidas: true, status: 'pesquisando' });
  const b = r.data.criado;
  assert.equal(r.data.housing.find((x) => x.id === b).status, 'quero-conhecer', 'status antigo convertido');

  // Comparar marca o objetivo da 6.1.
  const cmp = (await c('POST', '/living/compare', { ids: [a, b] })).data.comparacao;
  assert.equal(cmp.opcoes.length, 2);
  assert.ok(cmp.diferencas.some((t) => /caução dela ainda não foi informada|contas/.test(t)));
  assert.equal((await c('POST', '/living/compare', { ids: [a] })).status, 400);

  // Situação e conferência.
  d = (await c('PUT', `/living/housing/${b}`, { status: 'contato' })).data;
  d = (await c('PUT', `/living/housing/${b}`, { respostas: { contrato: 'ok', pagamento: 'ok', caucao: 'ok', antecipado: 'alerta' } })).data;
  let hb = d.housing.find((x) => x.id === b);
  assert.equal(hb.seguranca.nivel, 'alerta');
  assert.equal(hb.checklist.contrato, true);
  d = (await c('PUT', `/living/housing/${b}`, { respostas: { antecipado: null } })).data;
  hb = d.housing.find((x) => x.id === b);
  assert.equal(hb.seguranca.alertas.length, 0, '"não sei" limpa a resposta');

  // Escolher: uma só, e o planejamento financeiro acompanha (sem duplicar).
  await c('PUT', `/living/housing/${a}`, { status: 'escolhida' });
  let f = (await c('GET', `/finance?journeyId=${jid}`)).data.plano;
  const it = (id) => f.itens.find((i) => i.id === id);
  assert.equal(it('moradia').valorEur, 300);
  assert.equal(it('contas').valorEur, null, 'contas da moradia escolhida desconhecidas continuam desconhecidas');
  assert.equal(it('caucao').origemTipo, 'premissa', 'sem caução informada: premissa explícita de 1 mês');
  d = (await c('PUT', `/living/housing/${b}`, { status: 'escolhida' })).data;
  assert.equal(d.housing.filter((x) => x.status === 'escolhida').length, 1);
  assert.equal(d.housing.find((x) => x.id === a).status, 'contrato', 'a anterior volta para "contrato em análise"');
  f = (await c('GET', `/finance?journeyId=${jid}`)).data.plano;
  assert.equal(it('moradia').valorEur, 380, 'trocou de moradia, o plano trocou junto');
  assert.equal(it('contas').valorEur, 0);
  assert.equal(it('caucao').valorEur, 380);
  assert.equal(it('caucao').reembolsavel, true);

  // Missões 6.1/6.2 marcadas pelas ações (6.1 é trilha paralela: dá para explorar cedo).
  const m61 = (await c('GET', `/journeys/${jid}/missions/6.1`)).data.mission;
  assert.equal(m61.bloqueada, true, '6.1 depende de 1.3 (mestrado escolhido)');
  const j = (await c('GET', `/journeys/${jid}`)).data.journey;
  assert.ok(j.rodadas.find((x) => x.numero === 6).missoes.some((m) => m.id === '6.1'), 'a missão de pesquisa aparece mesmo com a Rodada 6 bloqueada');

  // Persistência entre sessões.
  const again = client();
  await again('POST', '/auth/login', { email: 'nina@exemplo.com', senha: 'segura123' });
  const g = (await again('GET', '/living')).data;
  assert.equal(g.housing.length, 2);
  assert.equal(g.busca.tipo, 'quarto');
  assert.ok(g.busca.comparadoEm);
});
