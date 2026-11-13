// Operações do painel administrativo do Radar: auditoria, revisão e correção.
// Toda correção manual vira uma correção protegida (overrides.js: as coletas não a sobrescrevem), gera
// OpportunityRevision (validacao: 'corrigida') e reavalia os alertas. Toda gravação é confirmada (commit()).

import { data, save, newId, reloadRadarStore } from './db.js';
import { EDITABLE, setOverride, clearOverride, listOverrides, isOverridden } from './overrides.js';
import { sameJson } from '../json-equal.js';
import { approveReview, applyCalendar, runSource, openReview, ensureOpportunitiesForCycle } from './pipeline.js';
import { correctionAlerts, onPublished, tick } from './notify.js';
import { parseAcademicYear } from './dates.js';
import { STALE_AFTER_HOURS } from './status.js';

const err = (status, message) => Object.assign(new Error(message), { status });

// Grava e confirma. Se o banco recusar, descarta a alteração da memória (recarrega) e responde 503: o painel
// nunca mostra "salvo" para algo que não foi gravado, e a memória não fica com dados que o banco não tem.
async function commit() {
  try {
    await save();
  } catch (e) {
    await reloadRadarStore().catch((x) => console.error('[radar] falha ao recarregar depois do erro:', x.message));
    throw err(503, `Não foi gravado (o banco recusou): ${e.message}`);
  }
}

export function overview(now = Date.now()) {
  const d = data();
  const stale = d.sources.filter((s) => s.metodo === 'html-publico' && (!s.ultimaVerificacaoOk || now - Date.parse(s.ultimaVerificacaoOk) > STALE_AFTER_HOURS * 3600000));
  return {
    fontes: d.sources,
    execucoes: d.runs.slice(-60).reverse(),
    erros: d.runs.filter((r) => r.resultado === 'erro').slice(-30).reverse(),
    revisoes: d.reviews.slice().reverse().slice(0, 100),
    pendentes: d.reviews.filter((r) => r.status === 'aberta').length,
    desatualizadas: stale.map((s) => ({ id: s.id, titulo: s.titulo, ultimaVerificacaoOk: s.ultimaVerificacaoOk })),
    programasSemFicha: d.programs.filter((p) => !p.ficha).length,
    totais: { programas: d.programs.length, oportunidades: d.opportunities.length, janelas: d.windows.length, eventos: d.events.length, assinaturas: d.subscriptions.length, alertas: d.alerts.length, historico: d.revisions.length },
    historico: d.revisions.slice(-80).reverse(),
    correcoes: listOverrides(d),
    demo: d.windows.some((w) => w.demo),
  };
}

export async function addSource(input) {
  const d = data();
  if (d.sources.some((s) => s.id === input.id)) throw err(409, 'Já existe uma fonte com este identificador.');
  const source = { ...input, metodo: 'revisao-manual', conector: null, estado: 'manual', ativa: true, falhasSeguidas: 0, ultimaConsulta: null, ultimaVerificacaoOk: null, criadaManualmente: true };
  d.sources.push(source);
  await commit();
  return source;
}

export async function setSourceAvailability(id, indisponivel, motivo) {
  const s = data().sources.find((x) => x.id === id);
  if (!s) throw err(404, 'Fonte não encontrada.');
  s.indisponivelManual = Boolean(indisponivel);
  s.motivoIndisponivel = indisponivel ? motivo || 'Marcada manualmente como indisponível.' : null;
  if (indisponivel) s.estado = 'falhando';
  await commit();
  return s;
}

export const runNow = (id, opts) => runSource(id, opts);

export async function resolveReview(id, decisao, por, nota, { antigoId = null } = {}) {
  const r = data().reviews.find((x) => x.id === id);
  if (!r) throw err(404, 'Revisão não encontrada.');
  if (r.status !== 'aberta') throw err(409, 'Esta revisão já foi resolvida.');
  let result = null;
  if (decisao === 'aprovar') {
    if (!r.proposta) throw err(400, 'Esta revisão não tem alteração a aplicar: use "Corrigir" ou "Descartar".');
    if (r.proposta.kind === 'reconciliacao') r.decisaoAntigoId = antigoId || r.proposta.antigoId;
    result = approveReview(r, por);
  } else {
    r.status = 'rejeitada';
    r.resolvidaEm = new Date().toISOString();
    r.por = por;
    // "Não é o mesmo mestrado": a próxima coleta não volta a sugerir este par.
    if (r.proposta?.kind === 'reconciliacao') {
      for (const cid of r.proposta.candidatos) {
        const c = data().programs.find((x) => x.id === cid);
        if (c) c.reconciliacaoRecusada = [...new Set([...(c.reconciliacaoRecusada || []), r.proposta.novoId])];
      }
    }
  }
  r.nota = nota || null;
  await commit();
  return { review: r, revisoes: result?.revisions?.length || 0 };
}

/** Registro manual de calendário (ex.: resolução publicada no BOJA). Sempre com URL da fonte. */
export async function registerCalendar({ sourceId, anoAcademico, procedimentoId = 'dua-masteres', url, fases, previsto = false }, por) {
  const d = data();
  const source = d.sources.find((s) => s.id === sourceId);
  if (!source) throw err(400, 'Fonte inválida.');
  const curso = parseAcademicYear(anoAcademico);
  if (!curso) throw err(400, 'Ano acadêmico inválido (ex.: 2027/2028).');
  for (const f of fases) {
    for (const v of [f.abertura, f.encerramento]) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw err(400, 'Datas no formato AAAA-MM-DD.');
      if (Number(v.slice(0, 4)) !== curso.inicio) throw err(400, `A data ${v} não pertence ao procedimento do curso ${curso.rotulo} (esperado ano ${curso.inicio}).`);
    }
    if (f.encerramento < f.abertura) throw err(400, 'O encerramento precisa ser depois da abertura.');
  }
  const parsed = {
    tipo: 'calendario', procedimentoId, anoAcademico: curso.rotulo, avisos: [],
    fases: fases.map((f) => ({
      fase: f.fase, titulo: f.titulo || `Fase ${f.fase}`, publico: f.publico || (f.fase === 1 ? 'estrangeiros' : 'todos'), confirmacao: previsto ? 'previsto' : 'confirmado',
      itens: [{ ordem: 1, tipo: 'candidatura', rotulo: 'Plazo de entrega de solicitudes', texto: `Registrado manualmente a partir de ${url}`, inicio: f.abertura, fim: f.encerramento }, ...(f.eventos || [])],
    })),
  };
  const snapshot = { id: newId(), sourceId, chave: `${sourceId}:manual`, url, versao: 1, coletadoEm: new Date().toISOString(), hash: null, conteudo: parsed, manual: true, por };
  d.snapshots.push(snapshot);
  const exists = d.windows.some((w) => w.procedimentoId === procedimentoId && w.anoAcademico === curso.rotulo);
  let result;
  if (exists) {
    // Alterar um calendário publicado nunca é direto: vai para a fila, mesmo vindo do painel.
    openReview({ tipo: 'alteracao-critica', sourceId, snapshotId: snapshot.id, motivo: `Registro manual altera o calendário publicado de ${curso.rotulo}. Confirme a alteração.`, proposta: { kind: 'calendar', parsed } });
    result = { revisao: true };
  } else {
    result = applyCalendar(parsed, { source, snapshot, force: true, por });
    onPublished(result.revisions);
  }
  ensureOpportunitiesForCycle(curso.rotulo);
  await commit();
  return result;
}

/** Correção pontual de um campo (janela, evento ou programa). */
const COLLECTION = (d) => ({ AdmissionWindow: d.windows, AdmissionEvent: d.events, Program: d.programs, Opportunity: d.opportunities });
const opportunityKeyOf = (entidade, target) => (target.procedimentoId ? `${target.procedimentoId}:${target.anoAcademico}` : entidade === 'Program' ? `program:${target.id}` : entidade === 'Opportunity' ? target.id : null);

function findTarget(entidade, id) {
  const coll = COLLECTION(data())[entidade];
  if (!coll) throw err(400, 'Entidade inválida.');
  const target = coll.find((x) => x.id === id);
  if (!target) throw err(404, 'Registro não encontrado.');
  return target;
}

/**
 * Correção manual protegida: o valor do admin passa a valer e as coletas seguintes não o sobrescrevem
 * (só atualizam o "valor da fonte", visível no painel). Exige motivo e URL de evidência.
 */
export async function correct({ entidade, id, campo, valor, motivo, url }, por) {
  const target = findTarget(entidade, id);
  if (!EDITABLE[entidade].includes(campo)) throw err(400, `Campo não editável: ${campo}. Editáveis: ${EDITABLE[entidade].join(', ')}.`);
  if (['abertura', 'encerramento', 'inicio', 'fim'].includes(campo) && valor !== null && !/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw err(400, 'Data no formato AAAA-MM-DD.');
  if (!motivo || !url) throw err(400, 'Informe o motivo e a URL da evidência oficial.');
  const em = new Date().toISOString();
  const efetivo = campo === 'suspensao' ? (valor ? { motivo: String(valor), em, url } : null) : valor;
  const { anterior, valorFonte } = setOverride(target, campo, efetivo, { por, motivo, url, em });
  const rev = { id: newId(), entidade, entidadeId: id, opportunityKey: opportunityKeyOf(entidade, target), campo, anterior: anterior ?? null, novo: target[campo] ?? null, valorFonte: valorFonte ?? null, evidencia: { url, nota: motivo }, em, validacao: 'corrigida', impacto: 'alto', por, ...(target.demo ? { demo: true } : {}) };
  data().revisions.push(rev);
  const alerts = correctionAlerts([rev]);
  tick();
  await commit();
  return { revisao: rev, alertasReavaliados: alerts.length, protegido: true };
}

/** Remove uma correção manual: o campo volta ao valor mais recente da fonte. Fica registrado no histórico. */
export async function clearCorrection({ entidade, id, campo, motivo }, por) {
  const target = findTarget(entidade, id);
  if (!isOverridden(target, campo)) throw err(404, 'Este campo não tem correção manual.');
  const r = clearOverride(target, campo);
  const rev = { id: newId(), entidade, entidadeId: id, opportunityKey: opportunityKeyOf(entidade, target), campo, anterior: r.anterior, novo: r.restaurado, evidencia: { nota: motivo || 'Correção manual removida: volta o valor da fonte.', url: r.override.url }, em: new Date().toISOString(), validacao: 'correcao-removida', impacto: 'medio', por };
  data().revisions.push(rev);
  const alerts = correctionAlerts([rev]);
  tick();
  await commit();
  return { revisao: rev, alertasReavaliados: alerts.length };
}

/** Correções vigentes (valor do admin × valor atual da fonte). */
export const corrections = () => listOverrides(data());

/** Histórico completo de uma entidade (todas as revisões, inclusive invalidadas, mais antigas primeiro). */
export function entityHistory(entidade, id) {
  const d = data();
  const target = COLLECTION(d)[entidade]?.find((x) => x.id === id) || null;
  const ids = new Set([id, ...(target?.aliases || [])]);
  return {
    entidade, id, existe: Boolean(target), rotulo: target?.nome || target?.titulo || target?.rotulo || id,
    correcoes: Object.entries(target?.overrides || {}).map(([campo, o]) => ({ campo, ...o })),
    revisoes: d.revisions.filter((r) => r.entidade === entidade && ids.has(r.entidadeId)).sort((a, b) => String(a.em).localeCompare(String(b.em))),
  };
}

/** Revisões que registram "mudança" sem mudança (antes = depois), ainda não invalidadas. Só leitura. */
export const suspectRevisions = () => data().revisions.filter((r) => !r.invalidada && sameJson(r.anterior, r.novo));

/**
 * Marca uma revisão como inválida (ex.: alteração registrada por engano). Nada é apagado: a revisão continua no
 * histórico, com quem invalidou, quando e por quê.
 */
export async function invalidateRevision(id, motivo, por) {
  const r = data().revisions.find((x) => x.id === id);
  if (!r) throw err(404, 'Revisão não encontrada.');
  if (r.invalidada) throw err(409, 'Esta revisão já está invalidada.');
  if (!motivo || motivo.length < 10) throw err(400, 'Explique por que a revisão é inválida.');
  r.invalidada = { em: new Date().toISOString(), por, motivo, validacaoAnterior: r.validacao };
  r.validacao = 'invalidada';
  await commit();
  return { revisao: r };
}

/** Recalcula alertas de calendário (após correções/republicação). */
export async function republish() {
  const created = tick();
  await commit();
  return { alertas: created.length };
}

// ---------- Ambiente de desenvolvimento: simulação claramente identificada ----------

export async function simulateDev({ anoAcademico, abertura, encerramento }, por) {
  const d = data();
  const curso = parseAcademicYear(anoAcademico);
  if (!curso) throw err(400, 'Ano acadêmico inválido.');
  if (d.windows.some((w) => w.anoAcademico === curso.rotulo && !w.demo)) throw err(409, 'Já existe calendário oficial para este curso, a simulação não sobrescreve dados reais.');
  const source = d.sources.find((s) => s.id === 'dua-calendario');
  const parsed = { tipo: 'calendario', procedimentoId: 'dua-masteres', anoAcademico: curso.rotulo, avisos: [], fases: [{ fase: 1, titulo: 'FASE 1: SIMULAÇÃO (DEMONSTRATIVO)', publico: 'estrangeiros', confirmacao: 'confirmado', itens: [{ ordem: 1, tipo: 'candidatura', rotulo: 'Simulação', texto: 'DADO DEMONSTRATIVO', inicio: abertura, fim: encerramento }] }] };
  const result = applyCalendar(parsed, { source, snapshot: { id: 'demo', url: 'demo://simulacao', versao: 0 }, force: true, por: `${por} (simulação)` });
  for (const w of d.windows.filter((x) => x.anoAcademico === curso.rotulo)) w.demo = true;
  for (const o of d.opportunities.filter((x) => x.anoAcademico === curso.rotulo)) o.demo = true;
  for (const r of result.revisions) r.demo = true;
  const alerts = onPublished(result.revisions);
  tick();
  await commit();
  return { alertas: alerts.length };
}

export async function clearDemo() {
  const d = data();
  const demoCycles = new Set(d.windows.filter((w) => w.demo).map((w) => w.anoAcademico));
  d.windows = d.windows.filter((w) => !w.demo);
  d.events = d.events.filter((e) => !demoCycles.has(e.anoAcademico) || !e.snapshotId || e.snapshotId !== 'demo');
  d.revisions = d.revisions.filter((r) => !r.demo);
  d.alerts = d.alerts.filter((a) => !a.demo);
  for (const o of d.opportunities) delete o.demo;
  await commit();
  return { ciclos: [...demoCycles] };
}

/** Itens da Comunidade verificados pela moderação → fila de revisão (nunca publicação direta). */
export async function importCommunityFeed() {
  let feed = [];
  try {
    const mod = await import('../community-engine.js');
    feed = (await mod.communityRadarFeed?.()) || [];
  } catch {
    return { importados: 0, indisponivel: true };
  }
  const { findOfficialMatch } = await import('./service.js');
  let n = 0;
  for (const item of feed) {
    const match = findOfficialMatch({ link: item.linkOficial, universidadeId: item.local?.universidadeId, titulo: item.titulo });
    const before = data().reviews.length;
    openReview({
      tipo: 'comunidade', sourceId: 'comunidade', snapshotId: null, impacto: 'medio', chave: `comunidade:${item.postId}:${item.verificadaEm}`,
      motivo: `${item.instituicao} - ${item.titulo}${item.prazo ? ` (prazo informado: ${item.prazo})` : ''}. Conferir em ${item.linkOficial}.${match.match ? ` Já existe no Radar: ${match.programa}.` : ''}`,
      proposta: null,
    });
    if (data().reviews.length > before) n += 1;
  }
  await commit();
  return { importados: n, total: feed.length };
}
