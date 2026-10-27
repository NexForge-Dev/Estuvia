import { Router } from 'express';
import { z } from 'zod';
import { users, audit } from '../store.js';
import { requireAuth, clearSession, verifyPassword, isModerator, isAdmin } from '../security.js';
import { communityExport, purgeCommunityUser } from './community.js';
import { forgetUser, exportUser } from '../radar/service.js';
import { purgeUserDocuments } from './documents.js';
import { personalTips } from '../tips.js';
import { programById } from '../content/catalog.js';
import { DOCUMENTS, DOC_STATUS } from '../content/documents.js';

const router = Router();
router.use(requireAuth);

// Nunca devolve hash de senha nem campos internos.
export function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    createdAt: u.createdAt,
    profile: u.profile,
    choices: u.choices || [],
    documents: u.documents || {},
    moderador: isModerator(u),
    admin: isAdmin(u),
  };
}

const bad = (res, parsed) => res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
const reply = (res, user) => res.json({ user: publicUser(user), tips: personalTips(user) });

router.get('/', (req, res) => reply(res, req.user));

const LEVELS = ['nenhum', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'nativo'];
const text = (max) => z.string().trim().max(max).optional();
const optionalEnum = (values) => z.enum(values).optional().or(z.literal(''));

const profileSchema = z.object({
  // Identidade e personalização
  nome: z.string().trim().min(2).max(60).optional(),
  apelido: text(30),
  avatar: z.enum(['🎓', '🚀', '🌍', '📚', '🦉', '🌻', '⚡', '🧉', '🎒', '🐢']).optional(),
  cor: z.enum(['turquesa', 'azul', 'verde', 'roxo', 'laranja', 'rosa']).optional(),
  tema: z.enum(['auto', 'claro', 'escuro']).optional(),
  porque: text(400),
  metaPessoal: text(200),
  // Onboarding: origem
  nacionalidade: text(40),
  paisResidencia: text(40),
  estado: text(40),
  // Formação (o destino fica em cada jornada: routes/journey.js)
  formacao: text(120),
  instituicao: text(120),
  area: text(80),
  // Idiomas
  espanhol: z.enum(LEVELS).optional(),
  ingles: z.enum(LEVELS).optional(),
  certificadoEspanhol: z.enum(['nenhum', 'DELE', 'SIELE', 'outro']).optional(),
  certificadoNivel: optionalEnum(LEVELS),
  // Situação atual (autodeclarada)
  situacaoCandidatura: z.enum(['nao-iniciada', 'preparando', 'enviada', 'admitido', 'matriculado']).optional(),
  situacaoVisto: z.enum(['nao-iniciado', 'preparando', 'solicitado', 'aprovado']).optional(),
  orcamentoDisponivel: z.number().min(0).max(10_000_000).nullable().optional(),
  onboardingConcluido: z.boolean().optional(),
}).strict();

router.put('/profile', async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const user = await users.update(req.user.id, (u) => { u.profile = { ...u.profile, ...parsed.data }; });
  reply(res, user);
});

router.put('/choices', async (req, res) => {
  const parsed = z.object({ choices: z.array(z.string().max(60)).max(6, 'O DUA 2026/27 permite até 6 opções.') }).safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const unique = [...new Set(parsed.data.choices)];
  if (unique.some((id) => !programById(id))) return res.status(400).json({ error: 'Programa desconhecido.' });
  const user = await users.update(req.user.id, (u) => { u.choices = unique; });
  reply(res, user);
});

router.put('/documents', async (req, res) => {
  const ids = DOCUMENTS.map((d) => d.id);
  const parsed = z.record(z.string(), z.enum(DOC_STATUS)).safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  if (Object.keys(parsed.data).some((k) => !ids.includes(k))) return res.status(400).json({ error: 'Documento desconhecido.' });
  const user = await users.update(req.user.id, (u) => { u.documents = { ...u.documents, ...parsed.data }; });
  reply(res, user);
});

// Portabilidade (LGPD art. 18 / RGPD art. 20).
router.get('/export', (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="meus-dados.json"');
  const u = req.user;
  res.json({ ...publicUser(u), journeys: u.journeys || [], requisitos: u.requisitos || {}, mentor: u.mentor || {}, planner: u.planner || [], agenda: u.agenda || {}, finance: u.finance || {}, scholarshipApps: u.scholarshipApps || [], housing: u.housing || [], travel: u.travel || {}, opportunities: u.opportunities || [], docFiles: (u.docFiles || []).map(({ iv, tag, ...f }) => f), docRecords: u.docRecords || {}, comunidade: communityExport(u.id), radar: exportUser(u.id) });
});

// Exclusão definitiva da conta, com reconfirmação de senha.
router.delete('/', async (req, res) => {
  const parsed = z.object({ senha: z.string().min(1).max(128) }).safeParse(req.body);
  if (!parsed.success || !(await verifyPassword(parsed.data.senha, req.user.passwordHash))) {
    return res.status(401).json({ error: 'Senha incorreta.' });
  }
  await purgeCommunityUser(req.user.id); // posts, comentários, curtidas e imagens (LGPD)
  await forgetUser(req.user.id); // inscrições e alertas do Radar
  await purgeUserDocuments(req.user.id); // arquivos cifrados da carteira de documentos
  await users.remove(req.user.id);
  await audit.log({ action: 'account-deleted', userId: req.user.id });
  clearSession(res);
  res.json({ ok: true });
});

export default router;
