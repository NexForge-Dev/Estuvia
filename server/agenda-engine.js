// Agenda: planejador da jornada. Regras determinísticas e explicáveis:
// prioriza (crítica → alta → normal → aguardando resposta), respeita a disponibilidade
// e os compromissos existentes, e propõe blocos que o estudante aprova ou edita.
// Nunca marca missões como concluídas e só planeja missões liberadas pela progressão (bloqueadas ficam de fora;
// o calendário nunca desbloqueia nada).

import { computeJourney } from './journey-engine.js';
import { missionById } from './content/rounds.js';

export const CATEGORY_BY_ROUND = { 1: 'academico', 2: 'documentacao', 3: 'academico', 4: 'financeiro', 5: 'visto', 6: 'viagem', 7: 'pessoal', 8: 'documentacao', 9: 'financeiro' };

export const DEFAULT_AVAILABILITY = {
  dias: [1, 2, 3, 4, 5],                           // 1 = segunda … 7 = domingo
  janelas: [{ inicio: '09:00', fim: '11:00' }],     // horários livres em cada dia disponível
  horasSemanais: 5,
  preferencia: 'curtas',                            // curtas: blocos de até 45 min · longas: até 120 min
  fuso: 'America/Sao_Paulo',
};

// "Hoje" no fuso escolhido pelo estudante (à noite no Brasil o UTC já está no dia seguinte).
export function todayFor(user, now = new Date()) {
  const fuso = user?.agenda?.disponibilidade?.fuso || DEFAULT_AVAILABILITY.fuso;
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); } catch { return now.toISOString().slice(0, 10); }
}

const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekday = (iso) => ((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
export const mondayOf = (iso) => addDays(iso, 1 - weekday(iso));
const PRIORITY_ORDER = { critica: 0, alta: 1, normal: 2, aguardando: 3 };
const PRIORITY_LABEL = { critica: 'Crítica', alta: 'Alta', normal: 'Normal', aguardando: 'Aguardando resposta' };

// Lista de trabalho: missões abertas de todas as jornadas + tarefas de bolsas.
export function workItems(user, today) {
  const items = [];
  for (const jr of user.journeys || []) {
    const j = computeJourney(user, jr);
    const sigla = j.destino.universidade?.sigla || 'Jornada';
    for (const m of j.rodadas.flatMap((r) => r.missoes)) {
      if (m.opcional && m.objetivosFeitos === 0) continue;
      const base = { journeyId: jr.id, missaoId: m.id, jornada: sigla, categoria: CATEGORY_BY_ROUND[m.rodada] };
      if (['atencao', 'em-andamento', 'disponivel'].includes(m.status)) {
        const restante = m.objetivosTotal ? 1 - m.objetivosFeitos / m.objetivosTotal : 1;
        const prioridade = m.prioridade === 'critica' ? 'critica' : m.prioridade === 'alta' ? 'alta' : 'normal';
        items.push({
          ...base,
          titulo: `Missão ${m.label} - ${m.titulo}`,
          minutos: Math.max(15, Math.round(((m.duracaoMin || 60) * restante) / 15) * 15),
          prioridade,
          prazo: m.prazo?.data || null,
          motivo: prioridade === 'critica' ? (m.prazo ? `Prazo em ${m.prazo.diasRestantes} dia(s)` : 'Ação urgente após mudança na sua situação') : m.status === 'atencao' ? 'Missão com atenção necessária' : m.status === 'em-andamento' ? 'Continuar o que você começou' : m.trilha && !j.rodadas.find((r) => r.numero === m.rodada)?.desbloqueada ? `Preparação antecipada: ${m.trilha.titulo}` : 'Disponível agora',
          rodada: m.rodada,
        });
      } else if (m.status === 'aguardando') {
        items.push({ ...base, titulo: `Verificar resposta: Missão ${m.label}`, minutos: 15, prioridade: 'aguardando', prazo: m.prazo?.data || null, motivo: 'Depende de terceiros: só conferir se houve resposta', rodada: m.rodada });
      }
    }
  }
  for (const app of user.scholarshipApps || []) {
    if (['concedida', 'negada', 'desisti'].includes(app.status) && !(app.tarefas || []).some((t) => !t.feito)) continue;
    const pend = (app.tarefas || []).filter((t) => !t.feito);
    if (!pend.length) continue;
    const dias = app.prazo ? Math.ceil((new Date(`${app.prazo}T23:59:59Z`) - new Date(`${today}T12:00:00Z`)) / 86400000) : null;
    items.push({
      titulo: `Bolsa ${app.nome} - ${pend[0].texto}`, minutos: 45, categoria: 'financeiro', bolsaId: app.id,
      prioridade: dias !== null && dias <= 7 ? 'critica' : dias !== null && dias <= 30 ? 'alta' : 'normal',
      prazo: app.prazo || null, motivo: app.prazo ? `Prazo do edital em ${dias} dia(s)` : 'Tarefa de candidatura à bolsa', rodada: 9,
    });
  }
  items.sort((a, b) => PRIORITY_ORDER[a.prioridade] - PRIORITY_ORDER[b.prioridade] || (a.prazo || '9999').localeCompare(b.prazo || '9999') || a.rodada - b.rodada);
  return items;
}

export function suggestWeek(user, weekStart, today = todayFor(user), { journeyId, missaoId } = {}) {
  const av = { ...DEFAULT_AVAILABILITY, ...(user.agenda?.disponibilidade || {}) };
  const start = mondayOf(weekStart);
  const maxBlock = av.preferencia === 'longas' ? 120 : 45;
  let budget = Math.round((Number(av.horasSemanais) || 5) * 60);
  const busy = (user.planner || []).filter((e) => e.data >= start && e.data <= addDays(start, 6));
  const free = [];
  for (let d = 0; d < 7; d++) {
    const date = addDays(start, d);
    if (date < today || !av.dias.includes(weekday(date))) continue;
    for (const w of av.janelas) {
      let s = toMin(w.inicio);
      const end = toMin(w.fim);
      // Recorta os horários já ocupados por compromissos do estudante.
      const taken = busy.filter((e) => e.data === date).map((e) => [toMin(e.inicio), toMin(e.fim)]).sort((a, b) => a[0] - b[0]);
      for (const [ts, te] of taken) {
        if (te <= s || ts >= end) continue;
        if (ts > s) free.push({ date, s, e: ts });
        s = Math.max(s, te);
      }
      if (s < end) free.push({ date, s, e: end });
    }
  }

  const proposal = [];
  const focus = Boolean(missaoId);
  let queue = workItems(user, today).map((x) => ({ ...x, restante: x.minutos }));
  // Foco numa missão: só ela, em blocos distribuídos ao longo dos dias (um por dia).
  if (focus) queue = queue.filter((q) => q.missaoId === missaoId && (!journeyId || q.journeyId === journeyId));
  // Bloco fixo de revisão no último dia disponível da semana (só no planejamento geral).
  const reviewSlot = focus ? null : [...free].reverse().find((f) => f.e - f.s >= 20);
  if (reviewSlot) {
    proposal.push({ titulo: 'Conferir pendências e planejar a próxima semana', categoria: 'pessoal', data: reviewSlot.date, inicio: toTime(reviewSlot.e - 20), fim: toTime(reviewSlot.e), prioridade: 'normal', motivo: 'Revisão semanal' });
    reviewSlot.e -= 20;
    budget -= 20;
  }
  const usedDays = new Set();
  for (const slot of free) {
    if (focus && usedDays.has(slot.date)) continue;
    let cursor = slot.s;
    while (cursor + 15 <= slot.e && budget >= 15) {
      const item = queue.find((q) => q.restante > 0 && (!q.prazo || q.prazo >= slot.date));
      if (!item) break;
      const len = Math.min(item.restante, maxBlock, slot.e - cursor, budget);
      if (len < 15) break;
      proposal.push({
        titulo: item.titulo, categoria: item.categoria, data: slot.date, inicio: toTime(cursor), fim: toTime(cursor + len),
        journeyId: item.journeyId, missaoId: item.missaoId, bolsaId: item.bolsaId, prioridade: item.prioridade, prioridadeLabel: PRIORITY_LABEL[item.prioridade], motivo: item.motivo,
      });
      item.restante -= len;
      cursor += len;
      budget -= len;
      if (focus) { usedDays.add(slot.date); break; }
    }
  }
  proposal.sort((a, b) => `${a.data}${a.inicio}`.localeCompare(`${b.data}${b.inicio}`));
  const naoAgendadas = queue.filter((q) => q.restante > 0).map((q) => ({ titulo: q.titulo, prioridade: q.prioridade, prazo: q.prazo }));
  const livreMin = free.reduce((s, f) => s + (f.e - f.s), 0);
  return {
    semana: start,
    disponibilidade: av,
    proposta: proposal,
    naoAgendadas,
    resumo: { livreMin, planejadoMin: proposal.reduce((s, p) => s + (toMin(p.fim) - toMin(p.inicio)), 0), metaMin: Math.round((Number(av.horasSemanais) || 5) * 60) },
  };
}

// Replanejamento: remove blocos sugeridos futuros que deixaram de fazer sentido
// (missão concluída, bloqueada ou aguardando terceiros) e explica o porquê.
export function staleSuggestions(user, today = todayFor(user)) {
  const states = new Map();
  for (const jr of user.journeys || []) {
    const j = computeJourney(user, jr);
    j.rodadas.flatMap((r) => r.missoes).forEach((m) => states.set(`${jr.id}:${m.id}`, m));
  }
  const removed = [];
  for (const e of user.planner || []) {
    if (e.origem !== 'agenda-ai' || e.data < today || !e.missaoId) continue;
    const m = states.get(`${e.journeyId}:${e.missaoId}`);
    if (!m) { removed.push({ id: e.id, titulo: e.titulo, motivo: 'Jornada removida' }); continue; }
    if (e.titulo.startsWith('Verificar resposta')) { if (m.status !== 'aguardando') removed.push({ id: e.id, titulo: e.titulo, motivo: 'A missão não está mais aguardando resposta' }); continue; }
    if (m.status === 'concluida') removed.push({ id: e.id, titulo: e.titulo, motivo: 'Missão já concluída' });
    else if (m.status === 'bloqueada') removed.push({ id: e.id, titulo: e.titulo, motivo: `Bloqueada: depende de ${m.bloqueadaPor.map((b) => b.label || b.titulo).join(', ')}` });
    else if (m.status === 'aguardando') removed.push({ id: e.id, titulo: e.titulo, motivo: 'Aguardando terceiros, o bloco vira uma verificação curta' });
    else if (m.status === 'nao-aplicavel') removed.push({ id: e.id, titulo: e.titulo, motivo: 'Não se aplica mais' });
  }
  return removed;
}

export const isMission = (id) => Boolean(missionById(id));
