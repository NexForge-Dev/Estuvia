// Action Confirmation: toda alteração proposta pelo Mentor vira uma PROPOSTA com prévia.
// Nada é gravado até o estudante confirmar; na confirmação as regras são verificadas de novo
// (o estado pode ter mudado) e o resultado real de cada passo é devolvido e auditado.

import crypto from 'node:crypto';
import { executeTool, makeCtx, TOOLS } from './tools/index.js';
import { recordAction } from './memory.js';
import { users } from '../store.js';

const TTL_MS = 30 * 60 * 1000;
const MAX_PER_USER = 20;
// As propostas ficam no registro do estudante (u.mentorPropostas: id → { titulo, passos, criadaEm, expiraEm, contexto }),
// e não na memória do processo: na Vercel, quem confirma pode cair numa instância diferente de quem propôs.
// Uso único: a confirmação remove a proposta numa gravação com controle de versão.
const box = (u) => (u.mentorPropostas && typeof u.mentorPropostas === 'object' ? u.mentorPropostas : (u.mentorPropostas = {}));
const live = (user, now = Date.now()) => Object.entries(user?.mentorPropostas || {}).filter(([, p]) => p.expiraEm >= now);

function sweep(u, now = Date.now()) {
  const b = box(u);
  for (const [id, p] of Object.entries(b)) if (p.expiraEm < now) delete b[id];
  return b;
}

const publicProposal = (id, p) => ({
  id, titulo: p.titulo, expiraEm: new Date(p.expiraEm).toISOString(),
  // "entrada" volta para a tela poder mostrar e editar os valores (são dados do próprio estudante).
  passos: p.passos.map((s, i) => ({ indice: i, ferramenta: s.ferramenta, efeito: TOOLS.get(s.ferramenta)?.efeito, ...s.preview, entrada: s.input, editavel: s.editavel || null })),
  confirmarRotulo: p.confirmarRotulo || 'Confirmar', cancelarRotulo: 'Agora não',
});

/** passos: [{ ferramenta, input, preview, editavel? }] — previews já validados por useTool. */
export async function propose(user, { titulo, passos, contexto = {}, confirmarRotulo }) {
  const id = crypto.randomUUID();
  const now = Date.now();
  const p = { titulo, passos, contexto, confirmarRotulo: confirmarRotulo || null, criadaEm: now, expiraEm: now + TTL_MS };
  await users.update(user.id, (u) => {
    const b = sweep(u, now);
    const mine = Object.entries(b);
    if (mine.length >= MAX_PER_USER) delete b[mine.sort((a, c) => a[1].criadaEm - c[1].criadaEm)[0][0]];
    b[id] = p;
  });
  return publicProposal(id, p);
}

export const getProposal = (user, id) => {
  const hit = live(user).find(([pid]) => pid === id);
  return hit ? publicProposal(id, hit[1]) : null;
};

/** Remove a proposta do registro e devolve o que estava guardado (null se não existia ou expirou). */
async function take(user, id) {
  let taken = null;
  await users.update(user.id, (u) => {
    const b = sweep(u);
    if (b[id]) { taken = b[id]; delete b[id]; }
  });
  return taken;
}

export async function cancel(user, id) {
  const p = await take(user, id);
  if (!p) return false;
  recordAction(user.id, { ferramenta: p.passos.map((s) => s.ferramenta).join('+'), efeito: 'escrita', resumo: p.titulo, resultado: 'cancelada', propostaId: id }).catch(() => {});
  return true;
}

/**
 * Executa a proposta. edicoes: { [indice]: { ...campos } } permite ao estudante ajustar antes
 * (ex.: outro horário, tirar itens da semana). Os campos editados passam pela validação da ferramenta.
 */
export async function confirm(user, id, { edicoes = {} } = {}) {
  const p = await take(user, id); // uso único: impede confirmação dupla, inclusive entre instâncias
  if (!p) return { ok: false, erro: { codigo: 'expirada', mensagem: 'Essa proposta expirou ou já foi usada. Peça de novo e eu preparo outra.', status: 410 } };
  const resultados = [];
  for (const [i, passo] of p.passos.entries()) {
    const ctx = makeCtx(user, p.contexto);
    const input = edicoes[i] ? { ...passo.input, ...edicoes[i] } : passo.input;
    const r = await executeTool(ctx, passo.ferramenta, input);
    resultados.push({ indice: i, ...r });
    await recordAction(user.id, { ferramenta: passo.ferramenta, efeito: 'escrita', resumo: r.ok ? r.resumo : passo.preview?.resumo, resultado: r.ok ? 'executada' : 'recusada', propostaId: id, erro: r.ok ? null : r.erro?.mensagem });
    if (!r.ok) break; // passos seguintes dependem deste
  }
  const ok = resultados.length === p.passos.length && resultados.every((r) => r.ok);
  const feitos = resultados.filter((r) => r.ok).map((r) => r.resumo);
  const falha = resultados.find((r) => !r.ok);
  const naoFeitos = p.passos.length - resultados.filter((r) => r.ok).length;
  return {
    ok,
    resultados,
    texto: [
      ...feitos,
      falha ? `Não consegui concluir: ${falha.erro.mensagem}` : null,
      falha && naoFeitos > 1 ? `Por isso, ${naoFeitos - 1} passo(s) seguinte(s) não foram executados.` : null,
    ].filter(Boolean).join('\n\n'),
  };
}

/** Só para testes: propostas vivas do estudante. */
export const _pendingForTests = (user) => live(user);
