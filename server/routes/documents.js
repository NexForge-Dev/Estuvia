// API da carteira de documentos (/api/documents). Regras em document-engine.js.
//
// Arquivos: privados por usuário, cifrados em disco (AES-256-GCM, chave em config.docsKey), fora de public/,
// tipo conferido pelos bytes iniciais, servidos só ao dono, sem cache e sem URL pública permanente.
// A Estuvia NÃO analisa nem valida o conteúdo dos arquivos.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { Router } from 'express';
import { z } from 'zod';
import { users, audit, newId } from '../store.js';
import { config } from '../config.js';
import { requireAuth, documentUploadLimiter } from '../security.js';
import { DOCUMENTS, DOC_STATUS, PROCEDURES, DOC_STAGES } from '../content/documents.js';
import { dashboard, documentDetail, docsForMission, missionSyncChanges, applyMissionSync, publicFile, docById } from '../document-engine.js';

const router = Router();
router.use(requireAuth);

const DOC_IDS = DOCUMENTS.map((d) => d.id);
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 60;
const MAX_TOTAL = 150 * 1024 * 1024;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');
const pickJourney = (user, id) => (user.journeys || []).find((j) => j.id === id) || (user.journeys || [])[0] || null;
const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// "Minha pasta": arquivos que não são do catálogo (RG, CNH, vacina…). Só guardam arquivo, sem status nem etapa.
const PERSONAL = { id: 'pessoal', nome: 'Outro documento' };
const docName = (id) => (id === PERSONAL.id ? PERSONAL.nome : docById(id)?.nome || id);
const cleanLabel = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60);

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

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

router.get('/dashboard', async (req, res) => {
  const user = await syncMissions(req.user);
  res.json(dashboard(user, pickJourney(user, req.query.journeyId)));
});

// Minha pasta: a versão mais recente de cada arquivo guardado, de qualquer etapa (inclusive "Outro documento").
router.get('/files', (req, res) => {
  const mine = req.user.docFiles || [];
  const latest = new Map();
  for (const f of mine) if (!latest.has(f.serie) || latest.get(f.serie).versao < f.versao) latest.set(f.serie, f);
  const arquivos = [...latest.values()]
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
    .map((f) => ({ ...publicFile(f), docId: f.docId, docNome: f.rotulo || docName(f.docId) }));
  res.json({ arquivos, tipos: [...DOCUMENTS.map((d) => ({ id: d.id, nome: d.nome })), PERSONAL] });
});

router.get('/missions/:jid/:mid', (req, res) => {
  const jr = (req.user.journeys || []).find((j) => j.id === req.params.jid);
  if (!jr) return res.status(404).json({ error: 'Jornada não encontrada.' });
  if (!/^\d\.\d{1,2}$/.test(req.params.mid)) return res.status(400).json({ error: 'Missão inválida.' });
  res.json(docsForMission(req.user, jr, req.params.mid));
});

router.get('/:docId', (req, res) => {
  if (!knownDoc(req, res)) return;
  res.json({ documento: documentDetail(req.user, pickJourney(req.user, req.query.journeyId), req.params.docId) });
});

const detailReply = (res, user, req, extra = {}) => res.json({ documento: documentDetail(user, pickJourney(user, req.query.journeyId), req.params.docId), documents: user.documents, ...extra });

// ---------------------------------------------------------------------------
// Situação, declaração e conferência
// ---------------------------------------------------------------------------

const updateSchema = z.object({
  status: z.enum(DOC_STATUS).optional(),
  aguardando: z.boolean().optional(),
  declarado: z.boolean().optional(),
  conferido: z.boolean().optional(),
  validade: date.nullable().optional(),
}).strict();

router.put('/:docId', async (req, res) => {
  const doc = knownDoc(req, res);
  if (!doc) return;
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
  const b = parsed.data;
  if (b.validade !== undefined && !doc.validade) return res.status(400).json({ error: 'Este documento não tem validade registrada.' });
  const user = await users.update(req.user.id, (u) => {
    const r = rec(u, doc.id);
    if (b.status) {
      u.documents = { ...(u.documents || {}), [doc.id]: b.status };
      r.origem = b.declarado ? 'declarado' : 'manual';
      if (b.status !== 'em-preparacao') r.aguardando = false;
    }
    if (b.aguardando !== undefined) {
      r.aguardando = b.aguardando;
      r.aguardandoDesde = b.aguardando ? today() : undefined;
      if (b.aguardando && !['em-preparacao'].includes(u.documents?.[doc.id])) u.documents = { ...(u.documents || {}), [doc.id]: 'em-preparacao' };
    }
    if (b.conferido !== undefined) r.conferidoEm = b.conferido ? now() : undefined;
    if (b.validade !== undefined) r.validade = b.validade || undefined;
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
      const cur = u.documents?.[id] || 'pendente';
      if (v === 'tenho' && !['pronto', 'enviado'].includes(cur)) {
        u.documents = { ...(u.documents || {}), [id]: 'pronto' };
        Object.assign(rec(u, id), { origem: 'declarado', aguardando: false, atualizadoEm: now() });
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
  nota: z.string().trim().max(200).optional(),
}).strict();

router.post('/:docId/submissions', async (req, res) => {
  const doc = knownDoc(req, res);
  if (!doc) return;
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
// Agenda AI: lembrete documental. Primeiro a prévia; o evento só é criado na confirmação.
// ---------------------------------------------------------------------------

const REMINDERS = {
  verificar: { titulo: (d) => `Verificar a solicitação: ${d.nome}`, dias: 7, prioridade: 'normal', motivo: 'Você registrou que está aguardando a emissão.' },
  solicitar: { titulo: (d) => `Solicitar: ${d.nome}`, dias: 2, prioridade: 'alta', motivo: 'Documento pendente na etapa atual da sua jornada.' },
  validade: { titulo: (d) => `Verificar a validade: ${d.nome}`, dias: 3, prioridade: 'alta', motivo: 'A validade registrada não cobre toda a estadia.' },
  revisar: { titulo: (d) => `Revisar antes de enviar: ${d.nome}`, dias: 1, prioridade: 'normal', motivo: 'Conferir nome, datas e páginas antes do envio.' },
};
const CATEGORY = { candidatura: 'documentacao', matricula: 'academico', visto: 'visto', viagem: 'viagem', estadia: 'documentacao' };
const reminderSchema = z.object({ tipo: z.enum(Object.keys(REMINDERS)), data: date.optional(), confirmar: z.boolean().default(false) }).strict();

router.post('/:docId/reminder', async (req, res) => {
  const doc = knownDoc(req, res);
  if (!doc) return;
  const parsed = reminderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
  const t = REMINDERS[parsed.data.tipo];
  const data = parsed.data.data || addDays(today(), t.dias);
  if (data < today()) return res.status(400).json({ error: 'Escolha uma data a partir de hoje.' });
  const evento = { titulo: t.titulo(doc).slice(0, 120), data, inicio: '09:00', fim: '09:30', categoria: CATEGORY[doc.etapa], prioridade: t.prioridade, motivo: t.motivo };
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
const userDir = (userId) => path.join(config.docsDir, userId);
const filePath = (userId, fid) => path.join(userDir(userId), `${fid}.bin`);

function encrypt(buf) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', config.docsKey, iv);
  const data = Buffer.concat([c.update(buf), c.final()]);
  return { data, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64') };
}
function decrypt(buf, meta) {
  const d = crypto.createDecipheriv('aes-256-gcm', config.docsKey, Buffer.from(meta.iv, 'base64'));
  d.setAuthTag(Buffer.from(meta.tag, 'base64'));
  return Buffer.concat([d.update(buf), d.final()]);
}
const cleanName = (s, ext) => {
  let name = '';
  try { name = decodeURIComponent(String(s || '')); } catch { name = ''; }
  name = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().slice(0, 120);
  return name || `documento.${ext}`;
};

router.post('/:docId/files', documentUploadLimiter, express.raw({ type: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/octet-stream'], limit: MAX_BYTES }), async (req, res) => {
  const personal = req.params.docId === PERSONAL.id;
  const doc = personal ? PERSONAL : knownDoc(req, res);
  if (!doc) return;
  const rotulo = personal ? cleanLabel(req.query.rotulo) : '';
  if (personal && !rotulo && !req.query.serie) return res.status(400).json({ error: 'Dê um nome ao documento (ex.: RG, CNH, carteira de vacinação).' });
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Envie um arquivo PDF, PNG, JPG ou WEBP.' });
  const sig = SIGNATURES.find((s) => s.test(req.body));
  if (!sig) return res.status(415).json({ error: 'Formato não aceito. Use PDF, PNG, JPG ou WEBP.' });
  const mine = req.user.docFiles || [];
  if (mine.length >= MAX_FILES) return res.status(409).json({ error: `Você pode guardar até ${MAX_FILES} arquivos. Exclua versões antigas.` });
  if (mine.reduce((s, f) => s + f.tamanho, 0) + req.body.length > MAX_TOTAL) return res.status(409).json({ error: 'Espaço da sua carteira esgotado (150 MB). Exclua versões antigas.' });
  const serie = typeof req.query.serie === 'string' ? req.query.serie : null;
  const prev = serie ? mine.filter((f) => f.serie === serie && f.docId === doc.id) : [];
  if (serie && !prev.length) return res.status(404).json({ error: 'Arquivo a substituir não encontrado.' });
  const missaoId = typeof req.query.missao === 'string' && /^\d\.\d{1,2}$/.test(req.query.missao) ? req.query.missao : undefined;

  const id = newId();
  const enc = encrypt(req.body);
  await fs.promises.mkdir(userDir(req.user.id), { recursive: true, mode: 0o700 });
  await fs.promises.writeFile(filePath(req.user.id, id), enc.data, { mode: 0o600 });
  const meta = {
    id, docId: doc.id, serie: serie || id, versao: prev.length ? Math.max(...prev.map((f) => f.versao)) + 1 : 1,
    nome: cleanName(req.get('X-File-Name'), sig.ext), mime: sig.mime, ext: sig.ext, tamanho: req.body.length,
    iv: enc.iv, tag: enc.tag, criadoEm: now(), ...(missaoId ? { missaoId } : {}), ...(personal ? { rotulo: rotulo || prev[0]?.rotulo || PERSONAL.nome } : {}),
  };
  const user = await users.update(req.user.id, (u) => {
    u.docFiles = [...(u.docFiles || []), meta];
    if (personal) return;
    const cur = u.documents?.[doc.id] || 'pendente';
    if (cur === 'pendente') u.documents = { ...(u.documents || {}), [doc.id]: 'em-preparacao' };
    rec(u, doc.id).atualizadoEm = now();
  });
  audit.log({ action: 'documents.file.uploaded', userId: req.user.id, docId: doc.id, tamanho: meta.tamanho }).catch(() => {});
  res.status(201).json({ arquivo: publicFile(meta), documento: personal ? null : documentDetail(user, pickJourney(user, req.query.journeyId), doc.id) });
});

router.get('/files/:fid', async (req, res) => {
  const meta = (req.user.docFiles || []).find((f) => f.id === req.params.fid);
  if (!meta) return res.status(404).json({ error: 'Arquivo não encontrado.' });
  let buf;
  try { buf = decrypt(await fs.promises.readFile(filePath(req.user.id, meta.id)), meta); } catch { return res.status(410).json({ error: 'Não foi possível abrir este arquivo.' }); }
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';
  res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(meta.nome)}`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.type(meta.mime).send(buf);
});

router.delete('/files/:fid', async (req, res) => {
  const meta = (req.user.docFiles || []).find((f) => f.id === req.params.fid);
  if (!meta) return res.status(404).json({ error: 'Arquivo não encontrado.' });
  await fs.promises.unlink(filePath(req.user.id, meta.id)).catch(() => {});
  const user = await users.update(req.user.id, (u) => { u.docFiles = (u.docFiles || []).filter((f) => f.id !== meta.id); });
  audit.log({ action: 'documents.file.deleted', userId: req.user.id, docId: meta.docId }).catch(() => {});
  res.json({ documento: meta.docId === PERSONAL.id ? null : documentDetail(user, pickJourney(user, req.query.journeyId), meta.docId) });
});

/** Exclusão de conta (LGPD): remove todos os arquivos do estudante. */
export async function purgeUserDocuments(userId) {
  if (!/^[\w-]+$/.test(userId)) return;
  await fs.promises.rm(userDir(userId), { recursive: true, force: true }).catch(() => {});
}

export default router;
