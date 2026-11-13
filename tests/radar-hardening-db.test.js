// Prova com Postgres real (PGlite executando as funções SQL do Supabase, migrations 0001/0002): correções do admin,
// contas dos alunos e evidências sobrevivem a "novos deploys" (memória zerada, tudo recarregado do banco) e a novas
// coletas; uma falha do banco no meio não deixa nada pela metade.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-hardening-db-'));
Object.assign(process.env, {
  DB_PROVIDER: 'supabase', STORAGE_PROVIDER: 'local', APP_ENV: 'development', RADAR_SCHEDULER: 'off',
  SUPABASE_URL: 'https://testeref.supabase.co', SUPABASE_SECRET_KEY: 'chave-de-teste', SUPABASE_PROD_PROJECT_REF: '', SUPABASE_DEV_PROJECT_REF: '',
  DATA_FILE: path.join(tmp, 'db.json'), RADAR_DATA_FILE: path.join(tmp, 'radar.json'), MEDIA_DIR: path.join(tmp, 'media'),
  RADAR_EVIDENCE_DIR: path.join(tmp, 'evidencias'), ENTITY_PAGE_ROWS: '50',
});

const MIGRATIONS = ['0001_estuvia_state.sql', '0002_entidades.sql'].map((f) => fs.readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8')).join('\n');
const SEED = new URL('../server/radar/seed/', import.meta.url);
const seed = (f) => new TextDecoder('windows-1252').decode(fs.readFileSync(new URL(f, SEED)));

const pg = new PGlite();
let falharApply = 0;
const rpc = async (name, args) => {
  try {
    if (name === 'estuvia_apply') {
      if (falharApply > 0) { falharApply -= 1; throw new Error('canceling statement due to statement timeout'); }
      return (await pg.query('select public.estuvia_apply($1::jsonb) as r', [JSON.stringify(args.p_ops)])).rows[0].r;
    }
    if (name === 'estuvia_changes') return (await pg.query('select public.estuvia_changes($1::bigint, $2::text[]) as r', [args.p_since, args.p_tables])).rows[0].r;
    throw new Error(`rpc desconhecida: ${name}`);
  } catch (e) {
    const err = new Error(e.message);
    if (/estuvia_conflict/.test(e.message)) err.code = 'ESTUVIA_CONFLICT';
    throw err;
  }
};
const page = async (table, after, limit) => (await pg.query(`select id, version, seq, ins_seq, data from public.${table} where ins_seq > $1 order by ins_seq limit $2`, [after, limit])).rows;
const one = async (sql, p = []) => (await pg.query(sql, p)).rows[0];

const database = await import('../server/database.js');
const radarDb = await import('../server/radar/db.js');
const pipeline = await import('../server/radar/pipeline.js');
const replay = await import('../server/radar/replay.js');
const admin = await import('../server/radar/admin.js');
const service = await import('../server/radar/service.js');
const storage = await import('../server/storage.js');
let store;
let instancia = 0;

const PROG = 'ugr-master-universitario-gestion-tecnologias-procesos-negocio';
const FICHA_URL = 'https://www.juntadeandalucia.es/economiaconocimientoempresasyuniversidad/sguit/mo_catalogo_ficha.php';
const ficha = (texto) => ({ url: FICHA_URL, method: 'POST', body: 'c_peticion=404508', status: 200, text: texto, coletadoEm: '2026-11-13T10:00:00.000Z' });
const prog = () => radarDb.data().programs.find((x) => x.id === PROG);
// "Novo deploy": memória do Radar zerada e recarregada do banco; base principal numa instância nova do módulo.
async function novoDeploy() {
  radarDb.resetForTests();
  await radarDb.initRadarStore();
  const s = await import(`../server/store.js?deploy=${++instancia}`);
  await s.initStore();
  return s;
}
let aluno;

before(async () => {
  await pg.exec('create role anon; create role authenticated; create role service_role;');
  await pg.exec(MIGRATIONS);
  database.setRpcForTests(rpc);
  database.setPageReaderForTests(page);
  database.setLegacyReaderForTests(async () => null); // sem modelo antigo: nada para importar
  store = await import('../server/store.js');
  await store.initStore();
  await radarDb.initRadarStore();
  await service.initRadar(); // banco vazio: carrega os snapshots oficiais do projeto (com evidência)
});

test('setup no banco: aluno com jornada e opções; programa vinculado ao DUA com ficha', async () => {
  aluno = await store.users.create({ id: 'aluno-1', email: 'aluno@teste.dev', passwordHash: 'h', tokenVersion: 1, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
    profile: { apelido: 'Ana' }, journeys: [{ id: 'j1', programaId: PROG, anoAcademico: '2027/28', missoes: { '1.1': { status: 'concluida' } } }], choices: [PROG], docFiles: [{ id: 'f1', nome: 'passaporte.pdf' }] });
  pipeline.ingest('dua-catalogo', { url: 'https://dua.example/cat', text: 'x', snapshotKey: 'dua-catalogo:ugr', parsedOverride: { ok: true, tipo: 'catalogo', universidadeId: 'ugr', anoAcademico: '2026/2027', avisos: [], programas: [
    { id: 'dua-404508', codigo: '404508', universidadeId: 'ugr', nome: 'GESTIÓN Y TECNOLOGÍAS DE PROCESOS DE NEGOCIO', webPropria: prog().ficha?.webPropria || prog().webPropria, ramos: [], tipoTitulo: 'oficial', modalidade: null, ofertaCondicionada: false, fonteCatalogo: 'dua-catalogo' },
  ] } });
  const run = await replay.importCollected('dua-fichas', { paginas: [ficha(seed('dua-ficha-404508-biotecnologia.html'))], robots: { 'https://www.juntadeandalucia.es': '' } });
  assert.equal(run.persistido, true);
  assert.equal((await one(`select data->'fichaDua'->'idiomasExigidos'->0->>'nivel' as n from public.radar_programs where id = $1`, [PROG])).n, 'B1', 'gravado no banco');
});

test('correção do admin gravada no banco sobrevive a um novo deploy e a uma coleta depois dele', async () => {
  await admin.correct({ entidade: 'Program', id: PROG, campo: 'nome', valor: 'Nome corrigido pelo admin', motivo: 'Nome oficial no BOE', url: 'https://www.boe.es/x' }, 'admin@teste.dev');
  const o = radarDb.data().opportunities.find((x) => x.programId === PROG);
  await admin.correct({ entidade: 'Opportunity', id: o.id, campo: 'suspensao', valor: 'Oferta suspensa', motivo: 'Comunicado oficial', url: 'https://www.ugr.es/x' }, 'admin@teste.dev');
  const row = await one(`select data->>'nome' as nome, data->'overrides'->'nome'->>'valorFonte' as fonte from public.radar_programs where id = $1`, [PROG]);
  assert.equal(row.nome, 'Nome corrigido pelo admin');
  assert.ok(row.fonte, 'o valor da fonte também está no banco');

  await novoDeploy();
  assert.equal(prog().nome, 'Nome corrigido pelo admin');
  assert.equal(prog().overrides.nome.por, 'admin@teste.dev');
  // Coleta depois do deploy, com um nome diferente na fonte.
  const p = prog();
  pipeline.ingest('ugr-catalogo', { url: 'https://masteres.ugr.es/informacion/titulaciones', text: 'nova', snapshotKey: 'ugr-catalogo:pos-deploy', completo: false, parsedOverride: { ok: true, tipo: 'catalogo', universidadeId: 'ugr', anoAcademico: '2026/2027', avisos: [], programas: [
    { id: p.id, codigo: p.codigo, universidadeId: 'ugr', nome: 'Nome novo publicado pela fonte', webPropria: p.webPropria, cursoCatalogo: p.cursoCatalogo, ofertaCondicionada: false, modalidade: p.modalidade ?? null, fichaUrl: p.fichaUrl, ramos: p.ramos || [], tipoTitulo: 'oficial' },
  ] } });
  pipeline.ensureOpportunitiesForCycle('2026/2027', 'ugr');
  await radarDb.save();

  await novoDeploy();
  assert.equal(prog().nome, 'Nome corrigido pelo admin', 'continua o do admin depois de coleta + deploy');
  assert.equal(prog().overrides.nome.valorFonte, 'Nome novo publicado pela fonte');
  assert.equal(radarDb.data().opportunities.find((x) => x.id === o.id).suspensao.motivo, 'Oferta suspensa');
});

test('falha do banco no meio de uma importação: 503, banco e memória sem meio-termo; repetir grava', async () => {
  const alterada = seed('dua-ficha-404508-biotecnologia.html').replace('UN NIVEL DE ESPAÑOL B1', 'UN NIVEL DE ESPAÑOL C2');
  const antesBanco = (await one(`select data->'fichaDua' as f from public.radar_programs where id = $1`, [PROG])).f;
  falharApply = 1;
  await assert.rejects(replay.importCollected('dua-fichas', { paginas: [ficha(alterada)], robots: { 'https://www.juntadeandalucia.es': '' } }), (e) => e.status === 503 && e.run.persistido === false);
  assert.deepEqual((await one(`select data->'fichaDua' as f from public.radar_programs where id = $1`, [PROG])).f, antesBanco, 'banco intacto');
  assert.equal(prog().fichaDua.idiomasExigidos[0].nivel, 'B1', 'memória recarregada do banco');
  const falhas = (await pg.query(`select data from public.radar_runs where data->>'persistido' = 'false'`)).rows;
  assert.ok(falhas.some((r) => /Falha ao gravar/.test(r.data.erro)), 'a falha ficou registrada no banco');
  const ok = await replay.importCollected('dua-fichas', { paginas: [ficha(alterada)], robots: { 'https://www.juntadeandalucia.es': '' } });
  assert.equal(ok.persistido, true);
  await novoDeploy();
  assert.equal(prog().fichaDua.idiomasExigidos[0].nivel, 'C2');
  assert.equal(prog().nome, 'Nome corrigido pelo admin', 'a correção atravessou também a falha');
});

test('evidência: o snapshot gravado no banco aponta para o HTML guardado, recuperável depois do deploy', async () => {
  const snap = radarDb.data().snapshots.filter((s) => s.chave === `dua-fichas:${PROG}`).at(-1);
  assert.ok(snap.evidencia?.html);
  const html = await storage.getEvidence(snap.evidencia.html);
  assert.ok(html.includes('UN NIVEL DE ESPAÑOL C2'));
  const conteudo = JSON.parse(await storage.getEvidence(snap.evidencia.conteudo));
  assert.equal(conteudo.dados.idiomasExigidos[0].nivel, 'C2');
  const rev = radarDb.data().revisions.filter((r) => r.entidadeId === PROG && r.campo === 'fichaDua.idiomasExigidos').at(-1);
  assert.equal(rev.evidencia.snapshotId, snap.id, 'a revisão no banco cita o snapshot com evidência');
});

test('contas dos alunos: jornada, opções e documentos idênticos no banco depois de tudo', async () => {
  const s = await novoDeploy();
  const u = s.users.findById('aluno-1');
  assert.deepEqual(u.journeys, aluno.journeys);
  assert.deepEqual(u.choices, [PROG]);
  assert.deepEqual(u.docFiles, aluno.docFiles);
  assert.equal(u.updatedAt, '2026-11-01T00:00:00.000Z', 'nenhuma gravação do Radar tocou a conta');
  const row = await one(`select version from public.users where id = 'aluno-1'`);
  assert.equal(Number(row.version), 1, 'a linha da conta nunca foi reescrita');
});
