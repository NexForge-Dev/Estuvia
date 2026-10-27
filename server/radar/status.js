// Estados das oportunidades — calculados SOMENTE por regras determinísticas sobre datas
// verificadas, tipo de procedimento e saúde da fonte. Nenhum texto gerado por IA define estado.
//
// Importante: "vagas ofertadas" nunca implica vagas disponíveis, e a mudança de estado da
// oportunidade nunca significa que o estudante se candidatou.

import { startOfDayMadrid, endOfDayMadrid, todayMadrid, daysBetween } from './dates.js';

export const STATES = {
  'nao-anunciado': { label: 'Não anunciado', tom: 'neutro', descricao: 'Ainda não existe calendário oficial identificado para este ano acadêmico.' },
  previsto: { label: 'Previsto', tom: 'pendente', descricao: 'Há uma previsão institucional, mas a abertura ainda não foi confirmada oficialmente.' },
  anunciadas: { label: 'Inscrições anunciadas', tom: 'info', descricao: 'Existem datas oficiais futuras de candidatura.' },
  abertas: { label: 'Inscrições abertas', tom: 'ok', descricao: 'A janela oficial de candidatura está vigente e o canal de inscrição foi confirmado.' },
  encerradas: { label: 'Encerradas', tom: 'fechado', descricao: 'Terminaram os prazos oficiais deste ano acadêmico.' },
  'em-avaliacao': { label: 'Em avaliação', tom: 'info', descricao: 'Candidaturas encerradas e em análise.' },
  adjudicacoes: { label: 'Adjudicações publicadas', tom: 'info', descricao: 'Listas de adjudicação foram publicadas.' },
  resultas: { label: 'Lista de espera / Resultas', tom: 'pendente', descricao: 'Fase de acompanhamento de vagas e confirmações (listas de resultas).' },
  suspenso: { label: 'Suspenso ou alterado', tom: 'alerta', descricao: 'O edital foi modificado, suspenso ou cancelado.' },
  desatualizado: { label: 'Informação desatualizada', tom: 'alerta', descricao: 'A última verificação não permite confirmar o estado atual.' },
};

// Sem verificação bem-sucedida por este tempo, a informação deixa de ser apresentada como atual.
export const STALE_AFTER_HOURS = 72;

const within = (now, inicio, fim) => (!inicio || now >= startOfDayMadrid(inicio)) && (!fim || now <= endOfDayMadrid(fim));
const lastDate = (items) => items.reduce((max, e) => ((e.fim || e.inicio) > max ? (e.fim || e.inicio) : max), '');

/** Estado de uma fase (janela + eventos da mesma fase). */
export function phaseState(window, events, now = Date.now()) {
  if (window.confirmacao !== 'confirmado') return 'previsto';
  if (within(now, window.abertura, window.encerramento)) return 'abertas';
  if (now < startOfDayMadrid(window.abertura)) return 'anunciadas';
  const end = lastDate(events);
  if (end && now > endOfDayMadrid(end)) return 'encerradas';
  const published = (tipo) => events.some((e) => e.tipo === tipo && now >= startOfDayMadrid(e.inicio || e.fim));
  if (published('resultas')) return 'resultas';
  if (published('adjudicacao')) return 'adjudicacoes';
  if (!end) return 'encerradas';
  return 'em-avaliacao';
}

/**
 * Estado consolidado de uma oportunidade.
 * @param {object} o                { suspensao? }
 * @param {object[]} windows        AdmissionWindow do procedimento/curso
 * @param {object[]} events         AdmissionEvent do procedimento/curso
 * @param {object} health           { ultimaVerificacaoOk?: ISO, falhando?: bool }
 * @param {object} channel          canal oficial de candidatura (ou null)
 */
export function opportunityState(o, windows, events, health = {}, channel = null, now = Date.now()) {
  const fases = windows
    .slice()
    .sort((a, b) => (a.abertura || '').localeCompare(b.abertura || ''))
    .map((w) => {
      const evs = events.filter((e) => e.fase === w.fase);
      let estado = phaseState(w, evs, now);
      // "Abertas" exige canal de inscrição confirmado; sem ele, mostramos como anunciadas.
      if (estado === 'abertas' && !channel) estado = 'anunciadas';
      return { fase: w.fase, estado, abertura: w.abertura, encerramento: w.encerramento, publico: w.publico, confirmacao: w.confirmacao };
    });

  const staleHours = health.ultimaVerificacaoOk ? (now - Date.parse(health.ultimaVerificacaoOk)) / 3600000 : Infinity;
  const pendente = Boolean(health.falhando) || staleHours > 24;
  const base = { fases, atualizacaoPendente: pendente };

  if (o.suspensao) return { ...base, estado: 'suspenso', motivo: o.suspensao.motivo };
  if (windows.length && staleHours > STALE_AFTER_HOURS) return { ...base, estado: 'desatualizado' };

  const pick = (s) => fases.find((f) => f.estado === s);
  const aberta = pick('abertas');
  if (aberta) return { ...base, estado: 'abertas', faseAtual: aberta.fase, prazoFinal: aberta.encerramento };
  const proxima = fases.filter((f) => f.estado === 'anunciadas').sort((a, b) => a.abertura.localeCompare(b.abertura))[0];
  if (proxima) {
    // Durante o pós-candidatura de uma fase, a próxima candidatura é o que o estudante pode fazer.
    return { ...base, estado: 'anunciadas', faseAtual: proxima.fase, proximaAbertura: proxima.abertura, prazoFinal: proxima.encerramento };
  }
  for (const s of ['resultas', 'adjudicacoes', 'em-avaliacao']) {
    const f = fases.slice().reverse().find((x) => x.estado === s);
    if (f) return { ...base, estado: s, faseAtual: f.fase };
  }
  if (fases.some((f) => f.estado === 'previsto')) return { ...base, estado: 'previsto' };
  if (fases.length) return { ...base, estado: 'encerradas' };
  return { ...base, estado: 'nao-anunciado' };
}

/** Próximos marcos oficiais (para cards, alertas e Agenda). */
export function upcoming(windows, events, now = Date.now(), limit = 5) {
  const today = todayMadrid(new Date(now));
  const items = [
    ...windows.filter((w) => w.confirmacao === 'confirmado').flatMap((w) => [
      { tipo: 'abertura', fase: w.fase, data: w.abertura, rotulo: `Abertura da candidatura — Fase ${w.fase}` },
      { tipo: 'encerramento', fase: w.fase, data: w.encerramento, rotulo: `Fim do prazo de candidatura — Fase ${w.fase}` },
    ]),
    ...events.filter((e) => ['adjudicacao', 'resultas', 'confirmacao'].includes(e.tipo)).map((e) => ({ tipo: e.tipo, fase: e.fase, data: e.inicio || e.fim, fim: e.fim, rotulo: e.rotulo })),
  ].filter((i) => i.data && i.data >= today);
  items.sort((a, b) => a.data.localeCompare(b.data));
  return items.slice(0, limit).map((i) => ({ ...i, diasRestantes: daysBetween(today, i.data) }));
}
