// Hardening do Radar: correções manuais protegidas, persistência confirmada, reconciliação de identificadores,
// evidências duráveis, histórico, concorrência e retenção. Base JSON (o mesmo pipeline do Supabase; a prova com
// Postgres real está em radar-hardening-db.test.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-hardening-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.RADAR_DATA_FILE = path.join(tmp, 'radar.json');
process.env.RADAR_EVIDENCE_DIR = path.join(tmp, 'evidencias');
process.env.RADAR_SCHEDULER = 'off';
process.env.RADAR_ADMIN_EMAILS = 'equipe@radar.dev';
process.env.RATE_LIMIT_SCALE = '20';

const SEED = new URL('../server/radar/seed/', import.meta.url);
const seed = (f, latin1 = true) => new TextDecoder(latin1 ? 'windows-1252' : 'utf-8').decode(fs.readFileSync(new URL(f, SEED)));
const { createApp } = await import('../server/app.js');
const { flush, users } = await import('../server/store.js');
const radarDb = await import('../server/radar/db.js');
const pipeline = await import('../server/radar/pipeline.js');
const service = await import('../server/radar/service.js');
const { programById } = await import('../server/content/catalog.js');

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
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  };
}

const d = () => radarDb.data();
const ORIGIN = 'https://www.juntadeandalucia.es';
const FICHA_URL = 'https://www.juntadeandalucia.es/economiaconocimientoempresasyuniversidad/sguit/mo_catalogo_ficha.php';
const ficha = (codigo, text = seed('dua-ficha-404508-biotecnologia.html'), coletadoEm = '2026-11-13T10:00:00.000Z') => ({ url: FICHA_URL, method: 'POST', body: `c_peticion=${codigo}`, status: 200, text, coletadoEm });
const PROG = 'ugr-master-universitario-gestion-tecnologias-procesos-negocio';
const prog = () => d().programs.find((x) => x.id === PROG);
const opp = () => d().opportunities.find((x) => x.programId === PROG);
// Catálogo da UGR "coletado de novo" com o que a fonte publica (parsedOverride; completo: false = só estes itens).
const ugrCatalog = (programas, anoAcademico = '2026/2027') => pipeline.ingest('ugr-catalogo', {
  url: 'https://masteres.ugr.es/informacion/titulaciones', text: JSON.stringify(programas), snapshotKey: `ugr-catalogo:teste:${Math.random()}`, completo: false,
  parsedOverride: { ok: true, tipo: 'catalogo', universidadeId: 'ugr', anoAcademico, avisos: [], programas },
});
const fonteDoPrograma = (p, extra = {}) => ({ id: p.id, codigo: p.codigo, universidadeId: 'ugr', nome: p.overrides?.nome?.valorFonte ?? p.nome, webPropria: p.overrides?.webPropria?.valorFonte ?? p.webPropria, cursoCatalogo: p.cursoCatalogo, ofertaCondicionada: false, modalidade: p.modalidade ?? null, fichaUrl: p.fichaUrl, ramos: p.ramos || [], tipoTitulo: 'oficial', ...extra });

let equipe;
let aluno;
let alunoId;
let jornadaAntes;

test('setup: equipe do Radar, aluno com jornada e opções no programa, vínculo DUA e ficha', async () => {
  equipe = client();
  aluno = client();
  assert.equal((await equipe('POST', '/auth/register', { nome: 'Equipe Radar', email: 'equipe@radar.dev', senha: 'segura123', aceite: true, maiorIdade: true })).status, 201);
  const r = await aluno('POST', '/auth/register', { nome: 'Bia Aluna', email: 'bia@aluna.dev', senha: 'segura123', aceite: true, maiorIdade: true });
  alunoId = r.data.user.id;
  await aluno('PUT', '/me/profile', { nacionalidade: 'Brasil', paisResidencia: 'Brasil', estado: 'BA' });
  assert.equal((await aluno('POST', '/journeys', { programaId: PROG, anoAcademico: '2027/28' })).status, 201);
  assert.equal((await aluno('PUT', '/me/choices', { choices: [PROG] })).status, 200);
  jornadaAntes = structuredClone(users.findById(alunoId));
  pipeline.ingest('dua-catalogo', { url: 'https://dua.example/cat', text: 'x', snapshotKey: 'dua-catalogo:ugr', parsedOverride: { ok: true, tipo: 'catalogo', universidadeId: 'ugr', anoAcademico: '2026/2027', avisos: [], programas: [
    { id: 'dua-404508', codigo: '404508', universidadeId: 'ugr', nome: 'GESTIÓN Y TECNOLOGÍAS DE PROCESOS DE NEGOCIO', webPropria: prog().ficha?.webPropria || prog().webPropria, ramos: [], tipoTitulo: 'oficial', modalidade: null, ofertaCondicionada: false, fonteCatalogo: 'dua-catalogo' },
  ] } });
  assert.equal(prog().duaCodigo, '404508');
  assert.equal((await equipe('POST', '/radar/admin/import', { fonte: 'dua-fichas', robots: { [ORIGIN]: '' }, paginas: [ficha('404508')] })).status, 200);
});

// 1 ------------------------------------------------------------------------------------------------
test('1. correção manual de nome e site sobrevive a uma nova coleta; o valor da fonte continua atualizado', async () => {
  const nomeFonte = prog().nome;
  const c = await equipe('POST', '/radar/admin/corrections', { entidade: 'Program', id: PROG, campo: 'nome', valor: 'Máster en Procesos de Negocio (nome corrigido)', motivo: 'Nome oficial atualizado no BOE', url: 'https://www.boe.es/x' });
  assert.equal(c.status, 200, JSON.stringify(c.data));
  await equipe('POST', '/radar/admin/corrections', { entidade: 'Program', id: PROG, campo: 'webPropria', valor: 'https://masteres.ugr.es/procesos-negocio-corrigido', motivo: 'Site mudou de endereço', url: 'https://www.ugr.es/x' });
  // Nova coleta com os mesmos dados da fonte: nada muda no valor efetivo.
  const fonte = fonteDoPrograma(prog());
  ugrCatalog([fonte]);
  assert.equal(prog().nome, 'Máster en Procesos de Negocio (nome corrigido)');
  assert.equal(prog().webPropria, 'https://masteres.ugr.es/procesos-negocio-corrigido');
  assert.equal(prog().overrides.nome.valorFonte, nomeFonte);
  // A fonte muda o nome: o valor corrigido continua valendo; o da fonte é atualizado e vira histórico.
  ugrCatalog([{ ...fonte, nome: 'Máster Universitario en Gestión de Procesos (nome novo na fonte)' }]);
  assert.equal(prog().nome, 'Máster en Procesos de Negocio (nome corrigido)');
  assert.equal(prog().overrides.nome.valorFonte, 'Máster Universitario en Gestión de Procesos (nome novo na fonte)');
  assert.ok(d().revisions.some((r) => r.entidadeId === PROG && r.campo === 'nome' && r.validacao === 'fonte-divergente'));
  await radarDb.save();
  // O que o aluno vê também é o corrigido.
  const det = (await aluno('GET', '/radar/programs')).data.programas.find((x) => x.id === PROG);
  assert.equal(det.nome, 'Máster en Procesos de Negocio (nome corrigido)');
});

test('1b. remover a correção volta ao valor mais recente da fonte; painel lista valor da fonte e do admin', async () => {
  const lista = (await equipe('GET', '/radar/admin/corrections')).data.correcoes;
  const c = lista.find((x) => x.id === PROG && x.campo === 'nome');
  assert.equal(c.valorAdmin, 'Máster en Procesos de Negocio (nome corrigido)');
  assert.equal(c.valorFonte, 'Máster Universitario en Gestión de Procesos (nome novo na fonte)');
  assert.equal(c.divergeDaFonte, true);
  assert.equal((await equipe('DELETE', '/radar/admin/corrections', { entidade: 'Program', id: PROG, campo: 'nome', motivo: 'O BOE confirmou o nome da fonte' })).status, 200);
  assert.equal(prog().nome, 'Máster Universitario en Gestión de Procesos (nome novo na fonte)');
  assert.equal(prog().overrides?.nome, undefined);
  assert.equal(prog().webPropria, 'https://masteres.ugr.es/procesos-negocio-corrigido', 'a outra correção continua');
});

test('1c. data corrigida de uma janela do calendário sobrevive a uma nova coleta do calendário', async () => {
  const w = d().windows.find((x) => x.procedimentoId === 'dua-masteres' && x.fase === 1);
  const original = w.abertura;
  assert.equal((await equipe('POST', '/radar/admin/corrections', { entidade: 'AdmissionWindow', id: w.id, campo: 'abertura', valor: '2026-02-20', motivo: 'Errata publicada no BOJA', url: 'https://www.juntadeandalucia.es/boja/x' })).status, 200);
  const r = pipeline.ingest('dua-calendario', { url: 'https://dua.example/cal', text: seed('dua-calendario-2026-27.html') + ' ', snapshotKey: 'dua-calendario:teste' });
  assert.ok(r.valido);
  const depois = d().windows.find((x) => x.id === w.id);
  assert.equal(depois.abertura, '2026-02-20');
  assert.equal(depois.overrides.abertura.valorFonte, original);
  assert.ok(!d().reviews.some((x) => x.status === 'aberta' && x.tipo === 'alteracao-critica' && x.motivo.includes('2026-02-20')), 'a correção não vira "alteração crítica" a cada coleta');
});

// 2 ------------------------------------------------------------------------------------------------
test('2. suspensão manual não é reativada por novas coletas (catálogo e calendário)', async () => {
  const o = opp();
  assert.equal((await equipe('POST', '/radar/admin/corrections', { entidade: 'Opportunity', id: o.id, campo: 'suspensao', valor: 'Oferta suspensa pela universidade', motivo: 'Comunicado oficial', url: 'https://www.ugr.es/suspensao' })).status, 200);
  ugrCatalog([fonteDoPrograma(prog())]);
  pipeline.ensureOpportunitiesForCycle('2026/2027', 'ugr');
  pipeline.ingest('dua-calendario', { url: 'https://dua.example/cal', text: seed('dua-calendario-2026-27.html') + '  ', snapshotKey: 'dua-calendario:teste2' });
  await radarDb.save();
  assert.equal(d().opportunities.find((x) => x.id === o.id).suspensao.motivo, 'Oferta suspensa pela universidade');
  const det = (await aluno('GET', `/radar/opportunities/${encodeURIComponent(o.id)}`)).data.opportunity;
  assert.equal(det.estado, 'suspenso');
  assert.equal((await equipe('DELETE', '/radar/admin/corrections', { entidade: 'Opportunity', id: o.id, campo: 'suspensao' })).status, 200);
  assert.equal(d().opportunities.find((x) => x.id === o.id).suspensao, null, 'reativar só explicitamente');
});

// 3 ------------------------------------------------------------------------------------------------
test('3. falha de gravação: importação responde 503, nada fica pela metade e repetir funciona', async () => {
  const antes = structuredClone(prog().fichaDua);
  const runsAntes = d().runs.length;
  const alterada = seed('dua-ficha-404508-biotecnologia.html').replace('UN NIVEL DE ESPAÑOL B1', 'UN NIVEL DE ESPAÑOL C1');
  radarDb.failNextWriteForTests(Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' }));
  const r = await equipe('POST', '/radar/admin/import', { fonte: 'dua-fichas', robots: { [ORIGIN]: '' }, paginas: [ficha('404508', alterada)] });
  assert.equal(r.status, 503);
  assert.equal(r.data.run.persistido, false);
  assert.match(r.data.error, /não foi gravada/);
  assert.deepEqual(prog().fichaDua, antes, 'a memória voltou ao que está gravado');
  const disco = JSON.parse(fs.readFileSync(process.env.RADAR_DATA_FILE, 'utf8'));
  assert.deepEqual(disco.programs.find((x) => x.id === PROG).fichaDua, antes, 'o arquivo/banco não tem a alteração');
  assert.ok(disco.runs.some((x) => x.resultado === 'erro' && x.persistido === false && /Falha ao gravar/.test(x.erro)), 'a falha ficou registrada');
  // Repetir a mesma importação: agora grava, uma vez só.
  const ok = await equipe('POST', '/radar/admin/import', { fonte: 'dua-fichas', robots: { [ORIGIN]: '' }, paginas: [ficha('404508', alterada)] });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.persistido, true);
  assert.equal(prog().fichaDua.idiomasExigidos[0].nivel, 'C1');
  assert.ok(d().runs.length > runsAntes);
});

test('3b. falha de gravação numa correção do painel: 503 e a correção não fica só na memória', async () => {
  radarDb.failNextWriteForTests(new Error('rede indisponível'));
  const r = await equipe('POST', '/radar/admin/corrections', { entidade: 'Program', id: PROG, campo: 'modalidade', valor: 'online', motivo: 'Teste de falha', url: 'https://www.ugr.es/x' });
  assert.equal(r.status, 503);
  assert.equal(prog().overrides?.modalidade, undefined);
});

// 4 ------------------------------------------------------------------------------------------------
test('4. repetir a mesma importação não duplica snapshots, revisões nem alertas', async () => {
  const pag = [ficha('404508', seed('dua-ficha-404508-biotecnologia.html').replace('UN NIVEL DE ESPAÑOL B1', 'UN NIVEL DE ESPAÑOL C1'))];
  const conta = () => ({ snaps: d().snapshots.filter((s) => s.sourceId === 'dua-fichas').length, revs: d().revisions.length, alerts: d().alerts.length });
  const a = conta();
  for (let i = 0; i < 3; i++) assert.equal((await equipe('POST', '/radar/admin/import', { fonte: 'dua-fichas', robots: { [ORIGIN]: '' }, paginas: pag })).data.persistido, true);
  assert.deepEqual(conta(), a);
});

// 5 ------------------------------------------------------------------------------------------------
test('5. programa renomeado na fonte (identificador novo, mesmo código e site): mantém o identificador antigo', async () => {
  const p = d().programs.find((x) => x.universidadeId === 'ugr' && x.id !== PROG && x.codigo && x.webPropria && !x.overrides);
  const total = d().programs.length;
  const novoId = `${p.id}-renomeado`;
  const nomeNovo = `${p.nome} (Nueva denominación)`;
  const oportunidades = d().opportunities.filter((o) => o.programId === p.id).map((o) => o.id).sort();
  ugrCatalog([fonteDoPrograma(p, { id: novoId, nome: nomeNovo })]);
  assert.equal(d().programs.length, total, 'nenhum programa duplicado');
  assert.ok(!d().programs.some((x) => x.id === novoId));
  assert.equal(p.nome, nomeNovo, 'o programa original recebe o nome novo da fonte');
  assert.deepEqual(d().opportunities.filter((o) => o.programId === p.id).map((o) => o.id).sort(), oportunidades, 'oportunidades vinculadas preservadas');
  assert.ok(!d().opportunities.some((o) => o.programId === novoId), 'nenhuma oportunidade duplicada');
  assert.ok(p.aliases.includes(novoId));
  assert.ok(d().revisions.some((r) => r.entidadeId === p.id && r.campo === 'identificacao' && r.validacao === 'reconciliada'));
  // A próxima coleta com o identificador novo encontra o mesmo programa pelo apelido.
  ugrCatalog([fonteDoPrograma(p, { id: novoId, nome: p.nome })]);
  assert.equal(d().programs.length, total);
});

test('5b. só nome parecido (sem evidência forte): cria o novo, abre revisão; aprovar une sem tocar nas contas', async () => {
  const antigo = d().programs.find((x) => x.universidadeId === 'ugr' && x.id !== PROG && !x.aliases && x.nome.split(' ').length > 5);
  const novoId = 'ugr-teste-nome-parecido';
  const palavras = antigo.nome.split(' ');
  ugrCatalog([{ id: novoId, codigo: 'X-NOVO', universidadeId: 'ugr', nome: [...palavras.slice(0, -1), 'Avanzado'].join(' '), webPropria: 'https://outro-site.example/novo', cursoCatalogo: '2026/2027', ofertaCondicionada: false, modalidade: null, fichaUrl: 'https://masteres.ugr.es/x', ramos: [], tipoTitulo: 'oficial' }]);
  assert.ok(d().programs.some((x) => x.id === novoId), 'sem evidência suficiente, nada é unido automaticamente');
  await radarDb.save();
  const rev = d().reviews.find((r) => r.status === 'aberta' && r.tipo === 'possivel-renomeacao' && r.proposta.novoId === novoId);
  assert.ok(rev, 'revisão administrativa aberta');
  assert.ok(rev.proposta.candidatos.includes(antigo.id));
  const ap = await equipe('POST', `/radar/admin/reviews/${rev.id}`, { decisao: 'aprovar', antigoId: antigo.id });
  assert.equal(ap.status, 200, JSON.stringify(ap.data));
  const novo = d().programs.find((x) => x.id === novoId);
  assert.equal(novo.aliasDe, antigo.id);
  assert.ok(antigo.aliases.includes(novoId));
  assert.equal(programById(novoId).idCanonico, antigo.id, 'quem guardou o id novo recebe o mestrado original');
  const lista = (await aluno('GET', '/radar/programs')).data.programas;
  assert.ok(!lista.some((x) => x.id === novoId), 'sem duplicata na lista');
});

// 6 ------------------------------------------------------------------------------------------------
test('6. código DUA novo para o mesmo mestrado: mantém o identificador; correção do código é respeitada', async () => {
  const dua = (codigo, extra = {}) => ({ id: `dua-${codigo}`, codigo, duaCodigo: codigo, universidadeId: 'uhu', nome: 'ACCESO A LA ABOGACÍA Y LA PROCURA', webPropria: 'https://www.uhu.es/abogacia', ramos: [], tipoTitulo: 'oficial', modalidade: null, ofertaCondicionada: false, fonteCatalogo: 'dua-catalogo', ...extra });
  const cat = (programas, k) => pipeline.ingest('dua-catalogo', { url: 'https://dua.example/cat', text: k, snapshotKey: 'dua-catalogo:uhu', parsedOverride: { ok: true, tipo: 'catalogo', universidadeId: 'uhu', anoAcademico: '2026/2027', avisos: [], programas } });
  cat([dua('520708')], 'a');
  const total = d().programs.length;
  cat([dua('520799')], 'b'); // a fonte trocou o código
  assert.equal(d().programs.length, total, 'não criou um segundo programa');
  const p = d().programs.find((x) => x.id === 'dua-520708');
  assert.equal(p.duaCodigo, '520799', 'a ficha passa a ser buscada pelo código novo');
  assert.ok(p.aliases.includes('dua-520799'));
  assert.ok(d().revisions.some((r) => r.entidadeId === 'dua-520708' && r.campo === 'duaCodigo' && r.anterior === '520708' && r.novo === '520799'));
  // Código corrigido pelo admin: uma coleta com outro código não o sobrescreve.
  await radarDb.save();
  assert.equal((await equipe('POST', '/radar/admin/corrections', { entidade: 'Program', id: 'dua-520708', campo: 'duaCodigo', valor: '520700', motivo: 'Código confirmado com a universidade', url: 'https://www.uhu.es/x' })).status, 200);
  cat([dua('520799')], 'c');
  assert.equal(p.duaCodigo, '520700');
  assert.equal(p.overrides.duaCodigo.valorFonte, '520799');
});

// 7 ------------------------------------------------------------------------------------------------
test('7. jornadas, opções e conta do aluno ficam idênticas depois de tudo (coletas, correções, falhas, reconciliação)', async () => {
  await flush();
  const agora = users.findById(alunoId);
  assert.deepEqual(agora.journeys, jornadaAntes.journeys);
  assert.deepEqual(agora.choices, jornadaAntes.choices);
  assert.equal(agora.updatedAt, jornadaAntes.updatedAt, 'nenhuma gravação na conta do aluno');
  // A jornada continua resolvendo o programa (com as correções vigentes).
  assert.equal(programById(PROG).nome, prog().nome);
  assert.equal(prog().webPropria, 'https://masteres.ugr.es/procesos-negocio-corrigido', 'correção vigente preservada');
  assert.equal((await aluno('GET', `/journeys/${agora.journeys[0].id}`)).status, 200);
});

// 8 e 9 ---------------------------------------------------------------------------------------------
test('8. a evidência de uma alteração é recuperável: HTML original e conteúdo extraído', async () => {
  const snap = d().snapshots.filter((s) => s.sourceId === 'dua-fichas' && s.chave === `dua-fichas:${PROG}`).at(-1);
  assert.ok(snap.evidencia?.html && snap.evidencia?.conteudo);
  const html = await equipe('GET', `/radar/admin/snapshots/${snap.id}/evidencia`);
  assert.equal(html.status, 200);
  assert.ok(html.data.includes('UN NIVEL DE ESPAÑOL C1'), 'o texto da página que fundamentou a mudança');
  const conteudo = await equipe('GET', `/radar/admin/snapshots/${snap.id}/evidencia?tipo=conteudo`);
  assert.equal(conteudo.data.dados.idiomasExigidos[0].nivel, 'C1');
  // A revisão aponta para esse snapshot.
  const rev = d().revisions.filter((r) => r.entidadeId === PROG && r.campo === 'fichaDua.idiomasExigidos').at(-1);
  assert.equal(rev.evidencia.snapshotId, snap.id);
  assert.equal((await aluno('GET', `/radar/admin/snapshots/${snap.id}/evidencia`)).status, 403, 'só a equipe do Radar');
});

test('9. o HTML fica gravado de forma durável (comprimido, por hash) e outro processo o lê depois (novo deploy)', async () => {
  const snap = d().snapshots.filter((s) => s.sourceId === 'dua-fichas').at(-1);
  const arquivo = path.join(process.env.RADAR_EVIDENCE_DIR, `${snap.evidencia.html}.gz`);
  assert.ok(fs.existsSync(arquivo));
  const script = `const s = await import(${JSON.stringify(new URL('../server/storage.js', import.meta.url).href)}); const t = await s.getEvidence(${JSON.stringify(snap.evidencia.html)}); process.stdout.write(String(t && t.includes('UN NIVEL DE ESPAÑOL C1')));`;
  const out = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env }, encoding: 'utf8' });
  assert.equal(out.stdout.trim(), 'true', out.stderr);
  // Nenhuma referência a disco temporário da instância.
  assert.ok(!d().snapshots.some((s) => s.evidencia && typeof s.referencia === 'string' && s.referencia.includes('radar-snapshots')));
});

// 10 -------------------------------------------------------------------------------------------------
test('10. coletas simultâneas da mesma fonte são serializadas: sem duplicar nem corromper', async () => {
  const pagA = ficha('404508', seed('dua-ficha-404508-biotecnologia.html').replace('UN NIVEL DE ESPAÑOL B1', 'UN NIVEL DE ESPAÑOL B2'));
  const runsAntes = d().runs.length;
  const snapsAntes = d().snapshots.filter((s) => s.chave === `dua-fichas:${PROG}`).length;
  const rs = await Promise.all([1, 2, 3, 4].map(() => equipe('POST', '/radar/admin/import', { fonte: 'dua-fichas', robots: { [ORIGIN]: '' }, paginas: [pagA] })));
  assert.deepEqual(rs.map((r) => r.status), [200, 200, 200, 200]);
  assert.ok(rs.every((r) => r.data.persistido === true));
  assert.equal(d().snapshots.filter((s) => s.chave === `dua-fichas:${PROG}`).length, snapsAntes + 1, 'uma versão nova, não quatro');
  assert.equal(new Set(rs.map((r) => r.data.run.id)).size, 4, 'cada execução com identificador próprio');
  assert.equal(d().runs.length, runsAntes + 4);
  const disco = JSON.parse(fs.readFileSync(process.env.RADAR_DATA_FILE, 'utf8'));
  assert.equal(disco.programs.find((x) => x.id === PROG).fichaDua.idiomasExigidos[0].nivel, 'B2');
  for (const r of rs) {
    const run = disco.runs.find((x) => x.id === r.data.run.id);
    assert.ok(run.inicio && run.fim && run.resultado && run.persistido === true && Number.isInteger(run.itens) && Number.isInteger(run.alvos), 'início, fim, resultado, contagens e persistência confirmada');
  }
});

// 11 -------------------------------------------------------------------------------------------------
test('11. histórico: correção, divergência da fonte, remoção e invalidação ficam registrados (nada é apagado)', async () => {
  const h = (await equipe('GET', `/radar/admin/history?entidade=Program&id=${PROG}`)).data;
  const tipos = h.revisoes.filter((r) => r.campo === 'nome').map((r) => r.validacao);
  assert.ok(tipos.includes('corrigida'));
  assert.ok(tipos.includes('fonte-divergente'));
  assert.ok(tipos.includes('correcao-removida'));
  // Revisão falsa antiga (antes = depois): detectada e invalidada sem ser apagada.
  d().revisions.push({ id: 'rev-falsa-1', entidade: 'Program', entidadeId: PROG, campo: 'fichaDua.titulacoes', anterior: '69 titulação(ões) com preferência', novo: '69 titulação(ões) com preferência', em: '2026-11-13T15:16:49.000Z', validacao: 'publicada', por: 'atualizador' });
  await radarDb.save();
  const sus = (await equipe('GET', '/radar/admin/revisions/suspeitas')).data.revisoes;
  assert.ok(sus.some((r) => r.id === 'rev-falsa-1'));
  assert.equal((await equipe('POST', '/radar/admin/revisions/rev-falsa-1/invalidate', { motivo: 'Alteração falsa: ordem das chaves do jsonb' })).status, 200);
  const r = d().revisions.find((x) => x.id === 'rev-falsa-1');
  assert.equal(r.validacao, 'invalidada');
  assert.equal(r.invalidada.validacaoAnterior, 'publicada');
  assert.ok(!(await equipe('GET', '/radar/admin/revisions/suspeitas')).data.revisoes.some((x) => x.id === 'rev-falsa-1'));
  // O pipeline não registra mais "mudança" sem mudança.
  const n = d().revisions.length;
  ugrCatalog([fonteDoPrograma(prog())]);
  assert.equal(d().revisions.length, n);
});

// 12 -------------------------------------------------------------------------------------------------
test('12. retenção: alertas não lidos nunca somem; lidos só acima da cota e do prazo; evidência citada fica', async () => {
  const dia = 86400000;
  const velho = new Date(Date.now() - 400 * dia).toISOString();
  const recente = new Date(Date.now() - 10 * dia).toISOString();
  const mk = (i, lido, criadoEm, userId = alunoId) => ({ id: `al-${userId}-${i}`, userId, opportunityId: opp().id, evento: 'x', titulo: 't', corpo: 'c', criadoEm, lidoEm: lido ? criadoEm : null, estado: lido ? 'lida' : 'nova', dedupeKey: `k-${userId}-${i}` });
  d().alerts.push(...Array.from({ length: 700 }, (_, i) => mk(`v${i}`, true, velho)));
  d().alerts.push(...Array.from({ length: 30 }, (_, i) => mk(`n${i}`, false, velho)));
  d().alerts.push(...Array.from({ length: 50 }, (_, i) => mk(`r${i}`, true, recente)));
  d().alerts.push(...Array.from({ length: 20000 }, (_, i) => mk(`o${i}`, false, recente, 'outro-aluno')));
  await radarDb.save();
  const meus = d().alerts.filter((a) => a.userId === alunoId);
  assert.equal(meus.filter((a) => !a.lidoEm).length, 30, 'todos os não lidos ficam');
  assert.equal(meus.filter((a) => a.lidoEm && a.criadoEm === recente).length, 50, 'lidos recentes ficam');
  assert.equal(meus.filter((a) => a.lidoEm).length, 500, 'lidos antigos só até a cota por aluno');
  assert.equal(d().alerts.filter((a) => a.userId === 'outro-aluno').length, 20000, 'sem teto global que apague alertas de outro aluno');
  // Snapshots: as 10 versões mais recentes por página, mais a citada por uma revisão.
  const chave = 'dua-fichas:retencao';
  for (let v = 1; v <= 15; v++) d().snapshots.push({ id: `snap-ret-${v}`, sourceId: 'dua-fichas', chave, versao: v, coletadoEm: recente, hash: `h${v}` });
  d().revisions.push({ id: 'rev-cita-snap', entidade: 'Program', entidadeId: PROG, campo: 'x', anterior: 'a', novo: 'b', evidencia: { snapshotId: 'snap-ret-2' }, em: recente, validacao: 'publicada', por: 'teste' });
  await radarDb.save();
  const ficaram = d().snapshots.filter((s) => s.chave === chave).map((s) => s.versao).sort((a, b) => a - b);
  assert.deepEqual(ficaram, [2, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  // Revisões nunca são cortadas.
  const nRev = d().revisions.length;
  d().revisions.push(...Array.from({ length: 21000 }, (_, i) => ({ id: `rev-massa-${i}`, entidade: 'Program', entidadeId: 'x', campo: 'c', anterior: i, novo: i + 1, em: recente, validacao: 'publicada', por: 'teste' })));
  await radarDb.save();
  assert.equal(d().revisions.length, nRev + 21000);
});
