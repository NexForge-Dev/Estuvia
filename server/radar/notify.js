// Alertas personalizados ("Avise-me quando abrir"). Só eventos CONFIRMADOS e publicados geram
// alerta; cada alerta tem uma chave de deduplicação, então a mesma alteração nunca é avisada duas vezes.
//
// Duas origens:
//   onPublished(revisions)  — mudança publicada pelo atualizador ou pela revisão (calendário, requisitos)
//   tick(now)               — marcos de calendário que chegam com o tempo (abertura, fim de prazo,
//                             resultados, confirmação de vaga), calculados das datas oficiais

import { data, newId, hash } from './db.js';
import { todayMadrid, daysBetween, startOfDayMadrid, endOfDayMadrid } from './dates.js';
import { UNIVERSITY_INFO, APPLICATION_CHANNEL } from './registry.js';

export const EVENT_TYPES = {
  calendario: 'Publicação ou alteração do calendário oficial',
  abertura: 'Abertura das candidaturas',
  encerramento: 'Prazo de candidatura perto do fim',
  requisitos: 'Modificação de requisitos ou dados do programa',
  resultados: 'Publicação dos resultados (adjudicações e resultas)',
  confirmacao: 'Abertura do prazo de confirmação de vaga',
  bolsas: 'Abertura de bolsas relacionadas',
};
export const CLOSING_SOON_DAYS = 3;

const fmt = (iso) => (iso ? iso.split('-').reverse().join('/') : 'a confirmar');

function context(opportunity) {
  const d = data();
  const p = d.programs.find((x) => x.id === opportunity.programId);
  const u = UNIVERSITY_INFO[opportunity.universidadeId];
  return { programa: p?.nome || opportunity.programId, universidade: u?.nome || opportunity.universidadeId };
}

function push(sub, opportunity, evento, { titulo, corpo, dados = {}, chave }) {
  const d = data();
  const dedupeKey = hash([sub.userId, opportunity.id, evento, chave]);
  if (d.alerts.some((a) => a.dedupeKey === dedupeKey)) return null;
  const ctx = context(opportunity);
  // Oportunidade em simulação de desenvolvimento: o alerta nasce marcado e é removido junto.
  const demo = Boolean(opportunity.demo);
  const alert = {
    id: newId(), userId: sub.userId, subscriptionId: sub.id, opportunityId: opportunity.id, evento,
    titulo: demo ? `[DEMONSTRATIVO] ${titulo}` : titulo, corpo, ...(demo ? { demo: true } : {}), dados: { ...ctx, anoAcademico: opportunity.anoAcademico, ...dados },
    canal: 'app', criadoEm: new Date().toISOString(), enviadoEm: new Date().toISOString(), lidoEm: null, estado: 'nova', dedupeKey,
  };
  d.alerts.push(alert);
  return alert;
}

const subscribersFor = (evento, filter) => {
  const d = data();
  return d.subscriptions
    .filter((s) => s.ativa !== false && s.eventos.includes(evento))
    .map((s) => ({ sub: s, opp: d.opportunities.find((o) => o.id === s.opportunityId) }))
    .filter(({ opp }) => opp && filter(opp));
};

/** Gera alertas para revisões publicadas. Retorna os alertas criados. */
export function onPublished(revisions) {
  const d = data();
  const created = [];
  // Calendário: agrupa por procedimento/curso para um único alerta por alteração.
  const byCycle = new Map();
  for (const r of revisions.filter((x) => ['AdmissionWindow', 'AdmissionEvent'].includes(x.entidade))) {
    if (!byCycle.has(r.opportunityKey)) byCycle.set(r.opportunityKey, []);
    byCycle.get(r.opportunityKey).push(r);
  }
  for (const [key, revs] of byCycle) {
    const [proc, curso] = key.split(':');
    const windows = d.windows.filter((w) => w.procedimentoId === proc && w.anoAcademico === curso && w.confirmacao === 'confirmado');
    if (!windows.length) continue;
    const novo = revs.every((r) => r.anterior === null || r.campo === 'confirmacao');
    const first = windows.slice().sort((a, b) => a.abertura.localeCompare(b.abertura))[0];
    const fonte = revs[0].evidencia?.url;
    for (const { sub, opp } of subscribersFor('calendario', (o) => o.procedimentoId === proc && o.anoAcademico === curso)) {
      const a = push(sub, opp, 'calendario', {
        titulo: novo ? 'Novas datas publicadas!' : 'Datas oficiais alteradas',
        corpo: novo
          ? `O calendário oficial de candidatura ${curso} para o mestrado que você acompanha foi publicado.`
          : `O calendário oficial ${curso} foi alterado. Confira o que mudou antes de reorganizar sua agenda.`,
        dados: {
          abertura: first.abertura, prazo: first.encerramento, fase: first.fase, fonteUrl: fonte,
          candidaturaUrl: APPLICATION_CHANNEL[proc]?.url,
          mudancas: novo ? null : revs.filter((r) => r.anterior !== null).map((r) => ({ campo: r.campo, de: r.anterior, para: r.novo })),
        },
        chave: revs.map((r) => r.id).sort().join(','),
      });
      if (a) created.push(a);
    }
  }
  // Dados do programa (ficha oficial): requisitos, modalidade, créditos…
  for (const r of revisions.filter((x) => x.entidade === 'Program' && x.impacto !== 'baixo')) {
    for (const { sub, opp } of subscribersFor('requisitos', (o) => o.programId === r.entidadeId)) {
      const a = push(sub, opp, 'requisitos', {
        titulo: 'Dados do programa atualizados',
        corpo: `A ficha oficial mudou: ${r.campo.replace('ficha.', '')} de "${r.anterior ?? '—'}" para "${r.novo ?? '—'}".`,
        dados: { fonteUrl: r.evidencia?.url, campo: r.campo, de: r.anterior, para: r.novo },
        chave: r.id,
      });
      if (a) created.push(a);
    }
  }
  return created;
}

/** Marcos de calendário que dependem da passagem do tempo. Idempotente. */
export function tick(now = Date.now()) {
  const d = data();
  const today = todayMadrid(new Date(now));
  const created = [];
  for (const sub of d.subscriptions.filter((s) => s.ativa !== false)) {
    const opp = d.opportunities.find((o) => o.id === sub.opportunityId);
    if (!opp) continue;
    const since = todayMadrid(new Date(sub.criadaEm));
    const windows = d.windows.filter((w) => w.procedimentoId === opp.procedimentoId && w.anoAcademico === opp.anoAcademico && w.confirmacao === 'confirmado');
    const events = d.events.filter((e) => e.procedimentoId === opp.procedimentoId && e.anoAcademico === opp.anoAcademico && e.confirmacao === 'confirmado');
    const channel = APPLICATION_CHANNEL[opp.procedimentoId];

    for (const w of windows) {
      const open = now >= startOfDayMadrid(w.abertura) && now <= endOfDayMadrid(w.encerramento);
      if (!open) continue;
      if (sub.eventos.includes('abertura') && channel) {
        const a = push(sub, opp, 'abertura', {
          titulo: 'Candidaturas abertas!', corpo: `A Fase ${w.fase} do curso ${opp.anoAcademico} está aberta até ${fmt(w.encerramento)}.`,
          dados: { abertura: w.abertura, prazo: w.encerramento, fase: w.fase, candidaturaUrl: channel.url }, chave: `${w.id}:${w.abertura}`,
        });
        if (a) created.push(a);
      }
      const left = daysBetween(today, w.encerramento);
      if (sub.eventos.includes('encerramento') && left <= CLOSING_SOON_DAYS) {
        const a = push(sub, opp, 'encerramento', {
          titulo: left === 0 ? 'Último dia para se candidatar' : `Faltam ${left} dia(s) para o fim do prazo`,
          corpo: `A candidatura da Fase ${w.fase} termina em ${fmt(w.encerramento)} (horário de Madri). Se já enviou, registre na sua missão.`,
          dados: { prazo: w.encerramento, fase: w.fase, candidaturaUrl: channel?.url }, chave: `${w.id}:${w.encerramento}`,
        });
        if (a) created.push(a);
      }
    }

    for (const e of events) {
      const start = e.inicio || e.fim;
      if (!start || start > today || start < since) continue;
      if (['adjudicacao', 'resultas'].includes(e.tipo) && sub.eventos.includes('resultados') && start === today) {
        const a = push(sub, opp, 'resultados', { titulo: 'Resultado publicado', corpo: `${e.rotulo} (Fase ${e.fase}) — confira na fonte oficial.`, dados: { data: start, fase: e.fase, candidaturaUrl: channel?.url }, chave: `${e.id}:${start}` });
        if (a) created.push(a);
      }
      if (e.tipo === 'confirmacao' && sub.eventos.includes('confirmacao') && today <= (e.fim || start)) {
        const a = push(sub, opp, 'confirmacao', { titulo: 'Prazo de confirmação aberto', corpo: `${e.rotulo}: de ${fmt(e.inicio)} a ${fmt(e.fim)}. Só se aplica se você foi admitido(a) ou está em lista de espera.`, dados: { inicio: e.inicio, prazo: e.fim, fase: e.fase }, chave: `${e.id}:${start}` });
        if (a) created.push(a);
      }
    }
  }
  return created;
}

/** Após uma correção administrativa: avisa quem recebeu alerta com o valor errado. */
export function correctionAlerts(revisionsCorrigidas) {
  const d = data();
  const created = [];
  for (const r of revisionsCorrigidas) {
    const [proc, curso] = (r.opportunityKey || '').split(':');
    const affected = d.alerts.filter((a) => {
      const o = d.opportunities.find((x) => x.id === a.opportunityId);
      return o && ((o.procedimentoId === proc && o.anoAcademico === curso) || r.opportunityKey === `program:${o.programId}`);
    });
    const seen = new Set();
    for (const a of affected) {
      if (seen.has(a.subscriptionId)) continue;
      seen.add(a.subscriptionId);
      const sub = d.subscriptions.find((s) => s.id === a.subscriptionId);
      const opp = d.opportunities.find((o) => o.id === a.opportunityId);
      if (!sub || !opp) continue;
      const alert = push(sub, opp, 'calendario', {
        titulo: 'Correção de informação', corpo: `Corrigimos "${r.campo}": ${r.anterior ?? '—'} → ${r.novo ?? '—'}. Confira a oportunidade e sua agenda.`,
        dados: { campo: r.campo, de: r.anterior, para: r.novo }, chave: `correcao:${r.id}`,
      });
      if (alert) created.push(alert);
    }
  }
  return created;
}
