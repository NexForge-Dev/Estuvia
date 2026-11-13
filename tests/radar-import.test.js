// Importação de páginas oficiais coletadas em outra máquina (o DUA recusa conexões da Vercel).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-radar-import-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.RADAR_DATA_FILE = path.join(tmp, 'radar.json');
process.env.RADAR_SCHEDULER = 'off';
process.env.RADAR_ADMIN_EMAILS = 'equipe@radar.dev';
process.env.RADAR_IMPORT_ONLY_HOSTS = 'www.juntadeandalucia.es';

const SEED = new URL('../server/radar/seed/', import.meta.url);
const seed = (f) => new TextDecoder('windows-1252').decode(fs.readFileSync(new URL(f, SEED)));
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
const FICHA_URL = 'https://www.juntadeandalucia.es/economiaconocimientoempresasyuniversidad/sguit/mo_catalogo_ficha.php';
const ORIGIN = 'https://www.juntadeandalucia.es';
const COLETADO = '2026-11-13T10:00:00.000Z';
const ficha = (codigo, text = seed('dua-ficha-404508-biotecnologia.html')) => ({ url: FICHA_URL, method: 'POST', body: `c_peticion=${codigo}`, status: 200, text, coletadoEm: COLETADO });
let equipe;
let prog;

test('setup: máster da UGR vinculado ao código do DUA', async () => {
  const d = radarDb.data();
  prog = d.programs.find((p) => p.id === 'ugr-master-universitario-gestion-tecnologias-procesos-negocio');
  const parsed = { ok: true, tipo: 'catalogo', universidadeId: 'ugr', anoAcademico: '2026/2027', avisos: [], programas: [
    { id: 'dua-404508', codigo: '404508', universidadeId: 'ugr', nome: 'GESTIÓN Y TECNOLOGÍAS DE PROCESOS DE NEGOCIO', webPropria: prog.ficha?.webPropria || prog.webPropria, ramos: [], tipoTitulo: 'oficial', modalidade: null, ofertaCondicionada: false, fonteCatalogo: 'dua-catalogo' },
  ] };
  pipeline.ingest('dua-catalogo', { url: 'https://dua.example/cat', text: 'x', parsedOverride: parsed, snapshotKey: 'dua-catalogo:ugr' });
  assert.equal(prog.duaCodigo, '404508');
  equipe = client();
  assert.equal((await equipe('POST', '/auth/register', { nome: 'Equipe Radar', email: 'equipe@radar.dev', senha: 'segura123', aceite: true, maiorIdade: true })).status, 201);
});

test('host só por importação: o agendador não tenta as fontes da Junta', () => {
  const due = pipeline.dueSources(Date.now() + 365 * 86400000).map((s) => s.id);
  assert.ok(!due.includes('dua-fichas'));
  assert.ok(!due.includes('dua-catalogo'));
  assert.ok(due.includes('ugr-catalogo'), 'a UGR responde à Vercel e continua no agendador');
});

test('a ficha importada passa pelo pipeline normal e guarda a data real da coleta', async () => {
  const r = await equipe('POST', '/radar/admin/import', { fonte: 'dua-fichas', robots: { [ORIGIN]: '' }, paginas: [ficha('404508')] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.run.origem, 'importada');
  assert.equal(r.data.run.itens, 1);
  assert.equal(prog.fichaDua.idiomasExigidos[0].nivel, 'B1');
  const fonte = radarDb.data().sources.find((s) => s.id === 'dua-fichas');
  assert.equal(fonte.estado, 'ok');
  const snap = radarDb.data().snapshots.filter((s) => s.sourceId === 'dua-fichas').at(-1);
  assert.ok(JSON.stringify(snap).includes(COLETADO), 'a data é a da coleta, não a da importação');
});

test('reimportar a mesma ficha depois de uma ida e volta ao Supabase (jsonb reordena as chaves) não gera mudança', async () => {
  // Simula o que o Postgres faz: mesmas chaves e valores, outra ordem (inclusive nos objetos dentro dos arrays).
  const reorder = (v) => (Array.isArray(v) ? v.map(reorder) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).reverse().map((k) => [k, reorder(v[k])])) : v);
  prog.fichaDua = reorder(prog.fichaDua);
  // Com mais fichas do que o limite de snapshots guardados (600), o snapshot anterior já foi descartado
  // e a ficha passa pela comparação campo a campo: é ali que a ordem das chaves fazia diferença.
  const d = radarDb.data();
  d.snapshots = d.snapshots.filter((s) => !(s.sourceId === 'dua-fichas' && String(s.chave || '').includes(prog.id)));
  const r = await equipe('POST', '/radar/admin/import', { fonte: 'dua-fichas', robots: { [ORIGIN]: '' }, paginas: [ficha('404508')] });
  assert.equal(r.status, 200);
  assert.equal(r.data.run.mudancas, 0, 'nenhuma alteração falsa no histórico');
  assert.equal(r.data.run.resultado, 'sem-alteracao');
});

test('uma mudança real na ficha continua sendo registrada', async () => {
  const alterada = seed('dua-ficha-404508-biotecnologia.html').replace('UN NIVEL DE ESPAÑOL B1', 'UN NIVEL DE ESPAÑOL B2');
  const r = await equipe('POST', '/radar/admin/import', { fonte: 'dua-fichas', robots: { [ORIGIN]: '' }, paginas: [ficha('404508', alterada)] });
  assert.equal(r.status, 200);
  assert.ok(r.data.run.mudancas >= 1);
  assert.equal(prog.fichaDua.idiomasExigidos[0].nivel, 'B2');
});

test('páginas sem alvo atual não marcam a fonte como verificada', async () => {
  const r = await equipe('POST', '/radar/admin/import', { fonte: 'dua-fichas', robots: { [ORIGIN]: '' }, paginas: [ficha('999999')] });
  assert.equal(r.status, 200);
  assert.equal(r.data.run.resultado, 'ignorada');
});

test('só aceita páginas das fontes oficiais e só da equipe do Radar', async () => {
  const fora = await equipe('POST', '/radar/admin/import', { fonte: 'dua-fichas', paginas: [{ ...ficha('404508'), url: 'https://exemplo.com/ficha' }] });
  assert.equal(fora.status, 400);
  assert.match(fora.data.error, /fora das fontes oficiais/);
  assert.equal((await equipe('POST', '/radar/admin/import', { fonte: 'nao-existe', paginas: [ficha('404508')] })).status, 404);
  const aluno = client();
  await aluno('POST', '/auth/register', { nome: 'Ana Aluna', email: 'ana@aluna.dev', senha: 'segura123', aceite: true, maiorIdade: true });
  assert.equal((await aluno('POST', '/radar/admin/import', { fonte: 'dua-fichas', paginas: [ficha('404508')] })).status, 403);
});

test('lote grande (até 4 MB) é aceito nesta rota', async () => {
  const grande = seed('dua-ficha-404508-biotecnologia.html') + '<!--' + 'x'.repeat(1_500_000) + '-->';
  const r = await equipe('POST', '/radar/admin/import', { fonte: 'dua-fichas', robots: { [ORIGIN]: '' }, paginas: [ficha('404508', grande)] });
  assert.equal(r.status, 200, JSON.stringify(r.data).slice(0, 200));
});
