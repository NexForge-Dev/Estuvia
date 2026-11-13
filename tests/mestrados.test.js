// Tela Mestrados: catálogo completo do Radar (GET /api/radar/programs) e filtros do navegador.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-mestrados-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.RADAR_DATA_FILE = path.join(tmp, 'radar.json');
process.env.RADAR_SCHEDULER = 'off';
process.env.RATE_LIMIT_SCALE = '10';

const SEED = new URL('../server/radar/seed/', import.meta.url);
const seed = (f) => new TextDecoder('windows-1252').decode(fs.readFileSync(new URL(f, SEED)));
const { createApp } = await import('../server/app.js');
const { flush } = await import('../server/store.js');
const radarDb = await import('../server/radar/db.js');
const pipeline = await import('../server/radar/pipeline.js');
const service = await import('../server/radar/service.js');
const { filterPrograms, spanishText, degreeText } = await import('../public/js/data/programs.js');

let server;
let base;
let req;
before(async () => {
  await service.initRadar();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  let cookie = '';
  req = async (method, url, body) => {
    const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'travessia', ...(cookie ? { Cookie: cookie } : {}) };
    const res = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
  await req('POST', '/auth/register', { nome: 'Rita Mestrados', email: 'rita@mestrados.dev', senha: 'segura123', aceite: true, maiorIdade: true });
});
after(async () => {
  server.close();
  await Promise.all([flush(), radarDb.flushRadar()]);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('lista TODOS os mestrados do ciclo (sem o teto de 100 da listagem paginada)', async () => {
  const r = await req('GET', '/radar/programs');
  assert.equal(r.status, 200);
  const esperado = radarDb.data().programs.filter((p) => !p.ausenteNoCatalogo).length;
  assert.ok(esperado > 100, 'a base de teste tem mais de 100 programas');
  assert.equal(r.data.total, esperado);
  assert.equal(r.data.programas.length, esperado);
  assert.equal(new Set(r.data.programas.map((p) => p.id)).size, esperado, 'sem repetidos');
  const ops = (await req('GET', '/radar/opportunities')).data;
  assert.equal(r.data.total, ops.indicadores.programas, 'mesmo número que o Radar mostra');
  assert.equal(r.data.anoAcademico, ops.anoAcademico);
});

test('contagem por universidade soma o total e cada item abre no Radar', async () => {
  const { data } = await req('GET', '/radar/programs');
  assert.equal(data.universidades.reduce((n, u) => n + u.total, 0), data.total);
  for (const u of data.universidades) assert.equal(u.total, data.programas.filter((p) => p.universidadeId === u.id).length, u.id);
  assert.ok(data.universidades.some((u) => u.id === 'unia'), 'as 10 universidades do DUA estão listadas');
  const p = data.programas[0];
  assert.equal((await req('GET', `/radar/opportunities/${encodeURIComponent(p.oportunidadeId)}`)).status, 200);
});

test('um mestrado do catálogo pode ir para "Minhas opções" e virar jornada', async () => {
  const { data } = await req('GET', '/radar/programs');
  const p = data.programas.find((x) => x.universidadeId === 'ugr');
  const c = await req('PUT', '/me/choices', { choices: [p.id] });
  assert.equal(c.status, 200, JSON.stringify(c.data));
  const j = await req('POST', '/journeys', { programaId: p.id, anoAcademico: '2027/28' });
  assert.equal(j.status, 201, JSON.stringify(j.data));
  const again = await req('GET', '/radar/programs');
  assert.equal(again.data.programas.find((x) => x.id === p.id).naJornada, true);
});

test('com ficha do DUA: idioma, critérios e se aceita a graduação do aluno', async () => {
  const prog = radarDb.data().programs.find((x) => x.id === 'ugr-master-universitario-gestion-tecnologias-procesos-negocio');
  pipeline.ingest('dua-catalogo', { url: 'https://dua.example/cat', text: 'x', snapshotKey: 'dua-catalogo:ugr', parsedOverride: { ok: true, tipo: 'catalogo', universidadeId: 'ugr', anoAcademico: '2026/2027', avisos: [], programas: [
    { id: 'dua-404508', codigo: '404508', universidadeId: 'ugr', nome: 'GESTIÓN Y TECNOLOGÍAS DE PROCESOS DE NEGOCIO', webPropria: prog.ficha?.webPropria || prog.webPropria, ramos: [], tipoTitulo: 'oficial', modalidade: null, ofertaCondicionada: false, fonteCatalogo: 'dua-catalogo' },
  ] } });
  pipeline.ingest('dua-fichas', { url: 'https://dua.example/ficha', text: seed('dua-ficha-404508-biotecnologia.html'), programId: prog.id });
  let item = (await req('GET', '/radar/programs')).data.programas.find((x) => x.id === prog.id);
  assert.deepEqual(item.espanhol, { exige: true, nivel: 'B1' });
  assert.ok(item.criterios.length >= 1);
  assert.equal(item.codigoDua, '404508');
  assert.equal(item.graduacao, null, 'sem graduação no perfil, nada a comparar');
  await req('PUT', '/me/profile', { graduacao: 'Biologia' });
  const r = (await req('GET', '/radar/programs')).data;
  assert.equal(r.comGraduacao, true);
  item = r.programas.find((x) => x.id === prog.id);
  assert.equal(item.graduacao.tipo, 'lista');
  assert.equal(item.graduacao.preferencia, 'alta');
  const semFicha = r.programas.find((x) => !x.criterios);
  assert.equal(semFicha.espanhol, null, 'sem ficha: não presume exigência');
});

const UNIS = [{ id: 'ugr', sigla: 'UGR', nome: 'Universidad de Granada', cidade: 'Granada' }, { id: 'us', sigla: 'US', nome: 'Universidad de Sevilla', cidade: 'Sevilla' }];
const P = [
  { id: 'a', nome: 'Biotecnología', universidadeId: 'ugr', ramos: ['Ciencias'], modalidade: 'presencial', espanhol: { exige: true, nivel: 'B2' }, graduacao: { tipo: 'lista', preferencia: 'alta' } },
  { id: 'b', nome: 'Derecho Digital', universidadeId: 'us', ramos: [], modalidade: 'online', espanhol: { exige: false }, graduacao: { tipo: 'fora' } },
  { id: 'c', nome: 'Arqueología', universidadeId: 'us', ramos: [], modalidade: null, espanhol: null, graduacao: null, codigoDua: 'A04601' },
  { id: 'd', nome: 'Filosofía', universidadeId: 'ugr', ramos: [], modalidade: 'presencial', espanhol: { exige: true, nivel: 'C1' }, graduacao: { tipo: 'condicionada' } },
];
const ids = (f) => filterPrograms(P, { q: '', universidade: '', cidade: '', area: '', modalidade: '', espanhol: '', graduacao: '', ficha: false, ...f }, UNIS).map((p) => p.id);

test('filtros da tela: busca sem acento, universidade, cidade, área e modalidade', () => {
  assert.deepEqual(ids({}), ['a', 'b', 'c', 'd']);
  assert.deepEqual(ids({ q: 'arqueologia' }), ['c']);
  assert.deepEqual(ids({ q: 'a04601' }), ['c'], 'busca pelo código do DUA');
  assert.deepEqual(ids({ q: 'sevilla' }), ['b', 'c'], 'busca pela cidade/universidade');
  assert.deepEqual(ids({ universidade: 'ugr' }), ['a', 'd']);
  assert.deepEqual(ids({ cidade: 'Sevilla' }), ['b', 'c']);
  assert.deepEqual(ids({ area: 'Ciencias' }), ['a']);
  assert.deepEqual(ids({ modalidade: 'online' }), ['b']);
});

test('filtros de espanhol e de graduação nunca presumem o que a ficha não diz', () => {
  assert.deepEqual(ids({ espanhol: 'B2' }), ['a', 'b'], 'até B2: B2 e quem não exige; sem ficha fica de fora');
  assert.deepEqual(ids({ espanhol: 'nao-exige' }), ['b']);
  assert.deepEqual(ids({ espanhol: 'C1' }), ['a', 'b', 'd']);
  assert.deepEqual(ids({ graduacao: 'aceita' }), ['a', 'd']);
  assert.deepEqual(ids({ graduacao: 'preferencia' }), ['a']);
  assert.deepEqual(ids({ ficha: true }), ['a', 'b', 'd']);
});

test('textos de idioma e graduação', () => {
  assert.equal(spanishText(null), 'Ficha do DUA ainda não conferida');
  assert.equal(spanishText({ exige: false }), 'Não exige espanhol');
  assert.equal(spanishText({ exige: true, nivel: 'B2' }), 'Espanhol B2');
  assert.equal(degreeText({ tipo: 'lista', preferencia: 'media' }).tom, 'ok');
  assert.equal(degreeText({ tipo: 'fora' }).tom, 'bad');
  assert.equal(degreeText({ tipo: 'sem-curso' }), null);
});

test('nomes do DUA em MAIÚSCULAS são exibidos em caixa normal; siglas ficam', async () => {
  const { displayName } = await import('../public/js/data/programs.js');
  assert.equal(displayName('ACCESO A LA ABOGACÍA Y LA PROCURA'), 'Acceso a la Abogacía y la Procura');
  assert.equal(displayName('TECNOLOGÍAS TIC PARA LA EDUCACIÓN'), 'Tecnologías TIC para la Educación');
  assert.equal(displayName('DERECHO DE LA UNIÓN EUROPEA (A DISTANCIA)'), 'Derecho de la Unión Europea (A Distancia)');
  assert.equal(displayName('ARTE Y CINE'), 'Arte y Cine');
  assert.equal(displayName('Máster Universitario en Biotecnología'), 'Máster Universitario en Biotecnología', 'nome já em caixa normal não muda');
});
