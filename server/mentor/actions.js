// Action Confirmation: toda alteração proposta pelo Mentor vira uma PROPOSTA com prévia.
// Nada é gravado até o estudante confirmar; na confirmação as regras são verificadas de novo
// (o estado pode ter mudado) e o resultado real de cada passo é devolvido e auditado.

import crypto from 'node:crypto';
import { executeTool, makeCtx, TOOLS } from './tools/index.js';
import { recordAction } from './memory.js';

const TTL_MS = 30 * 60 * 1000;
const MAX_PER_USER = 20;
const pending = new Map(); // id → { userId, titulo, passos[{ ferramenta, input, preview }], criadaEm, expiraEm, contexto }

function sweep(now = Date.now()) {
  for (const [id, p] of pending) if (p.expiraEm < now) pending.delete(id);
}

const publicProposal = (id, p) => ({
  id, titulo: p.titulo, expiraEm: new Date(p.expiraEm).toISOString(),
  // "entrada" volta para a tela poder mostrar e editar os valores (são dados do próprio estudante).
  passos: p.passos.map((s, i) => ({ indice: i, ferramenta: s.ferramenta, efeito: TOOLS.get(s.ferramenta)?.efeito, ...s.preview, entrada: s.input, editavel: s.editavel || null })),
  confirmarRotulo: p.confirmarRotulo || 'Confirmar', cancelarRotulo: 'Agora não',
});

/** passos: [{ ferramenta, input, preview, editavel? }] — previews já validados por useTool. */
export function propose(user, { titulo, passos, contexto = {}, confirmarRotulo }) {
  sweep();
  const mine = [...pending.entries()].filter(([, p]) => p.userId === user.id);
  if (mine.length >= MAX_PER_USER) pending.delete(mine.sort((a, b) => a[1].criadaEm - b[1].criadaEm)[0][0]);
  const id = crypto.randomUUID();
  const now = Date.now();
  const p = { userId: user.id, titulo, passos, contexto, confirmarRotulo, criadaEm: now, expiraEm: now + TTL_MS };
  pending.set(id, p);
  return publicProposal(id, p);
}

export const getProposal = (user, id) => {
  sweep();
  const p = pending.get(id);
  return p && p.userId === user.id ? publicProposal(id, p) : null;
};

export function cancel(user, id) {
  const p = pending.get(id);
  if (!p || p.userId !== user.id) return false;
  pending.delete(id);
  recordAction(user.id, { ferramenta: p.passos.map((s) => s.ferramenta).join('+'), efeito: 'escrita', resumo: p.titulo, resultado: 'cancelada', propostaId: id }).catch(() => {});
  return true;
}

/**
 * Executa a proposta. edicoes: { [indice]: { ...campos } } permite ao estudante ajustar antes
 * (ex.: outro horário, tirar itens da semana). Os campos editados passam pela validação da ferramenta.
 */
export async function confirm(user, id, { edicoes = {} } = {}) {
  sweep();
  const p = pending.get(id);
  if (!p || p.userId !== user.id) return { ok: false, erro: { codigo: 'expirada', mensagem: 'Essa proposta expirou ou já foi usada. Peça de novo e eu preparo outra.', status: 410 } };
  pending.delete(id); // uso único: impede confirmação dupla
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

export const _pendingForTests = pending;
