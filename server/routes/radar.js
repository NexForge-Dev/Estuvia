// Radar de Oportunidades — API do estudante.
// Leitura pública (catálogo e calendário verificados); acompanhamento, alertas e Agenda exigem login.
import { Router } from 'express';
import { z } from 'zod';
import { users } from '../store.js';
import { requireAuth } from '../security.js';
import {
  listOpportunities, opportunityDetail, subscribe, unsubscribe, myRadar, markAlertsRead, addToAgenda, confirmAgendaChange,
} from '../radar/service.js';
import { EVENT_TYPES } from '../radar/notify.js';

const router = Router();

// Identifica o estudante quando há sessão, sem exigir login (personaliza cards públicos).
function optionalUser(req, res, next) {
  if (!req.cookies?.tv_session) return next();
  const silent = { status: () => silent, json: () => next(), clearCookie: () => silent };
  requireAuth(req, silent, next);
}

const send = (res, fn) => Promise.resolve().then(fn).then((body) => res.json(body)).catch((err) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  throw err;
});

const listQuery = z.object({
  q: z.string().max(100).optional(),
  pais: z.string().max(40).optional(),
  cidade: z.string().max(60).optional(),
  universidade: z.string().max(20).optional(),
  area: z.string().max(80).optional(),
  ano: z.string().regex(/^20\d{2}[/-](20)?\d{2}$/).optional(),
  idioma: z.string().max(30).optional(),
  nivelIdioma: z.enum(['A2', 'B1', 'B2', 'C1', 'C2']).optional(),
  modalidade: z.enum(['presencial', 'hibrida', 'online']).optional(),
  precoMax: z.coerce.number().positive().optional(),
  situacao: z.string().max(30).optional(),
  bolsas: z.enum(['sim']).optional(),
  compativel: z.enum(['sim']).optional(),
  acompanhando: z.enum(['sim']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(5000).optional(),
});

router.get('/opportunities', optionalUser, (req, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Filtro inválido.' });
  const empty = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== '' && v !== undefined));
  res.json(listOpportunities(empty, { user: req.user || null }));
});

router.get('/opportunities/:id', optionalUser, (req, res) => {
  if (!/^[\w-]{3,140}$/.test(req.params.id)) return res.status(404).json({ error: 'Oportunidade não encontrada.' });
  const detail = opportunityDetail(req.params.id, { user: req.user || null });
  if (!detail) return res.status(404).json({ error: 'Oportunidade não encontrada.' });
  res.json({ opportunity: detail });
});

router.get('/event-types', (req, res) => res.json({ eventos: EVENT_TYPES }));

// ---------- Área do estudante ----------

router.get('/me', requireAuth, (req, res) => res.json(myRadar(req.user)));

const subSchema = z.object({
  eventos: z.array(z.enum(Object.keys(EVENT_TYPES))).max(10).optional(),
  canal: z.enum(['app']).optional(),
}).strict();

router.put('/opportunities/:id/subscription', requireAuth, (req, res) => {
  const parsed = subSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'Escolha eventos válidos.' });
  return send(res, async () => ({ subscription: await subscribe(req.user, req.params.id, parsed.data) }));
});

router.delete('/opportunities/:id/subscription', requireAuth, (req, res) => send(res, async () => { await unsubscribe(req.user, req.params.id); return { ok: true }; }));

router.post('/alerts/read', requireAuth, (req, res) => {
  const parsed = z.object({ ids: z.array(z.string().uuid()).max(200).optional() }).strict().safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.' });
  return send(res, async () => { await markAlertsRead(req.user, parsed.data.ids); return { ok: true }; });
});

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
router.post('/opportunities/:id/agenda', requireAuth, (req, res) => {
  const parsed = z.object({
    itens: z.array(z.object({ id: z.string().max(200), data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), inicio: time.optional(), fim: time.optional() }).strict()).min(1).max(30),
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Selecione as atividades a adicionar.' });
  return send(res, async () => {
    const created = await addToAgenda(req.user, req.params.id, parsed.data.itens, users);
    return { criadas: created.length, eventos: created };
  });
});

router.post('/agenda-changes/:linkId', requireAuth, (req, res) => {
  const parsed = z.object({ aceitar: z.boolean() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Confirme ou mantenha a data.' });
  return send(res, async () => ({ alteracao: await confirmAgendaChange(req.user, req.params.linkId, parsed.data.aceitar, users) }));
});

export default router;
