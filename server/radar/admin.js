// Operações do painel administrativo do Radar: auditoria, revisão e correção.
// Toda correção manual gera OpportunityRevision (validacao: 'corrigida') e reavalia os alertas.

import { data, save, newId } from './db.js';
import { approveReview, applyCalendar, runSource, openReview, ensureOpportunitiesForCycle } from './pipeline.js';
import { correctionAlerts, onPublished, tick } from './notify.js';
import { parseAcademicYear } from './dates.js';
import { STALE_AFTER_HOURS } from './status.js';

const err = (status, message) => Object.assign(new Error(message), { status });

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
    demo: d.windows.some((w) => w.demo),
  };
}

export async function addSource(input) {
  const d = data();
  if (d.sources.some((s) => s.id === input.id)) throw err(409, 'Já existe uma fonte com este identificador.');
  const source = { ...input, metodo: 'revisao-manual', conector: null, estado: 'manual', ativa: true, falhasSeguidas: 0, ultimaConsulta: null, ultimaVerificacaoOk: null, criadaManualmente: true };
  d.sources.push(source);
  await save();
  return source;
}

export async function setSourceAvailability(id, indisponivel, motivo) {
  const s = data().sources.find((x) => x.id === id);
  if (!s) throw err(404, 'Fonte não encontrada.');
  s.indisponivelManual = Boolean(indisponivel);
  s.motivoIndisponivel = indisponivel ? motivo || 'Marcada manualmente como indisponível.' : null;
  if (indisponivel) s.estado = 'falhando';
  await save();
  return s;
}

export const runNow = (id, opts) => runSource(id, opts);

export async function resolveReview(id, decisao, por, nota) {
  const r = data().reviews.find((x) => x.id === id);
  if (!r) throw err(404, 'Revisão não encontrada.');
  if (r.status !== 'aberta') throw err(409, 'Esta revisão já foi resolvida.');
  let result = null;
  if (decisao === 'aprovar') {
    if (!r.proposta) throw err(400, 'Esta revisão não tem alteração a aplicar: use "Corrigir" ou "Descartar".');
    result = approveReview(r, por);
  } else {
    r.status = 'rejeitada';
    r.resolvidaEm = new Date().toISOString();
    r.por = por;
  }
  r.nota = nota || null;
  await save();
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
  await save();
  return result;
}

/** Correção pontual de um campo (janela, evento ou programa). */
export async function correct({ entidade, id, campo, valor, motivo, url }, por) {
  const d = data();
  const coll = { AdmissionWindow: d.windows, AdmissionEvent: d.events, Program: d.programs, Opportunity: d.opportunities }[entidade];
  if (!coll) throw err(400, 'Entidade inválida.');
  const target = coll.find((x) => x.id === id);
  if (!target) throw err(404, 'Registro não encontrado.');
  const editable = { AdmissionWindow: ['abertura', 'encerramento', 'confirmacao'], AdmissionEvent: ['inicio', 'fim', 'rotulo'], Program: ['nome', 'webPropria'], Opportunity: ['suspensao'] }[entidade];
  if (!editable.includes(campo)) throw err(400, `Campo não editável: ${campo}.`);
  if (['abertura', 'encerramento', 'inicio', 'fim'].includes(campo) && !/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw err(400, 'Data no formato AAAA-MM-DD.');
  if (!motivo || !url) throw err(400, 'Informe o motivo e a URL da evidência oficial.');
  const anterior = target[campo];
  target[campo] = campo === 'suspensao' ? (valor ? { motivo: String(valor), em: new Date().toISOString(), url } : null) : valor;
  const key = target.procedimentoId ? `${target.procedimentoId}:${target.anoAcademico}` : entidade === 'Program' ? `program:${target.id}` : null;
  const rev = { id: newId(), entidade, entidadeId: id, opportunityKey: key, campo, anterior: anterior ?? null, novo: target[campo] ?? null, evidencia: { url, nota: motivo }, em: new Date().toISOString(), validacao: 'corrigida', impacto: 'alto', por, ...(target.demo ? { demo: true } : {}) };
  d.revisions.push(rev);
  const alerts = correctionAlerts([rev]);
  tick();
  await save();
  return { revisao: rev, alertasReavaliados: alerts.length };
}

/** Recalcula alertas de calendário (após correções/republicação). */
export async function republish() {
  const created = tick();
  await save();
  return { alertas: created.length };
}

// ---------- Ambiente de desenvolvimento: simulação claramente identificada ----------

export async function simulateDev({ anoAcademico, abertura, encerramento }, por) {
  const d = data();
  const curso = parseAcademicYear(anoAcademico);
  if (!curso) throw err(400, 'Ano acadêmico inválido.');
  if (d.windows.some((w) => w.anoAcademico === curso.rotulo && !w.demo)) throw err(409, 'Já existe calendário oficial para este curso — a simulação não sobrescreve dados reais.');
  const source = d.sources.find((s) => s.id === 'dua-calendario');
  const parsed = { tipo: 'calendario', procedimentoId: 'dua-masteres', anoAcademico: curso.rotulo, avisos: [], fases: [{ fase: 1, titulo: 'FASE 1 — SIMULAÇÃO (DEMONSTRATIVO)', publico: 'estrangeiros', confirmacao: 'confirmado', itens: [{ ordem: 1, tipo: 'candidatura', rotulo: 'Simulação', texto: 'DADO DEMONSTRATIVO', inicio: abertura, fim: encerramento }] }] };
  const result = applyCalendar(parsed, { source, snapshot: { id: 'demo', url: 'demo://simulacao', versao: 0 }, force: true, por: `${por} (simulação)` });
  for (const w of d.windows.filter((x) => x.anoAcademico === curso.rotulo)) w.demo = true;
  for (const o of d.opportunities.filter((x) => x.anoAcademico === curso.rotulo)) o.demo = true;
  for (const r of result.revisions) r.demo = true;
  const alerts = onPublished(result.revisions);
  tick();
  await save();
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
  await save();
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
      motivo: `${item.instituicao} — ${item.titulo}${item.prazo ? ` (prazo informado: ${item.prazo})` : ''}. Conferir em ${item.linkOficial}.${match.match ? ` Já existe no Radar: ${match.programa}.` : ''}`,
      proposta: null,
    });
    if (data().reviews.length > before) n += 1;
  }
  await save();
  return { importados: n, total: feed.length };
}
