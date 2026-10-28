import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Coleta, saúde da fonte e honestidade do estado. Nenhum teste acessa a rede: fetchImpl simulado.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-fetch-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.RADAR_DATA_FILE = path.join(tmp, 'radar.json');
process.env.RADAR_SCHEDULER = 'off';

// Relógio fixo (só Date): um dia após a captura dos snapshots oficiais (24/10/2026).
// Avançar o relógio também libera o intervalo mínimo entre requisições ao mesmo domínio.
mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-25T12:00:00Z') });
const later = () => mock.timers.tick(10_000);

const SEED = new URL('../server/radar/seed/', import.meta.url);
const CAL = new TextDecoder('windows-1252').decode(fs.readFileSync(new URL('dua-calendario-2026-27.html', SEED)));

const { politeFetch } = await import('../server/radar/http.js');
const radarDb = await import('../server/radar/db.js');
const pipeline = await import('../server/radar/pipeline.js');
const service = await import('../server/radar/service.js');
const { SCHOLARSHIPS } = await import('../server/content/scholarships.js');

before(() => service.initRadar());
after(async () => {
  await radarDb.flushRadar();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const dua = () => radarDb.data().sources.find((s) => s.id === 'dua-calendario');
const html = (body, headers = {}) => new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });

/** fetch simulado: robots.txt vazio (404) e uma função para a página. */
const site = (page) => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
    calls.push({ url, headers: init.headers || {} });
    return page(url, init.headers || {});
  };
  return { fetchImpl, calls };
};

test('página com estrutura alterada não conta como verificação e vai para revisão', async () => {
  const before = dua().ultimaVerificacaoOk;
  const broken = '<html><body><span class="badge">CURSO 2026/2027</span><p>Página em manutenção</p></body></html>';
  const { fetchImpl } = site(() => html(broken, { etag: '"quebrada"' }));
  later();
  const run = await pipeline.runSource('dua-calendario', { fetchImpl });
  assert.equal(run.resultado, 'revisao');
  assert.equal(dua().ultimaVerificacaoOk, before, 'a última verificação bem-sucedida não avança');
  assert.equal(dua().estado, 'falhando');
  assert.match(dua().ultimoErro, /estrutura pode ter mudado/);
  assert.equal(dua().validadores?.[dua().url], undefined, 'sem ETag de conteúdo ilegível: um 304 não pode confirmá-lo depois');
  assert.ok(radarDb.data().reviews.some((r) => r.tipo === 'extracao-incerta' && r.status === 'aberta' && /estrutura/.test(r.motivo)));

  // Mesma página quebrada de novo (hash igual): continua sem verificação.
  later();
  const again = await pipeline.runSource('dua-calendario', { fetchImpl });
  assert.equal(again.resultado, 'revisao');
  assert.equal(dua().ultimaVerificacaoOk, before);
  assert.equal(dua().falhasSeguidas, 2);
});

test('falha de coleta nunca aparece como "conferido, sem mudanças"', async () => {
  const before = dua().ultimaVerificacaoOk;
  later();
  const run = await pipeline.runSource('dua-calendario', { fetchImpl: site(() => { throw new Error('ECONNRESET'); }).fetchImpl });
  assert.equal(run.resultado, 'erro');
  assert.equal(dua().ultimaVerificacaoOk, before);
  later();
  const r500 = await pipeline.runSource('dua-calendario', { fetchImpl: site(() => new Response('x', { status: 500 })).fetchImpl });
  assert.equal(r500.resultado, 'erro');
  assert.equal(dua().ultimaVerificacaoOk, before);
});

test('página válida verifica; 304 sobre essa coleta também verifica', async () => {
  const { fetchImpl, calls } = site((url, headers) => (headers['If-None-Match'] === '"v1"' ? new Response(null, { status: 304 }) : html(CAL, { etag: '"v1"' })));
  later();
  const ok = await pipeline.runSource('dua-calendario', { fetchImpl });
  assert.equal(ok.resultado, 'sem-alteracao');
  assert.equal(dua().estado, 'ok');
  assert.equal(dua().ultimaVerificacaoOk, new Date().toISOString());
  assert.equal(dua().validadores[dua().url].etag, '"v1"');
  later();
  const nm = await pipeline.runSource('dua-calendario', { fetchImpl });
  assert.equal(nm.naoModificadas, 1);
  assert.equal(calls.at(-1).headers['If-None-Match'], '"v1"');
  assert.equal(dua().ultimaVerificacaoOk, new Date().toISOString());
});

test('alteração crítica em revisão: as datas antigas deixam de aparecer como "confirmada"', async () => {
  const id = radarDb.data().opportunities.find((o) => o.anoAcademico === '2026/2027').id;
  assert.equal(service.opportunityDetail(id).verificacao.status, 'confirmada');
  const changed = CAL.replace('Desde el día 13', 'Desde el día 15');
  const r = pipeline.ingest('dua-calendario', { url: dua().url, text: changed });
  assert.equal(r.revisao, true);
  const v = service.opportunityDetail(id).verificacao;
  assert.equal(v.status, 'pendente');
  assert.equal(v.alteracaoEmRevisao, true);
  // Outro ano acadêmico não é afetado pela revisão.
  const other = radarDb.data().opportunities.find((o) => o.anoAcademico === '2027/2028').id;
  assert.equal(service.opportunityDetail(other).verificacao.status, 'nao-confirmada');
});

test('coleta só em domínios oficiais: redirecionamento externo é recusado', async () => {
  const allowedHosts = ['oficial-a.es'];
  const redirectTo = (loc) => async (url) => (url.endsWith('/robots.txt') ? new Response('', { status: 404 }) : url.includes('/inicio') ? new Response(null, { status: 302, headers: { location: loc } }) : html('<html>ok</html>'));
  await assert.rejects(politeFetch('https://oficial-a.es/inicio', { fetchImpl: redirectTo('http://169.254.169.254/latest/meta-data'), allowedHosts }), /fora da lista|HTTP sem criptografia/);
  later();
  await assert.rejects(politeFetch('https://oficial-a.es/inicio', { fetchImpl: redirectTo('https://evil.example/x'), allowedHosts }), /fora da lista/);
  await assert.rejects(politeFetch('https://evil.example/x', { fetchImpl: redirectTo('/'), allowedHosts }), /fora da lista/);
  later();
  const ok = await politeFetch('https://oficial-a.es/inicio', { fetchImpl: redirectTo('/destino'), allowedHosts });
  assert.equal(ok.url, 'https://oficial-a.es/destino');
  assert.equal(ok.text, '<html>ok</html>');
});

test('robots.txt do destino do redirecionamento também é respeitado', async () => {
  const fetchImpl = async (url) => {
    if (url === 'https://oficial-r.es/robots.txt') return new Response('User-agent: *\nDisallow: /privado', { status: 200 });
    if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
    return new Response(null, { status: 301, headers: { location: '/privado/x' } });
  };
  await assert.rejects(politeFetch('https://oficial-r.es/livre', { fetchImpl }), /robots\.txt não permite/);
});

test('robots.txt inacessível (5xx ou rede) = não coletar; 404 = sem restrições', async () => {
  const page = async (url, status) => (url.endsWith('/robots.txt') ? new Response('', { status }) : html('<html>ok</html>'));
  await assert.rejects(politeFetch('https://oficial-b.es/p', { fetchImpl: (u) => page(u, 503) }), /inacessível/);
  await assert.rejects(politeFetch('https://oficial-c.es/p', { fetchImpl: async (u) => { if (u.endsWith('/robots.txt')) throw new Error('timeout'); return html('x'); } }), /inacessível/);
  assert.equal((await politeFetch('https://oficial-d.es/p', { fetchImpl: (u) => page(u, 404) })).text, '<html>ok</html>');
});

test('resposta grande demais é recusada (Content-Length e corpo real)', async () => {
  const big = 'x'.repeat(2048);
  const fetchImpl = async (url) => (url.endsWith('/robots.txt') ? new Response('', { status: 404 }) : html(big));
  await assert.rejects(politeFetch('https://oficial-e.es/p', { fetchImpl, maxBytes: 1024 }), /grande demais/);
  const declared = async (url) => (url.endsWith('/robots.txt') ? new Response('', { status: 404 }) : html('x', { 'content-length': '999999999' }));
  await assert.rejects(politeFetch('https://oficial-f.es/p', { fetchImpl: declared }), /grande demais/);
});

test('o atualizador só aceita os domínios das fontes com coleta automática', async () => {
  const { COLLECTION_HOSTS } = await import('../server/radar/registry.js');
  assert.deepEqual(COLLECTION_HOSTS.sort(), ['masteres.ugr.es', 'www.juntadeandalucia.es']);
  assert.ok(radarDb.data().programs.every((p) => !p.fichaUrl || new URL(p.fichaUrl).hostname === 'masteres.ugr.es'));
});

test('bolsa marcada "aberta" sem edital verificado (prazo vigente e link) não conta como aberta', () => {
  const fake = { id: 'teste-bolsa', nome: 'Bolsa teste', status: 'aberta', prazo: null, url: null };
  SCHOLARSHIPS.push(fake);
  try {
    assert.equal(service.listOpportunities().indicadores.bolsas, 0);
    Object.assign(fake, { prazo: '2026-01-01', url: 'https://oficial.es/edital' });
    assert.equal(service.listOpportunities().indicadores.bolsas, 0, 'prazo vencido');
    fake.prazo = '2026-12-31';
    assert.equal(service.listOpportunities().indicadores.bolsas, 1);
  } finally {
    SCHOLARSHIPS.splice(SCHOLARSHIPS.indexOf(fake), 1);
  }
});
