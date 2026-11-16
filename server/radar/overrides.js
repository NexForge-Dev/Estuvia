// Correções administrativas ("overrides") que sobrevivem às coletas.
//
// Cada entidade corrigida guarda, por campo, em `overrides[campo]`:
//   { valor, valorFonte, fonteAtualizadaEm, por, em, motivo, url }
// - `entity[campo]` é sempre o valor EFETIVO (o do admin, enquanto a correção existir);
// - `valorFonte` é o último valor que a fonte oficial publicou para esse campo. As coletas continuam
//   atualizando `valorFonte` normalmente, mas nunca o valor efetivo de um campo corrigido;
// - remover a correção restaura o valor da fonte mais recente.
// Tudo fica no próprio objeto (coluna `data` jsonb das tabelas radar_*): nenhuma migração de banco.

import { sameJson } from '../json-equal.js';

/** Campos que o painel pode corrigir, por entidade. */
export const EDITABLE = {
  Program: ['nome', 'webPropria', 'duaCodigo', 'codigo', 'modalidade'],
  Opportunity: ['suspensao'],
  AdmissionWindow: ['abertura', 'encerramento', 'confirmacao'],
  AdmissionEvent: ['inicio', 'fim', 'rotulo'],
};

export const isOverridden = (entity, campo) => Boolean(entity?.overrides && Object.hasOwn(entity.overrides, campo));

/**
 * Aplica um valor vindo da fonte a um campo. Sem correção: grava o valor. Com correção: só atualiza
 * `valorFonte` (o valor efetivo continua o do admin). Devolve o que aconteceu, para o histórico.
 */
export function applyCollectedField(entity, campo, valor, { em = new Date().toISOString() } = {}) {
  if (isOverridden(entity, campo)) {
    const o = entity.overrides[campo];
    const mudouNaFonte = !sameJson(o.valorFonte, valor);
    if (mudouNaFonte) { o.valorFonte = valor ?? null; o.fonteAtualizadaEm = em; }
    return { protegido: true, mudouNaFonte, anterior: o.valorFonte, efetivo: entity[campo] };
  }
  const mudou = !sameJson(entity[campo], valor);
  if (mudou) entity[campo] = valor;
  return { protegido: false, mudou };
}

/**
 * Substitui o Object.assign das coletas: copia os campos coletados para a entidade, sem tocar nos corrigidos.
 * Devolve os campos protegidos cujo valor na fonte mudou (para registrar "fonte divergente" no histórico).
 */
export function mergeCollected(entity, valores, opts = {}) {
  const divergentes = [];
  for (const [campo, valor] of Object.entries(valores)) {
    if (campo === 'overrides' || campo === 'id' || valor === undefined) continue;
    const r = applyCollectedField(entity, campo, valor, opts);
    if (r.protegido && r.mudouNaFonte) divergentes.push({ campo, valorFonte: valor ?? null, efetivo: entity[campo] });
  }
  return divergentes;
}

/** Registra (ou atualiza) uma correção. Na primeira vez, o valor atual é o da fonte e fica guardado. */
export function setOverride(entity, campo, valor, { por, motivo, url, em = new Date().toISOString() }) {
  entity.overrides ??= {};
  const anterior = entity[campo] ?? null;
  const valorFonte = isOverridden(entity, campo) ? entity.overrides[campo].valorFonte : anterior;
  entity.overrides[campo] = { valor: valor ?? null, valorFonte: valorFonte ?? null, por, em, motivo, url };
  entity[campo] = valor ?? null;
  return { anterior, valorFonte };
}

/** Remove a correção e volta ao valor mais recente da fonte. */
export function clearOverride(entity, campo) {
  if (!isOverridden(entity, campo)) return null;
  const o = entity.overrides[campo];
  delete entity.overrides[campo];
  if (!Object.keys(entity.overrides).length) delete entity.overrides;
  const anterior = entity[campo] ?? null;
  entity[campo] = o.valorFonte ?? null;
  return { anterior, restaurado: o.valorFonte ?? null, override: o };
}

/** Todas as correções vigentes, para o painel. */
export function listOverrides(d) {
  const out = [];
  const add = (entidade, x, rotulo) => {
    for (const [campo, o] of Object.entries(x.overrides || {})) {
      out.push({ entidade, id: x.id, rotulo, campo, valorAdmin: o.valor, valorFonte: o.valorFonte, fonteAtualizadaEm: o.fonteAtualizadaEm || null, divergeDaFonte: !sameJson(o.valor, o.valorFonte), por: o.por, em: o.em, motivo: o.motivo, url: o.url });
    }
  };
  for (const p of d.programs) add('Program', p, p.nome);
  for (const o of d.opportunities) add('Opportunity', o, `${o.programId} · ${o.anoAcademico}`);
  for (const w of d.windows) add('AdmissionWindow', w, `${w.procedimentoId} ${w.anoAcademico} · Fase ${w.fase}`);
  for (const e of d.events) add('AdmissionEvent', e, `${e.procedimentoId} ${e.anoAcademico} · ${e.rotulo || e.tipo}`);
  return out.sort((a, b) => String(b.em).localeCompare(String(a.em)));
}
