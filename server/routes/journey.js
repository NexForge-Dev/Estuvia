// Jornadas do estudante: cada uma é um destino (programa/universidade) com progresso próprio.
// A progressão (o que está bloqueado ou desbloqueado) é decidida aqui, no servidor, a partir de fatos persistidos.
import { Router } from 'express';
import { z } from 'zod';
import { users, newId, audit } from '../store.js';
import { requireAuth } from '../security.js';
import { UNIVERSITIES, programById, registerProgramSource } from '../content/catalog.js';
import { programForJourney, officialDeadlines } from '../radar/service.js';
import { registerOfficialDeadlines } from '../journey-engine.js';

registerProgramSource(programForJourney);
registerOfficialDeadlines(officialDeadlines);
import { SITUACAO } from '../content/rounds.js';
import { PRIOR_STAGES, REQUIREMENTS } from '../content/progression.js';
import {
  computeJourney, setObjective, completeMission, reopenMission, setMissionFlags, setSituacao, diffEvents, JourneyError,
  recordUnlocks, journeyForClient, missionForClient, declarePriorProgress, registerArrival, applyRequirements,
} from '../journey-engine.js';

const router = Router();
router.use(requireAuth);

export const MAX_JOURNEYS = 6;
const missionId = z.string().regex(/^\d\.\d{1,2}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');
const STAGES = PRIOR_STAGES.map(({ id, rotulo, exigeDataEntrada }) => ({ id, rotulo, exigeDataEntrada: Boolean(exigeDataEntrada) }));

const journeyFields = z.object({
  programaId: z.string().max(120).refine((id) => Boolean(programById(id)), 'Programa desconhecido.').optional(),
  universidadeId: z.enum(UNIVERSITIES.map((u) => u.id)).optional(),
  anoAcademico: z.string().regex(/^20\d{2}\/\d{2}$/, 'Ano acadêmico inválido (ex.: 2027/28).').optional(),
  inicioAulas: date.optional().or(z.literal('')),
  duracaoMeses: z.number().int().min(1).max(48).nullable().optional(),
}).strict();

const summary = (user, jr) => {
  const j = computeJourney(user, jr);
  const atual = j.rodadas.find((r) => r.numero === j.rodadaAtual);
  return {
    id: j.id, criadaEm: j.criadaEm, status: j.status, destino: j.destino, progresso: j.progresso,
    contagem: j.contagem, rodadaAtual: { numero: atual.numero, titulo: atual.titulo }, proximaMissao: j.proximaMissao,
    proximoPrazo: j.prazos.find((p) => p.diasRestantes >= 0) || null,
  };
};

const findJourney = (user, jid) => (user.journeys || []).find((j) => j.id === jid);
const view = (user, jr) => journeyForClient(computeJourney(user, jr));

// Rodadas desbloqueadas entram na auditoria (o histórico completo fica em jr.desbloqueios).
function logUnlocks(userId, journeyId, novos) {
  for (const e of novos.filter((x) => x.tipo === 'rodada' && x.motivo !== 'inicio')) {
    audit.log({ action: 'journey.round-unlocked', userId, journeyId, entidade: e.entidade, motivo: e.motivo }).catch(() => {});
  }
}

router.get('/', (req, res) => {
  res.json({ journeys: (req.user.journeys || []).map((jr) => summary(req.user, jr)), max: MAX_JOURNEYS });
});

router.get('/progress-stages', (req, res) => res.json({ etapas: STAGES }));

// "O que você já tem?" — requisitos pessoais (valem para todas as jornadas) e editáveis a qualquer momento.
const QUESTIONS = REQUIREMENTS.map(({ id, pergunta, opcoes, somenteNaEspanha }) => ({ id, pergunta, opcoes, somenteNaEspanha: Boolean(somenteNaEspanha) }));
router.get('/requirements', (req, res) => res.json({ perguntas: QUESTIONS, respostas: req.user.requisitos || {} }));
router.put('/requirements', async (req, res) => {
  const shape = Object.fromEntries(REQUIREMENTS.map((r) => [r.id, z.enum(r.opcoes.map(([v]) => v)).optional()]));
  const parsed = z.object({ respostas: z.object(shape).strict() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Respostas inválidas.' });
  const novos = [];
  const user = await users.update(req.user.id, (u) => {
    u.requisitos = { ...(u.requisitos || {}), ...parsed.data.respostas };
    for (const r of REQUIREMENTS) {
      if (r.documento && u.requisitos[r.id] === 'tenho' && !['pronto', 'enviado'].includes(u.documents?.[r.documento])) { u.documents = { ...(u.documents || {}), [r.documento]: 'pronto' }; u.docRecords = { ...(u.docRecords || {}), [r.documento]: { ...(u.docRecords?.[r.documento] || {}), origem: 'declarado' } }; }
    }
    for (const jr of u.journeys || []) {
      applyRequirements(u, jr);
      novos.push(...recordUnlocks(jr, computeJourney(u, jr)).map((e) => ({ ...e, jid: jr.id })));
    }
  });
  for (const e of novos) logUnlocks(req.user.id, e.jid, [e]);
  audit.log({ action: 'requirements.updated', userId: req.user.id, itens: Object.keys(parsed.data.respostas) }).catch(() => {});
  res.json({ respostas: user.requisitos, journeys: (user.journeys || []).map((jr) => summary(user, jr)) });
});

router.post('/', async (req, res) => {
  const parsed = journeyFields.extend({ programaId: z.string().max(120).refine((id) => Boolean(programById(id)), 'Programa desconhecido.') }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Escolha um mestrado.' });
  if ((req.user.journeys || []).length >= MAX_JOURNEYS) return res.status(409).json({ error: `Você pode ter até ${MAX_JOURNEYS} jornadas.` });
  if ((req.user.journeys || []).some((j) => j.programaId === parsed.data.programaId)) return res.status(409).json({ error: 'Você já tem uma jornada para este mestrado.' });
  const program = programById(parsed.data.programaId);
  const jr = {
    id: newId(),
    criadaEm: new Date().toISOString(),
    ...parsed.data,
    universidadeId: program.universidadeId,
    duracaoMeses: parsed.data.duracaoMeses ?? program.duracaoMeses,
    missions: {},
    dados: {},
    desbloqueios: [],
  };
  const user = await users.update(req.user.id, (u) => {
    (u.journeys ??= []).push(jr);
    if (!(u.choices || []).includes(jr.programaId)) u.choices = [...(u.choices || []), jr.programaId].slice(0, 6);
    const saved = findJourney(u, jr.id);
    applyRequirements(u, saved);
    recordUnlocks(saved, computeJourney(u, saved));
  });
  res.status(201).json({ journey: view(user, findJourney(user, jr.id)), etapas: STAGES });
});

// Ao abrir, recalcula: se algo mudou em outro módulo (perfil, documentos, finanças), registra os novos desbloqueios.
router.get('/:jid', async (req, res) => {
  const jr = findJourney(req.user, req.params.jid);
  if (!jr) return res.status(404).json({ error: 'Jornada não encontrada.' });
  const draft = structuredClone(jr);
  applyRequirements(req.user, draft);
  const changed = JSON.stringify(draft.missions) !== JSON.stringify(jr.missions);
  const novos = recordUnlocks(draft, computeJourney(req.user, draft));
  if (!novos.length && !changed) return res.json({ journey: view(req.user, jr), events: [] });
  const saved = await users.update(req.user.id, (u) => { const t = findJourney(u, req.params.jid); t.desbloqueios = draft.desbloqueios; t.missions = draft.missions; });
  logUnlocks(req.user.id, req.params.jid, novos);
  const journey = view(saved, findJourney(saved, req.params.jid));
  const events = novos.filter((e) => e.tipo === 'rodada' && e.motivo !== 'inicio').map((e) => {
    const r = journey.rodadas.find((x) => `rodada:${x.numero}` === e.entidade);
    return { tipo: 'rodada-desbloqueada', journeyId: journey.id, numero: r.numero, sigla: r.sigla, titulo: r.titulo, etapa: r.etapa, banner: r.banner };
  });
  res.json({ journey, events });
});

router.put('/:jid', async (req, res) => {
  const parsed = journeyFields.omit({ programaId: true, universidadeId: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
  if (!findJourney(req.user, req.params.jid)) return res.status(404).json({ error: 'Jornada não encontrada.' });
  const user = await users.update(req.user.id, (u) => { Object.assign(findJourney(u, req.params.jid), parsed.data); });
  res.json({ journey: view(user, findJourney(user, req.params.jid)) });
});

router.delete('/:jid', async (req, res) => {
  if (!findJourney(req.user, req.params.jid)) return res.status(404).json({ error: 'Jornada não encontrada.' });
  await users.update(req.user.id, (u) => {
    u.journeys = u.journeys.filter((j) => j.id !== req.params.jid);
    u.planner = (u.planner || []).filter((e) => e.journeyId !== req.params.jid);
  });
  res.json({ ok: true });
});

// Missão bloqueada devolve só a prévia (nome, objetivo resumido e o que falta).
router.get('/:jid/missions/:id', (req, res) => {
  const jr = findJourney(req.user, req.params.jid);
  const detail = jr && missionId.safeParse(req.params.id).success && missionForClient(req.user, jr, req.params.id);
  if (!detail) return res.status(404).json({ error: 'Missão não encontrada.' });
  res.json({ mission: detail });
});

// Aplica a mutação numa cópia, valida pelo motor, recalcula os desbloqueios (idempotente), persiste
// e devolve estado + eventos de feedback. O navegador nunca decide o que está desbloqueado.
async function mutate(req, res, apply, { mission = true } = {}) {
  const { jid, id } = req.params;
  const original = findJourney(req.user, jid);
  if (!original) return res.status(404).json({ error: 'Jornada não encontrada.' });
  if (mission && !missionId.safeParse(id).success) return res.status(404).json({ error: 'Missão não encontrada.' });
  const draft = structuredClone(original);
  const before = computeJourney(req.user, original);
  let extra;
  try {
    extra = apply(draft);
  } catch (err) {
    if (err instanceof JourneyError) return res.status(err.status).json({ error: err.message });
    throw err;
  }
  applyRequirements(req.user, draft);
  const novos = recordUnlocks(draft, computeJourney(req.user, draft));
  const saved = await users.update(req.user.id, (u) => {
    const target = findJourney(u, jid);
    for (const k of ['missions', 'dados', 'situacao', 'desbloqueios', 'progressoAnterior']) if (draft[k] !== undefined) target[k] = draft[k];
  });
  logUnlocks(req.user.id, jid, novos);
  const jr = findJourney(saved, jid);
  const full = computeJourney(saved, jr);
  const body = { ...(extra || {}), journey: journeyForClient(full), events: diffEvents(before, full, mission ? id : null) };
  if (mission) body.mission = missionForClient(saved, jr, id);
  res.json(body);
}

// Decisões externas (admissão, matrícula, visto) registradas pelo estudante.
router.put('/:jid/situacao', (req, res) => {
  const parsed = z.object({ campo: z.enum(Object.keys(SITUACAO)), valor: z.string().max(30) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Situação inválida.' });
  return mutate(req, res, (jr) => { setSituacao(jr, parsed.data.campo, parsed.data.valor); }, { mission: false });
});

// Estudante que já avançou fora da Estuvia: registra as etapas anteriores (com confirmação explícita).
router.post('/:jid/prior-progress', (req, res) => {
  const parsed = z.object({ etapa: z.enum(PRIOR_STAGES.map((s) => s.id)), dataEntrada: date.optional(), confirmo: z.literal(true) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Escolha a etapa e confirme que ela já foi realizada.' });
  return mutate(req, res, (jr) => {
    const declaradas = declarePriorProgress(req.user, jr, parsed.data.etapa, parsed.data);
    audit.log({ action: 'journey.prior-progress', userId: req.user.id, journeyId: req.params.jid, etapa: parsed.data.etapa, missoes: declaradas.length }).catch(() => {});
    return { declaradas };
  }, { mission: false });
});

// Chegada à Espanha (fato externo declarado): ativa as Rodadas 7 e 8.
router.post('/:jid/arrival', (req, res) => {
  const parsed = z.object({ dataEntrada: date, confirmo: z.literal(true) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Informe a data de entrada e confirme a chegada.' });
  return mutate(req, res, (jr) => { registerArrival(req.user, jr, parsed.data); }, { mission: false });
});

// Contatos acadêmicos (UniversityContact) encontrados pelo estudante em fontes oficiais.
const contactSchema = z.object({
  nome: z.string().trim().min(2).max(100),
  cargo: z.string().trim().max(100).optional(),
  email: z.email('E-mail inválido.').max(120).optional().or(z.literal('')),
  fonteUrl: z.url('Informe o link da página oficial onde encontrou o contato.').max(300).refine((u) => u.startsWith('https://'), 'Use um link https da fonte oficial.'),
  duvida: z.string().trim().max(500).optional(),
  enviadoEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  resposta: z.string().trim().max(500).optional(),
}).strict();

router.post('/:jid/contacts', async (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
  if (!findJourney(req.user, req.params.jid)) return res.status(404).json({ error: 'Jornada não encontrada.' });
  const contact = { id: newId(), ...parsed.data, registradoEm: new Date().toISOString() };
  const user = await users.update(req.user.id, (u) => { const j = findJourney(u, req.params.jid); (j.contatos ??= []).push(contact); });
  res.status(201).json({ contatos: findJourney(user, req.params.jid).contatos });
});

router.put('/:jid/contacts/:cid', async (req, res) => {
  const parsed = contactSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
  const jr = findJourney(req.user, req.params.jid);
  if (!jr?.contatos?.some((c) => c.id === req.params.cid)) return res.status(404).json({ error: 'Contato não encontrado.' });
  const user = await users.update(req.user.id, (u) => { Object.assign(findJourney(u, req.params.jid).contatos.find((c) => c.id === req.params.cid), parsed.data); });
  res.json({ contatos: findJourney(user, req.params.jid).contatos });
});

router.delete('/:jid/contacts/:cid', async (req, res) => {
  if (!findJourney(req.user, req.params.jid)) return res.status(404).json({ error: 'Jornada não encontrada.' });
  const user = await users.update(req.user.id, (u) => { const j = findJourney(u, req.params.jid); j.contatos = (j.contatos || []).filter((c) => c.id !== req.params.cid); });
  res.json({ contatos: findJourney(user, req.params.jid).contatos });
});

router.put('/:jid/missions/:id/objectives/:objId', (req, res) => {
  const parsed = z.object({ feito: z.boolean().optional(), valor: z.string().max(300).optional() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.' });
  return mutate(req, res, (jr) => { setObjective(req.user, jr, req.params.id, String(req.params.objId), parsed.data); });
});

router.post('/:jid/missions/:id/complete', (req, res) => {
  const parsed = z.object({ confirmo: z.boolean(), evidencia: z.string().max(200).optional() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Confirme que realizou o procedimento.' });
  return mutate(req, res, (jr) => { completeMission(req.user, jr, req.params.id, parsed.data.confirmo, parsed.data.evidencia); });
});

router.post('/:jid/missions/:id/reopen', (req, res) => mutate(req, res, (jr) => { reopenMission(req.user, jr, req.params.id); }));

router.put('/:jid/missions/:id/state', (req, res) => {
  const parsed = z.object({
    aguardando: z.boolean().optional(),
    naoAplicavel: z.boolean().optional(),
    ignorada: z.boolean().optional(),
    prazo: date.nullable().optional(),
    nota: z.string().max(500).optional(),
    execucao: z.enum(['nao-comecei', 'fazendo', 'ajuda']).nullable().optional(),
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
  return mutate(req, res, (jr) => { setMissionFlags(req.user, jr, req.params.id, { ...parsed.data, prazo: parsed.data.prazo === null ? '' : parsed.data.prazo }); });
});

export default router;
