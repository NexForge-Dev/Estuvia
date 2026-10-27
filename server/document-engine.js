// Carteira de documentos: regras puras (sem disco nem rede).
//
// Fonte do status: user.documents[docId] (DOC_STATUS), a mesma que as missões leem (journey-engine AUTO_RULES).
// Ao lado dele, user.docRecords[docId] guarda o que NÃO é status:
//   origem (declarado | missao | manual), aguardando, conferidoEm, validade, emitidoEm, alertaDias,
//   estado (detalhado, ver DOC_STATES) + estadoBase (o status em que ele foi registrado — se o status mudar por outro
//   caminho, o estado volta a ser derivado), apostila / traducao ('nao-precisa' | 'precisa' | 'solicitada' | 'pronta'),
//   emissor, pais, observacoes, atendidoPor, envios[{ procedimento, em, resultado }], missaoSync, lembretes.
// user.docFiles[] guarda os metadados dos arquivos cifrados (routes/documents.js), cada um com um "papel".
// user.docConditions guarda as condições que o estudante corrigiu ("Minha situação").
//
// Estados de confiança são separados e nunca se confundem:
//   declarado (o estudante disse que tem) · anexado (há arquivo na conta) · conferido (o estudante revisou)
//   · aceito no procedimento (o estudante registrou que o órgão aceitou). A Estuvia não valida documentos.

import {
  DOCUMENTS, DOC_STAGES, DOC_STATUS_SIMPLE, PROCEDURES, DOC_CATEGORIES, CATEGORY_USES, CONDITIONS, DOC_STATES, FILE_ROLES,
  APOSTILLE_GUIDE, TRANSLATION_GUIDE,
} from './content/documents.js';
import { ROUNDS } from './content/rounds.js';
import { programById } from './content/catalog.js';
import { sourceById } from './content/sources.js';
import { consulateResult } from './content/places.js';
import { computeJourney } from './journey-engine.js';
import { docRule } from './document-rules.js';

const DONE = new Set(['pronto', 'enviado', 'nao-se-aplica']);
const READY = new Set(['pronto', 'enviado']);
const ORDER = new Map(DOCUMENTS.map((d, i) => [d.id, i]));
const BY_ID = new Map(DOCUMENTS.map((d) => [d.id, d]));
export const docById = (id) => BY_ID.get(id) || null;
const stageById = (id) => DOC_STAGES.find((s) => s.id === id);
const categoryById = (id) => DOC_CATEGORIES.find((c) => c.id === id) || null;
const STAGE_ORDER = ['candidatura', 'matricula', 'visto', 'viagem', 'estadia', 'renovacao'];

// Usos de cada documento nas categorias (o mesmo documento, nunca duplicado).
const USES = new Map();
for (const [categoria, list] of Object.entries(CATEGORY_USES)) {
  for (const x of list) {
    if (!USES.has(x.doc)) USES.set(x.doc, []);
    USES.get(x.doc).push({ ...x, categoria });
  }
}

// Missões que usam cada documento (rounds.js + catálogo), para "Usado nas missões" e para a integração com a jornada.
const USED_BY = new Map();
const addUse = (docId, missionId) => {
  if (!USED_BY.has(docId)) USED_BY.set(docId, []);
  if (!USED_BY.get(docId).includes(missionId)) USED_BY.get(docId).push(missionId);
};
for (const d of DOCUMENTS) if (d.prepara) addUse(d.id, d.prepara);
for (const r of ROUNDS) for (const m of r.missoes) for (const d of m.documentos || []) addUse(d, m.id);
for (const d of DOCUMENTS) for (const m of d.missoesExtra || []) addUse(d.id, m);
const missionNum = (id) => id.split('.').map(Number);
for (const list of USED_BY.values()) list.sort((a, b) => { const [x1, y1] = missionNum(a); const [x2, y2] = missionNum(b); return x1 - x2 || y1 - y2; });

const addMonths = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};
const isoDay = (now) => now.toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

// ---------------------------------------------------------------------------
// Contexto
// ---------------------------------------------------------------------------

export function docContext(user, jr, now = new Date()) {
  const program = jr ? programById(jr.programaId) : null;
  const journey = jr ? computeJourney(user, jr, now) : null;
  const duracaoMeses = Number(jr?.duracaoMeses) || program?.duracaoMeses || null;
  const p = user.profile || {};
  const ctx = {
    user, jr, now, program, journey, duracaoMeses,
    statuses: user.documents || {},
    records: user.docRecords || {},
    files: user.docFiles || [],
    requisitos: user.requisitos || {},
    recursos: user.finance?.recursos || [],
    bolsas: user.scholarshipApps || [],
    consulado: consulateResult(p.estado, { pais: p.paisResidencia || 'Brasil' }),
    missoes: new Map((journey?.rodadas || []).flatMap((r) => r.missoes).map((m) => [m.id, m])),
  };
  ctx.conditions = resolveConditions(ctx);
  return ctx;
}

const fonte = (id) => {
  const s = sourceById(id);
  return s ? { id: s.id, titulo: s.titulo, orgao: s.orgao, url: s.url || null, revisadoEm: s.revisadoEm } : null;
};

// ---------------------------------------------------------------------------
// Condições do estudante ("Minha situação"): detectadas pela jornada/perfil e corrigíveis por ele.
// ---------------------------------------------------------------------------

function detectCondition(key, ctx) {
  const p = ctx.user.profile || {};
  switch (key) {
    case 'residenteBrasil': {
      const pais = (p.paisResidencia || '').trim();
      return pais ? { valor: /^brasil$/i.test(pais), detalhe: `País de residência no perfil: ${pais}.` } : { valor: true, detalhe: 'Sem país no perfil: consideramos o Brasil.' };
    }
    case 'longa':
      return ctx.duracaoMeses ? { valor: ctx.duracaoMeses > 6, detalhe: `Duração prevista: ${ctx.duracaoMeses} meses.` } : { valor: null, detalhe: 'Informe a duração do mestrado na jornada.' };
    case 'idiomaEspanhol': {
      const req = ctx.program?.idioma;
      if (!req) return { valor: null, detalhe: 'Defina o mestrado da jornada para saber se ele exige certificado.' };
      if (req.status === 'nao-requerido') return { valor: false, detalhe: 'O seu mestrado não exige certificado de idioma.' };
      if (req.status === 'requerido' && req.certificado) return { valor: true, detalhe: `O seu mestrado exige espanhol ${req.nivel || ''} com certificado.`.replace('  ', ' ') };
      if (req.status === 'requerido') return { valor: null, detalhe: `O mestrado pede espanhol ${req.nivel || ''}, sem exigir certificado formal: confira como comprovar.`.replace('  ', ' ') };
      return { valor: null, detalhe: 'A exigência de idioma do seu mestrado ainda não está confirmada na ficha oficial.' };
    }
    case 'bolsa':
      return ctx.bolsas.some((b) => b.status === 'concedida') ? { valor: true, detalhe: 'Você registrou uma bolsa concedida.' } : { valor: false, detalhe: 'Nenhuma bolsa concedida registrada.' };
    case 'patrocinador':
      return ctx.recursos.some((r) => r.tipo === 'familiar') ? { valor: true, detalhe: 'Você registrou apoio familiar no planejador.' } : { valor: false, detalhe: 'Nenhum apoio de terceiros registrado no planejador.' };
    case 'vistoAprovado':
      return { valor: ctx.journey?.situacao?.visto === 'aprovado', detalhe: 'Situação do visto registrada na jornada.' };
    case 'chegou':
      return { valor: Boolean(ctx.journey?.chegada), detalhe: ctx.journey?.chegada ? `Chegada registrada em ${ctx.journey.chegada}.` : 'Chegada ainda não registrada.' };
    default:
      return null;
  }
}

export function resolveConditions(ctx) {
  const manual = ctx.user.docConditions || {};
  const out = {};
  for (const [key, c] of Object.entries(CONDITIONS)) {
    const det = c.detect ? detectCondition(key, ctx) : null;
    if (typeof manual[key] === 'boolean') out[key] = { valor: manual[key], origem: 'voce', detalhe: det?.detalhe || null, detectado: det ? det.valor : undefined };
    else if (det) out[key] = { valor: det.valor, origem: det.valor === null ? 'desconhecido' : 'detectado', detalhe: det.detalhe };
    else out[key] = { valor: c.padrao === undefined ? false : c.padrao, origem: 'padrao', detalhe: null };
  }
  return out;
}

/** cond: chave, '!chave' ou lista (todas). → true (vale) · false (não vale) · null (depende). */
export function evalCond(cond, conditions) {
  if (!cond) return true;
  let unknown = false;
  for (const raw of [].concat(cond)) {
    const neg = raw.startsWith('!');
    const v = conditions[neg ? raw.slice(1) : raw]?.valor;
    if (v === null || v === undefined) { unknown = true; continue; }
    if ((neg ? !v : v) === false) return false;
  }
  return unknown ? null : true;
}

const condLabel = (cond) => [].concat(cond || []).map((k) => (k.startsWith('!') ? `não: ${CONDITIONS[k.slice(1)]?.rotulo}` : CONDITIONS[k]?.rotulo)).filter(Boolean).join(' + ');

// ---------------------------------------------------------------------------
// Aplicabilidade: o documento vale para este estudante? (classificação contextual, nunca universal)
// ---------------------------------------------------------------------------

const EXIGENCIA_RANK = { requerido: 0, condicional: 1, verificar: 2, recomendado: 3, 'nao-necessario': 4 };
// Ordem de EXIBIÇÃO em toda a plataforma: necessários → opcionais (recomendados) → contingência (só se algo acontecer).
export const GRUPOS = { requerido: 'necessarios', recomendado: 'opcionais', condicional: 'contingencia', verificar: 'contingencia', 'nao-necessario': 'nao-se-aplica' };
const DISPLAY_RANK = { requerido: 0, recomendado: 1, condicional: 2, verificar: 3, 'nao-necessario': 4 };
const CLASSE_LABEL = { O: 'Obrigatório', C: 'Condicional', R: 'Recomendado' };

function useApplicability(use, ctx) {
  const aplica = evalCond(use.cond, ctx.conditions);
  let exigencia;
  if (aplica === false) exigencia = 'nao-necessario';
  else if (use.classe === 'R') exigencia = 'recomendado';
  else if (use.classe === 'O') exigencia = aplica === null ? 'verificar' : 'requerido';
  // Condicional só vira exigido quando a condição do estudante se confirma; sem condição verificável, "conforme o caso".
  else exigencia = use.cond ? (aplica === null ? 'verificar' : 'requerido') : 'condicional';
  return { aplica, exigencia };
}

export function applicability(doc, ctx) {
  const usos = (USES.get(doc.id) || []).map((use) => {
    const a = useApplicability(use, ctx);
    const cat = categoryById(use.categoria);
    return {
      categoria: use.categoria, categoriaNome: cat?.nome, classe: use.classe, classeLabel: CLASSE_LABEL[use.classe], rotulo: use.rotulo || null, nota: use.nota || null,
      condicao: use.condicao || null, condicaoRotulo: condLabel(use.cond) || null, aplica: a.aplica, exigencia: a.exigencia, etapa: use.etapa || cat?.etapa || null,
    };
  });
  const best = usos.reduce((acc, x) => (!acc || EXIGENCIA_RANK[x.exigencia] < EXIGENCIA_RANK[acc.exigencia] ? x : acc), null);
  const exigencia = best?.exigencia || doc.exigencia;
  const motivo = motive(doc, best, ctx);
  return { exigencia, motivo, fonte: fonte(doc.fonte), usos, classe: best?.classe || null };
}

function motive(doc, best, ctx) {
  if (!best) return null;
  const keys = [].concat(USES.get(doc.id)?.find((u) => u.categoria === best.categoria && u.classe === best.classe)?.cond || []);
  const detalhe = keys.map((k) => ctx.conditions[k.replace('!', '')]?.detalhe).find(Boolean);
  if (best.exigencia === 'nao-necessario') {
    if (doc.id === 'idioma' && detalhe) return detalhe;
    return `Não se aplica ao seu caso agora (${best.condicaoRotulo || 'condição não atendida'}). Se isso mudar, ajuste em "Minha situação".`;
  }
  if (best.exigencia === 'requerido' && keys.length) return doc.id === 'idioma' && detalhe ? detalhe : `Vale para você: ${best.condicaoRotulo}.`;
  if (best.exigencia === 'verificar') return detalhe || `Depende de: ${best.condicaoRotulo || best.condicao || 'confirmação na fonte oficial'}.`;
  if (best.exigencia === 'condicional') return best.condicao || 'Conforme o caso: confira se o seu procedimento pede.';
  if (best.exigencia === 'recomendado') return 'Recomendado: não é exigência, mas ajuda na jornada.';
  return best.condicao || null;
}

// ---------------------------------------------------------------------------
// Estado detalhado (12 estados) a partir do status interno + registro do estudante
// ---------------------------------------------------------------------------

function validityInfo(doc, rec, ctx) {
  const hoje = isoDay(ctx.now);
  if (doc.tipoValidade === 'data' && rec.validade) {
    if (rec.validade < hoje) return { vencido: true, alerta: 'Venceu. Você vai precisar de um novo ou de uma renovação.' };
    const dias = daysBetween(hoje, rec.validade);
    if (['passaporte', 'visto', 'seguro'].includes(doc.id)) {
      const inicio = ctx.jr?.inicioAulas && ctx.jr.inicioAulas > hoje ? ctx.jr.inicioAulas : hoje;
      const fim = addMonths(inicio, ctx.duracaoMeses || 12);
      if (rec.validade < fim) {
        return { alerta: doc.id === 'passaporte'
          ? `Seu passaporte vence em ${rec.validade.split('-').reverse().join('/')}, antes do fim previsto da estadia. Verifique os requisitos de validade para o visto.`
          : `Vence em ${rec.validade.split('-').reverse().join('/')}, antes do fim previsto da estadia.` };
      }
    }
    const janela = Number(rec.alertaDias) || 60;
    if (dias <= janela) return { alerta: `Vence em ${dias} dia${dias === 1 ? '' : 's'} (${rec.validade.split('-').reverse().join('/')}).` };
  }
  // Documentos cuja aceitação depende da data de emissão: só informamos, sem inventar prazo.
  if (doc.tipoValidade === 'recencia' && rec.emitidoEm) {
    const dias = daysBetween(rec.emitidoEm, hoje);
    if (dias > 90) return { aviso: `Emitido há ${dias} dias. O órgão pode exigir emissão recente: confira o prazo aceito na fonte oficial do seu procedimento.` };
  }
  return {};
}

function derivedState(raw, rec, anexos) {
  if (raw === 'pendente') return 'nao-iniciado';
  if (raw === 'em-preparacao') return rec.aguardando ? 'aguardando' : anexos ? 'arquivo-enviado' : 'solicitar';
  if (raw === 'correcao') return 'correcao';
  if (raw === 'nao-se-aplica') return 'dispensado';
  return 'pronto';
}

function stateOf(doc, raw, rec, app, anexos, val) {
  if (app.exigencia === 'nao-necessario' && !READY.has(raw) && raw !== 'nao-se-aplica') return 'nao-aplicavel';
  if (val.vencido) return 'vencido';
  if (rec.atendidoPor && !['correcao', 'nao-se-aplica'].includes(raw)) return 'pronto';
  let estado = rec.estado && DOC_STATES[rec.estado] && rec.estadoBase === raw ? rec.estado : derivedState(raw, rec, anexos);
  // Pronto, mas o estudante registrou que o órgão pede apostila/tradução ainda não feita.
  if (estado === 'pronto' || estado === 'recebido' || estado === 'arquivo-enviado') {
    if (['precisa', 'solicitada'].includes(rec.apostila)) estado = 'precisa-apostila';
    else if (['precisa', 'solicitada'].includes(rec.traducao)) estado = 'precisa-traducao';
  }
  return estado;
}

// ---------------------------------------------------------------------------
// Visão de um documento (no contexto de uma etapa)
// ---------------------------------------------------------------------------

function latestFiles(ctx, docId) {
  const latest = new Map();
  for (const f of ctx.files) if (f.docId === docId && (!latest.has(f.serie) || latest.get(f.serie).versao < f.versao)) latest.set(f.serie, f);
  return [...latest.values()];
}

export function docView(doc, ctx, stageId = doc.etapa) {
  if (doc.agregado) return aggregateView(doc, ctx);
  const raw = ctx.statuses[doc.id] || 'pendente';
  const rec = ctx.records[doc.id] || {};
  const app = applicability(doc, ctx);
  const stage = stageById(stageId);
  const envios = (rec.envios || []).map((e) => ({ ...e, procedimentoLabel: PROCEDURES[e.procedimento] || e.procedimento }));
  const latest = latestFiles(ctx, doc.id);
  const val = validityInfo(doc, rec, ctx);
  const estado = stateOf(doc, raw, rec, app, latest.length, val);
  const meta = DOC_STATES[estado];

  // Status interno efetivo (compatível com as missões e o Mentor): vem do estado detalhado.
  let status = meta.base;
  if (raw === 'enviado' && status === 'pronto') status = 'enviado';
  // Reaproveitado em outra etapa: "Enviado" só conta no procedimento da própria etapa.
  const reused = Boolean(stageId) && stageId !== doc.etapa;
  if (status === 'enviado' && reused) status = stage?.procedimento && envios.some((e) => e.procedimento === stage.procedimento) ? 'enviado' : 'pronto';
  const atencao = ['correcao', 'vencido'].includes(estado) || Boolean(val.alerta);

  const missoes = (USED_BY.get(doc.id) || []).map((id) => {
    const m = ctx.missoes.get(id);
    if (!m) return null;
    const rodada = ROUNDS.find((r) => r.missoes.some((x) => x.id === id));
    return { id, label: m.label, titulo: m.titulo, status: m.status, rota: ctx.jr ? `/j/${ctx.jr.id}/m/${id}` : null, rodada: rodada ? { numero: rodada.numero, titulo: rodada.titulo, sigla: rodada.sigla || null } : null, prepara: doc.prepara === id };
  }).filter(Boolean);
  const cat = categoryById(doc.categoria);

  return {
    id: doc.id, nome: doc.nome, descricao: doc.descricao, icone: doc.icone, acao: doc.acao, etapa: doc.etapa, reutilizado: reused,
    categoria: doc.categoria, categoriaNome: cat?.nome || null,
    exigencia: app.exigencia, classe: app.classe, motivo: app.motivo, fonte: app.fonte,
    status, statusRegistrado: raw, statusLabel: DOC_STATUS_SIMPLE[status],
    estado, estadoLabel: meta.rotulo, estadoTom: meta.tom, estadoIcone: meta.icone,
    aguardando: estado === 'aguardando',
    aguardandoDesde: rec.aguardandoDesde || null,
    pronto: READY.has(status), resolvido: DONE.has(status), atencao, alerta: val.alerta || null, aviso: val.aviso || null,
    evidencias: {
      declarado: rec.origem === 'declarado' || ctx.requisitos[doc.id] === 'tenho',
      porMissao: rec.origem === 'missao' ? rec.missao || null : null,
      anexos: latest.length,
      conferidoEm: rec.conferidoEm || null,
      atendidoPor: rec.atendidoPor ? { id: rec.atendidoPor, nome: docById(rec.atendidoPor)?.nome || rec.atendidoPor } : null,
      envios,
      aceito: envios.filter((e) => e.resultado === 'aceito').map((e) => e.procedimentoLabel),
    },
    validade: doc.validade ? rec.validade || null : undefined,
    tipoValidade: doc.tipoValidade || null,
    antecedencia: doc.antecedencia || null,
    comoObter: doc.comoObter || [],
    dica: doc.dica,
    missoes,
    // "Mais adiante": todas as missões que usam o documento estão bloqueadas e são de uma rodada posterior à próxima.
    maisAdiante: missoes.length > 0 && missoes.every((m) => m.status === 'bloqueada')
      && Math.min(...missoes.map((m) => Number(m.id.split('.')[0]))) > Math.max(ctx.journey?.rodadaAtual || 1, 2) && !READY.has(status),
  };
}

// Item-checklist que reúne outros documentos (apostilas, traduções, "documentação acadêmica").
function aggregateView(doc, ctx) {
  const tipo = /apostila/.test(doc.id) ? 'apostila' : /traduc/.test(doc.id) ? 'traducao' : 'documentos';
  const membros = doc.agregado.map((id) => docById(id)).filter(Boolean).map((d) => docView(d, ctx));
  const rel = membros.filter((m) => m.exigencia !== 'nao-necessario');
  let total;
  let prontos;
  if (tipo === 'documentos') {
    total = rel.length;
    prontos = rel.filter((m) => m.pronto).length;
  } else {
    const flagged = rel.filter((m) => ['precisa', 'solicitada', 'pronta'].includes((ctx.records[m.id] || {})[tipo]));
    total = flagged.length;
    prontos = flagged.filter((m) => (ctx.records[m.id] || {})[tipo] === 'pronta').length;
  }
  const app = applicability(doc, ctx);
  const estado = app.exigencia === 'nao-necessario' ? 'nao-aplicavel' : total && prontos === total ? 'pronto' : total ? 'recebido' : 'nao-iniciado';
  const meta = DOC_STATES[estado];
  const resumo = tipo === 'documentos'
    ? `${prontos} de ${total} prontos`
    : total ? `${prontos} de ${total} ${tipo === 'apostila' ? 'apostila(s)' : 'tradução(ões)'} pronta(s)` : `Nenhum documento marcado como precisando de ${tipo === 'apostila' ? 'apostila' : 'tradução'}`;
  return {
    id: doc.id, nome: doc.nome, descricao: doc.descricao, icone: doc.icone, acao: 'Ver documentos', etapa: doc.etapa, reutilizado: false,
    categoria: doc.categoria, categoriaNome: categoryById(doc.categoria)?.nome || null,
    exigencia: app.exigencia, classe: app.classe, motivo: app.motivo, fonte: app.fonte,
    status: meta.base, statusRegistrado: meta.base, statusLabel: resumo, estado, estadoLabel: resumo, estadoTom: meta.tom, estadoIcone: meta.icone,
    aguardando: false, pronto: estado === 'pronto', resolvido: estado === 'pronto' || estado === 'nao-aplicavel' || !total, atencao: false, alerta: null, aviso: null,
    evidencias: { declarado: false, porMissao: null, anexos: 0, conferidoEm: null, atendidoPor: null, envios: [], aceito: [] },
    comoObter: [], dica: '', missoes: [], maisAdiante: false,
    agregado: { tipo, total, prontos, membros: membros.map((m) => ({ id: m.id, nome: m.nome, estadoLabel: m.estadoLabel, estadoTom: m.estadoTom, pronto: m.pronto, exigencia: m.exigencia, marcacao: (ctx.records[m.id] || {})[tipo] || null })) },
  };
}

const rank = (v) => [DISPLAY_RANK[v.exigencia] ?? 5, v.atencao ? 0 : 1, v.maisAdiante ? 1 : 0, v.aguardando ? 1 : 0, ORDER.get(v.id)];
const byRank = (a, b) => { const x = rank(a); const y = rank(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
const isPending = (v) => !v.resolvido || v.atencao;
// Entra na contagem: exigido para o estudante (obrigatório, ou condicional cuja condição se confirmou).
const counts = (v) => !v.agregado && v.exigencia === 'requerido';

// ---------------------------------------------------------------------------
// Etapas, categorias e painel
// ---------------------------------------------------------------------------

function stageStates(ctx) {
  const rounds = new Map((ctx.journey?.rodadas || []).map((r) => [r.numero, r]));
  const atualRodada = ctx.journey?.rodadaAtual || 1;
  return DOC_STAGES.map((s) => {
    const rs = s.rodadas.map((n) => rounds.get(n)).filter(Boolean);
    const main = rs.filter((r) => !r.transversal);
    const desbloqueada = !ctx.journey || s.id === 'candidatura' || main.some((r) => r.desbloqueada);
    const concluida = Boolean(ctx.journey) && main.length > 0 && main.every((r) => ['concluida', 'nao-aplicavel'].includes(r.status));
    const atual = s.rodadas.includes(atualRodada) || (!ctx.journey && s.id === 'candidatura');
    return { ...s, desbloqueada, concluida, atual };
  });
}

function currentStage(ctx) {
  const states = stageStates(ctx);
  // Visto aprovado ou chegada registrada: o foco sai da documentação consular.
  if (ctx.conditions.chegou?.valor) return states.find((s) => s.id === 'estadia');
  const cur = states.find((s) => s.atual) || states[0];
  if (ctx.conditions.vistoAprovado?.valor && STAGE_ORDER.indexOf(cur.id) <= STAGE_ORDER.indexOf('visto')) return states.find((s) => s.id === 'viagem');
  return cur;
}

/** Visões de todos os documentos (uma por documento). */
export function allViews(ctx) {
  return DOCUMENTS.map((d) => docView(d, ctx));
}

function categorySummaries(ctx, views, atual) {
  const byId = new Map(views.map((v) => [v.id, v]));
  const ai = STAGE_ORDER.indexOf(atual.id);
  return DOC_CATEGORIES.map((c) => {
    const uses = CATEGORY_USES[c.id] || [];
    const docs = [...new Set(uses.map((x) => x.doc))].map((id) => byId.get(id));
    // Situação do documento NESTA categoria (o mesmo documento pode ser exigido aqui e só recomendado em outra).
    const here = docs.map((v) => {
      const uso = applicability(docById(v.id), ctx).usos.filter((x) => x.categoria === c.id).reduce((acc, x) => (!acc || EXIGENCIA_RANK[x.exigencia] < EXIGENCIA_RANK[acc.exigencia] ? x : acc), null);
      return { v, exigencia: uso?.exigencia || v.exigencia };
    });
    const req = here.filter((x) => x.exigencia === 'requerido' && !x.v.agregado);
    const prontos = req.filter((x) => x.v.pronto && !x.v.atencao).length;
    const visiveis = here.filter((x) => x.exigencia !== 'nao-necessario').length;
    const ci = STAGE_ORDER.indexOf(c.etapa);
    const estado = !visiveis ? 'oculta' : c.etapa === null ? 'complementar' : ci > ai ? 'futura' : ci === ai ? 'atual' : 'anterior';
    return {
      id: c.id, numero: c.numero, nome: c.nome, icone: c.icone, descricao: c.descricao, etapa: c.etapa, estado,
      total: req.length, prontos,
      pendentes: req.filter((x) => isPending(x.v)).length,
      atencao: req.filter((x) => x.v.atencao).length,
      conformeCaso: here.filter((x) => ['condicional', 'verificar'].includes(x.exigencia) && !x.v.agregado && !x.v.resolvido).length,
      recomendados: here.filter((x) => x.exigencia === 'recomendado').length,
      contingencia: here.filter((x) => ['condicional', 'verificar'].includes(x.exigencia) && !x.v.agregado && !x.v.resolvido).length,
      opcionais: here.filter((x) => x.exigencia === 'recomendado').length,
      naoAplicaveis: here.filter((x) => x.exigencia === 'nao-necessario').length,
      progresso: req.length ? prontos / req.length : 1,
      motivoOculta: !visiveis ? hiddenReason(c.id) : null,
    };
  });
}

function hiddenReason(catId) {
  const keys = [...new Set((CATEGORY_USES[catId] || []).flatMap((x) => [].concat(x.cond || [])).map((k) => k.replace('!', '')))];
  const labels = keys.map((k) => CONDITIONS[k]?.rotulo).filter(Boolean);
  return labels.length ? `Não se aplica pela sua situação atual (${labels.slice(0, 2).join('; ')}). Ajuste em "Minha situação" se mudar.` : 'Não se aplica ao seu caso agora.';
}

const slim = (v) => ({
  id: v.id, nome: v.nome, icone: v.icone, categoria: v.categoria, categoriaNome: v.categoriaNome, exigencia: v.exigencia, classe: v.classe, motivo: v.motivo,
  status: v.status, statusLabel: v.statusLabel, estado: v.estado, estadoLabel: v.estadoLabel, estadoTom: v.estadoTom, estadoIcone: v.estadoIcone,
  pronto: v.pronto, resolvido: v.resolvido, atencao: v.atencao, alerta: v.alerta, aguardando: v.aguardando, anexos: v.evidencias.anexos,
  agregado: v.agregado ? { tipo: v.agregado.tipo, total: v.agregado.total, prontos: v.agregado.prontos } : null, rota: `/documentos/${v.id}`,
});
export { slim as slimDoc };

export function dashboard(user, jr, now = new Date()) {
  const ctx = docContext(user, jr, now);
  const views = allViews(ctx);
  const atual = currentStage(ctx);
  const ai = STAGE_ORDER.indexOf(atual.id);
  const stageIdx = (v) => STAGE_ORDER.indexOf(v.etapa);

  // Documentos da etapa atual: os de categorias da etapa, exigidos para o estudante (prontos também, para dar o retrato).
  const daEtapa = views.filter((v) => counts(v) && applicability(docById(v.id), ctx).usos.some((x) => x.etapa === atual.id && x.exigencia === 'requerido'));
  const proximos = [...daEtapa].sort((a, b) => Number(isPending(b)) - Number(isPending(a)) || byRank(a, b)).slice(0, 6).map(slim);

  // Exceção ao desbloqueio: o que precisa de antecedência aparece antes (sem virar pendência da etapa atual).
  const antecedencia = views.filter((v) => v.antecedencia && stageIdx(v) > ai && !v.resolvido && v.exigencia === 'requerido');
  const candidatos = [...daEtapa.filter(isPending), ...antecedencia].sort(byRank);
  const prox = candidatos[0] || null;

  const exigidos = views.filter(counts);
  const futuro = (v) => stageIdx(v) > ai;
  const indicadores = {
    aplicaveis: exigidos.length,
    prontos: exigidos.filter((v) => v.pronto && !v.atencao).length,
    pendentes: exigidos.filter((v) => isPending(v) && !futuro(v) && !v.atencao).length,
    maisAdiante: exigidos.filter((v) => isPending(v) && futuro(v)).length,
    atencao: exigidos.filter((v) => v.atencao).length,
  };
  const resumoEtapa = {
    prontos: daEtapa.filter((v) => v.pronto && !v.atencao).length,
    pendentes: daEtapa.filter((v) => !v.pronto && !v.atencao).length,
    atencao: daEtapa.filter((v) => v.atencao).length,
    total: daEtapa.length,
  };
  resumoEtapa.progresso = resumoEtapa.total ? resumoEtapa.prontos / resumoEtapa.total : 1;
  const proximaEtapa = STAGE_ORDER.slice(ai + 1).map(stageById).find(Boolean);

  return {
    journeyId: jr?.id || null,
    programa: ctx.journey?.destino.programa?.nome || null,
    etapaAtual: atual.id,
    etapaAtualInfo: { id: atual.id, titulo: atual.titulo, resumo: atual.resumo },
    resumo: resumoEtapa,
    indicadores,
    proximos,
    proximo: prox ? { documento: prox, titulo: nextTitle(prox), frase: nextSentence(prox), acao: prox.acao } : null,
    proximaEtapa: proximaEtapa ? { id: proximaEtapa.id, titulo: proximaEtapa.titulo } : null,
    antecedencia: antecedencia.map(slim),
    categorias: categorySummaries(ctx, views, atual),
    condicoes: Object.entries(CONDITIONS).map(([key, c]) => ({ key, rotulo: c.rotulo, ajuda: c.ajuda, ...ctx.conditions[key] })),
    consulado: ctx.consulado.status === 'encontrado' ? { nome: ctx.consulado.consulado.nome, vistoEstudosUrl: ctx.consulado.consulado.vistoEstudosUrl } : null,
    arquivos: { total: ctx.files.length },
    declarou: Boolean(ctx.records._carteira?.declaradoEm),
    consentimento: user.docConsent || null,
    prefs: { versoes: user.docPrefs?.versoes !== false },
  };
}

const curto = (v) => v.nome.replace(/ \(.*\)$/, '').replace(/ válido$/, '').toLowerCase();
function nextTitle(v) {
  if (v.alerta) return `Atenção: ${curto(v)}`;
  if (v.atencao) return `${v.nome}: precisa de atenção`;
  if (v.aguardando) return `Acompanhe: ${curto(v)}`;
  return `Você ainda precisa organizar: ${curto(v)}`;
}
function nextSentence(v) {
  if (v.alerta) return v.alerta;
  if (v.estado === 'vencido') return 'O documento venceu. Veja como renovar.';
  if (v.atencao) return 'Você marcou que ele precisa de correção. Resolva antes de enviar.';
  if (v.aguardando) return 'Você já pediu e está aguardando. Um lembrete ajuda a não esquecer de conferir.';
  if (v.estado === 'precisa-apostila') return 'Falta a apostila que o órgão pediu.';
  if (v.estado === 'precisa-traducao') return 'Falta a tradução que o órgão pediu.';
  if (v.status === 'em-preparacao') return 'Você já começou. Falta pouco para deixá-lo pronto.';
  if (v.antecedencia && v.etapa) return v.antecedencia;
  return v.descricao;
}

// ---------------------------------------------------------------------------
// Lista com filtros (categoria, etapa, exigência, estado) e busca — sem abrir dezenas de documentos de uma vez
// ---------------------------------------------------------------------------

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function listDocuments(user, jr, { q, categoria, etapa, exigencia, estado, incluirNaoAplicaveis = false } = {}, now = new Date()) {
  const ctx = docContext(user, jr, now);
  const termos = norm(q).split(/\s+/).filter((w) => w.length >= 2);
  const out = [];
  for (const d of DOCUMENTS) {
    const app = applicability(d, ctx);
    let usos = app.usos;
    if (categoria) usos = usos.filter((x) => x.categoria === categoria);
    if (etapa) usos = usos.filter((x) => x.etapa === etapa);
    if (!usos.length) continue;
    const v = docView(d, ctx);
    // Exigência nesta categoria/etapa (a mais forte entre os usos filtrados).
    const uso = usos.reduce((acc, x) => (!acc || EXIGENCIA_RANK[x.exigencia] < EXIGENCIA_RANK[acc.exigencia] ? x : acc), null);
    if (!incluirNaoAplicaveis && uso.exigencia === 'nao-necessario' && !exigencia && !estado) continue;
    if (exigencia && uso.exigencia !== exigencia) continue;
    if (estado && v.estado !== estado) continue;
    if (termos.length) {
      const hay = norm(`${d.nome} ${d.oque || ''} ${d.para || ''} ${usos.map((x) => x.rotulo || '').join(' ')} ${v.categoriaNome}`);
      if (!termos.every((t) => hay.includes(t))) continue;
    }
    out.push({ ...slim(v), grupo: GRUPOS[uso.exigencia], exigencia: uso.exigencia, classe: uso.classe, classeLabel: uso.classeLabel, rotulos: [...new Set(usos.map((x) => x.rotulo).filter(Boolean))], condicao: uso.condicao, nota: usos.map((x) => x.nota).find(Boolean) || null });
  }
  const order = (x) => [DISPLAY_RANK[x.exigencia], isPending(x) ? 0 : 1, ORDER.get(x.id)];
  return out.sort((a, b) => { const x = order(a); const y = order(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; });
}

// ---------------------------------------------------------------------------
// Detalhe de um documento
// ---------------------------------------------------------------------------

export const publicFile = (f, token = null) => ({
  id: f.id, nome: f.nome, mime: f.mime, tamanho: f.tamanho, criadoEm: f.criadoEm, versao: f.versao, papel: f.papel || 'original', papelLabel: FILE_ROLES[f.papel || 'original'],
  url: token ? `/api/documents/files/${f.id}?t=${token(f.id)}` : `/api/documents/files/${f.id}`,
});

/** Detalhe de um documento: visão + arquivos (agrupados por papel) + explicações. tokenFor(fileId) assina as URLs. */
export function documentDetail(user, jr, docId, now = new Date(), tokenFor = null) {
  const doc = docById(docId);
  if (!doc) return null;
  const ctx = docContext(user, jr, now);
  const v = docView(doc, ctx);
  const rec = ctx.records[docId] || {};
  const files = ctx.files.filter((f) => f.docId === docId).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  const series = new Map();
  for (const f of files) {
    if (!series.has(f.serie)) series.set(f.serie, []);
    series.get(f.serie).push(f);
  }
  const stage = stageById(doc.etapa);
  const app = applicability(doc, ctx);
  return {
    ...v,
    oque: doc.oque || doc.descricao, para: doc.para || null, onde: doc.onde || null, quando: doc.quando || null,
    etapaTitulo: stage?.titulo || v.categoriaNome,
    usos: app.usos,
    // Etapas em que é usado: as categorias que o listam + as que o reúnem num item-checklist (ex.: diploma na matrícula).
    usadoEm: [...new Set([
      ...app.usos.filter((x) => x.exigencia !== 'nao-necessario').map((x) => x.categoriaNome),
      ...DOCUMENTS.filter((a) => a.agregado?.includes(docId)).flatMap((a) => (USES.get(a.id) || []).map((x) => categoryById(x.categoria)?.nome)),
    ].filter(Boolean))],
    apostila: { regra: doc.apostila, nota: doc.apostilaNota || null, marcacao: rec.apostila || null, guia: doc.apostila === 'talvez' ? { ...APOSTILLE_GUIDE, fonte: fonte(APOSTILLE_GUIDE.fonte) } : null },
    traducao: { regra: doc.traducao, nota: doc.traducaoNota || null, marcacao: rec.traducao || null, guia: doc.traducao === 'talvez' ? { ...TRANSLATION_GUIDE, fonte: fonte(TRANSLATION_GUIDE.fonte) } : null },
    informacoes: {
      emissor: rec.emissor || null, pais: rec.pais || null, emitidoEm: rec.emitidoEm || null, validade: rec.validade || null,
      alertaDias: rec.alertaDias || null, observacoes: rec.observacoes || null, enviadoACarteiraEm: files.length ? files[files.length - 1].criadoEm : null,
    },
    partes: doc.partes || null, multiplos: doc.multiplos || false, atendidoPorOpcoes: (doc.atendidoPor || []).map((id) => ({ id, nome: docById(id)?.nome })),
    // Revisão editorial (painel admin) prevalece sobre o catálogo: fontes, data e aviso.
    fontes: (docRule(docId)?.fontes || doc.fontes || [doc.fonte]).map(fonte).filter(Boolean),
    avisoEditorial: docRule(docId)?.aviso || null,
    procedimentos: Object.entries(PROCEDURES).map(([id, label]) => ({ id, label })),
    procedimentoDaEtapa: stage?.procedimento || null,
    estados: Object.entries(DOC_STATES).filter(([id]) => id !== 'nao-aplicavel' && id !== 'vencido').map(([id, s]) => ({ id, label: s.rotulo })),
    papeis: Object.entries(FILE_ROLES).map(([id, label]) => ({ id, label })),
    arquivos: [...series.values()].map((list) => {
      const [atual, ...anteriores] = list.sort((a, b) => b.versao - a.versao);
      return { ...publicFile(atual, tokenFor), anteriores: anteriores.map((f) => publicFile(f, tokenFor)) };
    }),
    consulado: ['visto', 'financeira', 'saude'].includes(doc.categoria) && ctx.consulado.status === 'encontrado' ? { nome: ctx.consulado.consulado.nome, vistoEstudosUrl: ctx.consulado.consulado.vistoEstudosUrl } : null,
    revisadoEm: docRule(docId)?.revisadoEm || (doc.fontes || []).map((id) => sourceById(id)?.revisadoEm).filter(Boolean).sort().pop() || null,
  };
}

// ---------------------------------------------------------------------------
// Integração com missões (contrato para a central da missão)
// ---------------------------------------------------------------------------

/** O que a missão precisa, com a situação de cada documento: { prontos[], faltam[], conformeCaso[], naoNecessarios[] }. */
export function docsForMission(user, jr, missionId, now = new Date()) {
  const ctx = docContext(user, jr, now);
  const ids = [...USED_BY.entries()].filter(([, ms]) => ms.includes(missionId)).map(([id]) => id).filter((id) => docById(id) && !docById(id).agregado);
  const stage = DOC_STAGES.find((s) => s.rodadas.includes(Number(missionId.split('.')[0])))?.id;
  const views = ids.map((id) => docView(docById(id), ctx, stage || docById(id).etapa));
  const row = (v) => ({
    ...slim(v),
    mensagem: !v.resolvido && !v.evidencias.anexos ? `Você ainda não adicionou ${artigo(v)} à Carteira.` : null,
    atendivelPor: (docById(v.id).atendidoPor || []).map((id) => ({ id, nome: docById(id)?.nome })),
  });
  const necessarios = views.filter((v) => v.exigencia === 'requerido');
  return {
    missaoId: missionId,
    // Ordem fixa: necessários → opcionais → contingência.
    necessarios: necessarios.sort(byRank).map(row),
    opcionais: views.filter((v) => v.exigencia === 'recomendado').sort(byRank).map(row),
    contingencia: views.filter((v) => ['condicional', 'verificar'].includes(v.exigencia)).sort(byRank).map(row),
    // Atalhos (contrato anterior): o que falta / já está pronto entre os necessários.
    prontos: necessarios.filter((v) => v.pronto && !v.atencao).map(row),
    faltam: necessarios.filter(isPending).sort(byRank).map(row),
    conformeCaso: views.filter((v) => ['condicional', 'verificar', 'recomendado'].includes(v.exigencia) && isPending(v)).sort(byRank).map(row),
    naoNecessarios: views.filter((v) => v.exigencia === 'nao-necessario').map(row),
  };
}
const FEM = /^(carta|certid|declara|comprova|fotograf|apólice|passagem|autoriza|procura|grade|ementa|reserva|cópia|carteira|conta|escritura|resolu|identifica|informa|documenta|tui|tie|taxa)/i;
const artigo = (v) => `${FEM.test(v.nome) ? 'sua' : 'seu'} ${v.nome.charAt(0).toLowerCase()}${v.nome.slice(1)}`;

/** Documentos de uma rodada inteira (todas as missões dela), sem repetir: { total, prontos, faltam[], conformeCaso } */
export function docsForRound(user, jr, roundNumber, now = new Date()) {
  const round = ROUNDS.find((r) => r.numero === Number(roundNumber));
  if (!round) return null;
  const ctx = docContext(user, jr, now);
  const ids = new Set(round.missoes.flatMap((m) => [...USED_BY.entries()].filter(([, ms]) => ms.includes(m.id)).map(([id]) => id)));
  const views = [...ids].map(docById).filter((d) => d && !d.agregado).map((d) => docView(d, ctx));
  const exigidos = views.filter((v) => v.exigencia === 'requerido');
  return {
    rodada: round.numero,
    total: exigidos.length,
    prontos: exigidos.filter((v) => v.pronto && !v.atencao).length,
    faltam: exigidos.filter(isPending).sort(byRank).map(slim),
    opcionais: views.filter((v) => v.exigencia === 'recomendado').length,
    contingencia: views.filter((v) => ['condicional', 'verificar'].includes(v.exigencia) && isPending(v)).length,
  };
}

/**
 * Missão concluída → documento pronto (uma vez por conclusão; nunca rebaixa um status).
 * Devolve a lista de mudanças para o chamador gravar dentro de users.update.
 */
export function missionSyncChanges(user) {
  const changes = [];
  for (const jr of user.journeys || []) {
    for (const d of DOCUMENTS.filter((x) => x.prepara)) {
      const mp = jr.missions?.[d.prepara];
      if (!mp?.concluidaEm) continue;
      const key = `${jr.id}:${d.prepara}`;
      const rec = user.docRecords?.[d.id] || {};
      if (rec.missaoSync?.[key] === mp.concluidaEm) continue;
      const raw = user.documents?.[d.id] || 'pendente';
      changes.push({ docId: d.id, key, em: mp.concluidaEm, missao: d.prepara, promover: ['pendente', 'em-preparacao'].includes(raw) });
    }
  }
  return changes;
}

/**
 * Aplica, dentro de users.update, o que as missões concluídas dizem sobre os documentos.
 * Devolve os documentos que passaram a "pronto" na Carteira: [{ id, nome, missao }].
 */
export function syncDocumentsFromMissions(u) {
  const changes = missionSyncChanges(u);
  applyMissionSync(u, changes);
  return changes.filter((c) => c.promover).map((c) => ({ id: c.docId, nome: docById(c.docId)?.nome || c.docId, missao: c.missao }));
}

export function applyMissionSync(u, changes) {
  for (const c of changes) {
    u.docRecords ??= {};
    const rec = (u.docRecords[c.docId] ??= {});
    rec.missaoSync = { ...(rec.missaoSync || {}), [c.key]: c.em };
    if (c.promover) {
      u.documents = { ...(u.documents || {}), [c.docId]: 'pronto' };
      Object.assign(rec, { origem: 'missao', missao: c.missao, aguardando: false, atualizadoEm: new Date().toISOString() });
    }
  }
}
