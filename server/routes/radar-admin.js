// Radar de Oportunidades — painel administrativo (auditoria e revisão).
// Acesso: usuários com role "admin" ou e-mail listado em RADAR_ADMIN_EMAILS.
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../security.js';
import { config } from '../config.js';
import {
  overview, addSource, setSourceAvailability, runNow, resolveReview, registerCalendar, correct, republish, simulateDev, clearDemo, importCommunityFeed,
} from '../radar/admin.js';

const router = Router();
const adminEmails = () => (process.env.RADAR_ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
export const isRadarAdmin = (user) => user?.role === 'admin' || adminEmails().includes(String(user?.email || '').toLowerCase());

router.use(requireAuth, (req, res, next) => {
  if (!isRadarAdmin(req.user)) return res.status(403).json({ error: 'Área restrita à equipe do Radar (RADAR_ADMIN_EMAILS).' });
  next();
});

const send = (res, fn) => Promise.resolve().then(fn).then((body) => res.json(body)).catch((err) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  throw err;
});
const bad = (res, parsed) => res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
const who = (req) => req.user.email;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD.');

router.get('/', (req, res) => res.json({ ...overview(), ambiente: config.isProd ? 'producao' : 'desenvolvimento' }));

router.post('/sources', (req, res) => {
  const parsed = z.object({
    id: z.string().regex(/^[a-z0-9-]{3,40}$/, 'Identificador: letras minúsculas, números e hífen.'),
    titulo: z.string().trim().min(3).max(120),
    instituicao: z.string().trim().min(2).max(120),
    rotuloPublico: z.string().trim().min(2).max(80),
    url: z.string().url().max(400).refine((u) => u.startsWith('https://') || u.startsWith('http://'), 'URL inválida.'),
    tipo: z.enum(['calendario', 'catalogo', 'programa', 'normativa', 'portal-candidatura', 'bolsa', 'orientacao']),
    prioridade: z.number().int().min(0).max(5),
    frequenciaHoras: z.number().int().min(6).max(720),
    nota: z.string().max(300).optional(),
  }).strict().safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  return send(res, async () => ({ source: await addSource(parsed.data) }));
});

router.post('/sources/:id/run', (req, res) => send(res, async () => ({ run: await runNow(req.params.id) })));

router.put('/sources/:id/availability', (req, res) => {
  const parsed = z.object({ indisponivel: z.boolean(), motivo: z.string().max(200).optional() }).strict().safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  return send(res, async () => ({ source: await setSourceAvailability(req.params.id, parsed.data.indisponivel, parsed.data.motivo) }));
});

router.post('/reviews/:id', (req, res) => {
  const parsed = z.object({ decisao: z.enum(['aprovar', 'rejeitar']), nota: z.string().max(300).optional() }).strict().safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  return send(res, () => resolveReview(req.params.id, parsed.data.decisao, who(req), parsed.data.nota));
});

router.post('/calendars', (req, res) => {
  const parsed = z.object({
    sourceId: z.string().max(40),
    url: z.string().url().max(400),
    anoAcademico: z.string().max(9),
    previsto: z.boolean().optional(),
    fases: z.array(z.object({ fase: z.number().int().min(1).max(5), titulo: z.string().max(120).optional(), publico: z.enum(['estrangeiros', 'todos']).optional(), abertura: date, encerramento: date }).strict()).min(1).max(5),
  }).strict().safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  return send(res, () => registerCalendar(parsed.data, who(req)));
});

router.post('/corrections', (req, res) => {
  const parsed = z.object({
    entidade: z.enum(['AdmissionWindow', 'AdmissionEvent', 'Program', 'Opportunity']),
    id: z.string().max(200),
    campo: z.string().max(40),
    valor: z.string().max(300).nullable(),
    motivo: z.string().trim().min(5, 'Explique o motivo da correção.').max(300),
    url: z.string().url('Informe a URL da evidência oficial.').max(400),
  }).strict().safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  return send(res, () => correct(parsed.data, who(req)));
});

router.post('/republish', (req, res) => send(res, () => republish()));
router.post('/community/import', (req, res) => send(res, () => importCommunityFeed()));

// Somente em desenvolvimento: simulação claramente marcada como DEMONSTRATIVA.
router.post('/dev/simulate', (req, res) => {
  if (config.isProd) return res.status(404).json({ error: 'Rota não encontrada.' });
  const parsed = z.object({ anoAcademico: z.string().max(9), abertura: date, encerramento: date }).strict().safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  return send(res, () => simulateDev(parsed.data, who(req)));
});
router.delete('/dev/simulate', (req, res) => {
  if (config.isProd) return res.status(404).json({ error: 'Rota não encontrada.' });
  return send(res, () => clearDemo());
});

export default router;
