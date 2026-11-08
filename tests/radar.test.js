import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Base isolada; agendador desligado; nenhum teste acessa a rede (coletas usam o HTML oficial salvo).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.RADAR_DATA_FILE = path.join(tmp, 'radar.json');
process.env.RADAR_SCHEDULER = 'off';
process.env.RADAR_ADMIN_EMAILS = 'equipe@radar.dev';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

// Relógio fixo: os snapshots oficiais foram capturados em 24/10/2026 e a regra de frescor
// (STALE_AFTER_HOURS) depende do "agora". Sem relógio fixo a suíte quebra com o passar dos dias.
// Só o Date é simulado (timers reais), um dia depois da captura.
const NOW = Date.parse('2026-10-25T12:00:00Z');
mock.timers.enable({ apis: ['Date'], now: NOW });

const SEED = new URL('../server/radar/seed/', import.meta.url);
const seed = (f, latin1) => new TextDecoder(latin1 ? 'windows-1252' : 'utf-8').decode(fs.readFileSync(new URL(f, SEED)));
const CAL = seed('dua-calendario-2026-27.html', true);

const { parseSpanishDateExpr } = await import('../server/radar/dates.js');
const dua = await import('../server/radar/connectors/dua-calendar.js');
const ugr = await import('../server/radar/connectors/ugr-catalog.js');
const ficha = await import('../server/radar/connectors/ugr-program.js');
const { opportunityState } = await import('../server/radar/status.js');
const { robotsAllows } = await import('../server/radar/http.js');
const { createApp } = await import('../server/app.js');
const { flush } = await import('../server/store.js');
const radarDb = await import('../server/radar/db.js');
const pipeline = await import('../server/radar/pipeline.js');
const service = await import('../server/radar/service.js');

let server;
let base;
before(async () => {
  await service.initRadar();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  server.close();
  await Promise.all([flush(), radarDb.flushRadar()]);
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
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
}
async function student(email, extra = {}) {
  const req = client();
  const r = await req('POST', '/auth/register', { nome: 'Ana Souza', email, senha: 'segura123', aceite: true, ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return req;
}

// ---------- Extração (HTML oficial real, capturado em 24/10/2026) ----------

test('datas em espanhol viram ISO pelo ano do curso, sem inventar', () => {
  assert.deepEqual(parseSpanishDateExpr('Del 19 al 24 de febrero', '2026/2027'), { inicio: '2026-02-19', fim: '2026-02-24', incerto: false });
  assert.deepEqual(parseSpanishDateExpr('del 29 de septiembre al 1 de octubre', '2026/2027'), { inicio: '2026-09-29', fim: '2026-10-01', incerto: false });
  assert.equal(parseSpanishDateExpr('Hasta el 13 de febrero', '2026/2027').fim, '2026-02-13');
  // Documento de 2027/2028 citando 2026 → incerto (nunca atribuímos data ao ciclo errado).
  assert.equal(parseSpanishDateExpr('Del 13 al 29 de enero de 2026', '2027/2028').incerto, true);
  assert.equal(parseSpanishDateExpr('A determinar', '2026/2027').incerto, true);
});

test('conector DUA extrai as 3 fases do calendário 2026/2027', () => {
  const r = dua.parse(CAL);
  assert.equal(r.anoAcademico, '2026/2027');
  assert.deepEqual(r.avisos, []);
  const cand = r.fases.map((f) => f.itens.find((i) => i.tipo === 'candidatura'));
  assert.deepEqual(cand.map((c) => [c.inicio, c.fim]), [['2026-01-13', '2026-01-29'], ['2026-06-17', '2026-06-26'], ['2026-09-08', '2026-09-15']]);
  assert.equal(r.fases[0].publico, 'estrangeiros');
  assert.ok(r.fases[1].itens.filter((i) => i.tipo === 'resultas').length === 4);
});

test('conectores UGR extraem catálogo e ficha oficiais', () => {
  const cat = ugr.parse(seed('ugr-titulaciones-2026-27.html'));
  assert.equal(cat.anoAcademico, '2026/2027');
  assert.ok(cat.programas.length >= 130);
  assert.ok(cat.programas.some((p) => p.nome === 'Máster Universitario en Desarrollo del Software'));
  assert.ok(cat.programas.every((p) => !p.webPropria || !/\s/.test(p.webPropria)));
  const f = ficha.parse(seed('ugr-ficha-gestion-procesos-negocio.html'));
  assert.equal(f.dados.codigo, 'M93/56/1');
  assert.equal(f.dados.creditos, 60);
  assert.equal(f.dados.anoAcademico, '2026/2027');
  assert.equal(f.dados.idiomaEnsino, null, 'idioma não consta da ficha: não inventamos');
});

test('robots.txt é respeitado', () => {
  const robots = 'User-agent: *\nDisallow: /search\nDisallow: /*?q=*\nAllow: /core/*.css$';
  assert.equal(robotsAllows(robots, 'https://x.es/informacion/titulaciones'), true);
  assert.equal(robotsAllows(robots, 'https://x.es/search?a=1'), false);
  assert.equal(robotsAllows(robots, 'https://x.es/page?q=masteres'), false);
});

// ---------- Estados determinísticos ----------

test('estados derivam somente das datas oficiais e da saúde da fonte', () => {
  const r = dua.parse(CAL);
  const windows = r.fases.map((f) => { const c = f.itens.find((i) => i.tipo === 'candidatura'); return { fase: f.fase, abertura: c.inicio, encerramento: c.fim, confirmacao: 'confirmado', publico: f.publico }; });
  const events = r.fases.flatMap((f) => f.itens.filter((i) => i.tipo !== 'candidatura').map((i) => ({ ...i, fase: f.fase })));
  const at = (iso) => Date.parse(iso);
  const st = (iso, ch = { url: 'x' }) => opportunityState({}, windows, events, { ultimaVerificacaoOk: new Date(at(iso)).toISOString() }, ch, at(iso)).estado;
  assert.equal(st('2026-01-10T12:00:00Z'), 'anunciadas');
  assert.equal(st('2026-01-20T12:00:00Z'), 'abertas');
  assert.equal(st('2026-01-20T12:00:00Z', null), 'anunciadas', 'sem canal confirmado não dizemos "abertas"');
  assert.equal(st('2026-02-15T12:00:00Z'), 'anunciadas', 'pós-fase 1, a próxima candidatura (fase 2) é o que importa');
  assert.equal(st('2026-10-24T12:00:00Z'), 'resultas');
  assert.equal(st('2026-11-10T12:00:00Z'), 'encerradas');
  assert.equal(opportunityState({}, [], [], {}, null).estado, 'nao-anunciado');
  const stale = opportunityState({}, windows, events, { ultimaVerificacaoOk: '2026-01-01T00:00:00Z' }, { url: 'x' }, at('2026-01-20T12:00:00Z'));
  assert.equal(stale.estado, 'desatualizado');
  assert.equal(opportunityState({ suspensao: { motivo: 'x' } }, windows, events, {}, null).estado, 'suspenso');
});

// ---------- API ----------

test('critérios 1–6 e 15: pesquisar, ver ano, estado, fonte e falta de dados confirmados', async () => {
  const req = client();
  const list = await req('GET', '/radar/opportunities?q=desarrollo%20software');
  assert.equal(list.status, 200);
  assert.equal(list.data.anoAcademico, '2027/2028');
  const item = list.data.items[0];
  assert.match(item.programa.nome, /Desarrollo del Software/);
  assert.equal(item.estado, 'nao-anunciado');
  assert.equal(item.verificacao.status, 'nao-confirmada');
  assert.equal(item.verificacao.texto, 'Não foi possível confirmar as datas deste ano acadêmico.');
  assert.equal(item.referenciaHistorica.anoAcademico, '2026/2027', 'ano anterior só como referência histórica');
  assert.equal(item.abertura, null);
  assert.equal(list.data.indicadores.abertas, 0);

  const old = await req('GET', '/radar/opportunities?ano=2026/2027&q=procesos%20negocio');
  const o = old.data.items[0];
  assert.equal(o.verificacao.fonte, 'Distrito Único Andaluz');
  assert.ok(o.verificacao.ultimaVerificacao);
  assert.ok(o.candidatura.url.startsWith('https://www.juntadeandalucia.es/'));
  const detail = await req('GET', `/radar/opportunities/${o.id}`);
  assert.equal(detail.data.opportunity.calendario.length, 3);
  assert.equal(detail.data.opportunity.programa.creditos, 60);
});

test('critérios 7–10: acompanhar, receber alerta de nova data oficial e ver histórico', async () => {
  const req = await student('ana@exemplo.com');
  const target = (await req('GET', '/radar/opportunities?q=desarrollo%20software')).data.items[0];
  assert.equal((await client()('PUT', `/radar/opportunities/${target.id}/subscription`, {})).status, 401);
  const sub = await req('PUT', `/radar/opportunities/${target.id}/subscription`, { eventos: ['calendario', 'abertura', 'encerramento'] });
  assert.equal(sub.status, 200);
  assert.equal((await req('GET', '/radar/me')).data.naoLidas, 0);

  // O DUA publica o calendário 2027/2028 (mesma estrutura de página).
  const next = CAL.replace('CURSO 2026/2027', 'CURSO 2027/2028').replace(/de 2026/g, 'de 2027');
  const r1 = pipeline.ingest('dua-calendario', { url: 'https://dua.example/cal', text: next });
  assert.equal(r1.publicado, true);
  assert.equal(r1.novoCiclo, true);
  // ingest() é a etapa de extração; quem registra a verificação bem-sucedida é runSource().
  // Simulamos aqui o que runSource faria após esta coleta.
  radarDb.data().sources.find((s) => s.id === 'dua-calendario').ultimaVerificacaoOk = new Date().toISOString();
  const { onPublished } = await import('../server/radar/notify.js');
  onPublished(r1.revisions);
  onPublished(r1.revisions); // repetição não duplica alerta

  const me = await req('GET', '/radar/me');
  const cal = me.data.alertas.filter((a) => a.evento === 'calendario');
  assert.equal(cal.length, 1);
  assert.equal(cal[0].titulo, 'Novas datas publicadas!');
  assert.equal(cal[0].dados.abertura, '2027-01-13');
  const detail = (await req('GET', `/radar/opportunities/${target.id}`)).data.opportunity;
  assert.equal(detail.verificacao.status, 'confirmada');
  assert.equal(detail.calendario[0].candidatura.inicio, '2027-01-13');
  assert.ok(detail.historico.some((h) => h.campo === 'abertura' && h.novo === '2027-01-13'));

  // Alteração de prazo já publicado → revisão obrigatória; nada muda até aprovar.
  const changed = next.replace('Desde el día 13', 'Desde el día 15');
  const r2 = pipeline.ingest('dua-calendario', { url: 'https://dua.example/cal', text: changed });
  assert.equal(r2.revisao, true);
  assert.equal((await req('GET', `/radar/opportunities/${target.id}`)).data.opportunity.calendario[0].candidatura.inicio, '2027-01-13');

  const admin = await student('equipe@radar.dev');
  assert.equal((await req('GET', '/radar/admin')).status, 403);
  const panel = await admin('GET', '/radar/admin');
  const review = panel.data.revisoes.find((x) => x.tipo === 'alteracao-critica' && x.status === 'aberta');
  assert.ok(review);
  assert.equal((await admin('POST', `/radar/admin/reviews/${review.id}`, { decisao: 'aprovar' })).status, 200);
  const after = (await req('GET', `/radar/opportunities/${target.id}`)).data.opportunity;
  assert.equal(after.calendario[0].candidatura.inicio, '2027-01-15');
  assert.ok(after.historico.some((h) => h.campo === 'abertura' && h.anterior === '2027-01-13' && h.novo === '2027-01-15'));
  const alerts = (await req('GET', '/radar/me')).data.alertas;
  assert.ok(alerts.some((a) => a.titulo === 'Datas oficiais alteradas'));
});

test('documento com ano inconsistente vai para revisão e não é publicado', async () => {
  const wrong = CAL.replace('CURSO 2026/2027', 'CURSO 2028/2029'); // fase 1 cita "enero de 2026"
  const r = pipeline.ingest('dua-calendario', { url: 'https://dua.example/cal', text: wrong });
  assert.equal(r.publicado, false);
  assert.ok(radarDb.data().reviews.some((x) => x.tipo === 'extracao-incerta' && x.status === 'aberta' && /2028\/2029/.test(x.motivo)));
  assert.equal(radarDb.data().windows.filter((w) => w.anoAcademico === '2028/2029').length, 0);
});

test('critérios 11–14: jornada, missões, Agenda AI e assistente', async () => {
  const req = await student('bia@exemplo.com');
  const target = (await req('GET', '/radar/opportunities?ano=2027/2028&q=desarrollo%20software')).data.items[0];
  const detail = (await req('GET', `/radar/opportunities/${target.id}`)).data.opportunity;
  assert.ok(detail.missoes.find((m) => m.missao === '3.2').datas.length >= 1);
  const officialDeadline = detail.agenda.find((s) => s.oficial && s.momento === 'antes-do-encerramento');
  const prep = detail.agenda.find((s) => !s.oficial);
  const add = await req('POST', `/radar/opportunities/${target.id}/agenda`, { itens: [{ id: officialDeadline.id, data: '2099-01-01' }, { id: prep.id, inicio: '18:00', fim: '19:00' }] });
  assert.equal(add.status, 200);
  assert.equal(add.data.criadas, 2);
  const official = add.data.eventos.find((e) => e.titulo.startsWith('Prazo oficial'));
  assert.equal(official.data, officialDeadline.data, 'prazo oficial é preservado mesmo se o estudante tentar mover');

  const p = service.programForJourney(target.programId);
  assert.equal(p.demo, false);
  assert.equal(p.ciclo, '2026/27');
  const fakeUser = { journeys: [{ id: 'j1', programaId: target.programId, anoAcademico: '2027/28' }] };
  const deadlines = service.officialDeadlines(fakeUser);
  assert.ok(deadlines.some((d) => d.data === '2027-01-15' && d.journeyId === 'j1'));

  const ctx = service.radarContext('Quando abre o mestrado em Desarrollo del Software da UGR para 2028/2029?');
  assert.equal(ctx.relevante, true);
  assert.match(ctx.texto, /Curso 2028\/2029: NÃO há calendário oficial confirmado/);
  assert.ok(service.findOfficialMatch({ link: target.programa.fichaUrl }).match);
});
