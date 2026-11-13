// Atualizador de fontes: coleta → snapshot (hash) → extração → validação → comparação →
// revisão ou publicação → notificações.
//
// Regras de publicação (determinísticas):
//   - extração incerta ou ciclo inconsistente      → fila de revisão; nada é publicado
//   - calendário de um ano acadêmico ainda inexistente, extraído sem incertezas da fonte
//     primária                                      → publicado como "confirmado em fonte oficial"
//   - alteração de datas de candidatura já publicadas (alteração crítica) → revisão obrigatória
//   - conflito com dado de fonte de autoridade maior (ex.: BOJA) → revisão; segue-se a autoridade
//   - demais alterações (eventos, dados de catálogo) → publicadas com revisão no histórico
// Toda alteração gera OpportunityRevision com evidência (fonte, snapshot, trecho original).

import { broadcast } from '../events.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { data, save, newId, hash, radarFile } from './db.js';
import { politeFetch, FetchError } from './http.js';
import { SOURCE_SEED, UNIVERSITY_INFO, COLLECTION_HOSTS } from './registry.js';
import { nextAcademicYear } from './dates.js';
import * as duaCalendar from './connectors/dua-calendar.js';
import * as duaCatalog from './connectors/dua-catalog.js';
import * as ugrCatalog from './connectors/ugr-catalog.js';
import * as ugrProgram from './connectors/ugr-program.js';
import * as duaProgram from './connectors/dua-program.js';
import { onPublished } from './notify.js';

export const CONNECTORS = { 'dua-calendar': duaCalendar, 'dua-catalog': duaCatalog, 'ugr-catalog': ugrCatalog, 'ugr-program': ugrProgram, 'dua-program': duaProgram };

/** Página pública do DUA que abre a ficha do máster (o modal é carregado pelo próprio portal). */
export const duaSheetUrl = (codigo) => `https://www.juntadeandalucia.es/economiaconocimientoempresasyuniversidad/sguit/?c_peticion=${encodeURIComponent(codigo)}&d=mo_catalogo_top.php&q=masteres`;

const nowIso = (now) => new Date(now).toISOString();
const sourceById = (id) => data().sources.find((s) => s.id === id);
export const opportunityId = (programId, curso) => `${programId}--${curso.replace('/', '-')}`;

// ---------- Registro de fontes ----------

export function ensureSources() {
  const d = data();
  for (const seed of SOURCE_SEED) {
    const existing = d.sources.find((s) => s.id === seed.id);
    if (existing) Object.assign(existing, { ...seed, ...pickRuntime(existing) });
    else d.sources.push({ ...seed, estado: seed.metodo === 'html-publico' ? 'nunca-verificada' : 'manual', ultimaConsulta: null, ultimaVerificacaoOk: null, falhasSeguidas: 0, proximaVerificacao: null, ultimoErro: null, ativa: true });
  }
}
const pickRuntime = ({ estado, ultimaConsulta, ultimaVerificacaoOk, falhasSeguidas, proximaVerificacao, ultimoErro, ativa, indisponivelManual }) =>
  ({ estado, ultimaConsulta, ultimaVerificacaoOk, falhasSeguidas, proximaVerificacao, ultimoErro, ativa, indisponivelManual });

// ---------- Snapshots ----------

function storeRaw(sourceId, versao, text) {
  try {
    const dir = path.join(path.dirname(radarFile()), 'radar-snapshots');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${sourceId}-v${versao}.html`);
    fs.writeFileSync(file, text);
    return path.relative(path.dirname(radarFile()), file);
  } catch {
    return null;
  }
}

function recordSnapshot(source, { url, text, parsed, fetchedAt, chave = source.id }) {
  const d = data();
  const contentHash = hash(parsed);
  const previous = d.snapshots.filter((s) => s.sourceId === source.id && s.chave === chave).at(-1);
  if (previous && previous.hash === contentHash) {
    previous.ultimaConfirmacao = fetchedAt;
    return { snapshot: previous, changed: false };
  }
  const versao = (previous?.versao || 0) + 1;
  const snapshot = {
    id: newId(), sourceId: source.id, chave, url, versao, coletadoEm: fetchedAt, ultimaConfirmacao: fetchedAt,
    hash: contentHash, hashBruto: hash(text), tamanho: text.length,
    referencia: storeRaw(chave.replace(/[^\w-]/g, '_').slice(0, 80), versao, text),
    conteudo: parsed,
  };
  d.snapshots.push(snapshot);
  return { snapshot, changed: true };
}

// ---------- Fila de revisão e histórico ----------

export function openReview({ tipo, sourceId, snapshotId, motivo, proposta, impacto = 'alto', chave }) {
  const d = data();
  const dedupe = chave || hash([tipo, sourceId, motivo, proposta]);
  const existing = d.reviews.find((r) => r.status === 'aberta' && r.chave === dedupe);
  if (existing) return existing;
  const review = { id: newId(), tipo, sourceId, snapshotId, motivo, proposta: proposta || null, impacto, chave: dedupe, status: 'aberta', criadaEm: new Date().toISOString() };
  d.reviews.push(review);
  return review;
}

function revision({ entidade, entidadeId, opportunityKey, campo, anterior, novo, evidencia, validacao = 'publicada', impacto = 'baixo', por = 'atualizador' }) {
  const r = { id: newId(), entidade, entidadeId, opportunityKey, campo, anterior: anterior ?? null, novo: novo ?? null, evidencia, em: new Date().toISOString(), validacao, impacto, por };
  data().revisions.push(r);
  return r;
}

// ---------- Aplicadores por tipo de conteúdo ----------

const sameDates = (a, b) => a && b && a.abertura === b.abertura && a.encerramento === b.encerramento;

/** Calendário DUA → AdmissionWindow + AdmissionEvent. */
export function applyCalendar(parsed, { source, snapshot, force = false, por = 'atualizador' }) {
  const d = data();
  const curso = parsed.anoAcademico;
  const proc = parsed.procedimentoId;
  const evidence = (texto) => ({ sourceId: source.id, snapshotId: snapshot?.id || null, url: snapshot?.url || source.url, trecho: texto || null, versao: snapshot?.versao || null });
  const revisions = [];

  const currentWindows = d.windows.filter((w) => w.procedimentoId === proc && w.anoAcademico === curso);
  const isNewCycle = currentWindows.length === 0;

  const desiredWindows = parsed.fases.map((f) => {
    const c = f.itens.find((i) => i.tipo === 'candidatura');
    return {
      id: `${proc}:${curso}:F${f.fase}`, procedimentoId: proc, anoAcademico: curso, fase: f.fase, titulo: f.titulo, publico: f.publico,
      abertura: c?.inicio || null, encerramento: c?.fim || null, fusoHorario: 'Europe/Madrid', confirmacao: f.confirmacao,
      textoOriginal: c?.texto || null, sourceId: source.id, snapshotId: snapshot?.id || null, prioridadeFonte: source.prioridade,
    };
  });

  if (!force) {
    const critical = [];
    const conflicts = [];
    for (const w of desiredWindows) {
      const cur = currentWindows.find((x) => x.id === w.id);
      if (!cur) continue;
      if (cur.prioridadeFonte < source.prioridade && !sameDates(cur, w)) conflicts.push({ fase: w.fase, atual: cur, proposta: w });
      else if (cur.confirmacao === 'confirmado' && !sameDates(cur, w)) critical.push({ fase: w.fase, de: { abertura: cur.abertura, encerramento: cur.encerramento }, para: { abertura: w.abertura, encerramento: w.encerramento } });
    }
    const removed = currentWindows.filter((c) => !desiredWindows.some((w) => w.id === c.id));
    if (conflicts.length) {
      const fonteMaior = sourceById(conflicts[0].atual.sourceId);
      openReview({
        tipo: 'conflito', sourceId: source.id, snapshotId: snapshot?.id,
        motivo: `Conflito entre fontes oficiais no curso ${curso} (fase ${conflicts.map((c) => c.fase).join(', ')}). Autoridade normativa de maior prioridade: ${fonteMaior?.rotuloPublico || conflicts[0].atual.sourceId}. O dado atual é mantido até decisão.`,
        proposta: { kind: 'calendar', parsed },
      });
      return { publicado: false, revisao: true, revisions };
    }
    if (critical.length || removed.length) {
      openReview({
        tipo: 'alteracao-critica', sourceId: source.id, snapshotId: snapshot?.id,
        motivo: critical.length
          ? `Alteração de prazo de candidatura no curso ${curso}: ${critical.map((c) => `Fase ${c.fase} ${c.de.abertura}→${c.para.abertura}, fim ${c.de.encerramento}→${c.para.encerramento}`).join('; ')}. Exige aprovação antes de publicar.`
          : `A fonte deixou de listar a(s) fase(s) ${removed.map((r) => r.fase).join(', ')} do curso ${curso}. Exige aprovação.`,
        proposta: { kind: 'calendar', parsed },
      });
      return { publicado: false, revisao: true, revisions };
    }
  }

  // Publicação: janelas
  for (const w of desiredWindows) {
    const cur = d.windows.find((x) => x.id === w.id);
    for (const campo of ['abertura', 'encerramento', 'confirmacao']) {
      if (cur?.[campo] !== w[campo]) {
        revisions.push(revision({
          entidade: 'AdmissionWindow', entidadeId: w.id, opportunityKey: `${proc}:${curso}`, campo, anterior: cur?.[campo], novo: w[campo],
          evidencia: evidence(w.textoOriginal), impacto: 'alto', validacao: force ? 'aprovada' : 'publicada', por,
        }));
      }
    }
    if (cur) Object.assign(cur, w);
    else d.windows.push(w);
  }
  d.windows = d.windows.filter((w) => !(w.procedimentoId === proc && w.anoAcademico === curso && !desiredWindows.some((x) => x.id === w.id)));

  // Publicação: eventos (id estável por fase + ordem de aparição do tipo)
  const desiredEvents = parsed.fases.flatMap((f) => {
    const seen = {};
    return f.itens.filter((i) => i.tipo !== 'candidatura').map((i) => {
      seen[i.tipo] = (seen[i.tipo] || 0) + 1;
      return { id: `${proc}:${curso}:F${f.fase}:${i.tipo}:${seen[i.tipo]}`, procedimentoId: proc, anoAcademico: curso, fase: f.fase, tipo: i.tipo, ordem: i.ordem, rotulo: i.rotulo, inicio: i.inicio, fim: i.fim, textoOriginal: i.texto, sourceId: source.id, snapshotId: snapshot?.id || null, confirmacao: f.confirmacao };
    });
  });
  for (const e of desiredEvents) {
    const cur = d.events.find((x) => x.id === e.id);
    if (cur && (cur.inicio !== e.inicio || cur.fim !== e.fim)) {
      revisions.push(revision({ entidade: 'AdmissionEvent', entidadeId: e.id, opportunityKey: `${proc}:${curso}`, campo: 'datas', anterior: `${cur.inicio || ''}→${cur.fim || ''}`, novo: `${e.inicio || ''}→${e.fim || ''}`, evidencia: evidence(e.textoOriginal), impacto: 'medio', por }));
    }
    if (cur) Object.assign(cur, e);
    else d.events.push(e);
  }
  d.events = d.events.filter((e) => !(e.procedimentoId === proc && e.anoAcademico === curso && !desiredEvents.some((x) => x.id === e.id)));

  ensureOpportunitiesForCycle(curso);
  return { publicado: true, novoCiclo: isNewCycle, revisions, curso, procedimentoId: proc };
}

// ---------- Vínculo programa da universidade ↔ código DUA ----------
// O catálogo próprio da universidade (ex.: UGR) e o catálogo do DUA listam os mesmos másteres com
// nomes e códigos diferentes. O código DUA é o que abre a ficha com critérios e requisitos, então o
// vínculo é feito pela web própria do máster (presente nos dois catálogos) e, na falta dela, pelo nome
// normalizado. Só vínculos únicos nos dois sentidos são aceitos: na dúvida, o programa fica sem ficha DUA.

const webKey = (u) => String(u || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
export const programNameKey = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  .replace(/\([^)]*\)/g, ' ')
  .replace(/^MASTER UNIVERSITARIO\s+(EN|DE)?\s*(EL|LA|LOS|LAS)?\s+/, '')
  .replace(/[^A-Z0-9]+/g, ' ').trim();

export function linkDuaPrograms(duaPrograms, locals) {
  const pairs = new Map(); // localId → programa DUA
  for (const l of locals) {
    const w = webKey(l.ficha?.webPropria || l.webPropria);
    let cands = w ? duaPrograms.filter((x) => webKey(x.webPropria) === w) : [];
    if (cands.length > 1) cands = cands.filter((x) => programNameKey(x.nome) === programNameKey(l.nome));
    if (!cands.length) cands = duaPrograms.filter((x) => programNameKey(x.nome) === programNameKey(l.nome));
    if (cands.length === 1) pairs.set(l.id, cands[0]);
  }
  const uses = new Map();
  for (const x of pairs.values()) uses.set(x.codigo, (uses.get(x.codigo) || 0) + 1);
  for (const [id, x] of pairs) if (uses.get(x.codigo) > 1) pairs.delete(id);
  return pairs;
}

/** Catálogo da universidade → programas (nunca apaga: ausência vira revisão). */
export function applyCatalog(parsed, { source, snapshot, por = 'atualizador', completo = true }) {
  const d = data();
  const revisions = [];
  const evidence = { sourceId: source.id, snapshotId: snapshot?.id || null, url: source.url, versao: snapshot?.versao || null };
  const seen = new Set();
  // Carga inicial do catálogo não gera 138 entradas de histórico: só novidades posteriores.
  const initial = !d.programs.some((x) => x.universidadeId === parsed.universidadeId && (x.catalogSourceId === source.id || x.sourceId === source.id));

  // Catálogo do DUA para uma universidade que já tem catálogo próprio: serve para vincular o código DUA
  // aos programas existentes, sem criar uma segunda cópia de cada máster.
  let programas = parsed.programas;
  if (source.conector === 'dua-catalog') {
    const locals = d.programs.filter((x) => x.universidadeId === parsed.universidadeId && x.catalogSourceId !== source.id && x.sourceId !== source.id && !x.ausenteNoCatalogo);
    programas = programas.map((p) => ({ ...p, duaCodigo: p.codigo }));
    if (locals.length) {
      const pairs = linkDuaPrograms(programas, locals);
      for (const [localId, dua] of pairs) {
        const l = d.programs.find((x) => x.id === localId);
        if (l.duaCodigo && l.duaCodigo !== dua.codigo) revisions.push(revision({ entidade: 'Program', entidadeId: l.id, campo: 'duaCodigo', anterior: l.duaCodigo, novo: dua.codigo, evidencia: evidence, por }));
        l.duaCodigo = dua.codigo;
      }
      const linked = new Set([...pairs.values()].map((x) => x.codigo));
      const semVinculo = locals.filter((l) => !pairs.has(l.id));
      if (semVinculo.length) {
        openReview({ tipo: 'vinculo-dua', sourceId: source.id, snapshotId: snapshot?.id, impacto: 'baixo', chave: `vinculo-dua:${parsed.universidadeId}:${hash(semVinculo.map((l) => l.id))}`,
          motivo: `${semVinculo.length} máster(es) de ${parsed.universidadeId.toUpperCase()} sem correspondência única no catálogo do DUA (ficha DUA não será coletada): ${semVinculo.slice(0, 12).map((l) => l.nome).join('; ')}${semVinculo.length > 12 ? '…' : ''}` });
      }
      programas = []; // a lista oficial da universidade continua sendo a do catálogo próprio
      if (!linked.size) return { publicado: false, revisions };
    }
  }

  for (const p of programas) {
    seen.add(p.id);
    const cur = d.programs.find((x) => x.id === p.id);
    if (!cur) {
      d.programs.push({ ...p, verificadoEm: snapshot?.coletadoEm || new Date().toISOString(), sourceId: source.id, catalogSourceId: source.id, ficha: null });
      if (!initial) revisions.push(revision({ entidade: 'Program', entidadeId: p.id, campo: 'catalogo', anterior: null, novo: p.nome, evidencia: evidence, por }));
      continue;
    }
    for (const campo of ['nome', 'codigo', 'webPropria', 'cursoCatalogo', 'ofertaCondicionada', 'modalidade']) {
      if (cur[campo] !== p[campo]) revisions.push(revision({ entidade: 'Program', entidadeId: p.id, campo, anterior: cur[campo], novo: p[campo], evidencia: evidence, por }));
    }
    Object.assign(cur, p, { verificadoEm: snapshot?.coletadoEm || cur.verificadoEm, catalogSourceId: source.id, ausenteNoCatalogo: false });
  }
  if (completo) {
    for (const p of d.programs.filter((x) => x.universidadeId === parsed.universidadeId && (x.catalogSourceId === source.id || (!x.catalogSourceId && x.sourceId === source.id)) && !seen.has(x.id) && !x.ausenteNoCatalogo)) {
      p.ausenteNoCatalogo = true;
      openReview({ tipo: 'programa-ausente', sourceId: source.id, snapshotId: snapshot?.id, motivo: `"${p.nome}" não aparece mais no listado oficial ${parsed.anoAcademico}. Confirmar se foi descontinuado ou renomeado.`, impacto: 'medio', chave: `ausente:${p.id}:${parsed.anoAcademico}` });
    }
  }
  if (parsed.anoAcademico) {
    ensureOpportunitiesForCycle(parsed.anoAcademico, parsed.universidadeId);
    ensureOpportunitiesForCycle(nextAcademicYear(parsed.anoAcademico), parsed.universidadeId);
  }
  return { publicado: true, revisions };
}

/** Ficha de um programa → dados acadêmicos. */
export function applyProgramSheet(programId, parsed, { source, snapshot, por = 'atualizador' }) {
  const p = data().programs.find((x) => x.id === programId);
  if (!p) return { publicado: false, revisions: [] };
  const revisions = [];
  const before = p.ficha || {};
  for (const [campo, novo] of Object.entries(parsed.dados)) {
    if (before[campo] !== undefined && before[campo] !== novo) {
      revisions.push(revision({ entidade: 'Program', entidadeId: p.id, opportunityKey: `program:${p.id}`, campo: `ficha.${campo}`, anterior: before[campo], novo, evidencia: { sourceId: source.id, snapshotId: snapshot?.id || null, url: p.fichaUrl, versao: snapshot?.versao || null }, impacto: ['modalidade', 'idiomaEnsino', 'creditos'].includes(campo) ? 'medio' : 'baixo', por }));
    }
  }
  p.ficha = { ...parsed.dados, verificadaEm: snapshot?.coletadoEm || new Date().toISOString(), snapshotId: snapshot?.id || null };
  if (parsed.dados.anoAcademico && p.cursoCatalogo && parsed.dados.anoAcademico !== p.cursoCatalogo) {
    openReview({ tipo: 'ciclo-inconsistente', sourceId: source.id, snapshotId: snapshot?.id, motivo: `A ficha de "${p.nome}" é do curso ${parsed.dados.anoAcademico}, mas o catálogo é ${p.cursoCatalogo}.`, impacto: 'medio', chave: `ciclo:${p.id}:${parsed.dados.anoAcademico}` });
  }
  return { publicado: true, revisions };
}

// Resumo legível de cada campo da ficha DUA para o histórico de alterações.
const DUA_FIELDS = {
  baremo: { impacto: 'medio', resumo: (v) => (v || []).map((c) => `${c.descricao} ${c.peso ?? '?'}%`).join(' · ') || 'Somente nota do expediente' },
  idiomasExigidos: { impacto: 'medio', resumo: (v) => (v || []).map((i) => `${i.idioma} ${i.nivel || '(nível não informado)'}`).join(' · ') || 'Nenhum' },
  requisitos: { impacto: 'medio', resumo: (v) => `${(v || []).length} requisito(s), ${(v || []).filter((r) => r.obrigatorio).length} obrigatório(s)` },
  titulacoes: { impacto: 'baixo', resumo: (v) => `${(v || []).length} titulação(ões) com preferência` },
  inicioCurso: { impacto: 'baixo', resumo: (v) => v || '-' },
};

/** Ficha do DUA de um programa → critérios de seleção, requisitos, idioma e titulações de acesso. */
export function applyDuaSheet(programId, parsed, { source, snapshot, por = 'atualizador' }) {
  const p = data().programs.find((x) => x.id === programId);
  if (!p) return { publicado: false, revisions: [] };
  const revisions = [];
  const before = p.fichaDua;
  if (before) {
    for (const [campo, cfg] of Object.entries(DUA_FIELDS)) {
      if (JSON.stringify(before[campo] ?? null) === JSON.stringify(parsed.dados[campo] ?? null)) continue;
      revisions.push(revision({ entidade: 'Program', entidadeId: p.id, opportunityKey: `program:${p.id}`, campo: `fichaDua.${campo}`, anterior: cfg.resumo(before[campo]), novo: cfg.resumo(parsed.dados[campo]), evidencia: { sourceId: source.id, snapshotId: snapshot?.id || null, url: duaSheetUrl(p.duaCodigo), versao: snapshot?.versao || null }, impacto: cfg.impacto, por }));
    }
  }
  p.fichaDua = { ...parsed.dados, verificadaEm: snapshot?.coletadoEm || new Date().toISOString(), snapshotId: snapshot?.id || null };
  return { publicado: true, revisions };
}

/** Garante Opportunity (programa × ano acadêmico) para os programas de uma universidade. */
export function ensureOpportunitiesForCycle(curso, universidadeId = null) {
  if (!curso) return;
  const d = data();
  for (const p of d.programs) {
    if (universidadeId && p.universidadeId !== universidadeId) continue;
    const uni = UNIVERSITY_INFO[p.universidadeId];
    if (!uni) continue;
    const id = opportunityId(p.id, curso);
    if (d.opportunities.some((o) => o.id === id)) continue;
    d.opportunities.push({ id, programId: p.id, universidadeId: p.universidadeId, tipo: 'mestrado', anoAcademico: curso, procedimentoId: uni.procedimentoId, urlOficial: p.fichaUrl, criadaEm: new Date().toISOString(), suspensao: null });
  }
}

// ---------- Execução de uma fonte ----------

// Frequência adaptativa: perto de uma abertura, encerramento ou resultado oficial, a fonte de datas
// de candidatura é conferida com mais frequência (1 h a até 2 dias da data; 3 h a até 14 dias).
// Fora dessas janelas vale a frequência cadastrada. Com requisição condicional (ETag), conferir
// sem mudança custa quase nada para o site oficial.
export function effectiveFrequencyHours(source, now = Date.now()) {
  if (!source.autoridade?.includes('datas-candidatura')) return source.frequenciaHoras;
  const d = data();
  let nearest = Infinity;
  for (const iso of [...d.windows.flatMap((w) => [w.abertura, w.encerramento]), ...d.events.flatMap((e) => [e.inicio, e.fim])]) {
    const t = iso ? Date.parse(`${String(iso).slice(0, 10)}T12:00:00Z`) : NaN;
    if (Number.isFinite(t)) nearest = Math.min(nearest, Math.abs(t - now));
  }
  const days = nearest / 86400000;
  if (days <= 2) return Math.min(source.frequenciaHoras, 1);
  if (days <= 14) return Math.min(source.frequenciaHoras, 3);
  return source.frequenciaHoras;
}

function backoffHours(source) {
  return Math.min(source.frequenciaHoras, 0.25 * 2 ** Math.min(source.falhasSeguidas, 6));
}

// Extração que confirma os dados da fonte. Fora disso (estrutura mudou, ano incoerente, data
// incerta) a coleta NÃO conta como verificação: vai para revisão e o dado publicado envelhece.
const isValidExtraction = (parsed) => Boolean(parsed?.ok) && !(parsed.avisos || []).some((a) => ['ciclo-inconsistente', 'extracao-incerta'].includes(a.tipo));

function processParsed(source, parsed, ctx) {
  if (!isValidExtraction(parsed)) {
    openReview({
      tipo: parsed.avisos.find((a) => a.tipo === 'ciclo-inconsistente') ? 'ciclo-inconsistente' : 'extracao-incerta',
      sourceId: source.id, snapshotId: ctx.snapshot?.id,
      motivo: parsed.avisos.map((a) => a.motivo).join(' · ') || 'Extração incompleta.',
      proposta: { kind: parsed.tipo, parsed, programId: ctx.programId || null },
    });
    return { publicado: false, revisao: true, revisions: [] };
  }
  if (parsed.tipo === 'calendario') return applyCalendar(parsed, ctx);
  if (parsed.tipo === 'catalogo') return applyCatalog(parsed, ctx);
  if (parsed.tipo === 'ficha') return applyProgramSheet(ctx.programId, parsed, ctx);
  if (parsed.tipo === 'ficha-dua') return applyDuaSheet(ctx.programId, parsed, ctx);
  return { publicado: false, revisions: [] };
}

/** Processa um conteúdo já obtido (coleta real, seed ou teste). */
export function ingest(sourceId, { url, text, fetchedAt = new Date().toISOString(), programId = null, snapshotKey = null, parseContext = {}, parsedOverride = null, completo = true }) {
  const source = sourceById(sourceId);
  const connector = CONNECTORS[source.conector];
  const parsed = parsedOverride || connector.parse(text, parseContext);
  const { snapshot, changed } = recordSnapshot(source, { url, text, parsed, fetchedAt, chave: snapshotKey || (programId ? `${source.id}:${programId}` : source.id) });
  const valido = isValidExtraction(parsed);
  const result = changed
    ? processParsed(source, parsed, { source, snapshot, programId, completo })
    : parsed.tipo === 'catalogo' && valido
      ? applyCatalog(parsed, { source, snapshot, completo })
      : { publicado: false, revisions: [], semAlteracao: true, revisao: !valido };
  if (programId && valido) {
    const p = data().programs.find((x) => x.id === programId);
    const campo = parsed.tipo === 'ficha-dua' ? 'fichaDua' : 'ficha';
    if (p?.[campo]) p[campo].verificadaEm = fetchedAt;
  }
  return { ...result, changed, snapshot, valido };
}

export async function runSource(sourceId, { fetchImpl, now = Date.now(), origem = null } = {}) {
  ensureSources();
  const source = sourceById(sourceId);
  if (!source) throw new Error(`Fonte desconhecida: ${sourceId}`);
  const run = { id: newId(), sourceId, inicio: nowIso(now), fim: null, resultado: null, mudancas: 0, erro: null, itens: 0, ...(origem ? { origem } : {}) };
  data().runs.push(run);

  if (source.metodo !== 'html-publico' || !source.ativa || source.indisponivelManual) {
    run.resultado = 'ignorada';
    run.erro = source.metodo !== 'html-publico' ? 'Fonte de revisão manual.' : 'Fonte desativada ou marcada como indisponível.';
    run.fim = new Date().toISOString();
    await save();
    return run;
  }

  const latestDuaCycle = data().windows.filter((w) => w.procedimentoId === 'dua-masteres').map((w) => w.anoAcademico).sort().at(-1) || null;
  const fasesDua = [...new Set(data().windows.filter((w) => w.procedimentoId === 'dua-masteres' && w.anoAcademico === latestDuaCycle).map((w) => Number(w.fase)).filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
  const targets = source.conector === 'ugr-program'
    ? data().programs.filter((p) => p.fichaUrl && !p.ausenteNoCatalogo)
      .sort((a, b) => (a.ficha?.verificadaEm || '').localeCompare(b.ficha?.verificadaEm || ''))
      .slice(0, source.lote || 10)
      .map((p) => ({ url: p.fichaUrl, programId: p.id }))
    : source.conector === 'dua-program'
      ? data().programs.filter((p) => p.duaCodigo && !p.ausenteNoCatalogo)
        .sort((a, b) => (a.fichaDua?.verificadaEm || '').localeCompare(b.fichaDua?.verificadaEm || ''))
        .slice(0, source.lote || 8)
        .map((p) => ({ url: source.url, method: 'POST', body: new URLSearchParams({ c_peticion: p.duaCodigo }), programId: p.id, snapshotKey: `${source.id}:${p.id}` }))
    : source.conector === 'dua-catalog'
      // Uma universidade custa 3 consultas (uma por fase) de ~1 MB. Em lotes, a coleta cabe no limite
      // de uma função serverless; vão primeiro as nunca consultadas e, entre elas, as que têm catálogo
      // próprio (o vínculo com o DUA é o que libera as fichas de critérios).
      ? duaCatalog.UNIVERSITIES.map((u) => {
        const own = data().programs.filter((p) => p.universidadeId === u.id && p.catalogSourceId && p.catalogSourceId !== source.id);
        return { u, ultima: data().snapshots.filter((s) => s.sourceId === source.id && s.chave === `${source.id}:${u.id}`).at(-1)?.ultimaConfirmacao || '', semVinculo: own.length > 0 && !own.some((p) => p.duaCodigo) };
      })
        .sort((a, b) => Number(b.semVinculo) - Number(a.semVinculo) || a.ultima.localeCompare(b.ultima))
        .slice(0, source.lote || duaCatalog.UNIVERSITIES.length)
        .map(({ u }) => u)
        .map((u) => ({
        url: new URL('mo_catalogo.php', source.url).href,
        snapshotKey: `${source.id}:${u.id}`,
        programId: null,
        parseContext: { anoAcademico: latestDuaCycle, universidadeId: u.id },
        queries: (fasesDua.length ? fasesDua : [1, 2, 3]).map((fase) => ({
          fase,
          method: 'POST',
          body: new URLSearchParams({ univpet: u.codigo, titulpet: '', palclave: '', fase: String(fase), orden: '', virtualpet: '' }),
        })),
      }))
    : [{ url: source.url, programId: null }];

  const allRevisions = [];
  let failed = null;
  let verified = 0; // páginas cujo conteúdo foi confirmado (extração válida ou 304 sobre extração válida)
  source.validadores ??= {};
  for (const t of targets) {
    try {
      const targetKey = t.snapshotKey || t.url;
      if (t.queries) {
        const pages = [];
        let targetFailure = null;
        for (const query of t.queries) {
          try {
            const page = await politeFetch(t.url, { fetchImpl, allowedHosts: COLLECTION_HOSTS, method: query.method, body: query.body });
            const parsed = duaCatalog.parse(page.text, t.parseContext);
            pages.push({ page, parsed });
            run.itens += 1;
            if (!isValidExtraction(parsed)) run.falhasExtracao = (run.falhasExtracao || 0) + 1;
          } catch (err) {
            targetFailure ||= err;
            if (err instanceof FetchError && err.blocked) break;
          }
        }
        const validPages = pages.filter(({ parsed }) => isValidExtraction(parsed));
        const complete = pages.length === t.queries.length && validPages.length === t.queries.length;
        if (!validPages.length) throw targetFailure || new Error(`Nenhuma fase válida do catálogo para ${t.parseContext.universidadeId}.`);
        if (targetFailure) failed ||= targetFailure;
        const programs = [...new Map(validPages.flatMap(({ parsed }) => parsed.programas).map((p) => [p.id, p])).values()]
          .sort((a, b) => a.codigo.localeCompare(b.codigo));
        const parsed = { ok: true, tipo: 'catalogo', ...t.parseContext, programas: programs, avisos: [] };
        const text = validPages.map(({ page }, i) => `<!-- fase ${i + 1} -->\n${page.text}`).join('\n');
        const fetchedAt = validPages.map(({ page }) => page.fetchedAt).sort().at(-1);
        const r = ingest(sourceId, { url: t.url, text, fetchedAt, snapshotKey: targetKey, parsedOverride: parsed, completo: complete });
        allRevisions.push(...(r.revisions || []));
        if (r.revisao) run.resultado = 'revisao';
        if (complete && r.valido) verified += 1;
        if (!complete && !targetFailure) failed ||= new Error(`Uma ou mais respostas do catálogo DUA de ${t.parseContext.universidadeId} não puderam ser confirmadas.`);
        continue;
      }
      const page = await politeFetch(t.url, { fetchImpl, validadores: t.method === 'POST' ? null : source.validadores[targetKey], allowedHosts: COLLECTION_HOSTS, method: t.method || 'GET', body: t.body });
      if (page.naoModificada) {
        // 304: a página não mudou desde a última coleta. Só há validadores guardados quando aquela
        // coleta foi extraída com sucesso, então isto conta como verificação bem-sucedida.
        if (t.programId) { const p = data().programs.find((x) => x.id === t.programId); if (p?.ficha) p.ficha.verificadaEm = page.fetchedAt; }
        run.itens += 1;
        verified += 1;
        run.naoModificadas = (run.naoModificadas || 0) + 1;
        continue;
      }
      const r = ingest(sourceId, { url: page.url, text: page.text, fetchedAt: page.fetchedAt, programId: t.programId, snapshotKey: t.snapshotKey, parseContext: t.parseContext });
      allRevisions.push(...(r.revisions || []));
      if (r.revisao) run.resultado = 'revisao';
      run.itens += 1;
      if (r.valido) {
        verified += 1;
        if (t.method !== 'POST' && (page.etag || page.lastModified)) source.validadores[targetKey] = { etag: page.etag, lastModified: page.lastModified };
      } else {
        // Sem validadores, a próxima coleta baixa a página inteira de novo (um 304 não pode
        // "confirmar" um conteúdo que não conseguimos ler).
        delete source.validadores[targetKey];
        run.falhasExtracao = (run.falhasExtracao || 0) + 1;
      }
    } catch (err) {
      failed = err;
      if (err instanceof FetchError && err.blocked) break;
    }
  }

  source.ultimaConsulta = nowIso(now);
  if (!failed && run.itens && !verified) {
    // Página baixada, mas o conteúdo não pôde ser confirmado: nunca "verificado, sem mudanças".
    source.falhasSeguidas = (source.falhasSeguidas || 0) + 1;
    source.estado = 'falhando';
    source.ultimoErro = 'A página foi baixada, mas a extração não confirmou os dados (a estrutura pode ter mudado). Enviado para revisão.';
    source.proximaVerificacao = nowIso(now + backoffHours(source) * 3600000);
    run.resultado = 'revisao';
    run.erro = source.ultimoErro;
  } else if (failed && !verified) {
    source.falhasSeguidas = (source.falhasSeguidas || 0) + 1;
    source.estado = failed.blocked ? 'bloqueada' : 'falhando';
    source.ultimoErro = failed.message;
    source.proximaVerificacao = nowIso(now + backoffHours(source) * 3600000);
    run.resultado = 'erro';
    run.erro = failed.message;
  } else {
    source.falhasSeguidas = 0;
    source.estado = 'ok';
    source.ultimoErro = failed ? `Parcial: ${failed.message}` : run.falhasExtracao ? `Parcial: ${run.falhasExtracao} página(s) com extração em revisão.` : null;
    source.ultimaVerificacaoOk = nowIso(now);
    source.frequenciaEfetivaHoras = effectiveFrequencyHours(source, now);
    source.proximaVerificacao = nowIso(now + source.frequenciaEfetivaHoras * 3600000);
    run.resultado ??= allRevisions.length ? 'alterado' : 'sem-alteracao';
  }
  run.mudancas = allRevisions.length;
  run.fim = new Date().toISOString();
  if (allRevisions.length) {
    onPublished(allRevisions);
    broadcast('radar-atualizado', { fonte: source.rotuloPublico || source.titulo, mudancas: allRevisions.length });
  }
  await save();
  return run;
}

/** Fontes com verificação vencida. */
export const dueSources = (now = Date.now()) => data().sources.filter((s) => s.metodo === 'html-publico' && s.ativa && !s.indisponivelManual && (!s.proximaVerificacao || Date.parse(s.proximaVerificacao) <= now));

// ---------- Aprovação de revisões ----------

export function approveReview(review, por) {
  const source = sourceById(review.sourceId);
  const snapshot = data().snapshots.find((s) => s.id === review.snapshotId) || null;
  const p = review.proposta;
  let result = { revisions: [] };
  if (p?.kind === 'calendar' || p?.kind === 'calendario') result = applyCalendar(p.parsed, { source, snapshot, force: true, por });
  else if (p?.kind === 'catalogo') result = applyCatalog(p.parsed, { source, snapshot, por });
  else if (p?.kind === 'ficha' && p.programId) result = applyProgramSheet(p.programId, p.parsed, { source, snapshot, por });
  else if (p?.kind === 'ficha-dua' && p.programId && p.parsed?.dados) result = applyDuaSheet(p.programId, p.parsed, { source, snapshot, por });
  review.status = 'aprovada';
  review.resolvidaEm = new Date().toISOString();
  review.por = por;
  if (result.revisions?.length) {
    onPublished(result.revisions);
    broadcast('radar-atualizado', { fonte: source?.rotuloPublico || source?.titulo || 'Radar', mudancas: result.revisions.length });
  }
  return result;
}

// ---------- Seed: snapshots oficiais capturados em 24/10/2026 ----------

const here = path.dirname(fileURLToPath(import.meta.url));
const SEED = [
  { sourceId: 'ugr-catalogo', file: 'ugr-titulaciones-2026-27.html', url: 'https://masteres.ugr.es/informacion/titulaciones', capturadoEm: '2026-10-24T18:17:00.000Z' },
  { sourceId: 'dua-calendario', file: 'dua-calendario-2026-27.html', url: SOURCE_SEED[0].url, capturadoEm: '2026-10-24T18:17:00.000Z', latin1: true },
  { sourceId: 'ugr-fichas', file: 'ugr-ficha-gestion-procesos-negocio.html', url: 'https://masteres.ugr.es/informacion/titulaciones/master-universitario-gestion-tecnologias-procesos-negocio', programId: 'ugr-master-universitario-gestion-tecnologias-procesos-negocio', capturadoEm: '2026-10-24T18:17:00.000Z' },
];

/** Na primeira execução, carrega os snapshots oficiais incluídos no projeto (dados reais, com data de captura). */
export async function bootstrap() {
  ensureSources();
  const d = data();
  if (d.programs.length || d.windows.length) return false;
  for (const s of SEED) {
    const buf = fs.readFileSync(path.join(here, 'seed', s.file));
    const text = new TextDecoder(s.latin1 ? 'windows-1252' : 'utf-8').decode(buf);
    ingest(s.sourceId, { url: s.url, text, fetchedAt: s.capturadoEm, programId: s.programId || null });
    const src = sourceById(s.sourceId);
    src.ultimaConsulta = s.capturadoEm;
    src.ultimaVerificacaoOk = s.capturadoEm;
    src.estado = 'ok';
    src.proximaVerificacao = null; // o agendador verifica de novo assim que puder
  }
  await save();
  return true;
}
