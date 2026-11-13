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
import { REQUIREMENTS } from '../content/progression.js';
import { countryCode, BR_UFS } from '../../public/js/data/geo.js';
import { duaGrade } from '../../public/js/data/grade.js';
import { compareChoices } from '../journey-engine.js';

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

// 'nao-sei' é uma resposta válida ("ainda não sei meu nível"), diferente de não responder.
const LEVELS = ['nenhum', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'nativo', 'nao-sei'];
const CERT_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
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
  // Curso da graduação (texto livre). A Missão 1.4 compara com as graduações da ficha do DUA.
  graduacao: text(120),
  area: text(80),
  // Nota média da graduação na escala de origem (Missão 2.3). null apaga; os três andam juntos.
  notaMedia: z.number().min(0).max(1000).nullable().optional(),
  notaMaxima: z.number().positive().max(1000).nullable().optional(),
  notaMinima: z.number().min(0).max(1000).nullable().optional(),
  // Idiomas
  espanhol: z.enum(LEVELS).optional(),
  ingles: z.enum(LEVELS).optional(),
  certificadoEspanhol: z.enum(['nenhum', 'DELE', 'SIELE', 'outro']).optional(),
  certificadoNivel: optionalEnum(CERT_LEVELS),
  // Situação atual (autodeclarada)
  situacaoCandidatura: z.enum(['nao-iniciada', 'preparando', 'enviada', 'admitido', 'matriculado']).optional(),
  situacaoVisto: z.enum(['nao-iniciado', 'preparando', 'solicitado', 'aprovado']).optional(),
  orcamentoDisponivel: z.number().min(0).max(10_000_000).nullable().optional(),
  // "Ainda não sei" é explícito: sem ele, orçamento ausente não vira zero.
  orcamentoSituacao: z.enum(['informado', 'nao-sei']).optional(),
  onboardingConcluido: z.boolean().optional(),
}).strict();

router.put('/profile', async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const merged = { ...req.user.profile, ...parsed.data };
  const grade = [merged.notaMedia, merged.notaMaxima, merged.notaMinima];
  if (grade.some((v) => v != null)) {
    if (grade.some((v) => v == null)) return res.status(400).json({ error: 'Informe a média, a nota máxima e a mínima para aprovação juntas (ou apague as três).' });
    const g = duaGrade({ nota: merged.notaMedia, max: merged.notaMaxima, min: merged.notaMinima });
    if (!g.ok) return res.status(400).json({ error: g.erro });
  }
  const user = await users.update(req.user.id, (u) => { u.profile = { ...u.profile, ...parsed.data }; });
  reply(res, user);
});

// Conclusão do primeiro onboarding: o servidor confere o que é essencial antes de marcar o perfil como
// concluído (o navegador chama depois de salvar perfil, requisitos e criar a jornada). Idempotente.
const filled = (v) => typeof v === 'string' && v.trim().length > 0;
export function onboardingGaps(u) {
  const p = u.profile || {};
  const r = u.requisitos || {};
  const gaps = [];
  if (!filled(p.nacionalidade)) gaps.push('nacionalidade');
  if (!filled(p.paisResidencia)) gaps.push('país de residência');
  else if (countryCode(p.paisResidencia) === 'BR' && !BR_UFS.includes(p.estado)) gaps.push('estado');
  if (!filled(p.formacao)) gaps.push('formação');
  if (!filled(p.instituicao)) gaps.push('instituição de origem');
  if (!filled(p.area)) gaps.push('área de interesse');
  if (!LEVELS.includes(p.espanhol)) gaps.push('nível de espanhol');
  if (!LEVELS.includes(p.ingles)) gaps.push('nível de inglês');
  if (!p.certificadoEspanhol) gaps.push('certificado de espanhol');
  else if (p.certificadoEspanhol !== 'nenhum' && !CERT_LEVELS.includes(p.certificadoNivel)) gaps.push('nível do certificado');
  if (p.orcamentoSituacao === 'informado' ? typeof p.orcamentoDisponivel !== 'number' : p.orcamentoSituacao !== 'nao-sei') gaps.push('orçamento');
  for (const q of REQUIREMENTS.filter((x) => !x.somenteNaEspanha)) if (!r[q.id]) gaps.push(`documento: ${q.id}`);
  if (!(u.journeys || []).length) gaps.push('jornada');
  return gaps;
}

router.post('/onboarding/complete', async (req, res) => {
  if (req.user.profile?.onboardingConcluido) return reply(res, req.user);
  const gaps = onboardingGaps(req.user);
  if (gaps.length) return res.status(422).json({ error: `Faltam informações para concluir: ${gaps.join(', ')}.`, faltam: gaps });
  const user = await users.update(req.user.id, (u) => { u.profile = { ...u.profile, onboardingConcluido: true, onboardingConcluidoEm: new Date().toISOString() }; });
  audit.log({ action: 'onboarding.completed', userId: req.user.id }).catch(() => {});
  reply(res, user);
});

// Comparação lado a lado das opções salvas (Missão 3.4), com a elegibilidade de cada uma para este perfil.
router.get('/choices/compare', (req, res) => res.json({ opcoes: compareChoices(req.user) }));

router.put('/choices', async (req, res) => {
  // IDs dos mestrados do Radar passam de 60 caracteres (mesmo limite de 120 da criação de jornada).
  const parsed = z.object({ choices: z.array(z.string().max(120)).max(6, 'O DUA 2026/27 permite até 6 opções.') }).safeParse(req.body);
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
  // Tudo o que está guardado sobre a pessoa, exceto credenciais e segredos internos. Lista de exclusão (e não de
  // inclusão): um campo novo no usuário entra na exportação sem depender de alguém lembrar de acrescentá-lo aqui.
  // adminNotes ficam de fora (anotações internas da equipe; o painel promete que o aluno não as vê).
  // Se o direito de acesso (LGPD art. 18 / RGPD art. 15) exigir incluí-las, é decisão jurídica pendente.
  const { passwordHash, tokenVersion, passwordReset, docFiles, adminNotes, loginFalhas, loginLock, ...rest } = u;
  res.json({
    ...rest,
    ...publicUser(u),
    journeys: u.journeys || [], requisitos: u.requisitos || {}, mentor: u.mentor || {}, planner: u.planner || [], agenda: u.agenda || {}, finance: u.finance || {}, scholarshipApps: u.scholarshipApps || [], housing: u.housing || [], travel: u.travel || {}, opportunities: u.opportunities || [],
    docFiles: (docFiles || []).map(({ iv, tag, ...f }) => f), docRecords: u.docRecords || {}, docConditions: u.docConditions || {}, docConsent: u.docConsent || null, docPrefs: u.docPrefs || {},
    // Registros de segurança da própria conta (acessos, IP e dispositivo).
    atividade: audit.recent(5000, (e) => e.userId === u.id || (e.email && e.email === u.email)),
    comunidade: communityExport(u.id), radar: exportUser(u.id),
  });
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
