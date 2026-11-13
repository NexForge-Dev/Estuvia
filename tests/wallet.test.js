// Carteira inteligente: catálogo completo, condições do estudante, estados detalhados, apostila/tradução,
// busca e filtros, segurança dos arquivos, revisão editorial, integração com missões e preservação de dados antigos.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wallet-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.RADAR_DATA_FILE = path.join(tmp, 'radar.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
process.env.DOCS_DIR = path.join(tmp, 'docfiles');
process.env.DOC_RULES_FILE = path.join(tmp, 'document-rules.json');
process.env.RADAR_SCHEDULER = 'off';
process.env.ADMIN_EMAIL = 'equipe@carteira.dev';
process.env.ADMIN_PASSWORD = 'admin-carteira-123';

const { createApp } = await import('../server/app.js');
const { flush, users } = await import('../server/store.js');
const { DOCUMENTS, DOC_CATEGORIES, CATEGORY_USES, CONDITIONS, LEGACY_IDS } = await import('../server/content/documents.js');
const { pdfHasActiveContent } = await import('../server/routes/documents.js');

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
  return async (method, url, body, extra = {}) => {
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
}
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);

let req;
let uid;
let jid;
const doc = async (id) => (await req('GET', `/documents/${id}?journeyId=${jid}`)).data.documento;
const dash = async () => (await req('GET', `/documents/dashboard?journeyId=${jid}`)).data;

// ---------- Catálogo ----------

test('catálogo: 17 categorias com todos os itens da lista, sem documentos duplicados, ids antigos preservados', () => {
  assert.equal(DOC_CATEGORIES.length, 17);
  const expected = { pessoais: 13, academicos: 15, candidatura: 16, matricula: 12, financeira: 18, visto: 19, saude: 14, moradia: 19, viagem: 19, empadronamiento: 14, 'nie-tie': 14, 'universidade-es': 12, banco: 10, trabalho: 14, familiares: 14, complementar: 10, renovacao: 12 };
  for (const [c, n] of Object.entries(expected)) assert.equal(CATEGORY_USES[c].length, n, c);
  const ids = DOCUMENTS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length, 'cada documento existe uma vez');
  for (const id of LEGACY_IDS) assert.ok(ids.includes(id), `id antigo preservado: ${id}`);
  for (const d of DOCUMENTS) {
    assert.ok(d.categoria && d.nome && d.oque, d.id);
    assert.ok(['talvez', 'nao'].includes(d.apostila) && ['talvez', 'nao'].includes(d.traducao), `apostila/tradução nunca "sempre": ${d.id}`);
  }
  for (const list of Object.values(CATEGORY_USES)) {
    for (const u of list) {
      assert.ok(ids.includes(u.doc), u.doc);
      assert.ok(['O', 'C', 'R'].includes(u.classe));
      for (const k of [].concat(u.cond || [])) assert.ok(CONDITIONS[k.replace('!', '')], k);
    }
  }
  // O passaporte é um documento só, usado em várias categorias.
  const passCats = Object.entries(CATEGORY_USES).filter(([, l]) => l.some((u) => u.doc === 'passaporte')).map(([c]) => c);
  assert.ok(['pessoais', 'visto', 'viagem', 'nie-tie'].every((c) => passCats.includes(c)));
});

test('setup: estudante de 12 meses, morando em SP, mestrado sem certificado de idioma', async () => {
  req = client();
  const r = await req('POST', '/auth/register', { nome: 'Lia Rocha', email: 'lia@carteira.dev', senha: 'segura123', aceite: true });
  uid = r.data.user.id;
  await req('PUT', '/me/profile', { nacionalidade: 'Brasileira', paisResidencia: 'Brasil', estado: 'SP' });
  jid = (await req('POST', '/journeys', { programaId: 'ugr-demo-eng', anoAcademico: '2027/28', duracaoMeses: 12 })).data.journey.id;
  await req('POST', '/documents/consent', { aceito: true, versao: '2026-11-13' });
});

// ---------- Personalização ----------

test('condicionais pelo perfil: curso longo exige EX-17; acompanhantes, trabalho e renovação ficam fora até o estudante dizer', async () => {
  const d = await dash();
  const longa = d.condicoes.find((c) => c.key === 'longa');
  assert.equal(longa.valor, true);
  assert.equal(longa.origem, 'detectado');
  assert.equal((await doc('tie-solicitacao')).exigencia, 'requerido');
  assert.equal((await doc('antecedentes')).exigencia, 'verificar');
  for (const c of ['familiares', 'trabalho', 'renovacao']) assert.equal(d.categorias.find((x) => x.id === c).estado, 'oculta', c);
  // Nunca "obrigatório" quando depende do programa: carta de motivação é "conforme o caso".
  assert.equal((await doc('carta-motivacao')).exigencia, 'condicional');
  assert.equal((await doc('cpf')).exigencia, 'recomendado');
});

test('"Minha situação": corrigir condições muda a carteira; null volta ao detectado', async () => {
  // Curso de até 6 meses: EX-17 e antecedentes deixam de valer.
  let d = (await req('PUT', `/documents/conditions?journeyId=${jid}`, { longa: false, familiares: true, renovar: true })).data;
  assert.equal(d.condicoes.find((c) => c.key === 'longa').origem, 'voce');
  const ex17 = await doc('tie-solicitacao');
  assert.equal(ex17.exigencia, 'nao-necessario');
  assert.equal(ex17.estado, 'nao-aplicavel');
  assert.match(ex17.motivo, /Minha situação/);
  assert.equal((await doc('antecedentes')).exigencia, 'verificar', 'a duração, sozinha, não confirma a exigência do consulado');
  assert.notEqual(d.categorias.find((c) => c.id === 'familiares').estado, 'oculta');
  assert.notEqual(d.categorias.find((c) => c.id === 'renovacao').estado, 'oculta');
  assert.equal((await doc('passaportes-acompanhantes')).exigencia, 'requerido');
  assert.equal((await req('PUT', '/documents/conditions', { inexistente: true })).status, 400);
  d = (await req('PUT', `/documents/conditions?journeyId=${jid}`, { longa: null, familiares: null, renovar: null })).data;
  assert.equal(d.condicoes.find((c) => c.key === 'longa').origem, 'detectado');
  assert.equal((await doc('tie-solicitacao')).exigencia, 'requerido');
});

test('bolsa concedida é detectada pelas finanças e ativa a documentação da bolsa', async () => {
  assert.equal((await doc('carta-bolsa')).exigencia, 'nao-necessario');
  await users.update(uid, (u) => { u.scholarshipApps = [{ id: 'b1', nome: 'Bolsa X', status: 'concedida' }]; });
  assert.equal((await doc('carta-bolsa')).exigencia, 'requerido');
  assert.equal((await doc('recebimento-bolsa')).exigencia, 'requerido');
});

// ---------- Estados, apostila e tradução ----------

test('estados detalhados mapeiam para o status que as missões leem', async () => {
  let r = await req('PUT', `/documents/historico?journeyId=${jid}`, { estado: 'solicitar' });
  assert.equal(r.data.documento.estadoLabel, 'Preciso solicitar');
  assert.equal(users.findById(uid).documents.historico, 'pendente');
  r = await req('PUT', `/documents/historico?journeyId=${jid}`, { estado: 'aguardando' });
  assert.equal(r.data.documento.estado, 'aguardando');
  assert.equal(users.findById(uid).documents.historico, 'em-preparacao');
  r = await req('PUT', `/documents/historico?journeyId=${jid}`, { estado: 'pronto' });
  assert.equal(r.data.documento.estadoLabel, 'Pronto para utilização');
  assert.equal(users.findById(uid).documents.historico, 'pronto');
  // "Vencido" e "Não aplicável" são calculados, nunca escolhidos à mão.
  assert.equal((await req('PUT', '/documents/historico', { estado: 'vencido' })).status, 400);
});

test('apostila: o órgão pediu → "Precisa de apostilamento" (sai de pronto); arquivo da apostila → volta a ficar pronto', async () => {
  const before = await doc('diploma');
  assert.equal(before.apostila.regra, 'talvez', 'nunca obrigatória por padrão');
  await req('PUT', `/documents/diploma?journeyId=${jid}`, { estado: 'pronto' });
  let r = await req('PUT', `/documents/diploma?journeyId=${jid}`, { apostila: 'precisa' });
  assert.equal(r.data.documento.estado, 'precisa-apostila');
  assert.equal(users.findById(uid).documents.diploma, 'em-preparacao', 'missões não contam como pronto');
  const agg = await doc('apostilas-academicas');
  assert.equal(agg.agregado.total, 1);
  assert.equal(agg.agregado.prontos, 0);
  r = await req('POST', `/documents/diploma/files?journeyId=${jid}&papel=apostila`, PDF, { 'Content-Type': 'application/pdf', 'X-File-Name': 'apostila.pdf' });
  assert.equal(r.status, 201);
  assert.equal(r.data.arquivo.papel, 'apostila');
  assert.equal(r.data.documento.apostila.marcacao, 'pronta');
  assert.equal((await doc('apostilas-academicas')).agregado.prontos, 1);
  r = await req('PUT', `/documents/diploma?journeyId=${jid}`, { estado: 'pronto' });
  assert.equal(r.data.documento.estado, 'pronto');
  assert.equal((await req('PUT', '/documents/apostilas-academicas', { estado: 'pronto' })).status, 400, 'item-checklist não tem estado próprio');
});

test('atendido por outro documento: a média final pode estar no histórico (sem arquivo extra)', async () => {
  const m = await doc('media-final');
  assert.deepEqual(m.atendidoPorOpcoes.map((x) => x.id), ['historico']);
  const r = await req('PUT', `/documents/media-final?journeyId=${jid}`, { atendidoPor: 'historico' });
  assert.equal(r.data.documento.estado, 'pronto');
  assert.equal(r.data.documento.evidencias.atendidoPor.id, 'historico');
  assert.equal(r.data.documento.evidencias.anexos, 0);
  assert.equal((await req('PUT', '/documents/media-final', { atendidoPor: 'passaporte' })).status, 400);
});

test('validade: só documentos com data; vencido é calculado; documentos de emissão recente não ganham prazo inventado', async () => {
  const past = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const r = await req('PUT', `/documents/seguro?journeyId=${jid}`, { validade: past });
  assert.equal(r.data.documento.estado, 'vencido');
  assert.ok(r.data.documento.atencao);
  assert.equal((await req('PUT', '/documents/diploma', { validade: past })).status, 400, 'diploma não vence');
  const old = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  const a = (await req('PUT', `/documents/antecedentes?journeyId=${jid}`, { emitidoEm: old })).data.documento;
  assert.match(a.aviso, /confira o prazo aceito na fonte oficial/);
  assert.notEqual(a.estado, 'vencido');
});

test('informações do documento e proibição de credenciais', async () => {
  const r = await req('PUT', `/documents/passaporte?journeyId=${jid}`, { emissor: 'Polícia Federal', pais: 'Brasil', emitidoEm: '2024-05-10', observacoes: 'Renovar antes de 2030.' });
  assert.equal(r.status, 200);
  assert.equal(r.data.documento.informacoes.emissor, 'Polícia Federal');
  assert.equal((await req('PUT', '/documents/iban', { observacoes: 'minha senha do banco é 1234' })).status, 400);
  assert.equal((await req('PUT', '/documents/iban', { observacoes: 'PIN 9876' })).status, 400);
  assert.equal((await req('PUT', '/documents/clave', { observacoes: 'código de acesso 55' })).status, 400);
});

// ---------- Busca e filtros ----------

test('busca e filtros: por texto, categoria, exigência e estado; não aplicáveis só sob pedido', async () => {
  assert.equal((await req('GET', '/documents/list')).status, 400, 'sem filtro não lista o catálogo inteiro');
  const q = (await req('GET', `/documents/list?q=apostila&journeyId=${jid}`)).data.itens;
  assert.ok(q.some((x) => x.id === 'apostilas-academicas'));
  const cat = (await req('GET', `/documents/list?categoria=nie-tie&journeyId=${jid}`)).data.itens;
  assert.ok(cat.some((x) => x.id === 'tie-solicitacao' && x.classe === 'O'));
  assert.ok(cat.some((x) => x.id === 'passaporte' && x.rotulos.includes('Cópia do passaporte')), 'referência, não duplicata');
  const trab = (await req('GET', `/documents/list?categoria=trabalho&journeyId=${jid}`)).data.itens;
  assert.equal(trab.length, 0, 'não aplicáveis ficam fora');
  const trabTodos = (await req('GET', `/documents/list?categoria=trabalho&todos=1&journeyId=${jid}`)).data.itens;
  assert.ok(trabTodos.length >= 10 && trabTodos.every((x) => x.exigencia === 'nao-necessario'));
  const prontos = (await req('GET', `/documents/list?estado=pronto&journeyId=${jid}`)).data.itens;
  assert.ok(prontos.some((x) => x.id === 'historico'));
  assert.equal((await req('GET', '/documents/list?categoria=xyz')).status, 400);
});

// ---------- Missões (nos dois sentidos) ----------

test('missão ↔ carteira: a missão lê a carteira e mudanças na carteira aparecem na missão', async () => {
  let m = (await req('GET', `/documents/missions/${jid}/2.3`)).data;
  assert.ok(m.prontos.some((x) => x.id === 'historico'), 'histórico pronto na carteira → pronto na missão');
  assert.ok(m.prontos.some((x) => x.id === 'media-final'));
  assert.ok(m.faltam.some((x) => x.id === 'carga-horaria' && x.atendivelPor[0].id === 'historico'));
  assert.match(m.faltam.find((x) => x.id === 'carga-horaria').mensagem, /ainda não adicionou/);
  await req('PUT', `/documents/historico?journeyId=${jid}`, { estado: 'solicitar' });
  m = (await req('GET', `/documents/missions/${jid}/2.3`)).data;
  assert.ok(m.faltam.some((x) => x.id === 'historico'));
  // As regras automáticas das missões continuam lendo user.documents.
  assert.equal(users.findById(uid).documents.historico, 'pendente');
  // Documentos novos do catálogo entram nas missões certas (TIE).
  const tie = (await req('GET', `/documents/missions/${jid}/8.4`)).data;
  assert.ok([...tie.faltam, ...tie.prontos].some((x) => x.id === 'foto-tie'));
});

// ---------- Segurança dos arquivos ----------

test('PDF com conteúdo ativo é recusado; papel do arquivo pode ser corrigido', async () => {
  const evil = Buffer.from('%PDF-1.4\n1 0 obj<< /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>endobj\n%%EOF');
  assert.equal(pdfHasActiveContent(evil), true);
  assert.equal(pdfHasActiveContent(PDF), false);
  assert.equal((await req('POST', '/documents/rg-cin/files', evil, { 'Content-Type': 'application/pdf' })).status, 415);
  const up = await req('POST', `/documents/rg-cin/files?papel=frente&journeyId=${jid}`, PNG, { 'Content-Type': 'image/png', 'X-File-Name': 'rg' });
  assert.equal(up.status, 201);
  assert.equal(up.data.arquivo.nome, 'rg.png', 'extensão sugerida pelo tipo real');
  assert.equal(up.data.arquivo.papel, 'frente');
  const fix = await req('PATCH', `/documents/files/${up.data.arquivo.id}`, { papel: 'verso', nome: 'RG verso' });
  assert.equal(fix.data.documento.arquivos[0].papel, 'verso');
  assert.equal(fix.data.documento.arquivos[0].nome, 'RG verso.png');
  // Imagem servida em sandbox.
  const img = await req('GET', fix.data.documento.arquivos[0].url.replace('/api', ''));
  assert.equal(img.status, 200);
  assert.match(img.headers.get('content-security-policy'), /sandbox/);
  assert.equal((await req('POST', '/documents/rg-cin/files?papel=hack', PNG, { 'Content-Type': 'image/png' })).status, 400);
  assert.equal((await req('POST', '/documents/apostilas-academicas/files', PDF, { 'Content-Type': 'application/pdf' })).status, 400);
});

test('sem histórico de versões, a substituição apaga a versão antiga', async () => {
  await req('PUT', '/documents/prefs', { versoes: false });
  const v1 = await req('POST', `/documents/cpf/files?journeyId=${jid}`, PDF, { 'Content-Type': 'application/pdf' });
  const v2 = await req('POST', `/documents/cpf/files?serie=${v1.data.arquivo.id}&journeyId=${jid}`, PDF, { 'Content-Type': 'application/pdf' });
  assert.equal(v2.status, 201);
  assert.equal(v2.data.documento.arquivos[0].anteriores.length, 0);
  assert.ok(!fs.existsSync(path.join(tmp, 'docfiles', uid, `${v1.data.arquivo.id}.bin`)));
  await req('PUT', '/documents/prefs', { versoes: true });
});

test('exclusão definitiva de todos os arquivos exige confirmação escrita', async () => {
  assert.ok((users.findById(uid).docFiles || []).length > 0);
  assert.equal((await req('DELETE', '/documents/files', { confirmar: 'sim' })).status, 400);
  const r = await req('DELETE', '/documents/files', { confirmar: 'EXCLUIR' });
  assert.equal(r.status, 200);
  assert.ok(r.data.excluidos > 0);
  assert.equal(users.findById(uid).docFiles.length, 0);
  assert.ok(!fs.existsSync(path.join(tmp, 'docfiles', uid)));
  assert.equal(users.findById(uid).documents.historico, 'pendente', 'a situação dos documentos continua');
});

// ---------- Revisão editorial ----------

test('revisão editorial: a equipe atualiza aviso, data e fontes sem mexer nas telas; estudante não pode', async () => {
  assert.equal((await req('PUT', '/admin/document-rules/antecedentes', { aviso: 'x' })).status, 403);
  const admin = client();
  assert.equal((await admin('POST', '/auth/login', { email: 'equipe@carteira.dev', senha: 'admin-carteira-123' })).status, 200);
  const r = await admin('PUT', '/admin/document-rules/antecedentes', { aviso: 'O consulado de São Paulo passou a pedir a certidão estadual também.', revisadoEm: '2026-11-01', fontes: ['O22', 'NAOEXISTE'] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.revisao.fontes, ['O22']);
  const a = await doc('antecedentes');
  assert.match(a.avisoEditorial, /certidão estadual/);
  assert.equal(a.revisadoEm, '2026-11-01');
  assert.deepEqual(a.fontes.map((f) => f.id), ['O22']);
  await admin('PUT', '/admin/document-rules/antecedentes', { remover: true });
  assert.equal((await doc('antecedentes')).avisoEditorial, null);
});

// ---------- Dados antigos ----------

test('dados da versão anterior continuam valendo (status, registros e arquivos sem "papel")', async () => {
  const old = client();
  const r = await old('POST', '/auth/register', { nome: 'Rui Alves', email: 'rui@carteira.dev', senha: 'segura123', aceite: true });
  const id = r.data.user.id;
  await users.update(id, (u) => {
    u.documents = { passaporte: 'enviado', diploma: 'pronto', 'escala-notas': 'em-preparacao', seguro: 'correcao' };
    u.docRecords = { passaporte: { envios: [{ id: 'e1', procedimento: 'dua', resultado: 'enviado', em: '2026-01-10' }] }, 'escala-notas': { aguardando: true } };
    u.docFiles = [];
  });
  const d = (await old('GET', '/documents/dashboard')).data;
  assert.equal(d.consentimento, null, 'consentimento só é pedido para novos envios');
  const get = async (docId) => (await old('GET', `/documents/${docId}`)).data.documento;
  assert.equal((await get('passaporte')).status, 'enviado');
  assert.equal((await get('passaporte')).estado, 'pronto');
  assert.equal((await get('diploma')).estado, 'pronto');
  assert.equal((await get('escala-notas')).estado, 'aguardando');
  assert.equal((await get('seguro')).estado, 'correcao');
  assert.equal(users.findById(id).documents.passaporte, 'enviado', 'nada é reescrito ao ler');
});
