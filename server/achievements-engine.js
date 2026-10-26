// Motor de conquistas: regras puras (sem Express, sem DOM).
// Como o resto da jornada, uma conquista vale enquanto o fato que a libera for verdadeiro
// (desfazer a missão ou corrigir a situação a desfaz). O registro em user.conquistas guarda
// só a data da primeira vez e se o estudante já viu a celebração — nunca o estado em si.

import { ACHIEVEMENTS, CATEGORIES, LEVEL_POINTS } from './content/achievements.js';
import { computeJourney } from './journey-engine.js';

const READY_DOC = ['pronto', 'enviado', 'nao-se-aplica'];

// Fatos agregados do estudante: uma conquista ganha em qualquer jornada conta para a pessoa.
export function collectFacts(user, now = new Date()) {
  const journeys = (user.journeys || []).map((jr) => computeJourney(user, jr, now));
  const marcos = new Set(journeys.flatMap((j) => j.marcos.filter((m) => m.conquistado).map((m) => m.id)));
  const situacoes = journeys.map((j) => j.situacao || {});
  const docs = user.documents || {};
  const p = user.profile || {};
  return {
    jornadas: journeys.length,
    missoesConcluidas: journeys.reduce((s, j) => s + (j.contagem?.concluida || 0), 0),
    rodadaConcluida: journeys.some((j) => j.rodadas.some((r) => !r.transversal && r.status === 'concluida')),
    jornadaConcluida: journeys.some((j) => j.status === 'concluida'),
    marcos,
    algumaSituacao: (campo, valores) => situacoes.some((s) => valores.includes(s[campo])),
    algumDado: (campo) => (user.journeys || []).some((jr) => Boolean(jr.dados?.[campo])),
    perfilCompleto: Boolean(p.nacionalidade && p.paisResidencia && p.formacao && p.espanhol),
    docsProntos: ['passaporte', 'diploma', 'historico'].every((id) => READY_DOC.includes(docs[id])),
    planoViavel: journeys.some((j) => j.financas?.viavel),
    bolsaConcedida: (user.scholarshipApps || []).some((a) => a.status === 'concedida'),
    larEscolhido: (user.housing || []).some((x) => x.status === 'escolhida'),
    rotaEscolhida: (user.travel?.opcoes || []).some((o) => o.escolhida),
  };
}

// Cada regra devolve true/false; as com `meta` devolvem o valor atual do contador.
const RULES = {
  'primeiro-passo': (f) => f.jornadas >= 1,
  'perfil-completo': (f) => f.perfilCompleto,
  'primeira-missao': (f) => f.missoesConcluidas >= 1,
  'dez-missoes': (f) => f.missoesConcluidas,
  'primeira-rodada': (f) => f.rodadaConcluida,
  'plano-b': (f) => f.jornadas >= 2,
  'docs-prontos': (f) => f.docsProntos,
  'candidatura-enviada': (f) => f.marcos.has('primeira-candidatura') || f.algumaSituacao('adjudicacao', ['aguardando', 'admitido', 'lista-espera', 'nao-admitido', 'exige-acao']),
  admitido: (f) => f.algumaSituacao('adjudicacao', ['admitido']),
  'vaga-garantida': (f) => f.marcos.has('vaga-conquistada') || f.algumaSituacao('matricula', ['vaga-confirmada', 'reservada', 'matriculado']),
  matriculado: (f) => f.marcos.has('matricula-concluida') || f.algumaSituacao('matricula', ['matriculado']),
  'plano-viavel': (f) => f.planoViavel,
  'bolsa-concedida': (f) => f.bolsaConcedida,
  'visto-aprovado': (f) => f.marcos.has('visto-aprovado') || f.algumaSituacao('visto', ['aprovado']),
  'lar-escolhido': (f) => f.larEscolhido,
  'rota-tracada': (f) => f.rotaEscolhida,
  chegou: (f) => f.marcos.has('chegou') || f.algumDado('dataEntrada'),
  residente: (f) => f.marcos.has('estadia-regularizada'),
  'travessia-completa': (f) => f.jornadaConcluida,
};

export function evaluate(user, now = new Date()) {
  const facts = collectFacts(user, now);
  const registro = user.conquistas || {};
  return ACHIEVEMENTS.map((a) => {
    const raw = RULES[a.id]?.(facts);
    const conquistada = a.meta ? raw >= a.meta : Boolean(raw);
    const reg = registro[a.id];
    return {
      ...a,
      categoriaLabel: CATEGORIES[a.categoria],
      pontos: LEVEL_POINTS[a.nivel],
      conquistada,
      em: conquistada ? reg?.em || null : null,
      nova: conquistada && !reg?.vistaEm,
      progresso: a.meta ? { atual: Math.min(raw, a.meta), meta: a.meta } : null,
    };
  });
}

// Registra a data da primeira conquista. Devolve o registro atualizado e se algo mudou.
export function syncRecord(registro = {}, list, nowIso = new Date().toISOString()) {
  const next = { ...registro };
  let changed = false;
  list.filter((a) => a.conquistada && !next[a.id]).forEach((a) => { next[a.id] = { em: nowIso }; changed = true; });
  return { registro: next, changed };
}

export function markSeen(registro = {}, ids, nowIso = new Date().toISOString()) {
  const next = { ...registro };
  ids.filter((id) => next[id] && !next[id].vistaEm).forEach((id) => { next[id] = { ...next[id], vistaEm: nowIso }; });
  return next;
}

export function summarize(list) {
  const won = list.filter((a) => a.conquistada);
  return {
    total: list.length,
    conquistadas: won.length,
    pontos: won.reduce((s, a) => s + a.pontos, 0),
    pontosPossiveis: list.reduce((s, a) => s + a.pontos, 0),
    categorias: Object.entries(CATEGORIES).map(([id, label]) => ({ id, label })),
  };
}
