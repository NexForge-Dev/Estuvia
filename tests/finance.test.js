// Planejador financeiro: cálculos determinísticos (sem LLM) e API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-fin-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
process.env.RATE_LIMIT_SCALE = '20';
process.env.FX_PROVIDER = 'off';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

const { computeFinance, financialDeadlines } = await import('../server/finance-engine.js');
const { createApp } = await import('../server/app.js');
const { flush } = await import('../server/store.js');

const NOW = new Date('2026-10-24T12:00:00Z');
const journey = (over = {}) => ({ id: 'j1', programaId: 'ugr-demo-eng', anoAcademico: '2027/28', duracaoMeses: 12, missions: {}, dados: {}, ...over });
const user = (finance = {}, extra = {}) => ({ profile: {}, documents: {}, finance: { ...finance }, ...extra });
const item = (f, id) => f.itens.find((i) => i.id === id);

test('1/6/18: sem conhecer preços, o plano já tem estimativas com fonte — e o desconhecido fica desconhecido', () => {
  const f = computeFinance(user(), journey(), NOW);
  assert.equal(f.destino.cidade, 'Granada');
  assert.equal(item(f, 'moradia').valorEur, 300, 'perfil equilibrado: meio da faixa publicada pela UGR');
  assert.equal(item(f, 'moradia').fonte.id, 'O15');
  assert.equal(item(f, 'moradia').origemTipo, 'premissa');
  assert.equal(item(f, 'alimentacao').valorEur, 179, 'INE EPF 2024: 15,8% de €13.626 ÷ 12');
  assert.equal(item(f, 'alimentacao').fonte.id, 'O17');
  assert.equal(item(f, 'transporte').valorEur, null, 'sem fonte confiável: não inventamos preço');
  assert.ok(f.faltamInformar.includes('transporte') && f.faltamInformar.includes('matricula'));
  assert.equal(f.parcial, true);
  assert.equal(item(f, 'caucao').valorEur, 300, 'premissa explícita: 1 mês de aluguel');
  assert.match(item(f, 'caucao').nota, /Premissa/);
  assert.equal(f.planoIniciado, false, 'estimativas automáticas não contam como plano feito pelo estudante');
});

test('4/5: instalação e mensal separados; visto calculado à parte e fora do custo', () => {
  const f = computeFinance(user(), journey(), NOW);
  assert.equal(f.mensal, 300 + 179);
  assert.equal(f.mensalTotal, (300 + 179) * 12);
  assert.equal(f.orcamento, f.instalacao + f.mensalTotal);
  assert.equal(f.preparar, f.instalacao + f.mensal, 'A: instalação + primeiro mês');
  assert.equal(f.exigenciaVisto, 600 * 12, 'C: IPREM 2026 × 12 meses');
  const longer = computeFinance(user(), journey({ duracaoMeses: 18 }), NOW);
  assert.equal(longer.mensalTotal, (300 + 179) * 18, 'duração muda o recorrente');
  assert.equal(longer.orcamento - longer.exigenciaVisto !== f.orcamento - f.exigenciaVisto, true);
  assert.equal(f.orcamento, f.itens.reduce((s, i) => s + (i.valorEur ?? 0) * (i.grupo === 'mensal' ? 12 : 1), 0), 'nada de dupla contagem com o visto');
});

test('8: três cenários comparáveis a partir das premissas transparentes', () => {
  const f = computeFinance(user(), journey(), NOW);
  const [eco, eq, conf] = f.cenarios;
  assert.deepEqual(f.cenarios.map((c) => c.perfil), ['economico', 'equilibrado', 'confortavel']);
  assert.ok(eco.orcamento < eq.orcamento && eq.orcamento < conf.orcamento);
  assert.equal(eco.mensal, 250 + Math.round(179 * 0.85));
  assert.equal(conf.mensal, 350 + Math.round(179 * 1.25));
});

test('reembolsável, já pago e zero ≠ desconhecido', () => {
  const f = computeFinance(user({ itens: { matricula: { valor: 2000, moeda: 'EUR', status: 'pago' }, transporte: { valor: 0, moeda: 'EUR', status: 'confirmado' } } }), journey(), NOW);
  assert.equal(item(f, 'matricula').pago, true);
  assert.equal(f.jaPago, 2000);
  assert.equal(f.aDesembolsar, f.orcamento - 2000, 'pago sai do que falta desembolsar');
  assert.ok(f.orcamento >= 2000, '…mas continua no custo total histórico');
  assert.equal(f.custoDefinitivo, f.orcamento - item(f, 'caucao').valorEur, 'caução é necessidade de caixa, não gasto definitivo');
  assert.equal(item(f, 'transporte').valorEur, 0);
  assert.ok(!f.faltamInformar.includes('transporte'), 'zero informado é informação, não ausência');
});

test('10: disponível × prometido × bolsas; real sem câmbio não vira euro', () => {
  const recursos = [
    { id: 'a', tipo: 'poupanca', descricao: 'Poupança', valor: 4000, moeda: 'EUR', status: 'disponivel' },
    { id: 'b', tipo: 'familiar', descricao: 'Pai', valor: 3000, moeda: 'EUR', status: 'prometido' },
    { id: 'c', tipo: 'poupanca', descricao: 'Conta no Brasil', valor: 10000, moeda: 'BRL', status: 'disponivel' },
  ];
  const apps = [{ id: 's1', nome: 'Bolsa X', status: 'concedida', valorTotal: 5000, moeda: 'EUR' }, { id: 's2', nome: 'Bolsa Y', status: 'enviada', valorTotal: 8000, moeda: 'EUR' }];
  let f = computeFinance(user({ recursos, informouRecursos: true }, { scholarshipApps: apps }), journey(), NOW);
  assert.equal(f.confirmados, 4000 + 5000, 'sem câmbio, os R$ 10.000 não entram; prometido e bolsa enviada não contam');
  assert.equal(f.gruposRecursos.prometido.total, 3000);
  assert.equal(f.gruposRecursos['bolsa-solicitada'].total, 8000);
  assert.equal(f.gruposRecursos.disponivel.semCambio, 1);
  f = computeFinance(user({ recursos, informouRecursos: true, cambio: 5, spreadPct: 4 }, { scholarshipApps: apps }), journey(), NOW);
  assert.equal(f.cambioInfo.origem, 'manual');
  assert.equal(Math.round(f.confirmados), 4000 + 5000 + Math.round((10000 / 5) * 0.96), 'conversão com custo de 4%');
  assert.equal(f.falta, Math.max(0, f.aDesembolsar - f.confirmados));
});

test('12: moradia e viagem escolhidas alimentam o plano sem duplicar', () => {
  const extra = {
    housing: [{ id: 'h', nome: 'Quarto Realejo', status: 'escolhida', aluguel: 320, adicionais: 40, caucao: 640, moeda: 'EUR' }],
    travel: { opcoes: [{ id: 'r', rota: 'GRU → MAD → GRX', voo: 800, bagagem: 60, terrestre: 30, escolhida: true }], chegada: {} },
  };
  const f = computeFinance(user({ itens: { moradia: { valor: 999, moeda: 'EUR' } } }, extra), journey(), NOW);
  assert.equal(item(f, 'moradia').valorEur, 360, 'aluguel + adicionais da moradia escolhida (vence o valor digitado)');
  assert.equal(item(f, 'moradia').editavel, false);
  assert.equal(item(f, 'contas').valorEur, 0, 'contas já incluídas na moradia escolhida');
  assert.equal(item(f, 'caucao').valorEur, 640);
  assert.equal(item(f, 'passagens').valorEur, 890);
  assert.equal(f.linhas.find((l) => l.id === 'moradia').origem, 'moradia escolhida');
});

test('destino sem premissa local: moradia desconhecida, alimentação com referência nacional', () => {
  const f = computeFinance(user(), journey({ programaId: 'us-demo-adm' }), NOW);
  assert.equal(f.destino.premissasLocais, false);
  assert.equal(item(f, 'moradia').valorEur, null);
  assert.equal(item(f, 'alimentacao').valorEur, 179);
});

test('9/13: economia mensal até a partida e pagamentos com data na Agenda', () => {
  const u = user({ itens: { matricula: { valor: 2000, moeda: 'EUR', status: 'confirmado', vencimento: '2027-07-15' }, documentos: { valor: 300, moeda: 'EUR', status: 'pago', vencimento: '2027-01-10' } }, recursos: [], informouRecursos: true, partida: '2027-08-24' });
  const f = computeFinance(u, journey(), NOW);
  assert.equal(f.partidaOrigem, 'simulada');
  assert.equal(f.mesesAteViagem, 10);
  assert.equal(Math.round(f.economiaMensal), Math.round(f.deficit / 10));
  const d = financialDeadlines(u);
  assert.equal(d.length, 1, 'só o que ainda não foi pago');
  assert.equal(d[0].data, '2027-07-15');
});

// ---------- API ----------
let server;
let base;
before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
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

test('2/7/14/15: API recupera a jornada, recalcula a cada alteração e guarda entre sessões', async () => {
  const c = client();
  await c('POST', '/auth/register', { nome: 'Lia Costa', email: 'lia@exemplo.com', senha: 'segura123', aceite: true });
  const jid = (await c('POST', '/journeys', { programaId: 'ugr-demo-eng', anoAcademico: '2027/28' })).data.journey.id;
  let f = (await c('GET', `/finance?journeyId=${jid}`)).data;
  assert.equal(f.plano.destino.universidade.sigla, 'UGR');
  assert.equal(f.plano.destino.anoAcademico, '2027/28');
  assert.equal(f.plano.cambioInfo.origem, null, 'sem serviço de câmbio: nada de taxa fingida');
  const before = f.plano.orcamento;
  f = (await c('PUT', `/finance?journeyId=${jid}`, { iniciar: true, itens: { transporte: { valor: 30, moeda: 'EUR' } } })).data;
  assert.equal(f.plano.orcamento, before + 30 * 12 + 30, 'resultado imediato, sem "Recalcular" (a reserva de 1 mês acompanha o custo mensal)');
  assert.equal(f.plano.planoIniciado, true);
  f = (await c('PUT', `/finance?journeyId=${jid}`, { perfil: 'economico' })).data;
  assert.equal(f.plano.perfil, 'economico');
  f = (await c('POST', `/finance/scenarios?journeyId=${jid}`, { nome: 'Plano enxuto' })).data;
  const sid = f.plano.cenariosSalvos[0].id;
  await c('PUT', `/finance?journeyId=${jid}`, { perfil: 'confortavel', itens: { transporte: null } });
  f = (await c('PUT', `/finance/scenarios/${sid}/principal?journeyId=${jid}`)).data;
  assert.equal(f.plano.perfil, 'economico', 'cenário salvo volta a ser o principal');
  assert.equal(f.plano.itens.find((i) => i.id === 'transporte').valorEur, 30);
  f = (await c('PUT', `/finance?journeyId=${jid}`, { cambio: 5.5 })).data;
  assert.equal(f.plano.cambioInfo.origem, 'manual');
  assert.equal((await c('POST', `/finance/resources?journeyId=${jid}`, { tipo: 'familiar', descricao: 'Mãe', valor: 2000, moeda: 'EUR', status: 'prometido' })).status, 201);
  assert.equal((await c('PUT', `/finance?journeyId=${jid}`, { itens: { inexistente: { valor: 1 } } })).status, 400);
  const again = client();
  await again('POST', '/auth/login', { email: 'lia@exemplo.com', senha: 'segura123' });
  const g = (await again('GET', `/finance?journeyId=${jid}`)).data;
  assert.equal(g.plano.perfil, 'economico');
  assert.equal(g.plano.gruposRecursos.prometido.total, 2000);
  assert.equal(g.plano.confirmados, 0, 'prometido não vira dinheiro garantido');
});
