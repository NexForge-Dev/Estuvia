// API da carteira de documentos (/api/documents). Regras em document-engine.js; catálogo em content/document-catalog.js.
//
// Arquivos: privados por usuário, cifrados em disco (AES-256-GCM, chave em config.docsKey), fora de public/,
// tipo conferido pelos bytes iniciais, PDFs com conteúdo ativo recusados, enviados só depois do consentimento,
// servidos só ao dono autenticado e por link assinado que expira (15 min), sem cache e em sandbox.
// A Estuvia NÃO analisa nem valida o conteúdo dos arquivos e não os envia a serviços de IA.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import express, { Router } from 'express';
import { z } from 'zod';
import { users, audit, newId } from '../store.js';
import { config } from '../config.js';
import { requireAuth, documentUploadLimiter } from '../security.js';
import { DOCUMENTS, DOC_STATUS, PROCEDURES, DOC_STAGES, DOC_STATES, FILE_ROLES, CONDITIONS, DOC_CATEGORIES } from '../content/documents.js';
import { dashboard, documentDetail, docsForMission, docsForRound, missionSyncChanges, applyMissionSync, publicFile, docById, listDocuments } from '../document-engine.js';

const router = Router();
router.use(requireAuth);

const DOC_IDS = DOCUMENTS.map((d) => d.id);
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 80;
const MAX_TOTAL = 200 * 1024 * 1024;
const LINK_TTL_S = 15 * 60;
export const CONSENT_VERSION = '2026-10-27';
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');
const pickJourney = (user, id) => (user.journeys || []).find((j) => j.id === id) || (user.journeys || [])[0] || null;
const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// "Minha pasta": arquivos que não são do catálogo. Só guardam arquivo, sem status nem etapa.
const PERSONAL = { id: 'pessoal', nome: 'Outro documento' };
const docName = (id) => (id === PERSONAL.id ? PERSONAL.nome : docById(id)?.nome || id);
const cleanLabel = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60);

// A carteira guarda documentos, nunca credenciais (senhas, PIN, CVV, códigos de acesso). Recusa texto que pareça uma.
const CREDENTIAL = /\b(senha|password|contrase[ñn]a|pin|cvv|cvc|c[óo]digo (de )?(acesso|seguran[çc]a|verifica[çc][ãa]o|autentica[çc][ãa]o)|token|2fa|otp)\b/i;
const noCredentials = (s) => s === null || s === undefined || !CREDENTIAL.test(String(s));

// ---------------------------------------------------------------------------
// Links assinados: valem 15 min e só para o dono (a sessão continua exigida).
// ---------------------------------------------------------------------------
const linkKey = crypto.hkdfSync('sha256', config.docsKey, 'estuvia-links', 'links-v1', 32);
const sign = (userId, fid, exp) => crypto.createHmac('sha256', Buffer.from(linkKey)).update(`${userId}:${fid}:${exp}`).digest('base64url');
export const fileToken = (userId) => (fid) => { const exp = Math.floor(Date.now() / 1000) + LINK_TTL_S; return `${exp}.${sign(userId, fid, exp)}`; };
function validToken(userId, fid, t) {
  const [exp, sig] = String(t || '').split('.');
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const expected = Buffer.from(sign(userId, fid, exp));
  const got = Buffer.from(sig);
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

function knownDoc(req, res) {
  if (!docById(req.params.docId)) { res.status(404).json({ error: 'Documento desconhecido.' }); return null; }
  return docById(req.params.docId);
}

// Missão concluída → documento pronto (idempotente). Roda ao abrir a carteira.
async function syncMissions(user) {
  const changes = missionSyncChanges(user);
  if (!changes.length) return user;
  return users.update(user.id, (u) => applyMissionSync(u, changes));
}

const rec = (u, id) => { u.docRecords ??= {}; return (u.docRecords[id] ??= {}); };
const detail = (user, req, docId = req.params.docId) => documentDetail(user, pickJourney(user, req.query.journeyId), docId, new Date(), fileToken(user.id));

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

router.get('/dashboard', async (req, res) => {
  const user = await syncMissions(req.user);
  res.json(dashboard(user, pickJourney(user, req.query.journeyId)));
});

// Busca e filtros (categoria, etapa, exigência, estado). Sem filtro, nada é listado: a interface não abre 180 documentos de uma vez.
const listSchema = z.object({
  q: z.string().trim().max(80).optional(),
  categoria: z.enum(DOC_CATEGORIES.map((c) => c.id)).optional(),
  etapa: z.enum(['candidatura', 'matricula', 'visto', 'viagem', 'estadia', 'renovacao']).optional(),
  exigencia: z.enum(['requerido', 'condicional', 'verificar', 'recomendado', 'nao-necessario']).optional(),
  estado: z.enum(Object.keys(DOC_STATES)).optional(),
  todos: z.enum(['1']).optional(),
  journeyId: z.string().max(60).optional(),
}).strict();
router.get('/list', (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Filtro inválido.' });
  const f = parsed.data;
  if (!f.q && !f.categoria && !f.etapa && !f.exigencia && !f.estado) return res.status(400).json({ error: 'Escolha uma categoria, um filtro ou digite o que procura.' });
  const itens = listDocuments(req.user, pickJourney(req.user, f.journeyId), { ...f, incluirNaoAplicaveis: f.todos === '1' });
  res.json({ itens, total: itens.length });
});

// Minha pasta: a versão mais recente de cada arquivo guardado, de qualquer etapa (inclusive "Outro documento").
router.get('/files', (req, res) => {
  const mine = req.user.docFiles || [];
  const latest = new Map();
  for (const f of mine) if (!latest.has(f.serie) || latest.get(f.serie).versao < f.versao) latest.set(f.serie, f);
  const tok = fileToken(req.user.id);
  const arquivos = [...latest.values()]
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
    .map((f) => ({ ...publicFile(f, tok), docId: f.docId, docNome: f.rotulo || docName(f.docId) }));
  res.json({ arquivos, tipos: [...DOCUMENTS.filter((d) => !d.agregado).map((d) => ({ id: d.id, nome: d.nome })), PERSONAL], consentimento: req.user.docConsent || null });
});

router.get('/missions/:jid/:mid', async (req, res) => {
  req.user = await syncMissions(req.user);
  const jr = (req.user.journeys || []).find((j) => j.id === req.params.jid);
  if (!jr) return res.status(404).json({ error: 'Jornada não encontrada.' });
  if (!/^\d\.\d{1,2}$/.test(req.params.mid)) return res.status(400).json({ error: 'Missão inválida.' });
  res.json(docsForMission(req.user, jr, req.params.mid));
});

// Documentos de uma rodada (tela da trilha): quantos estão prontos e o que falta, já com o que está na carteira.
router.get('/rounds/:jid/:n', async (req, res) => {
  const user = await syncMissions(req.user);
  const jr = (user.journeys || []).find((j) => j.id === req.params.jid);
  if (!jr) return res.status(404).json({ error: 'Jornada não encontrada.' });
  const r = docsForRound(user, jr, req.params.n);
  if (!r) return res.status(404).json({ error: 'Rodada não encontrada.' });
  res.json(r);
});

// ---------------------------------------------------------------------------
// Minha situação (condições), consentimento e preferências
// ---------------------------------------------------------------------------

router.put('/conditions', async (req, res) => {
  const parsed = z.partialRecord(z.enum(Object.keys(CONDITIONS)), z.boolean().nullable()).safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.data).length) return res.status(400).json({ error: 'Condição inválida.' });
  const user = await users.update(req.user.id, (u) => {
    u.docConditions ??= {};
    // null = voltar ao que a Estuvia detecta pela jornada.
    for (const [k, v] of Object.entries(parsed.data)) { if (v === null) delete u.docConditions[k]; else u.docConditions[k] = v; }
  });
  res.json(dashboard(user, pickJourney(user, req.query.journeyId)));
});

router.post('/consent', async (req, res) => {
  const parsed = z.object({ aceito: z.literal(true), versao: z.literal(CONSENT_VERSION) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Para guardar arquivos, confirme que leu como eles são tratados.' });
  const user = await users.update(req.user.id, (u) => { u.docConsent = { versao: CONSENT_VERSION, em: now() }; });
  audit.log({ action: 'documents.consent', userId: req.user.id, versao: CONSENT_VERSION }).catch(() => {});
  res.json({ consentimento: user.docConsent });
});

router.put('/prefs', async (req, res) => {
  const parsed = z.object({ versoes: z.boolean() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Preferência inválida.' });
  const user = await users.update(req.user.id, (u) => { u.docPrefs = { ...(u.docPrefs || {}), ...parsed.data }; });
  res.json({ prefs: user.docPrefs });
});

router.get('/:docId', (req, res) => {
  if (!knownDoc(req, res)) return;
  res.json({ documento: detail(req.user, req) });
});

const detailReply = (res, user, req, extra = {}) => res.json({ documento: detail(user, req), documents: user.documents, ...extra });

// ---------------------------------------------------------------------------
// Situação, informações, declaração e conferência
// ---------------------------------------------------------------------------

const MARK = z.enum(['nao-precisa', 'precisa', 'solicitada', 'pronta']).nullable();
const updateSchema = z.object({
  status: z.enum(DOC_STATUS).optional(),
  estado: z.enum(Object.keys(DOC_STATES).filter((k) => !['nao-aplicavel', 'vencido'].includes(k))).optional(),
  aguardando: z.boolean().optional(),
  declarado: z.boolean().optional(),
  conferido: z.boolean().optional(),
  validade: date.nullable().optional(),
  emitidoEm: date.nullable().optional(),
  alertaDias: z.number().int().min(7).max(365).nullable().optional(),
  apostila: MARK.optional(),
  traducao: MARK.optional(),
  emissor: z.string().trim().max(120).refine(noCredentials, 'Não guarde senhas ou códigos aqui.').nullable().optional(),
  pais: z.string().trim().max(60).nullable().optional(),
  observacoes: z.string().trim().max(1000).refine(noCredentials, 'Por segurança, a carteira não guarda senhas, PIN, CVV ou códigos de acesso. Tire esse trecho das observações.').nullable().optional(),
  atendidoPor: z.string().max(60).nullable().optional(),
}).strict();

router.put('/:docId', async (req, res) => {
  const doc = knownDoc(req, res);
  if (!doc) return;
  if (doc.agregado) return res.status(400).json({ error: 'Este item reúne outros documentos: atualize cada um deles.' });
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
  const b = parsed.data;
  if (b.validade !== undefined && doc.tipoValidade !== 'data') return res.status(400).json({ error: 'Este documento não tem data de validade.' });
  if (b.atendidoPor && !(doc.atendidoPor || []).includes(b.atendidoPor)) return res.status(400).json({ error: 'Este documento não pode ser atendido por esse outro.' });
  const user = await users.update(req.user.id, (u) => {
    const r = rec(u, doc.id);
    const setStatus = (s) => { u.documents = { ...(u.documents || {}), [doc.id]: s }; };
    if (b.status) {
      setStatus(b.status);
      r.origem = b.declarado ? 'declarado' : 'manual';
      if (b.status !== 'em-preparacao') r.aguardando = false;
      delete r.estado; // status escolhido diretamente: o estado detalhado volta a ser derivado
    }
    if (b.estado) {
      const base = DOC_STATES[b.estado].base;
      setStatus(base);
      Object.assign(r, { estado: b.estado, estadoBase: base, origem: b.declarado ? 'declarado' : 'manual', aguardando: b.estado === 'aguardando' });
      if (b.estado === 'aguardando') r.aguardandoDesde ??= today();
      // Marcar como pronto confirma apostila/tradução que estavam pendentes.
      if (b.estado === 'pronto') { if (['precisa', 'solicitada'].includes(r.apostila)) r.apostila = 'pronta'; if (['precisa', 'solicitada'].includes(r.traducao)) r.traducao = 'pronta'; }
    }
    if (b.aguardando !== undefined) {
      r.aguardando = b.aguardando;
      r.aguardandoDesde = b.aguardando ? today() : undefined;
      if (b.aguardando && u.documents?.[doc.id] !== 'em-preparacao') setStatus('em-preparacao');
      if (b.aguardando) Object.assign(r, { estado: 'aguardando', estadoBase: 'em-preparacao' });
    }
    if (b.conferido !== undefined) r.conferidoEm = b.conferido ? now() : undefined;
    for (const k of ['validade', 'emitidoEm', 'alertaDias', 'apostila', 'traducao', 'emissor', 'pais', 'observacoes']) {
      if (b[k] !== undefined) { if (b[k] === null || b[k] === '') delete r[k]; else r[k] = b[k]; }
    }
    // "Precisa de apostila/tradução" num documento pronto: volta para preparação até ficar pronta.
    if ((['precisa', 'solicitada'].includes(b.apostila) || ['precisa', 'solicitada'].includes(b.traducao)) && ['pronto', 'enviado'].includes(u.documents?.[doc.id])) {
      setStatus('em-preparacao');
      Object.assign(r, { estado: ['precisa', 'solicitada'].includes(r.apostila) ? 'precisa-apostila' : 'precisa-traducao', estadoBase: 'em-preparacao' });
    }
    if (b.atendidoPor !== undefined) {
      if (b.atendidoPor) { r.atendidoPor = b.atendidoPor; setStatus('pronto'); delete r.estado; } else { delete r.atendidoPor; }
    }
    r.atualizadoEm = now();
  });
  detailReply(res, user, req);
});

// "O que você já tem?" — várias declarações de uma vez (onboarding da carteira).
router.post('/declare', async (req, res) => {
  const parsed = z.object({ itens: z.partialRecord(z.enum(DOC_IDS), z.enum(['tenho', 'nao-tenho'])) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Declaração inválida.' });
  const user = await users.update(req.user.id, (u) => {
    for (const [id, v] of Object.entries(parsed.data.itens)) {
      if (docById(id)?.agregado) continue;
      const cur = u.documents?.[id] || 'pendente';
      if (v === 'tenho' && !['pronto', 'enviado'].includes(cur)) {
        u.documents = { ...(u.documents || {}), [id]: 'pronto' };
        Object.assign(rec(u, id), { origem: 'declarado', aguardando: false, atualizadoEm: now() });
        delete rec(u, id).estado;
      }
      if (v === 'nao-tenho' && cur === 'pronto' && u.docRecords?.[id]?.origem === 'declarado') {
        u.documents = { ...u.documents, [id]: 'pendente' };
        Object.assign(rec(u, id), { origem: 'manual', atualizadoEm: now() });
      }
    }
    rec(u, '_carteira').declaradoEm = now();
  });
  res.json(dashboard(user, pickJourney(user, req.query.journeyId)));
});

// ---------------------------------------------------------------------------
// Envios por procedimento (DUA ≠ universidade ≠ consulado)
// ---------------------------------------------------------------------------

const submissionSchema = z.object({
  procedimento: z.enum(Object.keys(PROCEDURES)),
  resultado: z.enum(['enviado', 'aceito', 'correcao']).default('enviado'),
  em: date.optional(),
  nota: z.string().trim().max(200).refine(noCredentials, 'Não guarde senhas ou códigos aqui.').optional(),
}).strict();

router.post('/:docId/submissions', async (req, res) => {
  const doc = knownDoc(req, res);
  if (!doc) return;
  if (doc.agregado) return res.status(400).json({ error: 'Registre o envio em cada documento.' });
  const parsed = submissionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
  if ((req.user.docRecords?.[doc.id]?.envios || []).length >= 20) return res.status(409).json({ error: 'Limite de registros de envio atingido.' });
  const home = DOC_STAGES.find((s) => s.id === doc.etapa)?.procedimento;
  const user = await users.update(req.user.id, (u) => {
    const r = rec(u, doc.id);
    const e = { id: newId(), ...parsed.data, em: parsed.data.em || today(), registradoEm: now() };
    r.envios = [...(r.envios || []), e];
    // O status geral só muda pelo procedimento da própria etapa do documento.
    if (parsed.data.procedimento === home || (!home && parsed.data.procedimento)) {
      u.documents = { ...(u.documents || {}), [doc.id]: parsed.data.resultado === 'correcao' ? 'correcao' : 'enviado' };
      delete r.estado;
    }
    r.atualizadoEm = now();
  });
  detailReply(res, user, req);
});

router.delete('/:docId/submissions/:sid', async (req, res) => {
  const doc = knownDoc(req, res);
  if (!doc) return;
  if (!(req.user.docRecords?.[doc.id]?.envios || []).some((e) => e.id === req.params.sid)) return res.status(404).json({ error: 'Registro não encontrado.' });
  const user = await users.update(req.user.id, (u) => { const r = rec(u, doc.id); r.envios = r.envios.filter((e) => e.id !== req.params.sid); });
  detailReply(res, user, req);
});

// ---------------------------------------------------------------------------
// Agenda: lembrete documental. Primeiro a prévia; o evento só é criado na confirmação.
// ---------------------------------------------------------------------------

const REMINDERS = {
  verificar: { titulo: (d) => `Verificar a solicitação: ${d.nome}`, dias: 7, prioridade: 'normal', motivo: 'Você registrou que está aguardando a emissão.' },
  solicitar: { titulo: (d) => `Solicitar: ${d.nome}`, dias: 2, prioridade: 'alta', motivo: 'Documento pendente na etapa atual da sua jornada.' },
  validade: { titulo: (d) => `Verificar a validade: ${d.nome}`, dias: 3, prioridade: 'alta', motivo: 'A validade registrada pede atenção.' },
  revisar: { titulo: (d) => `Revisar antes de enviar: ${d.nome}`, dias: 1, prioridade: 'normal', motivo: 'Conferir nome, datas e páginas antes do envio.' },
};
const CATEGORY = { candidatura: 'documentacao', matricula: 'academico', visto: 'visto', viagem: 'viagem', estadia: 'documentacao', renovacao: 'documentacao' };
const reminderSchema = z.object({ tipo: z.enum(Object.keys(REMINDERS)), data: date.optional(), confirmar: z.boolean().default(false) }).strict();

router.post('/:docId/reminder', async (req, res) => {
  const doc = knownDoc(req, res);
  if (!doc) return;
  const parsed = reminderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
  const t = REMINDERS[parsed.data.tipo];
  const data = parsed.data.data || addDays(today(), t.dias);
  if (data < today()) return res.status(400).json({ error: 'Escolha uma data a partir de hoje.' });
  const evento = { titulo: t.titulo(doc).slice(0, 120), data, inicio: '09:00', fim: '09:30', categoria: CATEGORY[doc.etapa] || 'documentacao', prioridade: t.prioridade, motivo: t.motivo };
  if (!parsed.data.confirmar) return res.json({ previa: evento, confirmado: false });
  if ((req.user.planner || []).length >= 500) return res.status(409).json({ error: 'Sua agenda está cheia.' });
  const e = { id: newId(), origem: 'documentos', documentoId: doc.id, ...evento, nota: `Carteira de documentos: ${doc.nome}`.slice(0, 300), criadoEm: now() };
  const user = await users.update(req.user.id, (u) => {
    u.planner = [...(u.planner || []), e];
    const r = rec(u, doc.id);
    r.lembretes = [...(r.lembretes || []), e.id].slice(-10);
  });
  detailReply(res, user, req, { evento: e, confirmado: true });
});

// ---------------------------------------------------------------------------
// Arquivos (cifrados, privados)
// ---------------------------------------------------------------------------

const SIGNATURES = [
  { mime: 'application/pdf', ext: 'pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { mime: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/webp', ext: 'webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];
// PDF com conteúdo ativo (scripts, ações automáticas, arquivos embutidos) é recusado: um documento não precisa disso.
const ACTIVE_PDF = /\/(JavaScript|JS|Launch|OpenAction|AA|EmbeddedFile|RichMedia|XFA)\b/;
// Nomes PDF aceitam escapes "#xx" (/J#61vaScript = /JavaScript): normaliza antes de procurar.
const unescapeNames = (s) => s.replace(/\/[^\s/[\]<>(){}%]+/g, (n) => (n.includes('#') ? n.replace(/#([0-9a-fA-F]{2})/g, (_, x) => String.fromCharCode(parseInt(x, 16))) : n));
// Fluxos de objetos (/Type /ObjStm, PDF 1.5+) guardam dicionários comprimidos: abre e confere também.
const STREAM = /<<((?:(?!>>\s*stream)[\s\S]){0,4000})>>\s*stream\r?\n/g;
const MAX_INFLATE = 30 * 1024 * 1024;
export function pdfHasActiveContent(buf) {
  const text = buf.toString('latin1');
  const plain = unescapeNames(text);
  if (ACTIVE_PDF.test(plain)) return true;
  let budget = MAX_INFLATE;
  for (const m of text.matchAll(STREAM)) {
    const dict = unescapeNames(m[1]);
    if (!/\/Type\s*\/ObjStm\b/.test(dict)) continue;
    const start = m.index + m[0].length;
    const end = text.indexOf('endstream', start);
    if (end < 0) return true; // fluxo de objetos sem fim: não dá para conferir
    let body = buf.subarray(start, end);
    if (/\/Filter\b/.test(dict)) {
      // Só FlateDecode (o filtro padrão) é aberto; outro filtro num fluxo de objetos não dá para conferir.
      if (!/\/Filter\s*(\[\s*)?\/FlateDecode\s*\]?\s*(\/|$)/.test(dict)) return true;
      try { body = zlib.inflateSync(body, { maxOutputLength: budget, finishFlush: zlib.constants.Z_SYNC_FLUSH }); } catch { return true; }
      budget -= body.length;
      if (budget <= 0) return true;
    }
    if (ACTIVE_PDF.test(unescapeNames(body.toString('latin1')))) return true;
  }
  return false;
}

const userDir = (userId) => path.join(config.docsDir, userId);
const filePath = (userId, fid) => path.join(userDir(userId), `${fid}.bin`);

// GCM: IV aleatório de 96 bits por arquivo e etiqueta de 128 bits. A decifra exige os 16 bytes da etiqueta
// (sem authTagLength o Node aceita uma etiqueta truncada, de até 4 bytes).
const TAG_BYTES = 16;
function encrypt(buf) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', config.docsKey, iv, { authTagLength: TAG_BYTES });
  const data = Buffer.concat([c.update(buf), c.final()]);
  return { data, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64') };
}
function decrypt(buf, meta) {
  const tag = Buffer.from(String(meta.tag || ''), 'base64');
  if (tag.length !== TAG_BYTES) throw new Error('etiqueta de autenticação inválida');
  const d = crypto.createDecipheriv('aes-256-gcm', config.docsKey, Buffer.from(meta.iv, 'base64'), { authTagLength: TAG_BYTES });
  d.setAuthTag(tag);
  return Buffer.concat([d.update(buf), d.final()]);
}
const cleanName = (s, ext) => {
  let name = '';
  try { name = decodeURIComponent(String(s || '')); } catch { name = ''; }
  name = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().slice(0, 120);
  if (name && !/\.[a-z0-9]{2,4}$/i.test(name)) name = `${name}.${ext}`;
  return name || `documento.${ext}`;
};
async function removeFile(userId, meta) {
  await fs.promises.unlink(filePath(userId, meta.id)).catch(() => {});
}

router.post('/:docId/files', documentUploadLimiter, express.raw({ type: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/octet-stream'], limit: MAX_BYTES }), async (req, res) => {
  const personal = req.params.docId === PERSONAL.id;
  const doc = personal ? PERSONAL : knownDoc(req, res);
  if (!doc) return;
  if (doc.agregado) return res.status(400).json({ error: 'Anexe o arquivo dentro de cada documento.' });
  // Consentimento explícito antes do primeiro arquivo (RGPD/LGPD): o estudante sabe como os arquivos são tratados.
  if (req.user.docConsent?.versao !== CONSENT_VERSION) return res.status(428).json({ error: 'Antes de guardar arquivos, leia e aceite como eles são tratados.', codigo: 'consentimento' });
  const rotulo = personal ? cleanLabel(req.query.rotulo) : '';
  if (personal && !rotulo && !req.query.serie) return res.status(400).json({ error: 'Dê um nome ao documento (ex.: RG, CNH, carteira de vacinação).' });
  if (personal && CREDENTIAL.test(rotulo)) return res.status(400).json({ error: 'A carteira não guarda senhas ou códigos.' });
  const papel = typeof req.query.papel === 'string' ? req.query.papel : 'original';
  if (!FILE_ROLES[papel]) return res.status(400).json({ error: 'Tipo de arquivo inválido.' });
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Envie um arquivo PDF, PNG, JPG ou WEBP.' });
  const sig = SIGNATURES.find((s) => s.test(req.body));
  if (!sig) return res.status(415).json({ error: 'Formato não aceito. Use PDF, PNG, JPG ou WEBP.' });
  if (sig.mime === 'application/pdf' && pdfHasActiveContent(req.body)) {
    audit.log({ action: 'documents.file.rejected', userId: req.user.id, motivo: 'pdf-ativo' }).catch(() => {});
    return res.status(415).json({ error: 'Este PDF tem conteúdo ativo (scripts ou arquivos embutidos) e foi recusado por segurança. Gere o PDF de novo (ex.: "Imprimir como PDF") ou envie uma foto.' });
  }
  const mine = req.user.docFiles || [];
  const serie = typeof req.query.serie === 'string' ? req.query.serie : null;
  const prev = serie ? mine.filter((f) => f.serie === serie && f.docId === doc.id) : [];
  if (serie && !prev.length) return res.status(404).json({ error: 'Arquivo a substituir não encontrado.' });
  const keepVersions = req.user.docPrefs?.versoes !== false;
  const freed = serie && !keepVersions ? prev : [];
  if (mine.length - freed.length >= MAX_FILES) return res.status(409).json({ error: `Você pode guardar até ${MAX_FILES} arquivos. Exclua versões antigas.` });
  if (mine.reduce((s, f) => s + f.tamanho, 0) - freed.reduce((s, f) => s + f.tamanho, 0) + req.body.length > MAX_TOTAL) return res.status(409).json({ error: 'Espaço da sua carteira esgotado (200 MB). Exclua versões antigas.' });
  const missaoId = typeof req.query.missao === 'string' && /^\d\.\d{1,2}$/.test(req.query.missao) ? req.query.missao : undefined;

  const id = newId();
  const enc = encrypt(req.body);
  try {
    await fs.promises.mkdir(userDir(req.user.id), { recursive: true, mode: 0o700 });
    await fs.promises.writeFile(filePath(req.user.id, id), enc.data, { mode: 0o600 });
  } catch (err) {
    // Disco cheio ou sem permissão: apaga o que ficou pela metade e responde (o Express 4 não captura erro assíncrono).
    await removeFile(req.user.id, { id });
    console.error('[documentos] falha ao gravar arquivo:', err.message);
    return res.status(500).json({ error: 'Não foi possível guardar o arquivo agora. Tente novamente.' });
  }
  const meta = {
    id, docId: doc.id, serie: serie || id, versao: prev.length ? Math.max(...prev.map((f) => f.versao)) + 1 : 1,
    nome: cleanName(req.get('X-File-Name'), sig.ext), mime: sig.mime, ext: sig.ext, tamanho: req.body.length, papel: serie ? prev[0].papel || papel : papel,
    iv: enc.iv, tag: enc.tag, criadoEm: now(), ...(missaoId ? { missaoId } : {}), ...(personal ? { rotulo: rotulo || prev[0]?.rotulo || PERSONAL.nome } : {}),
  };
  const user = await users.update(req.user.id, (u) => {
    const ids = new Set(freed.map((f) => f.id));
    u.docFiles = [...(u.docFiles || []).filter((f) => !ids.has(f.id)), meta];
    if (personal) return;
    const r = rec(u, doc.id);
    const cur = u.documents?.[doc.id] || 'pendente';
    if (cur === 'pendente') u.documents = { ...(u.documents || {}), [doc.id]: 'em-preparacao' };
    // Arquivo da apostila/tradução: marca como pronta. Arquivo do documento: estado "Arquivo enviado" se ainda estava antes disso.
    if (papel === 'apostila' || papel === 'apostilado') r.apostila = 'pronta';
    if (papel === 'traducao' || papel === 'comprovante-traducao') r.traducao = 'pronta';
    if (!['apostila', 'traducao', 'comprovante-traducao'].includes(papel) && ['pendente', 'em-preparacao'].includes(u.documents[doc.id]) && !['precisa-apostila', 'precisa-traducao', 'correcao'].includes(r.estado)) {
      Object.assign(r, { estado: 'arquivo-enviado', estadoBase: u.documents[doc.id], aguardando: false });
    }
    r.atualizadoEm = now();
  });
  // Conta excluída durante o envio: não deixa o arquivo cifrado órfão no disco.
  if (!user) { await removeFile(req.user.id, meta); return res.status(404).json({ error: 'Conta não encontrada.' }); }
  for (const f of freed) await removeFile(req.user.id, f);
  audit.log({ action: 'documents.file.uploaded', userId: req.user.id, docId: doc.id, papel, tamanho: meta.tamanho }).catch(() => {});
  res.status(201).json({ arquivo: publicFile(meta, fileToken(req.user.id)), documento: personal ? null : detail(user, req, doc.id) });
});

// Muda o papel de um arquivo (ex.: era a frente, é o verso) ou o nome.
router.patch('/files/:fid', async (req, res) => {
  const parsed = z.object({ papel: z.enum(Object.keys(FILE_ROLES)).optional(), nome: z.string().trim().min(1).max(120).optional() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.' });
  const meta = (req.user.docFiles || []).find((f) => f.id === req.params.fid);
  if (!meta) return res.status(404).json({ error: 'Arquivo não encontrado.' });
  const user = await users.update(req.user.id, (u) => {
    for (const f of u.docFiles || []) {
      if (f.serie !== meta.serie) continue;
      if (parsed.data.papel) f.papel = parsed.data.papel;
      if (parsed.data.nome && f.id === meta.id) f.nome = cleanName(encodeURIComponent(parsed.data.nome), meta.ext);
    }
  });
  res.json({ documento: meta.docId === PERSONAL.id ? null : detail(user, req, meta.docId) });
});

router.get('/files/:fid', async (req, res) => {
  const meta = (req.user.docFiles || []).find((f) => f.id === req.params.fid);
  if (!meta) return res.status(404).json({ error: 'Arquivo não encontrado.' });
  if (!validToken(req.user.id, meta.id, req.query.t)) return res.status(403).json({ error: 'Este link expirou. Abra o documento de novo na carteira.' });
  let buf;
  try { buf = decrypt(await fs.promises.readFile(filePath(req.user.id, meta.id)), meta); } catch { return res.status(410).json({ error: 'Não foi possível abrir este arquivo.' }); }
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';
  res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(meta.nome)}`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Imagem aberta no navegador roda isolada (sem scripts). PDFs seguem a CSP geral (o sandbox impede o visualizador)
  // e PDFs com conteúdo ativo já foram recusados no envio.
  if (meta.mime.startsWith('image/')) res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
  res.type(meta.mime).send(buf);
});

router.delete('/files/:fid', async (req, res) => {
  const meta = (req.user.docFiles || []).find((f) => f.id === req.params.fid);
  if (!meta) return res.status(404).json({ error: 'Arquivo não encontrado.' });
  await removeFile(req.user.id, meta);
  const user = await users.update(req.user.id, (u) => { u.docFiles = (u.docFiles || []).filter((f) => f.id !== meta.id); });
  audit.log({ action: 'documents.file.deleted', userId: req.user.id, docId: meta.docId }).catch(() => {});
  res.json({ documento: meta.docId === PERSONAL.id ? null : detail(user, req, meta.docId) });
});

// Exclusão definitiva de TODOS os arquivos (os registros de situação ficam). Exige confirmação escrita.
router.delete('/files', async (req, res) => {
  const parsed = z.object({ confirmar: z.literal('EXCLUIR') }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Digite EXCLUIR para confirmar.' });
  const n = (req.user.docFiles || []).length;
  await purgeUserDocuments(req.user.id);
  await users.update(req.user.id, (u) => { u.docFiles = []; });
  audit.log({ action: 'documents.files.purged', userId: req.user.id, n }).catch(() => {});
  res.json({ excluidos: n });
});

/** Exclusão de conta (LGPD): remove todos os arquivos do estudante. */
export async function purgeUserDocuments(userId) {
  if (!/^[\w-]+$/.test(userId)) return;
  await fs.promises.rm(userDir(userId), { recursive: true, force: true }).catch(() => {});
}

export default router;
