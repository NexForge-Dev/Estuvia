// Memória e controle do estudante sobre o Mentor (user.mentor).
// O Mentor NÃO guarda conversas: a continuidade vem dos dados persistentes da Estuvia
// (jornada, documentos, agenda, finanças) + notas curtas que o estudante autorizou salvar.
//
// user.mentor = {
//   permissoes: { jornada, agenda, financas, documentos, moradia, radar, memoria },  (true = o Mentor pode usar)
//   preferencias: { proativo, tiposAviso: {...} },
//   notas: [{ id, tipo:'pendencia'|'lembrete', texto, documentoId?, missaoId?, journeyId?, criadaEm, resolvidaEm? }],
//   historico: [{ id, em, ferramenta, efeito, resumo, resultado }],   (ações executadas — Audit Log do estudante)
//   dispensados: { [insightId]: isoDate }
// }

import { users, newId, audit } from '../store.js';

export const PERMISSIONS = {
  jornada: 'Jornada, rodadas e missões',
  agenda: 'Agenda AI e compromissos',
  financas: 'Planejamento financeiro e bolsas',
  documentos: 'Situação dos documentos',
  moradia: 'Moradia e viagem',
  radar: 'Radar de Oportunidades',
  memoria: 'Lembrar pendências que você me contar',
};
export const DEFAULT_PERMISSIONS = Object.fromEntries(Object.keys(PERMISSIONS).map((k) => [k, true]));
export const INSIGHT_TYPES = {
  prazo: 'Prazos se aproximando',
  radar: 'Inscrições e alterações oficiais (Radar)',
  missao: 'Missões paradas ou com atenção',
  documentos: 'Documentos pendentes',
  financas: 'Planejamento financeiro',
  bolsa: 'Bolsas que exigem ação',
  chegada: 'Chegada à Espanha e prazos migratórios',
  memoria: 'Pendências que você me contou',
};
const MAX_NOTES = 50;
const MAX_HISTORY = 100;

export function mentorState(user) {
  const m = user.mentor || {};
  return {
    permissoes: { ...DEFAULT_PERMISSIONS, ...(m.permissoes || {}) },
    preferencias: { proativo: true, ...(m.preferencias || {}), tiposAviso: { ...Object.fromEntries(Object.keys(INSIGHT_TYPES).map((k) => [k, true])), ...(m.preferencias?.tiposAviso || {}) } },
    notas: m.notas || [],
    historico: m.historico || [],
    dispensados: m.dispensados || {},
  };
}

const ensure = (u) => {
  u.mentor ??= {};
  u.mentor.notas ??= [];
  u.mentor.historico ??= [];
  u.mentor.dispensados ??= {};
  return u.mentor;
};

export const can = (user, perm) => !perm || mentorState(user).permissoes[perm] !== false;

export async function setPreferences(userId, { permissoes, preferencias }) {
  return users.update(userId, (u) => {
    const m = ensure(u);
    if (permissoes) m.permissoes = { ...(m.permissoes || {}), ...permissoes };
    if (preferencias) m.preferencias = { ...(m.preferencias || {}), ...preferencias, tiposAviso: { ...(m.preferencias?.tiposAviso || {}), ...(preferencias.tiposAviso || {}) } };
    // Desligar a memória apaga o que já estava guardado.
    if (permissoes?.memoria === false) m.notas = [];
  });
}

export async function addNote(userId, note) {
  let saved;
  await users.update(userId, (u) => {
    const m = ensure(u);
    const dup = m.notas.find((n) => !n.resolvidaEm && n.texto === note.texto);
    if (dup) { saved = dup; return; }
    saved = { id: newId(), tipo: 'pendencia', ...note, criadaEm: new Date().toISOString() };
    m.notas.push(saved);
    if (m.notas.length > MAX_NOTES) m.notas = m.notas.slice(-MAX_NOTES);
  });
  return saved;
}

export async function resolveNote(userId, id) {
  let found = null;
  await users.update(userId, (u) => {
    const n = ensure(u).notas.find((x) => x.id === id);
    if (n && !n.resolvidaEm) { n.resolvidaEm = new Date().toISOString(); found = n; }
  });
  return found;
}

export async function deleteNote(userId, id) {
  await users.update(userId, (u) => { const m = ensure(u); m.notas = m.notas.filter((n) => n.id !== id); });
}

export async function clearMemory(userId) {
  await users.update(userId, (u) => { const m = ensure(u); m.notas = []; m.historico = []; m.dispensados = {}; });
  audit.log({ action: 'mentor.memory-cleared', userId }).catch(() => {});
}

export async function dismissInsight(userId, id) {
  await users.update(userId, (u) => { ensure(u).dispensados[id] = new Date().toISOString(); });
}

export const openNotes = (user) => mentorState(user).notas.filter((n) => !n.resolvidaEm);

// ---------- Audit Log ----------
// Toda ação de escrita do Mentor (confirmada ou recusada pelo backend) é registrada em dois lugares:
// no log global (sem conteúdo pessoal) e no histórico do próprio estudante, que ele pode consultar.
export async function recordAction(userId, { ferramenta, efeito, resumo, resultado, propostaId, erro }) {
  const entry = { id: newId(), em: new Date().toISOString(), ferramenta, efeito, resumo: String(resumo || '').slice(0, 200), resultado, ...(erro ? { erro: String(erro).slice(0, 200) } : {}) };
  await users.update(userId, (u) => {
    const m = ensure(u);
    m.historico.push(entry);
    if (m.historico.length > MAX_HISTORY) m.historico = m.historico.slice(-MAX_HISTORY);
  });
  audit.log({ action: `mentor.${resultado}`, userId, ferramenta, efeito, propostaId: propostaId || null }).catch(() => {});
  return entry;
}
