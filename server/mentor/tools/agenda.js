// Ferramentas da Agenda: disponibilidade, eventos, proposta de semana e criação/alteração de eventos.
// Usa o mesmo motor da Agenda (agenda-engine) e as mesmas regras de validação da rota /planner.
import { z } from 'zod';
import { users, newId } from '../../store.js';
import { computeJourney } from '../../journey-engine.js';
import { suggestWeek, staleSuggestions, DEFAULT_AVAILABILITY, mondayOf, CATEGORY_BY_ROUND } from '../../agenda-engine.js';
import { missionById } from '../../content/rounds.js';
import { data as radarData } from '../../radar/db.js';
import { defineTool, ToolError, pickJourney } from './core.js';
import { addDays, addMinutes, toMin, dateLabel, timeLabel, weekday } from '../parse.js';

export const CATEGORIES = ['academico', 'documentacao', 'financeiro', 'visto', 'viagem', 'pessoal'];
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido.');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');
export const eventInput = z.object({
  titulo: z.string().trim().min(1).max(120),
  categoria: z.enum(CATEGORIES),
  data: date, inicio: time, fim: time,
  nota: z.string().max(300).optional(),
  journeyId: z.string().max(60).optional(),
  missaoId: z.string().regex(/^\d\.\d{1,2}$/).optional(),
  bolsaId: z.string().max(60).optional(),
  prioridade: z.enum(['critica', 'alta', 'normal', 'aguardando']).optional(),
  motivo: z.string().max(200).optional(),
}).strict().refine((e) => e.fim > e.inicio, { message: 'O fim precisa ser depois do início.' });

export const availability = (user) => ({ ...DEFAULT_AVAILABILITY, ...(user.agenda?.disponibilidade || {}) });
const overlaps = (a, b) => a.data === b.data && toMin(a.inicio) < toMin(b.fim) && toMin(b.inicio) < toMin(a.fim);

/** Prazo oficial vindo do Radar: a data não pode ser movida (só o horário do lembrete). */
export function isOfficialDeadline(userId, event) {
  if (event.origem !== 'radar') return false;
  try { return radarData().agendaLinks.some((l) => l.userId === userId && l.plannerEventId === event.id && l.oficial); } catch { return false; }
}

/** Primeiro horário livre no dia, dentro das janelas de disponibilidade e sem conflito. */
export function findSlot(user, dia, minutos, preferido = null) {
  const av = availability(user);
  const busy = (user.planner || []).filter((e) => e.data === dia);
  const free = (inicio) => { const fim = addMinutes(inicio, minutos); return fim > inicio && !busy.some((e) => overlaps({ data: dia, inicio, fim }, e)) ? { inicio, fim } : null; };
  if (preferido) {
    const s = free(preferido);
    return s ? { ...s, foraDaDisponibilidade: !av.dias.includes(weekday(dia)) || !av.janelas.some((w) => preferido >= w.inicio && s.fim <= w.fim), conflito: null } : { inicio: preferido, fim: addMinutes(preferido, minutos), conflito: busy.find((e) => overlaps({ data: dia, inicio: preferido, fim: addMinutes(preferido, minutos) }, e)) };
  }
  if (av.dias.includes(weekday(dia))) {
    for (const w of av.janelas) {
      for (let m = toMin(w.inicio); m + minutos <= toMin(w.fim); m += 15) {
        const s = free(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
        if (s) return { ...s, foraDaDisponibilidade: false, conflito: null };
      }
    }
  }
  const s = free(av.janelas[0]?.inicio || '09:00') || free('19:00');
  return s ? { ...s, foraDaDisponibilidade: true, conflito: null } : null;
}

const publicEvent = (e, userId) => ({ id: e.id, titulo: e.titulo, categoria: e.categoria, data: e.data, inicio: e.inicio, fim: e.fim, origem: e.origem, missaoId: e.missaoId || null, journeyId: e.journeyId || null, prazoOficial: isOfficialDeadline(userId, e) });

export const getUserAvailability = defineTool({
  name: 'get_user_availability', efeito: 'leitura', permissao: 'agenda',
  descricao: 'Disponibilidade cadastrada na Agenda (dias, janelas de horário, horas semanais, fuso) e horários livres de um dia.',
  entrada: z.object({ dia: date.optional() }).strict(),
  saida: '{ disponibilidade, cadastrada(bool), livresNoDia?[] }',
  run: (ctx, { dia }) => {
    const av = availability(ctx.user);
    const out = { disponibilidade: av, cadastrada: Boolean(ctx.user.agenda?.disponibilidade) };
    if (dia) out.primeiroHorarioLivre = findSlot(ctx.user, dia, 30);
    return out;
  },
});

function deadlinesBetween(user, de, ate) {
  const out = [];
  for (const jr of user.journeys || []) {
    const j = computeJourney(user, jr);
    for (const p of j.prazos) if (p.data >= de && p.data <= ate) out.push({ titulo: p.titulo, data: p.data, origem: p.origem, missao: p.label || null, journeyId: jr.id });
  }
  for (const a of user.scholarshipApps || []) if (a.prazo && a.prazo >= de && a.prazo <= ate && !['concedida', 'negada', 'desisti'].includes(a.status)) out.push({ titulo: `Prazo da bolsa: ${a.nome}`, data: a.prazo, origem: 'declarado', missao: null });
  return out.sort((a, b) => a.data.localeCompare(b.data));
}

export const getCalendarEvents = defineTool({
  name: 'get_calendar_events', efeito: 'leitura', permissao: 'agenda',
  descricao: 'Compromissos da agenda e prazos (oficiais, previstos e declarados) num intervalo de datas. Padrão: hoje até 7 dias.',
  entrada: z.object({ de: date.optional(), ate: date.optional(), busca: z.string().max(80).optional() }).strict(),
  saida: '{ de, ate, eventos[{ id, titulo, data, inicio, fim, origem, prazoOficial }], prazos[{ titulo, data, origem }] }',
  run: (ctx, { de, ate, busca }) => {
    const from = de || ctx.today;
    const to = ate || addDays(from, 7);
    let eventos = (ctx.user.planner || []).filter((e) => e.data >= from && e.data <= to);
    if (busca) eventos = eventos.filter((e) => e.titulo.toLowerCase().includes(busca.toLowerCase()));
    eventos.sort((a, b) => `${a.data}${a.inicio}`.localeCompare(`${b.data}${b.inicio}`));
    return { de: from, ate: to, eventos: eventos.map((e) => publicEvent(e, ctx.user.id)), prazos: deadlinesBetween(ctx.user, from, to) };
  },
});

export const proposeWeeklySchedule = defineTool({
  name: 'propose_weekly_schedule', efeito: 'leitura', permissao: 'agenda',
  descricao: 'Monta (sem salvar) uma proposta de semana com as missões abertas, prioridades, prazos e horários livres, usando a Agenda. Para salvar, use create_calendar_event com os itens aprovados.',
  entrada: z.object({ semana: date.optional().describe('Qualquer dia da semana desejada; padrão: semana atual.'), journeyId: z.string().max(60).optional(), missaoId: z.string().regex(/^\d\.\d{1,2}$/).optional() }).strict(),
  saida: '{ semana, proposta[{ titulo, data, inicio, fim, categoria, prioridade, motivo, missaoId }], naoAgendadas[], resumo{ livreMin, planejadoMin, metaMin }, prazos[] }',
  run: (ctx, { semana, journeyId, missaoId }) => {
    const start = mondayOf(semana || ctx.today);
    const s = suggestWeek(ctx.user, start, ctx.today, { journeyId, missaoId });
    return { ...s, prazos: deadlinesBetween(ctx.user, start, addDays(start, 6)), tarefasPendentes: s.proposta.filter((p) => p.missaoId || p.bolsaId).length + s.naoAgendadas.length };
  },
});

function describeEvent(e, today) {
  return `${e.titulo} - ${dateLabel(e.data, today)}, ${timeLabel(e.inicio)}–${timeLabel(e.fim)}`;
}

export const createCalendarEvent = defineTool({
  name: 'create_calendar_event', efeito: 'escrita', permissao: 'agenda',
  descricao: 'Cria um ou mais compromissos na Agenda (ex.: tarefa de uma missão ou a proposta da semana aprovada). Não marca nada como concluído.',
  entrada: z.object({ itens: z.array(eventInput).min(1).max(40), origem: z.enum(['mentor', 'agenda-ai']).default('mentor') }).strict(),
  saida: '{ resumo, criados[{ id, titulo, data, inicio, fim }] }',
  preview: (ctx, { itens }) => {
    const avisos = [];
    for (const e of itens) {
      if (e.data < ctx.today) throw new ToolError('data-passada', `A data ${e.data.split('-').reverse().join('/')} já passou.`);
      if (e.journeyId && !pickJourney(ctx.user, e.journeyId)) throw new ToolError('entrada', 'Jornada inválida.');
      const c = (ctx.user.planner || []).find((x) => overlaps(e, x));
      if (c) avisos.push(`"${e.titulo}" coincide com "${c.titulo}" (${timeLabel(c.inicio)}–${timeLabel(c.fim)}).`);
    }
    if ((ctx.user.planner || []).length + itens.length > 500) throw new ToolError('limite', 'Limite de atividades da agenda atingido.', 409);
    return { resumo: itens.length === 1 ? `Adicionar à sua agenda: ${describeEvent(itens[0], ctx.today)}.` : `Adicionar ${itens.length} blocos à sua agenda.`, detalhes: itens.length > 1 ? itens.map((e) => describeEvent(e, ctx.today)) : [], avisos };
  },
  execute: async (ctx, { itens, origem }) => {
    const created = itens.map((e) => ({ id: newId(), origem: origem === 'agenda-ai' ? 'agenda-ai' : 'mentor', ...e, criadoEm: new Date().toISOString() }));
    ctx.user = await users.update(ctx.user.id, (u) => { (u.planner ??= []).push(...created); });
    return { resumo: created.length === 1 ? `Pronto: adicionei "${created[0].titulo}" em ${dateLabel(created[0].data, ctx.today)}, às ${timeLabel(created[0].inicio)}.` : `Pronto: adicionei ${created.length} blocos à sua agenda.`, dados: { criados: created.map((e) => publicEvent(e, ctx.user.id)) } };
  },
});

export const updateCalendarEvent = defineTool({
  name: 'update_calendar_event', efeito: 'escrita', permissao: 'agenda',
  descricao: 'Move ou ajusta um compromisso existente (data e/ou horário). Prazos oficiais vindos do Radar não podem mudar de data.',
  entrada: z.object({ eventoId: z.string().max(60), data: date.optional(), inicio: time.optional(), fim: time.optional(), titulo: z.string().trim().min(1).max(120).optional() }).strict(),
  saida: '{ resumo, evento }',
  preview: (ctx, input) => {
    const e = (ctx.user.planner || []).find((x) => x.id === input.eventoId);
    if (!e) throw new ToolError('nao-encontrado', 'Não encontrei esse compromisso na sua agenda.', 404);
    if (input.data && input.data !== e.data && isOfficialDeadline(ctx.user.id, e)) throw new ToolError('prazo-oficial', `"${e.titulo}" é um prazo oficial: a data não pode ser alterada. Posso mover as tarefas de preparação.`, 409);
    const next = { ...e, ...Object.fromEntries(Object.entries(input).filter(([k, v]) => k !== 'eventoId' && v !== undefined)) };
    if (!input.fim && input.inicio) next.fim = addMinutes(input.inicio, toMin(e.fim) - toMin(e.inicio));
    if (next.fim <= next.inicio) throw new ToolError('entrada', 'O fim precisa ser depois do início.');
    if (next.data < ctx.today) throw new ToolError('data-passada', 'Essa data já passou.');
    const c = (ctx.user.planner || []).find((x) => x.id !== e.id && overlaps(next, x));
    return { resumo: `Mover "${e.titulo}" de ${dateLabel(e.data, ctx.today)} ${timeLabel(e.inicio)} para ${dateLabel(next.data, ctx.today)} ${timeLabel(next.inicio)}.`, detalhes: [], avisos: c ? [`Coincide com "${c.titulo}".`] : [], _next: next };
  },
  execute: async (ctx, input) => {
    const { _next: next } = updateCalendarEvent.preview(ctx, input);
    ctx.user = await users.update(ctx.user.id, (u) => {
      const e = u.planner.find((x) => x.id === input.eventoId);
      Object.assign(e, { data: next.data, inicio: next.inicio, fim: next.fim, titulo: next.titulo, editadoEm: new Date().toISOString() });
    });
    return { resumo: `Pronto: "${next.titulo}" agora está em ${dateLabel(next.data, ctx.today)}, às ${timeLabel(next.inicio)}.`, dados: { evento: publicEvent(next, ctx.user.id) } };
  },
});

export const replanWeek = defineTool({
  name: 'replan_week', efeito: 'escrita', permissao: 'agenda',
  descricao: 'Reorganiza a semana: remove os blocos futuros criados pela Agenda/Mentor nesta semana (e os que perderam sentido) e salva uma nova distribuição. Compromissos do estudante e prazos oficiais ficam intactos.',
  entrada: z.object({ semana: date.optional() }).strict(),
  saida: '{ resumo, removidos[], criados[] }',
  preview: (ctx, { semana }) => {
    const p = planReplan(ctx, semana);
    return { resumo: `Reorganizar a semana: liberar ${p.remover.length} bloco(s) antigos e salvar ${p.nova.proposta.length} bloco(s) novos.`, detalhes: p.nova.proposta.slice(0, 12).map((e) => describeEvent(e, ctx.today)), avisos: p.nova.naoAgendadas.length ? [`${p.nova.naoAgendadas.length} tarefa(s) não couberam nesta semana.`] : [] };
  },
  execute: async (ctx, { semana }) => {
    const p = planReplan(ctx, semana);
    const ids = new Set(p.remover.map((e) => e.id));
    const created = p.nova.proposta.map((e) => ({ id: newId(), origem: 'agenda-ai', ...pickEvent(e), criadoEm: new Date().toISOString() }));
    ctx.user = await users.update(ctx.user.id, (u) => { u.planner = (u.planner || []).filter((e) => !ids.has(e.id)); u.planner.push(...created); });
    return { resumo: `Pronto: reorganizei a semana com ${created.length} bloco(s).`, dados: { removidos: p.remover.length, criados: created.map((e) => publicEvent(e, ctx.user.id)) } };
  },
});

const pickEvent = (e) => Object.fromEntries(Object.entries({ titulo: e.titulo, categoria: e.categoria, data: e.data, inicio: e.inicio, fim: e.fim, journeyId: e.journeyId, missaoId: e.missaoId, bolsaId: e.bolsaId, prioridade: e.prioridade, motivo: e.motivo }).filter(([, v]) => v !== undefined));

function planReplan(ctx, semana) {
  const start = mondayOf(semana || ctx.today);
  const end = addDays(start, 6);
  const stale = new Set(staleSuggestions(ctx.user, ctx.today).map((s) => s.id));
  const remover = (ctx.user.planner || []).filter((e) => stale.has(e.id) || (['agenda-ai', 'mentor'].includes(e.origem) && e.missaoId && e.data >= ctx.today && e.data >= start && e.data <= end));
  const ids = new Set(remover.map((e) => e.id));
  const virtual = { ...ctx.user, planner: (ctx.user.planner || []).filter((e) => !ids.has(e.id)) };
  return { remover, nova: suggestWeek(virtual, start, ctx.today) };
}

/** Converte a proposta da Agenda nos itens aceitos por create_calendar_event. */
export const proposalToItems = (proposta) => proposta.map(pickEvent);

export const categoryForMission = (id) => CATEGORY_BY_ROUND[missionById(id)?.rodada] || 'pessoal';

export default [getUserAvailability, getCalendarEvents, proposeWeeklySchedule, createCalendarEvent, updateCalendarEvent, replanWeek];
