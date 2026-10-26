// Contrato comum das ferramentas do Mentor.
//
// defineTool({
//   name, descricao, efeito: 'leitura' | 'rascunho' | 'escrita', permissao, entrada (zod), saida (texto do contrato),
//   run(ctx, input)      → dados                      (leitura / rascunho: executa na hora)
//   preview(ctx, input)  → { resumo, detalhes[], avisos[] }  (escrita: valida e descreve, SEM alterar nada)
//   execute(ctx, input)  → { resumo, dados }          (escrita: só depois da confirmação do estudante)
// })
//
// Erros de regra de negócio usam ToolError (o motor da jornada já lança JourneyError com status).

import { users } from '../../store.js';
import { computeJourney, recordUnlocks, diffEvents, journeyForClient, JourneyError } from '../../journey-engine.js';
import { DEFAULT_AVAILABILITY } from '../../agenda-engine.js';
import { todayIn } from '../parse.js';

export class ToolError extends Error {
  constructor(codigo, mensagem, status = 400) { super(mensagem); this.codigo = codigo; this.status = status; }
}

export const EFFECTS = {
  leitura: 'Somente leitura',
  rascunho: 'Gera um rascunho (nada é enviado)',
  escrita: 'Altera seus dados na Estuvia — pede confirmação',
};

export function defineTool(t) {
  if (!t.name || !t.entrada || !EFFECTS[t.efeito]) throw new Error(`Ferramenta inválida: ${t.name}`);
  if (t.efeito === 'escrita' && (!t.preview || !t.execute)) throw new Error(`Ferramenta de escrita sem preview/execute: ${t.name}`);
  if (t.efeito !== 'escrita' && !t.run) throw new Error(`Ferramenta sem run: ${t.name}`);
  return { confirmacao: t.efeito === 'escrita', ...t };
}

// ---------- Contexto de execução ----------

export function makeCtx(user, contexto = {}, now = new Date()) {
  const fresh = users.findById(user.id) || user;
  const tz = fresh.agenda?.disponibilidade?.fuso || DEFAULT_AVAILABILITY.fuso;
  return { user: fresh, contexto, now, tz, today: todayIn(tz, now) };
}

export const pickJourney = (user, jid) => (user.journeys || []).find((j) => j.id === jid) || (user.journeys || [])[0] || null;

export function requireJourney(ctx, jid) {
  const jr = pickJourney(ctx.user, jid || ctx.contexto.journeyId);
  if (!jr) throw new ToolError('sem-jornada', 'Você ainda não criou uma jornada. Crie a primeira em "Minhas Jornadas".', 409);
  return jr;
}

export const flatMissions = (j) => j.rodadas.flatMap((r) => r.missoes);

/**
 * Mesma sequência de routes/journey.js (mutate): aplica numa cópia, o motor valida,
 * registra desbloqueios (idempotente), persiste e devolve eventos de feedback.
 */
export async function mutateJourney(ctx, jid, apply, { missionId = null } = {}) {
  const original = pickJourney(ctx.user, jid);
  if (!original) throw new ToolError('sem-jornada', 'Jornada não encontrada.', 404);
  const draft = structuredClone(original);
  const before = computeJourney(ctx.user, original);
  try {
    apply(draft);
  } catch (err) {
    if (err instanceof JourneyError) throw new ToolError('regra', err.message, err.status);
    throw err;
  }
  recordUnlocks(draft, computeJourney(ctx.user, draft));
  const saved = await users.update(ctx.user.id, (u) => {
    const target = u.journeys.find((j) => j.id === original.id);
    for (const k of ['missions', 'dados', 'situacao', 'desbloqueios', 'progressoAnterior']) if (draft[k] !== undefined) target[k] = draft[k];
  });
  ctx.user = saved;
  const after = computeJourney(saved, saved.journeys.find((j) => j.id === original.id));
  return { journey: journeyForClient(after), eventos: diffEvents(before, after, missionId) };
}

/** Valida sem persistir: roda a mutação numa cópia e devolve o erro do motor, se houver. */
export function dryRunJourney(ctx, jid, apply) {
  const original = pickJourney(ctx.user, jid);
  if (!original) throw new ToolError('sem-jornada', 'Jornada não encontrada.', 404);
  const draft = structuredClone(original);
  try { apply(draft); } catch (err) {
    if (err instanceof JourneyError) throw new ToolError('regra', err.message, err.status);
    throw err;
  }
  return draft;
}

export const eur = (v) => `€ ${Math.round(v).toLocaleString('pt-BR')}`;
