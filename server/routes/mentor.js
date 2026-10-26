// Mentor Estuvia: conversa, confirmação de ações, avisos proativos e controle de dados do estudante.
import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../security.js';
import { handleMessage, mode } from '../mentor/orchestrator.js';
import { QUICK_ACTIONS } from '../mentor/guided.js';
import { confirm, cancel, getProposal } from '../mentor/actions.js';
import { insights } from '../mentor/proactive.js';
import { buildContext } from '../mentor/context.js';
import { catalog, UNAVAILABLE } from '../mentor/tools/index.js';
import { mentorState, setPreferences, deleteNote, clearMemory, dismissInsight, PERMISSIONS, INSIGHT_TYPES } from '../mentor/memory.js';

const router = Router();
router.use(requireAuth);

// Modo Guiado não tem custo por mensagem; com IA o limite é mais apertado.
const limit = (max) => rateLimit({ windowMs: 60 * 60 * 1000, limit: max, standardHeaders: 'draft-7', legacyHeaders: false, keyGenerator: (req) => req.user.id, message: { error: 'Você atingiu o limite de mensagens por hora. Volte daqui a pouco!' } });
const guidedLimiter = limit(200);
const aiLimiter = limit(40);
const messageLimiter = (req, res, next) => (mode().modo === 'ia' ? aiLimiter : guidedLimiter)(req, res, next);

const contextSchema = z.object({
  journeyId: z.string().max(60).optional(),
  missaoId: z.string().regex(/^\d\.\d{1,2}$/).optional(),
  tela: z.string().max(30).optional(),
}).strict().default({});

router.get('/', (req, res) => {
  const st = mentorState(req.user);
  res.json({
    ...mode(),
    acoesRapidas: QUICK_ACTIONS,
    avisos: insights(req.user),
    permissoes: st.permissoes,
    preferencias: st.preferencias,
    rotulos: { permissoes: PERMISSIONS, tiposAviso: INSIGHT_TYPES },
  });
});

const messageSchema = z.object({
  mensagem: z.string().trim().max(3000, 'Mensagem muito longa.').optional(),
  acao: z.enum(QUICK_ACTIONS.map((q) => q.id)).optional(),
  contexto: contextSchema,
  historico: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) })).max(12).default([]),
}).strict().refine((d) => d.acao || (d.mensagem && d.mensagem.length >= 1), { message: 'Escreva sua mensagem.' });

router.post('/message', messageLimiter, async (req, res) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Mensagem inválida.' });
  const abort = new AbortController();
  res.on('close', () => { if (!res.writableEnded) abort.abort(); });
  try {
    res.json(await handleMessage(req.user, parsed.data, { signal: abort.signal }));
  } catch (err) {
    if (abort.signal.aborted) return;
    throw err;
  }
});

router.get('/actions/:id', (req, res) => {
  const p = getProposal(req.user, req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposta não encontrada ou expirada.' });
  res.json({ proposta: p });
});

router.post('/actions/:id/confirm', async (req, res) => {
  const parsed = z.object({ edicoes: z.record(z.string().regex(/^\d{1,2}$/), z.record(z.string(), z.unknown())).optional() }).strict().safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'Edição inválida.' });
  const r = await confirm(req.user, req.params.id, { edicoes: parsed.data.edicoes || {} });
  if (r.erro) return res.status(r.erro.status || 400).json({ error: r.erro.mensagem, codigo: r.erro.codigo });
  res.status(r.ok ? 200 : 409).json(r);
});

router.post('/actions/:id/cancel', (req, res) => {
  cancel(req.user, req.params.id);
  res.json({ ok: true, texto: 'Tudo bem, não alterei nada.' });
});

router.get('/insights', (req, res) => res.json({ avisos: insights(req.user) }));

router.post('/insights/:id/dismiss', async (req, res) => {
  if (!/^[0-9a-f]{16}$/.test(req.params.id)) return res.status(400).json({ error: 'Aviso inválido.' });
  await dismissInsight(req.user.id, req.params.id);
  res.json({ ok: true });
});

// "O que o Mentor sabe": transparência e controle (LGPD art. 18).
router.get('/memory', (req, res) => {
  const st = mentorState(req.user);
  res.json({
    permissoes: st.permissoes, preferencias: st.preferencias, notas: st.notas, historico: st.historico.slice().reverse(),
    rotulos: { permissoes: PERMISSIONS, tiposAviso: INSIGHT_TYPES },
    contexto: buildContext(req.user, { journeyId: typeof req.query.journeyId === 'string' ? req.query.journeyId : undefined }),
    conversas: 'O Mentor não grava as conversas: o histórico do chat fica só nesta aba do navegador.',
  });
});

const flags = (keys) => z.object(Object.fromEntries(keys.map((k) => [k, z.boolean().optional()]))).strict();
router.put('/preferences', async (req, res) => {
  const parsed = z.object({
    permissoes: flags(Object.keys(PERMISSIONS)).optional(),
    preferencias: z.object({ proativo: z.boolean().optional(), tiposAviso: flags(Object.keys(INSIGHT_TYPES)).optional() }).strict().optional(),
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Preferências inválidas.' });
  const user = await setPreferences(req.user.id, parsed.data);
  const st = mentorState(user);
  res.json({ permissoes: st.permissoes, preferencias: st.preferencias, notas: st.notas });
});

router.delete('/memory/notes/:id', async (req, res) => {
  await deleteNote(req.user.id, req.params.id);
  res.json({ ok: true });
});

router.delete('/memory', async (req, res) => {
  await clearMemory(req.user.id);
  res.json({ ok: true });
});

router.get('/tools', (req, res) => res.json({ ferramentas: catalog(), indisponiveis: UNAVAILABLE }));

export default router;
