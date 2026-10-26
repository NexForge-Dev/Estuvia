// Carteira de documentos: regras puras (sem disco nem rede).
//
// Fonte do status: user.documents[docId] (DOC_STATUS), a mesma que as missões leem (journey-engine AUTO_RULES).
// Ao lado dele, user.docRecords[docId] guarda o que NÃO é status:
//   origem (declarado | missao | manual), aguardando, conferidoEm, validade,
//   envios[{ procedimento, em, resultado }] — enviado ao DUA ≠ apresentado ao consulado —, missaoSync, lembretes.
// E user.docFiles[] guarda os metadados dos arquivos cifrados (routes/documents.js).
//
// Estados de confiança são separados e nunca se confundem:
//   declarado (o estudante disse que tem) · anexado (há arquivo na conta) · conferido (o estudante revisou)
//   · aceito no procedimento (o estudante registrou que o órgão aceitou). A Estuvia não valida documentos.

import { DOCUMENTS, DOC_STAGES, DOC_STATUS_SIMPLE, PROCEDURES } from './content/documents.js';
import { ROUNDS } from './content/rounds.js';
import { programById } from './content/catalog.js';
import { sourceById } from './content/sources.js';
import { consulateResult } from './content/places.js';
import { computeJourney } from './journey-engine.js';

const DONE = new Set(['pronto', 'enviado', 'nao-se-aplica']);
const READY = new Set(['pronto', 'enviado']);
const ORDER = new Map(DOCUMENTS.map((d, i) => [d.id, i]));
export const docById = (id) => DOCUMENTS.find((d) => d.id === id) || null;
const stageById = (id) => DOC_STAGES.find((s) => s.id === id);

// Missões que usam cada documento (para "Usado nas missões" e para a integração com a jornada).
const USED_BY = new Map();
for (const r of ROUNDS) {
  for (const m of r.missoes) {
    for (const d of m.documentos || []) {
      if (!USED_BY.has(d)) USED_BY.set(d, []);
      USED_BY.get(d).push(m.id);
    }
  }
}
for (const d of DOCUMENTS) {
  if (d.prepara && !(USED_BY.get(d.id) || []).includes(d.prepara)) USED_BY.set(d.id, [d.prepara, ...(USED_BY.get(d.id) || [])]);
}

const addMonths = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};
const isoDay = (now) => now.toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Contexto
// ---------------------------------------------------------------------------

export function docContext(user, jr, now = new Date()) {
  const program = jr ? programById(jr.programaId) : null;
  const journey = jr ? computeJourney(user, jr, now) : null;
  const duracaoMeses = Number(jr?.duracaoMeses) || program?.duracaoMeses || null;
  const p = user.profile || {};
  return {
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
}

const fonte = (id) => {
  const s = sourceById(id);
  return s ? { id: s.id, titulo: s.titulo, orgao: s.orgao, url: s.url || null, revisadoEm: s.revisadoEm } : null;
};

// ---------------------------------------------------------------------------
// Personalização: o documento vale para este estudante?
// Só usa dados do catálogo (com fonte) ou do próprio estudante. Sem dado → mantém a exigência do catálogo.
// ---------------------------------------------------------------------------

export function applicability(doc, ctx) {
  const base = { exigencia: doc.exigencia, motivo: null, fonte: fonte(doc.fonte) };
  const longa = ctx.duracaoMeses ? ctx.duracaoMeses > 6 : null;
  switch (doc.id) {
    case 'idioma': {
      const req = ctx.program?.idioma;
      if (!req) return { ...base, motivo: 'Defina o mestrado da jornada para saber se ele exige certificado.' };
      const f = fonte(req.fonte) || base.fonte;
      if (req.status === 'nao-requerido') return { exigencia: 'nao-necessario', motivo: 'O seu mestrado não exige certificado de idioma.', fonte: f };
      if (req.status === 'requerido' && req.certificado) return { exigencia: 'requerido', motivo: `O seu mestrado exige espanhol ${req.nivel || ''} com certificado.`.replace('  ', ' '), fonte: f };
      if (req.status === 'requerido') return { exigencia: 'condicional', motivo: `O mestrado pede espanhol ${req.nivel || ''}, sem exigir certificado formal: confira como comprovar.`.replace('  ', ' '), fonte: f };
      return { ...base, exigencia: 'verificar', motivo: 'A exigência de idioma do seu mestrado ainda não está confirmada na ficha oficial.', fonte: f };
    }
    case 'antecedentes':
      if (longa === true) return { exigencia: 'requerido', motivo: 'Exigida porque a sua estada passa de seis meses.', fonte: base.fonte };
      if (longa === false) return { exigencia: 'nao-necessario', motivo: 'A sua estada prevista é de até seis meses.', fonte: base.fonte };
      return { ...base, motivo: 'Exigida para estadas acima de seis meses.' };
    case 'tie':
    case 'tie-solicitacao':
    case 'taxa-tie':
      if (longa === false) return { exigencia: 'nao-necessario', motivo: 'A TIE é para estadas acima de seis meses.', fonte: base.fonte };
      return { ...base, motivo: longa ? 'A sua estada passa de seis meses.' : 'Para estadas acima de seis meses.' };
    case 'apoio-familiar':
      return ctx.recursos.some((r) => r.tipo === 'familiar')
        ? { ...base, exigencia: 'condicional', motivo: 'Você registrou apoio familiar no planejador: o consulado define como comprovar.' }
        : { exigencia: 'nao-necessario', motivo: 'Você não registrou apoio de terceiros no planejador financeiro.', fonte: base.fonte };
    case 'carta-bolsa':
      return ctx.bolsas.some((b) => b.status === 'concedida')
        ? { ...base, exigencia: 'requerido', motivo: 'Você registrou uma bolsa concedida.' }
        : { exigencia: 'nao-necessario', motivo: 'Só vale quando há bolsa oficialmente concedida.', fonte: base.fonte };
    default:
      return base;
  }
}

// ---------------------------------------------------------------------------
// Visão de um documento (no contexto de uma etapa)
// ---------------------------------------------------------------------------

function validityAlert(doc, rec, ctx) {
  if (!doc.validade || !rec.validade) return null;
  const hoje = isoDay(ctx.now);
  if (rec.validade < hoje) return 'Venceu. Você vai precisar de um novo.';
  const inicio = ctx.jr?.inicioAulas && ctx.jr.inicioAulas > hoje ? ctx.jr.inicioAulas : hoje;
  const fim = addMonths(inicio, ctx.duracaoMeses || 12);
  if (rec.validade < fim) return `Vence em ${rec.validade.split('-').reverse().join('/')}, antes do fim previsto da estadia.`;
  return null;
}

export function docView(doc, ctx, stageId = doc.etapa) {
  const raw = ctx.statuses[doc.id] || 'pendente';
  const rec = ctx.records[doc.id] || {};
  const app = applicability(doc, ctx);
  const stage = stageById(stageId);
  const envios = (rec.envios || []).map((e) => ({ ...e, procedimentoLabel: PROCEDURES[e.procedimento] || e.procedimento }));
  const files = ctx.files.filter((f) => f.docId === doc.id);
  const latest = new Map();
  for (const f of files) if (!latest.has(f.serie) || latest.get(f.serie).versao < f.versao) latest.set(f.serie, f);

  // Estado efetivo na etapa: "Não necessário" pelo perfil; "Enviado" só conta no procedimento da própria etapa.
  let status = raw;
  if (app.exigencia === 'nao-necessario' && !READY.has(raw)) status = 'nao-se-aplica';
  const reused = stageId !== doc.etapa;
  if (raw === 'enviado' && reused) status = stage?.procedimento && envios.some((e) => e.procedimento === stage.procedimento) ? 'enviado' : 'pronto';
  const alerta = validityAlert(doc, rec, ctx);
  const atencao = status === 'correcao' || Boolean(alerta);

  const missoes = (USED_BY.get(doc.id) || []).map((id) => {
    const m = ctx.missoes.get(id);
    return m ? { id, label: m.label, titulo: m.titulo, status: m.status, rota: ctx.jr ? `/j/${ctx.jr.id}/m/${id}` : null } : null;
  }).filter(Boolean);

  return {
    id: doc.id, nome: doc.nome, descricao: doc.descricao, icone: doc.icone, acao: doc.acao, etapa: doc.etapa, reutilizado: reused,
    exigencia: app.exigencia, motivo: app.motivo, fonte: app.fonte,
    status, statusRegistrado: raw, statusLabel: DOC_STATUS_SIMPLE[status],
    aguardando: Boolean(rec.aguardando) && status === 'em-preparacao',
    aguardandoDesde: rec.aguardandoDesde || null,
    pronto: READY.has(status), resolvido: DONE.has(status), atencao, alerta,
    evidencias: {
      declarado: rec.origem === 'declarado' || ctx.requisitos[doc.id] === 'tenho',
      porMissao: rec.origem === 'missao' ? rec.missao || null : null,
      anexos: latest.size,
      conferidoEm: rec.conferidoEm || null,
      envios,
      aceito: envios.filter((e) => e.resultado === 'aceito').map((e) => e.procedimentoLabel),
    },
    validade: doc.validade ? rec.validade || null : undefined,
    antecedencia: doc.antecedencia || null,
    comoObter: doc.comoObter || [],
    dica: doc.dica,
    missoes,
    // "Mais adiante": todas as missões que usam o documento estão bloqueadas e são de uma rodada posterior à próxima
    // (na rodada 1, os documentos da rodada 2 já valem a pena preparar).
    maisAdiante: missoes.length > 0 && missoes.every((m) => m.status === 'bloqueada')
      && Math.min(...missoes.map((m) => Number(m.id.split('.')[0]))) > Math.max(ctx.journey?.rodadaAtual || 1, 2) && !READY.has(status),
  };
}

const rank = (v) => [v.atencao ? 0 : 1, v.maisAdiante ? 1 : 0, { requerido: 0, condicional: 1, verificar: 2 }[v.exigencia] ?? 3, v.aguardando ? 1 : 0, ORDER.get(v.id)];
const byRank = (a, b) => { const x = rank(a); const y = rank(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

function counts(views) {
  const relevant = views.filter((v) => v.status !== 'nao-se-aplica');
  const prontos = relevant.filter((v) => v.pronto && !v.atencao).length;
  return {
    prontos,
    pendentes: relevant.filter((v) => !v.pronto && !v.atencao).length,
    atencao: relevant.filter((v) => v.atencao).length,
    naoNecessarios: views.length - relevant.length,
    total: relevant.length,
    progresso: relevant.length ? prontos / relevant.length : 1,
  };
}

// ---------------------------------------------------------------------------
// Etapas e dashboard
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

export function dashboard(user, jr, now = new Date()) {
  const ctx = docContext(user, jr, now);
  const states = stageStates(ctx);
  let current = states.find((s) => s.atual) || states[0];
  // Etapa atual já resolvida (ex.: candidatura enviada aguardando resultado): o foco passa para a próxima liberada.
  const etapas = states.map((s) => {
    const own = DOCUMENTS.filter((d) => d.etapa === s.id).map((d) => docView(d, ctx, s.id));
    const reuse = (s.reutiliza || []).map((id) => docView(docById(id), ctx, s.id));
    const c = counts(own);
    const visivel = s.desbloqueada || s.concluida || s.atual;
    return {
      id: s.id, titulo: s.titulo, icone: s.icone, resumo: s.resumo, procedimento: s.procedimentoLabel,
      estado: s.concluida ? 'concluida' : s.atual ? 'atual' : s.desbloqueada ? 'disponivel' : 'futura',
      contagem: c,
      // Etapa futura: só a prévia (quantos e quais tipos), nunca a lista completa como pendência.
      documentos: visivel ? own.sort(byRank) : [],
      previa: visivel ? null : { total: c.total, icones: [...new Set(own.filter((v) => v.status !== 'nao-se-aplica').map((v) => v.icone))].slice(0, 4) },
      reutiliza: visivel ? reuse.filter((v) => v.status !== 'nao-se-aplica').map((v) => ({ id: v.id, nome: v.nome, icone: v.icone, pronto: v.pronto, status: v.status, statusLabel: v.statusLabel })) : [],
    };
  });
  const atual = etapas.find((e) => e.id === current.id);
  // Exceção ao desbloqueio: o que precisa de antecedência aparece antes (sem virar pendência da etapa atual).
  const antecedencia = etapas.filter((e) => e.estado === 'futura' || (e.estado === 'disponivel' && e.id !== atual.id))
    .flatMap((e) => DOCUMENTS.filter((d) => d.etapa === e.id && d.antecedencia).map((d) => docView(d, ctx, e.id)))
    .filter((v) => !v.resolvido && v.exigencia !== 'nao-necessario');

  const candidatos = [...atual.documentos.filter((v) => !v.resolvido || v.atencao), ...antecedencia].sort(byRank);
  const prox = candidatos[0] || null;
  const proximaEtapa = etapas.find((e, i) => i > etapas.indexOf(atual) && e.estado !== 'concluida');
  return {
    journeyId: jr?.id || null,
    programa: ctx.journey?.destino.programa?.nome || null,
    etapaAtual: atual.id,
    resumo: atual.contagem,
    proximo: prox ? { documento: prox, titulo: nextTitle(prox), frase: nextSentence(prox), acao: prox.acao } : null,
    proximaEtapa: proximaEtapa ? { id: proximaEtapa.id, titulo: proximaEtapa.titulo } : null,
    antecedencia,
    etapas,
    consulado: ctx.consulado.status === 'encontrado' ? { nome: ctx.consulado.consulado.nome, vistoEstudosUrl: ctx.consulado.consulado.vistoEstudosUrl } : null,
    arquivos: { total: ctx.files.length },
    declarou: Boolean(ctx.records._carteira?.declaradoEm),
  };
}

const curto = (v) => v.nome.replace(/ (.*)$/, '').replace(/ válido$/, '').toLowerCase();
function nextTitle(v) {
  if (v.alerta) return `Atenção ao seu ${curto(v)}`;
  if (v.atencao) return `${v.nome}: precisa de atenção`;
  if (v.aguardando) return `Acompanhe: ${curto(v)}`;
  return `Você ainda precisa organizar: ${curto(v)}`;
}
function nextSentence(v) {
  if (v.alerta) return v.alerta;
  if (v.atencao) return 'Você marcou que ele precisa de correção. Resolva antes de enviar.';
  if (v.aguardando) return 'Você já pediu e está aguardando. Um lembrete ajuda a não esquecer de conferir.';
  if (v.status === 'em-preparacao') return 'Você já começou. Falta pouco para deixá-lo pronto.';
  if (v.antecedencia && v.etapa) return v.antecedencia;
  return v.descricao;
}

/** Detalhe de um documento: visão + arquivos (metadados) + etapa de origem. */
export function documentDetail(user, jr, docId, now = new Date()) {
  const doc = docById(docId);
  if (!doc) return null;
  const ctx = docContext(user, jr, now);
  const v = docView(doc, ctx);
  const files = ctx.files.filter((f) => f.docId === docId).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  const series = new Map();
  for (const f of files) {
    if (!series.has(f.serie)) series.set(f.serie, []);
    series.get(f.serie).push(f);
  }
  const stage = stageById(doc.etapa);
  return {
    ...v,
    etapaTitulo: stage.titulo,
    procedimentos: Object.entries(PROCEDURES).map(([id, label]) => ({ id, label })),
    procedimentoDaEtapa: stage.procedimento,
    arquivos: [...series.values()].map((list) => {
      const [atual, ...anteriores] = list.sort((a, b) => b.versao - a.versao);
      return { ...publicFile(atual), anteriores: anteriores.map(publicFile) };
    }),
    usadoEm: DOC_STAGES.filter((s) => s.id === doc.etapa || (s.reutiliza || []).includes(doc.id)).map((s) => s.titulo),
    consulado: doc.etapa === 'visto' && ctx.consulado.status === 'encontrado' ? { nome: ctx.consulado.consulado.nome, vistoEstudosUrl: ctx.consulado.consulado.vistoEstudosUrl } : null,
  };
}

export const publicFile = (f) => ({ id: f.id, nome: f.nome, mime: f.mime, tamanho: f.tamanho, criadoEm: f.criadoEm, versao: f.versao, url: `/api/documents/files/${f.id}` });

// ---------------------------------------------------------------------------
// Integração com missões (contrato para MissionGuide/MissionContent)
// ---------------------------------------------------------------------------

/** O que a missão precisa, já com a situação de cada documento: { prontos[], faltam[], naoNecessarios[] }. */
export function docsForMission(user, jr, missionId, now = new Date()) {
  const ctx = docContext(user, jr, now);
  const ids = [...new Set([...(ROUNDS.flatMap((r) => r.missoes).find((m) => m.id === missionId)?.documentos || []), ...DOCUMENTS.filter((d) => d.prepara === missionId).map((d) => d.id)])];
  const stage = DOC_STAGES.find((s) => s.rodadas.includes(Number(missionId.split('.')[0])))?.id;
  const views = ids.map((id) => docView(docById(id), ctx, stage || docById(id).etapa));
  const slim = (v) => ({ id: v.id, nome: v.nome, icone: v.icone, status: v.status, statusLabel: v.statusLabel, exigencia: v.exigencia, motivo: v.motivo, anexos: v.evidencias.anexos, rota: `/documentos/${v.id}` });
  return {
    missaoId: missionId,
    prontos: views.filter((v) => v.pronto && !v.atencao).map(slim),
    faltam: views.filter((v) => !v.resolvido || v.atencao).sort(byRank).map(slim),
    naoNecessarios: views.filter((v) => v.status === 'nao-se-aplica').map(slim),
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
