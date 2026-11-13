// Carteira de documentos: etapas, personalização, missões, envios por procedimento, agenda e arquivos cifrados.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.RADAR_DATA_FILE = path.join(tmp, 'radar.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
process.env.DOCS_DIR = path.join(tmp, 'docfiles');
process.env.RADAR_SCHEDULER = 'off';

const { createApp } = await import('../server/app.js');
const { flush, users } = await import('../server/store.js');

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
  const call = async (method, url, body, extra = {}) => {
    const headers = { 'X-Requested-With': 'travessia', ...(body !== undefined && !Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}), ...extra };
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(base + url, { method, headers, body: Buffer.isBuffer(body) ? body : body !== undefined ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const buf = Buffer.from(await res.arrayBuffer());
    let data;
    try { data = JSON.parse(buf.toString('utf8')); } catch { data = buf; }
    return { status: res.status, data, headers: res.headers };
  };
  return call;
}

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);

let req;
let uid;
let jid;
const cat = (d, id) => d.categorias.find((c) => c.id === id);
const doc = async (id) => (await req('GET', `/documents/${id}?journeyId=${jid}`)).data.documento;

test('setup: estudante com jornada (mestrado sem exigência de idioma, 18 meses)', async () => {
  req = client();
  const r = await req('POST', '/auth/register', { nome: 'Bia Lima', email: 'bia@docs.dev', senha: 'segura123', aceite: true });
  assert.equal(r.status, 201);
  uid = r.data.user.id;
  await req('PUT', '/me/profile', { nacionalidade: 'Brasileira', paisResidencia: 'Brasil', estado: 'PB', onboardingConcluido: true });
  const j = await req('POST', '/journeys', { programaId: 'ugr-demo-arq', anoAcademico: '2027/28' });
  assert.equal(j.status, 201);
  jid = j.data.journey.id;
});

test('dashboard: etapa atual em destaque, futuras só como prévia, próximo documento', async () => {
  const { status, data: d } = await req('GET', `/documents/dashboard?journeyId=${jid}`);
  assert.equal(status, 200);
  assert.equal(d.etapaAtual, 'candidatura');
  assert.equal(d.categorias.length, 17);
  for (const id of ['pessoais', 'academicos', 'candidatura']) assert.equal(cat(d, id).estado, 'atual', id);
  // Categorias de etapas futuras ficam como "mais adiante": não entram nas pendências de agora.
  for (const id of ['matricula', 'visto', 'viagem', 'nie-tie']) assert.equal(cat(d, id).estado, 'futura', id);
  // Categorias que dependem de uma situação que o estudante não tem ficam ocultas (acompanhantes, trabalho, renovação).
  for (const id of ['familiares', 'trabalho', 'renovacao']) assert.equal(cat(d, id).estado, 'oculta', id);
  assert.ok(d.proximos.length >= 4 && d.proximos.length <= 6);
  assert.ok(d.proximos.every((v) => v.exigencia === 'requerido'));
  assert.ok(d.indicadores.maisAdiante > 0);
  assert.equal(d.indicadores.aplicaveis, d.indicadores.prontos + d.indicadores.pendentes + d.indicadores.maisAdiante + d.indicadores.atencao);
  // Exceção: o que precisa de antecedência aparece antes (antecedentes, meios).
  assert.ok(d.antecedencia.some((v) => v.id === 'antecedentes'));
  assert.ok(d.antecedencia.some((v) => v.id === 'meios'));
  assert.equal(d.proximo.documento.id, 'passaporte');
  assert.match(d.proximo.acao, /passaporte/i);
  assert.equal(d.consulado.nome, 'Consulado Geral da Espanha em Salvador da Bahia');
  assert.equal(d.declarou, false);
});

test('personalização: mestrado sem idioma e sem apoio/bolsa → "Não necessário", fora das pendências', async () => {
  const { data: d } = await req('GET', `/documents/dashboard?journeyId=${jid}`);
  const idioma = await doc('idioma');
  assert.equal(idioma.status, 'nao-se-aplica');
  assert.equal(idioma.estado, 'nao-aplicavel');
  assert.equal(idioma.statusLabel, 'Não necessário');
  assert.match(idioma.motivo, /não exige/);
  assert.ok(!d.proximos.some((v) => v.id === 'idioma'));
  assert.ok(cat(d, 'candidatura').naoAplicaveis >= 1);
  // Estada de 18 meses → EX-17 da TIE exigido.
  assert.equal((await doc('tie-solicitacao')).exigencia, 'requerido');
  // Antecedentes aparecem para confirmação, pois a exigência depende da lista do consulado.
  const { data: a } = await req('GET', `/documents/antecedentes?journeyId=${jid}`);
  assert.equal(a.documento.exigencia, 'verificar');
  assert.ok(d.antecedencia.some((v) => v.id === 'antecedentes' && v.exigencia === 'verificar'));
  const { data: ap } = await req('GET', `/documents/apoio-familiar?journeyId=${jid}`);
  assert.equal(ap.documento.exigencia, 'nao-necessario');
});

test('"O que você já tem?": declarado ≠ anexado ≠ conferido; desfazer só o que foi declarado', async () => {
  const { data: d } = await req('POST', `/documents/declare?journeyId=${jid}`, { itens: { passaporte: 'tenho', diploma: 'tenho' } });
  assert.equal(d.declarou, true);
  const pass = await doc('passaporte');
  assert.equal(pass.status, 'pronto');
  assert.equal(pass.estado, 'pronto');
  assert.equal(pass.evidencias.declarado, true);
  assert.equal(pass.evidencias.anexos, 0);
  assert.equal(pass.evidencias.conferidoEm, null);
  assert.equal(d.proximo.documento.id, 'historico');
  // As regras das missões continuam lendo user.documents.
  assert.equal(users.findById(uid).documents.passaporte, 'pronto');
  const { data: back } = await req('POST', `/documents/declare?journeyId=${jid}`, { itens: { diploma: 'nao-tenho' } });
  assert.equal(back.declarou, true);
  assert.equal((await doc('diploma')).status, 'pendente');
});

test('validade do passaporte: vence antes do fim da estadia → precisa de atenção e vira o próximo', async () => {
  const soon = new Date(Date.now() + 200 * 86400000).toISOString().slice(0, 10);
  const r = await req('PUT', `/documents/passaporte?journeyId=${jid}`, { validade: soon, conferido: true });
  assert.equal(r.status, 200);
  assert.ok(r.data.documento.atencao);
  assert.match(r.data.documento.alerta, /antes do fim/);
  assert.ok(r.data.documento.evidencias.conferidoEm);
  const { data: d } = await req('GET', `/documents/dashboard?journeyId=${jid}`);
  assert.equal(d.proximo.documento.id, 'passaporte');
  assert.equal(d.resumo.atencao, 1);
  assert.equal(d.indicadores.atencao, 1);
  assert.equal((await req('PUT', '/documents/diploma', { validade: soon })).status, 400);
  await req('PUT', '/documents/passaporte', { validade: null });
});

test('aguardando emissão + lembrete na Agenda: prévia primeiro, evento só com confirmação', async () => {
  const w = await req('PUT', `/documents/historico?journeyId=${jid}`, { aguardando: true });
  assert.equal(w.data.documento.status, 'em-preparacao');
  assert.equal(w.data.documento.aguardando, true);
  assert.equal(w.data.documento.statusLabel, 'Preparando');
  assert.equal(w.data.documento.estadoLabel, 'Aguardando emissão');
  const before = (users.findById(uid).planner || []).length;
  const p = await req('POST', '/documents/historico/reminder', { tipo: 'verificar' });
  assert.equal(p.data.confirmado, false);
  assert.match(p.data.previa.titulo, /Verificar a solicitação: Histórico/);
  assert.equal((users.findById(uid).planner || []).length, before);
  const c = await req('POST', '/documents/historico/reminder', { tipo: 'verificar', data: p.data.previa.data, confirmar: true });
  assert.equal(c.data.confirmado, true);
  const ev = users.findById(uid).planner.at(-1);
  assert.equal(ev.origem, 'documentos');
  assert.equal(ev.documentoId, 'historico');
  assert.equal(ev.categoria, 'documentacao');
  assert.equal((await req('POST', '/documents/historico/reminder', { tipo: 'verificar', data: '2020-01-01', confirmar: true })).status, 400);
});

test('envio por procedimento: enviado ao DUA não é apresentado ao consulado', async () => {
  const r = await req('POST', `/documents/passaporte/submissions?journeyId=${jid}`, { procedimento: 'dua' });
  assert.equal(r.status, 200);
  assert.equal(r.data.documento.status, 'enviado');
  // Na etapa do visto o passaporte é reutilizado e aparece como pronto (ainda não apresentado ao consulado).
  const { data: d } = await users.update(uid, (u) => { u.journeys[0].missions['5.1'] ??= { objetivos: {} }; }).then(() => req('GET', `/documents/dashboard?journeyId=${jid}`));
  const { docView, docContext } = await import('../server/document-engine.js');
  const { DOCUMENTS } = await import('../server/content/documents.js');
  const ctx = docContext(users.findById(uid), users.findById(uid).journeys[0]);
  const noVisto = docView(DOCUMENTS.find((x) => x.id === 'passaporte'), ctx, 'visto');
  assert.equal(noVisto.status, 'pronto');
  assert.equal(noVisto.reutilizado, true);
  assert.equal(d.categorias.length, 17);
  const c = await req('POST', '/documents/passaporte/submissions', { procedimento: 'consulado', resultado: 'aceito' });
  assert.deepEqual(c.data.documento.evidencias.aceito, ['Consulado']);
  const ctx2 = docContext(users.findById(uid), users.findById(uid).journeys[0]);
  assert.equal(docView(DOCUMENTS.find((x) => x.id === 'passaporte'), ctx2, 'visto').status, 'enviado');
});

test('missão concluída → documento pronto (uma vez; não rebaixa nem repete)', async () => {
  await users.update(uid, (u) => { u.documents.diploma = 'pendente'; u.journeys[0].missions['2.2'] = { objetivos: {}, concluidaEm: new Date().toISOString() }; });
  const { data: d } = await req('GET', `/documents/dashboard?journeyId=${jid}`);
  assert.equal(d.etapaAtual, 'candidatura');
  const dip = await doc('diploma');
  assert.equal(dip.status, 'pronto');
  assert.equal(dip.evidencias.porMissao, '2.2');
  // O estudante corrige para "pendente": a mesma conclusão não volta a promover.
  await req('PUT', '/documents/diploma', { status: 'pendente' });
  const { data: d2 } = await req('GET', `/documents/dashboard?journeyId=${jid}`);
  assert.ok(d2.proximos.some((v) => v.id === 'diploma' && v.status === 'pendente'));
  assert.equal((await doc('diploma')).status, 'pendente');
  // Contrato das missões.
  const m = await req('GET', `/documents/missions/${jid}/3.5`);
  assert.equal(m.status, 200);
  assert.ok(m.data.faltam.some((x) => x.id === 'diploma'));
  assert.ok(m.data.prontos.some((x) => x.id === 'passaporte'));
  assert.ok(m.data.naoNecessarios.some((x) => x.id === 'idioma'));
});

test('arquivos: consentimento, cifrados em disco, só o dono baixa por link assinado, versões, tipo pelos bytes', async () => {
  const noConsent = await req('POST', `/documents/historico/files?journeyId=${jid}`, PDF, { 'Content-Type': 'application/pdf' });
  assert.equal(noConsent.status, 428);
  assert.equal(noConsent.data.codigo, 'consentimento');
  assert.equal((await req('POST', '/documents/consent', { aceito: true, versao: 'antiga' })).status, 400);
  const ok = await req('POST', '/documents/consent', { aceito: true, versao: '2026-11-13' });
  assert.equal(ok.status, 200);
  assert.ok(ok.data.consentimento.em);
  const up = await req('POST', `/documents/historico/files?journeyId=${jid}`, PDF, { 'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent('histórico ../../x.pdf') });
  assert.equal(up.status, 201);
  const f = up.data.arquivo;
  assert.equal(f.mime, 'application/pdf');
  assert.equal(f.nome, 'histórico ....x.pdf');
  assert.equal(up.data.documento.evidencias.anexos, 1);
  // Em disco não está o PDF em claro.
  const onDisk = fs.readFileSync(path.join(tmp, 'docfiles', uid, `${f.id}.bin`));
  assert.ok(!onDisk.includes(Buffer.from('%PDF')));
  assert.match(f.url, /\?t=\d+\./, 'link assinado');
  assert.equal((await req('GET', `/documents/files/${f.id}`)).status, 403, 'sem assinatura não abre');
  assert.equal((await req('GET', `/documents/files/${f.id}?t=1.abc`)).status, 403, 'assinatura inválida/expirada não abre');
  const dl = await req('GET', f.url.replace('/api', ''));
  assert.equal(dl.status, 200);
  assert.ok(Buffer.compare(dl.data, PDF) === 0);
  assert.equal(dl.headers.get('cache-control'), 'private, no-store');
  assert.equal(dl.headers.get('x-content-type-options'), 'nosniff');
  // Outro estudante não acessa.
  const other = client();
  await other('POST', '/auth/register', { nome: 'Caio Reis', email: 'caio@docs.dev', senha: 'segura123', aceite: true });
  assert.equal((await other('GET', f.url.replace('/api', ''))).status, 404, 'o link de um não abre na conta de outro');
  assert.equal((await client()('GET', f.url.replace('/api', ''))).status, 401, 'sem sessão não abre');
  // Nova versão na mesma série.
  const v2 = await req('POST', `/documents/historico/files?serie=${f.id}`, PNG, { 'Content-Type': 'image/png', 'X-File-Name': 'historico.png' });
  assert.equal(v2.status, 201);
  assert.equal(v2.data.arquivo.versao, 2);
  const det = v2.data.documento;
  assert.equal(det.arquivos.length, 1);
  assert.equal(det.arquivos[0].versao, 2);
  assert.equal(det.arquivos[0].anteriores.length, 1);
  // Tipo falso é recusado.
  assert.equal((await req('POST', '/documents/historico/files', Buffer.from('<script>alert(1)</script>'), { 'Content-Type': 'application/pdf' })).status, 415);
  // Exclusão apaga o arquivo do disco.
  const del = await req('DELETE', `/documents/files/${f.id}`);
  assert.equal(del.status, 200);
  assert.ok(!fs.existsSync(path.join(tmp, 'docfiles', uid, `${f.id}.bin`)));
});

test('minha pasta: lista tudo, aceita etapa futura e "Outro documento" com nome', async () => {
  // Carta de admissão é de etapa futura, mas pode ser guardada já.
  const adm = await req('POST', `/documents/admissao/files?journeyId=${jid}`, PDF, { 'Content-Type': 'application/pdf', 'X-File-Name': 'carta.pdf' });
  assert.equal(adm.status, 201);
  // "Outro documento" exige nome e não vira status nem pendência.
  assert.equal((await req('POST', '/documents/pessoal/files', PNG, { 'Content-Type': 'image/png' })).status, 400);
  const rg = await req('POST', `/documents/pessoal/files?rotulo=${encodeURIComponent('RG <b>')}`, PNG, { 'Content-Type': 'image/png', 'X-File-Name': 'rg.png' });
  assert.equal(rg.status, 201);
  assert.equal(rg.data.documento, null);
  // Nova versão herda o nome.
  const rg2 = await req('POST', `/documents/pessoal/files?serie=${rg.data.arquivo.id}`, PDF, { 'Content-Type': 'application/pdf' });
  assert.equal(rg2.status, 201);
  const list = await req('GET', '/documents/files');
  assert.equal(list.status, 200);
  const nomes = list.data.arquivos.map((x) => x.docNome);
  assert.ok(nomes.includes('RG b'));
  assert.ok(list.data.arquivos.some((x) => x.docId === 'admissao'));
  assert.equal(list.data.arquivos.filter((x) => x.docId === 'pessoal').length, 1, 'só a versão mais recente');
  assert.ok(list.data.tipos.some((t) => t.id === 'pessoal'));
  assert.equal(users.findById(uid).documents?.pessoal, undefined);
  // Excluir "Outro documento" funciona.
  const del = await req('DELETE', `/documents/files/${rg2.data.arquivo.id}`);
  assert.equal(del.status, 200);
  assert.equal(del.data.documento, null);
  // Outro estudante não vê a pasta.
  const other = client();
  await other('POST', '/auth/register', { nome: 'Dani Souza', email: 'dani@docs.dev', senha: 'segura123', aceite: true });
  assert.equal((await other('GET', '/documents/files')).data.arquivos.length, 0);
});

test('LGPD: revogar o consentimento apaga os arquivos e exige novo aceite; os registros continuam', async () => {
  assert.ok((users.findById(uid).docFiles || []).length > 0);
  assert.equal((await req('DELETE', '/documents/consent', {})).status, 400, 'exige confirmação');
  const r = await req('DELETE', '/documents/consent', { confirmar: 'REVOGAR' });
  assert.equal(r.status, 200);
  assert.ok(r.data.excluidos > 0);
  const u = users.findById(uid);
  assert.equal(u.docConsent, null);
  assert.equal((u.docFiles || []).length, 0);
  assert.ok(u.docRecords.passaporte, 'o status do documento não é arquivo e continua');
  const again = await req('POST', '/documents/pessoal/files', PDF, { 'Content-Type': 'application/pdf' });
  assert.equal(again.status, 428, 'sem consentimento, novo envio é recusado');
  assert.equal((await req('POST', '/documents/consent', { aceito: true, versao: '2026-11-13' })).status, 200);
  assert.equal((await req('POST', `/documents/historico/files?journeyId=${jid}`, PDF, { 'Content-Type': 'application/pdf' })).status, 201);
});

test('LGPD: exportação sem chaves e exclusão apaga os arquivos', async () => {
  const ex = await req('GET', '/me/export');
  assert.ok(Array.isArray(ex.data.docFiles));
  assert.ok(ex.data.docFiles.every((f) => !('iv' in f) && !('tag' in f)));
  assert.ok(ex.data.docRecords.passaporte);
  assert.ok(fs.existsSync(path.join(tmp, 'docfiles', uid)));
  assert.equal((await req('DELETE', '/me', { senha: 'segura123' })).status, 200);
  assert.ok(!fs.existsSync(path.join(tmp, 'docfiles', uid)));
});
