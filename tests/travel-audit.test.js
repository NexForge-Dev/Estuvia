// Auditoria da viagem e dos preços de passagens: nada de cotação inventada, links só do Aviasales,
// moedas diferentes não se comparam e um estudante não mexe nos dados de outro.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-travel-audit-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
process.env.RATE_LIMIT_SCALE = '20';
process.env.FX_PROVIDER = 'off';
delete process.env.TRAVELPAYOUTS_TOKEN;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

const { normalizeOffer, routePrices, clearPriceCache } = await import('../server/flight-prices.js');
const { computeTravel } = await import('../server/travel-engine.js');
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

test('link de oferta: só caminhos do próprio Aviasales', () => {
  const link = (l) => normalizeOffer({ price: 100, link: l }, 'brl').link;
  assert.equal(link('/search/REC1009MAD1?t=1'), 'https://www.aviasales.com/search/REC1009MAD1?t=1');
  assert.equal(link('//evil.example/phish'), null, 'protocol-relative levaria a outro domínio');
  assert.equal(link('/\\evil.example/phish'), null);
  assert.equal(link('https://evil.example/'), null);
  assert.equal(link(42), null);
  assert.equal(normalizeOffer({ price: 0 }, 'brl'), null, 'preço zero/ausente não vira oferta');
});

test('preços: sem token desligado; erro, timeout e resposta vazia não fabricam oferta', async () => {
  clearPriceCache();
  const q = { origem: 'REC', destino: 'MAD', quando: '2027-08' };
  assert.deepEqual(await routePrices(q, { token: '' }), { ok: false, ofertas: [], erro: 'desligado' });
  let calls = 0;
  const fail = async () => { calls += 1; return new Response('{}', { status: 500 }); };
  const r1 = await routePrices(q, { token: 't', fetchImpl: fail });
  assert.equal(r1.ok, false);
  assert.deepEqual(r1.ofertas, []);
  await routePrices(q, { token: 't', fetchImpl: fail });
  assert.equal(calls, 2, 'erro não fica em cache');
  const timeout = async () => { const e = new Error('t'); e.name = 'TimeoutError'; throw e; };
  assert.match((await routePrices(q, { token: 't', fetchImpl: timeout })).erro, /demorou/);
  let limitedCalls = 0;
  const limited = async () => { limitedCalls += 1; return new Response('{}', { status: 429 }); };
  assert.match((await routePrices(q, { token: 't', fetchImpl: limited })).erro, /limite/);
  assert.match((await routePrices({ ...q, destino: 'AGP' }, { token: 't', fetchImpl: limited })).erro, /limite/);
  assert.equal(limitedCalls, 1, 'após um 429 o provedor descansa (não gasta a cota a cada tela)');
  clearPriceCache();
  const junk = async () => new Response(JSON.stringify({ success: true, data: [{ price: 'abc' }, { price: -5 }] }), { status: 200 });
  const r2 = await routePrices(q, { token: 't', fetchImpl: junk });
  assert.equal(r2.ok, true);
  assert.deepEqual(r2.ofertas, []);
  assert.ok(r2.consultadoEm);
  assert.deepEqual(await routePrices({ ...q, origem: 'rec' }, { token: 't', fetchImpl: junk }), { ok: false, ofertas: [], erro: 'rota inválida' });
  clearPriceCache();
});

test('cotações em moedas diferentes não ganham "diferença para a mais barata"', () => {
  const opcoes = [
    { id: 'a', rota: 'REC → MAD', voo: 4000, bagagem: 0, moeda: 'BRL', percursoId: 'via-granada' },
    { id: 'b', rota: 'REC → GRX', voo: 700, bagagem: 0, moeda: 'EUR', percursoId: 'via-granada' },
    { id: 'c', rota: 'REC → GRX', voo: 650, bagagem: 0, moeda: 'EUR', percursoId: 'via-granada' },
  ];
  const t = computeTravel({ profile: {}, travel: { opcoes } });
  const by = (id) => t.cotacoes.find((c) => c.id === id);
  assert.equal(t.moedaComparacao, 'BRL');
  assert.equal(by('a').diferencaParaMenor, 0);
  assert.equal(by('b').diferencaParaMenor, null, 'não subtrai euro de real');
  assert.equal(by('c').diferencaParaMenor, null);
  // Primeira cotação incompleta (sem bagagem) não define a moeda de comparação.
  const v = computeTravel({ profile: {}, travel: { opcoes: [{ id: 'x', rota: 'REC → GRX', voo: 3000, moeda: 'BRL', percursoId: 'via-granada' }, ...opcoes.slice(1)] } });
  assert.equal(v.moedaComparacao, 'EUR');
  assert.equal(v.cotacoes.find((c) => c.id === 'b').diferencaParaMenor, 50);
  assert.equal(v.cotacoes.find((c) => c.id === 'x').diferencaParaMenor, null);
});

const session = () => {
  let cookie = '';
  return async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'travessia', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, data: await res.json() };
  };
};

test('API: um estudante não lê nem altera moradia, cotação, recurso ou bolsa de outro', async () => {
  const ana = session();
  const bob = session();
  await ana('POST', '/auth/register', { nome: 'Ana Souza', email: 'ana@audit.dev', senha: 'segura123', aceite: true });
  await bob('POST', '/auth/register', { nome: 'Bob Lima', email: 'bob@audit.dev', senha: 'segura123', aceite: true });
  const h = (await ana('POST', '/living/housing', { nome: 'Quarto da Ana', tipo: 'quarto', aluguel: 300 })).data.criado;
  const q = (await ana('POST', '/travel/quotes', { rota: 'REC → MAD', voo: 700 })).data.cotacoes[0].id;
  const r = (await ana('POST', '/finance/resources', { tipo: 'poupanca', descricao: 'Poupança', valor: 5000, moeda: 'EUR', status: 'disponivel' })).data.plano.recursos[0].id;
  const s = (await ana('POST', '/finance/scholarships', { nome: 'Bolsa da Ana', valorTotal: 3000 })).data.candidaturas[0].id;
  assert.ok(h && q && r && s);

  assert.equal((await bob('PUT', `/living/housing/${h}`, { status: 'escolhida' })).status, 404);
  assert.equal((await bob('POST', '/living/compare', { ids: [h, h] })).status, 404);
  assert.equal((await bob('PUT', `/travel/quotes/${q}`, { voo: 1 })).status, 404);
  assert.equal((await bob('POST', `/travel/quotes/${q}/purchase`, { comprada: true, confirmo: true })).status, 404);
  assert.equal((await bob('PUT', `/finance/resources/${r}`, { valor: 1 })).status, 404);
  assert.equal((await bob('PUT', `/finance/scholarships/${s}`, { status: 'concedida' })).status, 404);
  await bob('DELETE', `/living/housing/${h}`);
  await bob('DELETE', `/finance/resources/${r}`);
  await bob('DELETE', `/travel/quotes/${q}`);
  assert.equal((await bob('GET', '/living')).data.housing.length, 0);

  const mine = await ana('GET', '/living');
  assert.equal(mine.data.housing.length, 1);
  assert.equal(mine.data.housing[0].status, 'quero-conhecer');
  const fin = await ana('GET', '/finance');
  assert.equal(fin.data.plano.recursos.find((x) => x.id === r).valor, 5000);
  assert.equal(fin.data.candidaturas[0].status, 'interesse');
  const tr = await ana('GET', '/travel');
  assert.equal(tr.data.cotacoes[0].voo, 700);
  assert.equal(tr.data.cotacoes[0].comprada, false);
});

test('API: selecionar a moradia atualiza o orçamento (inclui a taxa de agência)', async () => {
  const cy = session();
  await cy('POST', '/auth/register', { nome: 'Cy Rocha', email: 'cy@audit.dev', senha: 'segura123', aceite: true });
  await cy('POST', '/journeys', { programaId: 'ugr-demo-eng', anoAcademico: '2027/28' });
  const antes = (await cy('GET', '/finance')).data.plano;
  const h = (await cy('POST', '/living/housing', { nome: 'Piso', tipo: 'quarto', aluguel: 410, contasIncluidas: true, caucao: 410, taxaAgencia: 200 })).data.criado;
  await cy('PUT', `/living/housing/${h}`, { status: 'escolhida' });
  const depois = (await cy('GET', '/finance')).data.plano;
  assert.equal(depois.moradia.id, h);
  assert.equal(depois.itens.find((i) => i.id === 'moradia').valorEur, 410);
  assert.equal(depois.itens.find((i) => i.id === 'taxaAgencia').valorEur, 200);
  assert.ok(depois.orcamento > antes.orcamento);
});

test('API: /living/travel/routes respeita o mesmo limite de cotações', async () => {
  const di = session();
  await di('POST', '/auth/register', { nome: 'Di Melo', email: 'di@audit.dev', senha: 'segura123', aceite: true });
  for (let i = 0; i < 20; i += 1) assert.equal((await di('POST', '/living/travel/routes', { rota: `Rota ${i}`, voo: 500 })).status, 201);
  assert.equal((await di('POST', '/living/travel/routes', { rota: 'Rota 21', voo: 500 })).status, 409);
});

test('API: bolsas salvas têm limite', async () => {
  const ed = session();
  await ed('POST', '/auth/register', { nome: 'Ed Reis', email: 'ed@audit.dev', senha: 'segura123', aceite: true });
  for (let i = 0; i < 50; i += 1) assert.equal((await ed('POST', '/finance/scholarships', { nome: `Bolsa ${i}` })).status, 201);
  assert.equal((await ed('POST', '/finance/scholarships', { nome: 'Bolsa 51' })).status, 409);
});
