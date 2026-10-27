// Agenda: eventos (AgendaEvent), prazos das jornadas e das bolsas, disponibilidade,
// proposta automática de semana, aprovação e replanejamento.
import { Router } from 'express';
import { z } from 'zod';
import { users, newId } from '../store.js';
import { requireAuth } from '../security.js';
import { computeJourney } from '../journey-engine.js';
import { financialDeadlines } from '../finance-engine.js';
import { missionById } from '../content/rounds.js';
import { suggestWeek, staleSuggestions, CATEGORY_BY_ROUND, DEFAULT_AVAILABILITY, mondayOf } from '../agenda-engine.js';

const router = Router();
router.use(requireAuth);

export const CATEGORIES = ['academico', 'documentacao', 'financeiro', 'visto', 'viagem', 'pessoal'];

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido.');
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const eventSchema = z.object({
  titulo: z.string().trim().min(1, 'Dê um título à atividade.').max(120),
  categoria: z.enum(CATEGORIES),
  data: z.string().regex(dateRe, 'Data inválida.'),
  inicio: time,
  fim: time,
  nota: z.string().max(300).optional(),
  journeyId: z.string().max(60).optional(),
  missaoId: z.string().regex(/^\d\.\d{1,2}$/).optional(),
  bolsaId: z.string().max(60).optional(),
  prioridade: z.enum(['critica', 'alta', 'normal', 'aguardando']).optional(),
  motivo: z.string().max(200).optional(),
}).strict().refine((e) => e.fim > e.inicio, { message: 'O fim precisa ser depois do início.' });

function deadlines(user) {
  const fromJourneys = (user.journeys || []).flatMap((jr) => {
    const j = computeJourney(user, jr);
    const label = j.destino.universidade?.sigla || 'Jornada';
    return j.prazos.map((p) => ({
      id: `prazo-${jr.id}-${p.missao || 'aulas'}`,
      tipo: p.origem === 'oficial' ? 'prazo-oficial' : 'prazo-declarado',
      titulo: p.titulo, rotulo: p.rotulo, data: p.data, origem: p.origem,
      categoria: p.missao ? CATEGORY_BY_ROUND[missionById(p.missao)?.rodada] || 'pessoal' : 'academico',
      journeyId: jr.id, jornada: label, missaoId: p.missao, label: p.label,
    }));
  });
  const fromScholarships = (user.scholarshipApps || []).filter((a) => a.prazo && !['concedida', 'negada', 'desisti'].includes(a.status))
    .map((a) => ({ id: `prazo-bolsa-${a.id}`, tipo: 'prazo-declarado', titulo: `Prazo da bolsa: ${a.nome}`, rotulo: 'Edital (declarado por você)', data: a.prazo, origem: 'declarado', categoria: 'financeiro', bolsaId: a.id }));
  // Oportunidades salvas da comunidade (o estudante decidiu acompanhar; prazo declarado no post).
  const fromOpportunities = (user.opportunities || []).filter((o) => o.snapshot?.prazo && o.decisao !== 'descartar')
    .map((o) => ({ id: `prazo-op-${o.id || o.postId}`, tipo: 'prazo-declarado', titulo: o.snapshot.titulo, rotulo: 'Oportunidade da comunidade', data: o.snapshot.prazo, origem: 'declarado', categoria: 'academico' }));
  // Compromissos financeiros com data (pagamentos previstos no planejador financeiro).
  const fromFinance = financialDeadlines(user).map((p) => ({ ...p, tipo: 'prazo-declarado', rotulo: 'Pagamento (planejador financeiro)', origem: 'declarado', categoria: 'financeiro' }));
  return [...fromJourneys, ...fromScholarships, ...fromOpportunities, ...fromFinance];
}

const reply = (user, extra = {}) => ({
  events: user.planner || [],
  deadlines: deadlines(user),
  categories: CATEGORIES,
  disponibilidade: { ...DEFAULT_AVAILABILITY, ...(user.agenda?.disponibilidade || {}) },
  ...extra,
});

router.get('/', (req, res) => res.json(reply(req.user)));

router.post('/', async (req, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
  if ((req.user.planner || []).length >= 500) return res.status(409).json({ error: 'Limite de atividades atingido.' });
  if (parsed.data.journeyId && !(req.user.journeys || []).some((j) => j.id === parsed.data.journeyId)) return res.status(400).json({ error: 'Jornada inválida.' });
  const event = { id: newId(), origem: 'estudante', ...parsed.data, criadoEm: new Date().toISOString() };
  const user = await users.update(req.user.id, (u) => { (u.planner ??= []).push(event); });
  res.status(201).json(reply(user, { event }));
});

router.put('/events/:id', async (req, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
  if (!(req.user.planner || []).some((e) => e.id === req.params.id)) return res.status(404).json({ error: 'Atividade não encontrada.' });
  const user = await users.update(req.user.id, (u) => {
    const e = u.planner.find((x) => x.id === req.params.id);
    Object.keys(e).forEach((k) => { if (!['id', 'origem', 'criadoEm', 'oportunidadeId', 'oportunidadeTipo', 'documentoId'].includes(k)) delete e[k]; });
    Object.assign(e, parsed.data, { editadoEm: new Date().toISOString() });
  });
  res.json(reply(user));
});

router.delete('/events/:id', async (req, res) => {
  if (!(req.user.planner || []).some((e) => e.id === req.params.id)) return res.status(404).json({ error: 'Atividade não encontrada.' });
  const user = await users.update(req.user.id, (u) => { u.planner = u.planner.filter((e) => e.id !== req.params.id); });
  res.json(reply(user));
});

// ---------- Agenda ----------

router.put('/availability', async (req, res) => {
  const parsed = z.object({
    dias: z.array(z.number().int().min(1).max(7)).min(1, 'Escolha ao menos um dia.').max(7),
    janelas: z.array(z.object({ inicio: time, fim: time }).strict().refine((w) => w.fim > w.inicio, 'Janela inválida.')).min(1).max(4),
    horasSemanais: z.number().min(0.5).max(60),
    preferencia: z.enum(['curtas', 'longas']),
    fuso: z.enum(['America/Sao_Paulo', 'America/Manaus', 'America/Fortaleza', 'America/Noronha', 'America/Rio_Branco', 'Europe/Madrid']),
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
  const user = await users.update(req.user.id, (u) => { u.agenda = { ...(u.agenda || {}), disponibilidade: parsed.data }; });
  res.json(reply(user));
});

const weekQuery = z.object({ semana: z.string().regex(dateRe) }).strict();
const suggestQuery = weekQuery.extend({ journeyId: z.string().max(60).optional(), missaoId: z.string().regex(/^\d\.\d{1,2}$/).optional() }).strict();

router.post('/suggest', (req, res) => {
  const parsed = suggestQuery.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Semana inválida.' });
  const { semana, ...focus } = parsed.data;
  res.json(suggestWeek(req.user, semana, undefined, focus));
});

// Aprovação: a proposta (editada ou não) vira eventos "agenda-ai" do estudante.
router.post('/approve', async (req, res) => {
  const parsed = z.object({ itens: z.array(eventSchema).min(1).max(80) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Proposta inválida.' });
  const created = parsed.data.itens.map((e) => ({ id: newId(), origem: 'agenda-ai', ...e, criadoEm: new Date().toISOString() }));
  const user = await users.update(req.user.id, (u) => { (u.planner ??= []).push(...created); });
  res.status(201).json(reply(user, { criados: created.length }));
});

// Replanejar: remove blocos sugeridos que perderam sentido e devolve nova proposta para a semana.
router.post('/replan', async (req, res) => {
  const parsed = weekQuery.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Semana inválida.' });
  const stale = staleSuggestions(req.user);
  const ids = new Set(stale.map((s) => s.id));
  const start = mondayOf(parsed.data.semana);
  const today = new Date().toISOString().slice(0, 10);
  // Também libera os blocos futuros desta semana criados pela Agenda, para redistribuí-los.
  const user = await users.update(req.user.id, (u) => {
    u.planner = (u.planner || []).filter((e) => !ids.has(e.id) && !(e.origem === 'agenda-ai' && e.data >= today && e.data >= start && e.data <= addDays(start, 6)));
  });
  res.json(reply(user, { removidos: stale, ...suggestWeek(user, start) }));
});

function addDays(iso, n) { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

export default router;
