// Serviço do Radar: consultas da interface, acompanhamento, Agenda, jornada e assistente.
// Tudo aqui lê a base VERIFICADA (db.js). Nada é inferido de anos anteriores: um ciclo sem
// calendário publicado mostra o anterior apenas como "referência histórica".

import { data, save, newId } from './db.js';
import { opportunityState, upcoming, STATES, STALE_AFTER_HOURS } from './status.js';
import { APPLICATION_CHANNEL, UNIVERSITY_INFO } from './registry.js';
import { EVENT_TYPES, tick } from './notify.js';
import { parseAcademicYear, todayMadrid, daysBetween } from './dates.js';
import { bootstrap, ensureSources, duaSheetUrl } from './pipeline.js';
import { MANUAL_DUA_LINKS } from '../content/program-channels.js';
import { languageRequirements } from './connectors/dua-program.js';

// Idiomas exigidos recalculados a partir dos requisitos da ficha guardada: correções do interpretador valem
// na hora, sem esperar a próxima coleta (o texto oficial é a fonte; idiomasExigidos guardado é só cache).
const fichaIdiomas = (f) => (f ? languageRequirements(f.requisitos || []) : []);
import { matchDegree } from '../../public/js/data/degree.js';

let scholarships = [];
export async function initRadar() {
  ensureSources();
  await bootstrap();
  try {
    const mod = await import('../content/scholarships.js');
    scholarships = mod.SCHOLARSHIPS || [];
  } catch { scholarships = []; }
}

// ---------- Utilitários ----------

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const sourceById = (id) => data().sources.find((s) => s.id === id);
const shortYear = (curso) => { const y = parseAcademicYear(curso); return y ? `${y.inicio}/${String(y.fim).slice(2)}` : null; };
const longYear = (curso) => parseAcademicYear(curso)?.rotulo || null;

function cycleData(opp) {
  const d = data();
  const windows = d.windows.filter((w) => w.procedimentoId === opp.procedimentoId && w.anoAcademico === opp.anoAcademico);
  const events = d.events.filter((e) => e.procedimentoId === opp.procedimentoId && e.anoAcademico === opp.anoAcademico);
  return { windows, events };
}

function calendarHealth() {
  const s = sourceById('dua-calendario');
  return { ultimaVerificacaoOk: s?.ultimaVerificacaoOk, falhando: ['falhando', 'bloqueada'].includes(s?.estado) || Boolean(s?.indisponivelManual), fonte: s };
}

/** Ciclo anterior com calendário publicado (só para referência histórica). */
function historicalReference(opp) {
  const y = parseAcademicYear(opp.anoAcademico);
  if (!y) return null;
  const prev = `${y.inicio - 1}/${y.inicio}`;
  const d = data();
  const windows = d.windows.filter((w) => w.procedimentoId === opp.procedimentoId && w.anoAcademico === prev && w.confirmacao === 'confirmado');
  if (!windows.length) return null;
  return {
    anoAcademico: prev,
    aviso: `Referência histórica do curso ${prev}. Não são as datas de ${opp.anoAcademico}.`,
    fases: windows.sort((a, b) => a.fase - b.fase).map((w) => ({ fase: w.fase, abertura: w.abertura, encerramento: w.encerramento, publico: w.publico })),
  };
}

const PROFILE_AREAS = [
  [/inform|computa|software|sistemas|dados|ti\b|tecnolog/, ['Ingeniería y Arquitectura', 'Ciencias'], /software|inform|datos|ciber|digital|computador/],
  [/engenh|arquitet|civil|eletr|mecan|quim/, ['Ingeniería y Arquitectura'], /ingenier|arquitect|estructur|electr|hidraul/],
  [/administra|econom|contab|gest|marketing|negocio|empresa/, ['Ciencias Sociales y Jurídicas', 'Ingeniería y Arquitectura'], /empresa|econom|marketing|gestion|negocio|auditor/],
  [/direito|jur[ií]d|advoca/, ['Ciencias Sociales y Jurídicas'], /derecho|abogac|jurid|criminol/],
  [/educa|pedagog|letras|licenciatura/, ['Ciencias Sociales y Jurídicas', 'Artes y Humanidades'], /educac|profesorado|didactic|ensenanza/],
  [/sa[uú]de|medic|enferm|nutri|farm|psicol|fisio|odont/, ['Ciencias de la Salud'], /salud|enfermer|nutric|farmac|psicolog|medic/],
  [/hist|filos|arte|m[uú]sic|comunica|jornal|tradu/, ['Artes y Humanidades'], /histor|filosof|arte|music|traduc|literat|periodism/],
  [/biolog|f[ií]sic|matem|qu[ií]m|geolog|estat/, ['Ciencias'], /biolog|fisic|matemat|quimic|geolog|estadist/],
];

/** Compatibilidade estimada pela área de formação declarada — não é avaliação de admissão. */
export function compatibility(profile, program) {
  const f = norm(profile?.formacao);
  if (!f) return null;
  for (const [re, ramos, nameRe] of PROFILE_AREAS) {
    if (!re.test(f)) continue;
    if (nameRe.test(norm(program.nome))) return 'alta';
    if (program.ramos?.some((r) => ramos.includes(r))) return 'media';
  }
  return 'baixa';
}

// ---------- Ficha do DUA: critérios, requisitos e idioma ----------

export const NIVEIS_QECR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

// Critérios mais comuns nas fichas, em português; o texto original sempre acompanha.
const CRITERIOS_PT = [
  [/NOTA MEDIA|EXPEDIENTE/, 'Nota média do histórico'],
  [/CURRICUL/, 'Currículo'],
  [/ENTREVISTA/, 'Entrevista'],
  [/CONOCIMIENTO DE IDIOMAS|IDIOMA/, 'Conhecimento de idiomas'],
  [/EXPERIENCIA PROFESIONAL|EXPERIENCIA LABORAL|EXPERIENCIA/, 'Experiência profissional'],
  [/CARTA DE MOTIVACION/, 'Carta de motivação'],
  [/MOTIVACION/, 'Motivação'],
  [/CARTA.* RECOMENDACION|RECOMENDACION/, 'Cartas de recomendação'],
  [/ADECUACION|AFINIDAD|PERFIL/, 'Adequação da formação ao máster'],
  [/INVESTIGA|PUBLICACION/, 'Experiência em pesquisa'],
  [/FORMACION COMPLEMENTARIA|OTROS MERITOS|MERITOS/, 'Outros méritos'],
];
const upperNorm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
// Só rótulos curtos são traduzidos: uma descrição longa mistura vários méritos e perderia sentido.
export const criterioPt = (desc) => (String(desc || '').length <= 45 && CRITERIOS_PT.find(([re]) => re.test(upperNorm(desc)))?.[1])
  || String(desc || '').toLowerCase().replace(/^./, (c) => c.toUpperCase());

/** Exigência de espanhol segundo a ficha do DUA. null = ficha ainda não coletada (não presumir nada). */
export function spanishRequirement(p) {
  const f = p?.fichaDua;
  if (!f) return null;
  const es = fichaIdiomas(f).find((i) => i.idioma === 'espanhol');
  return es ? { exige: true, nivel: es.nivel, obrigatorio: es.obrigatorio, estrangeiros: es.estrangeiros, texto: es.texto } : { exige: false };
}

const langLabel = (i) => `${i.idioma.replace(/^./, (c) => c.toUpperCase())} ${i.nivel || '(nível não informado na ficha)'}`;

function admissionFromDua(p) {
  const f = p?.fichaDua;
  if (!f) return null;
  const pref = (k) => f.titulacoes.filter((t) => t.preferencia === k).map((t) => t.nome);
  return {
    url: duaSheetUrl(p.duaCodigo),
    codigoDua: p.duaCodigo,
    verificadaEm: f.verificadaEm,
    inicioCurso: f.inicioCurso,
    fimCurso: f.fimCurso,
    centro: f.centro,
    somenteNotaExpediente: f.somenteNotaExpediente,
    criterios: f.baremo.map((c) => ({ descricao: criterioPt(c.descricao), original: c.descricao, peso: c.peso })),
    requisitos: f.requisitos,
    idiomas: fichaIdiomas(f),
    titulacoes: { alta: pref('alta'), media: pref('media'), baixa: pref('baixa'), condicionadas: f.condicionadas, outras: f.restoComAcesso },
    equivalentes: f.titulacoesEquivalentes || [],
  };
}

// ---------- Card / detalhe ----------

const pendingCalendarChange = (opp) => data().reviews.some((r) => r.status === 'aberta' && ['alteracao-critica', 'conflito'].includes(r.tipo)
  && ['calendar', 'calendario'].includes(r.proposta?.kind) && r.proposta.parsed?.anoAcademico === opp.anoAcademico
  && (r.proposta.parsed.procedimentoId || opp.procedimentoId) === opp.procedimentoId);

function verification(state, windows, health, opp) {
  const s = health.fonte;
  const base = { fonte: s?.rotuloPublico || 'Distrito Único Andaluz', url: s?.url, ultimaVerificacao: s?.ultimaVerificacaoOk || null, ultimaConsulta: s?.ultimaConsulta || null };
  if (opp.demo) return { ...base, status: 'demonstrativo', texto: 'DADO DEMONSTRATIVO, ambiente de desenvolvimento. Não é informação oficial.' };
  if (state.estado === 'desatualizado') return { ...base, status: 'desatualizada', texto: `Não foi possível confirmar o estado atual: a última verificação bem-sucedida tem mais de ${STALE_AFTER_HOURS} h.` };
  if (!windows.length) return { ...base, status: 'nao-confirmada', texto: 'Não foi possível confirmar as datas deste ano acadêmico.' };
  if (windows.some((w) => w.confirmacao !== 'confirmado')) return { ...base, status: 'prevista', texto: 'Previsão institucional, ainda não confirmada em boletim oficial.' };
  // A fonte já mostrou datas diferentes das publicadas aqui (alteração crítica ou conflito em
  // revisão): o dado exibido não pode continuar sendo apresentado como "confirmado".
  if (pendingCalendarChange(opp)) return { ...base, status: 'pendente', alteracaoEmRevisao: true, texto: 'A fonte oficial publicou uma alteração destas datas, que está em conferência. Confira na fonte oficial antes de agir.' };
  if (state.atualizacaoPendente) return { ...base, status: 'pendente', texto: 'Confirmada em fonte oficial, atualização pendente (exibindo o último dado verificado).' };
  return { ...base, status: 'confirmada', texto: 'Confirmada em fonte oficial' };
}

function card(opp, { user = null, now = Date.now() } = {}) {
  const d = data();
  const p = d.programs.find((x) => x.id === opp.programId) || {};
  const u = UNIVERSITY_INFO[opp.universidadeId] || {};
  const { windows, events } = cycleData(opp);
  const health = calendarHealth();
  const channel = APPLICATION_CHANNEL[opp.procedimentoId] || null;
  const state = opportunityState(opp, windows, events, health, channel, now);
  const meta = STATES[state.estado];
  const avail = d.availability.filter((a) => a.opportunityId === opp.id).at(-1) || null;
  const following = user ? d.subscriptions.some((s) => s.userId === user.id && s.opportunityId === opp.id && s.ativa !== false) : false;
  const inJourney = user ? (user.journeys || []).some((j) => j.programaId === opp.programId) : false;
  return {
    id: opp.id,
    programId: opp.programId,
    tipo: opp.tipo,
    anoAcademico: opp.anoAcademico,
    universidade: { id: u.id, sigla: u.sigla, nome: u.nome, cidade: u.cidade, pais: u.pais, regiao: u.regiao, capa: u.capa, logo: u.logo },
    programa: {
      nome: p.nome, ramos: p.ramos || [], codigo: p.codigo, tipoTitulo: p.tipoTitulo, ofertaCondicionada: Boolean(p.ofertaCondicionada),
      fichaUrl: p.fichaUrl, webPropria: p.ficha?.webPropria || p.webPropria, cursoCatalogo: p.cursoCatalogo,
      creditos: p.ficha?.creditos ?? null, modalidade: p.ficha?.modalidade ?? null, idiomaEnsino: p.ficha?.idiomaEnsino ?? null,
      duracaoEstimadaAnos: p.ficha?.duracaoEstimadaAnos ?? null, fichaVerificada: Boolean(p.ficha), fichaVerificadaEm: p.ficha?.verificadaEm || null,
      cursoFicha: p.ficha?.anoAcademico || null,
      // Da ficha do DUA (null enquanto não coletada: "não informado", nunca "não exige").
      idiomasExigidos: p.fichaDua ? fichaIdiomas(p.fichaDua).map(({ idioma, nivel, obrigatorio }) => ({ idioma, nivel, obrigatorio })) : null,
      criteriosVerificados: Boolean(p.fichaDua),
      inicioCurso: p.fichaDua?.inicioCurso || null,
    },
    estado: state.estado,
    estadoLabel: meta.label,
    estadoDescricao: meta.descricao,
    tom: meta.tom,
    fases: state.fases,
    faseAtual: state.faseAtual || null,
    abertura: state.proximaAbertura || (state.estado === 'abertas' ? windows.find((w) => w.fase === state.faseAtual)?.abertura : null),
    prazoFinal: state.prazoFinal || null,
    diasParaPrazo: state.prazoFinal ? daysBetween(todayMadrid(new Date(now)), state.prazoFinal) : null,
    proximos: upcoming(windows, events, now, 3),
    referenciaHistorica: windows.length ? null : historicalReference(opp),
    vagas: avail
      ? { ofertadas: avail.vagasOfertadas, remanescentes: avail.vagasRemanescentes ?? null, fonte: avail.fonte, data: avail.dataInformacao, aviso: 'Vagas ofertadas não significam vagas disponíveis agora.' }
      : { ofertadas: null, texto: 'Consultar oferta oficial do ciclo correspondente.' },
    candidatura: channel ? { url: channel.url, rotulo: channel.rotulo } : null,
    verificacao: verification(state, windows, health, opp),
    compatibilidade: user ? compatibility(user.profile, p) : null,
    acompanhando: following,
    naJornada: inJourney,
    demo: Boolean(opp.demo),
  };
}

// ---------- Listagem com filtros ----------

const FILTERS = ['q', 'pais', 'cidade', 'universidade', 'area', 'ano', 'idioma', 'nivelIdioma', 'modalidade', 'precoMax', 'situacao', 'bolsas', 'compativel', 'acompanhando'];

export function listOpportunities(query = {}, { user = null, now = Date.now(), semLimite = false } = {}) {
  const d = data();
  const cycles = [...new Set(d.opportunities.map((o) => o.anoAcademico))].sort();
  const ano = longYear(query.ano) || cycles.at(-1) || null;
  let items = d.opportunities.filter((o) => !ano || o.anoAcademico === ano).map((o) => card(o, { user, now }));
  const all = items;

  const q = norm(query.q);
  if (q) items = items.filter((c) => q.split(/\s+/).every((t) => norm(`${c.programa.nome} ${c.universidade.nome} ${c.universidade.sigla} ${c.programa.codigo} ${c.programa.ramos.join(' ')}`).includes(t)));
  if (query.pais) items = items.filter((c) => norm(c.universidade.pais) === norm(query.pais));
  if (query.cidade) items = items.filter((c) => norm(c.universidade.cidade) === norm(query.cidade));
  if (query.universidade) items = items.filter((c) => c.universidade.id === query.universidade);
  if (query.area) items = items.filter((c) => c.programa.ramos.includes(query.area));
  if (query.modalidade) items = items.filter((c) => c.programa.modalidade === query.modalidade);
  if (query.idioma) items = items.filter((c) => c.programa.idiomaEnsino === query.idioma);
  if (query.nivelIdioma) {
    // "Meu nível de espanhol": ficam os másteres cuja ficha do DUA exige até esse nível ou não exige.
    // Sem ficha DUA coletada, ou exigência sem nível no texto, o máster fica de fora (não presumimos).
    const max = NIVEIS_QECR.indexOf(String(query.nivelIdioma).toUpperCase());
    items = items.filter((c) => {
      if (!c.programa.idiomasExigidos || max < 0) return false;
      const es = c.programa.idiomasExigidos.find((i) => i.idioma === 'espanhol');
      return !es || (es.nivel && NIVEIS_QECR.indexOf(es.nivel) <= max);
    });
  }
  if (query.precoMax) items = items.filter(() => false); // preço não consta das fichas coletadas
  if (query.situacao) items = items.filter((c) => c.estado === query.situacao);
  if (query.bolsas === 'sim') items = items.filter(() => openScholarships().length > 0);
  if (query.compativel === 'sim') items = items.filter((c) => ['alta', 'media'].includes(c.compatibilidade));
  if (query.acompanhando === 'sim') items = items.filter((c) => c.acompanhando);

  const rank = { abertas: 0, anunciadas: 1, previsto: 2, resultas: 3, adjudicacoes: 4, 'em-avaliacao': 5, 'nao-anunciado': 6, desatualizado: 7, suspenso: 8, encerradas: 9 };
  const compatRank = { alta: 0, media: 1, baixa: 2 };
  items.sort((a, b) => (rank[a.estado] - rank[b.estado])
    || ((compatRank[a.compatibilidade] ?? 3) - (compatRank[b.compatibilidade] ?? 3))
    || a.programa.nome.localeCompare(b.programa.nome, 'es'));

  const count = (fn) => Object.entries(all.reduce((acc, c) => { for (const k of [].concat(fn(c))) acc[k ?? 'nao-informado'] = (acc[k ?? 'nao-informado'] || 0) + 1; return acc; }, {})).map(([valor, n]) => ({ valor, n }));
  // A API pública devolve no máximo 100 por página; o catálogo interno (programCatalog) pede todos.
  const limit = semLimite ? Infinity : Math.min(Number(query.limit) || 24, 100);
  const offset = Math.max(Number(query.offset) || 0, 0);
  return {
    anoAcademico: ano,
    ciclos: cycles,
    total: items.length,
    items: items.slice(offset, offset + limit),
    facetas: {
      pais: count((c) => c.universidade.pais), cidade: count((c) => c.universidade.cidade), universidade: count((c) => c.universidade.id),
      area: count((c) => c.programa.ramos), modalidade: count((c) => c.programa.modalidade), idioma: count((c) => c.programa.idiomaEnsino),
      situacao: count((c) => c.estado),
    },
    indisponiveis: {
      nivelIdioma: (() => {
        const sem = all.filter((c) => !c.programa.idiomasExigidos).length;
        return `Mostra os másteres cuja ficha do DUA exige até esse nível de espanhol (ou não exige).${sem ? ` ${sem} ainda sem ficha conferida ficam fora.` : ''}`;
      })(),
      precoMax: 'O preço não consta das fichas oficiais coletadas.',
      idioma: 'A ficha da UGR não informa o idioma de ensino; só filtramos programas com essa informação verificada.',
    },
    filtros: FILTERS,
    estados: Object.entries(STATES).map(([id, s]) => ({ id, ...s })),
    indicadores: indicators(all, user),
  };
}

// ---------- Catálogo completo (tela Mestrados) ----------

// Resumo da exigência de espanhol para a lista: null = ficha do DUA ainda não coletada (não presumir).
const spanishSummary = (p) => {
  const es = spanishRequirement(p);
  return es === null ? null : es.exige ? { exige: true, nivel: es.nivel || null } : { exige: false };
};

/**
 * Todos os mestrados oficiais do ciclo mais recente, num formato compacto (sem calendário por item, que pesa):
 * a tela Mestrados mostra a oferta inteira por universidade, com filtros no navegador.
 * Com o curso de graduação no perfil, informa se cada ficha do DUA o aceita (mesma regra da Missão 1.4).
 */
export function programCatalog({ user = null, now = Date.now() } = {}) {
  const list = listOpportunities({}, { user, now, semLimite: true });
  const all = list.items;
  const curso = user?.profile?.graduacao || '';
  const d = data();
  const byId = new Map(d.programs.map((p) => [p.id, p]));
  const programas = all.map((c) => {
    const p = byId.get(c.programId) || {};
    const grad = curso && p.fichaDua ? matchDegree(curso, p.fichaDua) : null;
    return {
      id: c.programId,
      oportunidadeId: c.id,
      anoAcademico: c.anoAcademico,
      estado: c.estado,
      estadoLabel: c.estadoLabel,
      nome: c.programa.nome,
      universidadeId: c.universidade.id,
      ramos: c.programa.ramos,
      modalidade: c.programa.modalidade || null,
      creditos: c.programa.creditos,
      codigoDua: p.duaCodigo || null,
      espanhol: spanishSummary(p),
      criterios: p.fichaDua ? (p.fichaDua.baremo || []).map((x) => ({ descricao: criterioPt(x.descricao), peso: x.peso ?? null })) : null,
      requisitos: p.fichaDua ? (p.fichaDua.requisitos || []).length : null,
      fichaDuaUrl: p.duaCodigo ? duaSheetUrl(p.duaCodigo) : null,
      fichaVerificadaEm: p.fichaDua?.verificadaEm || null,
      webPropria: c.programa.webPropria || null,
      graduacao: grad ? { tipo: grad.tipo, preferencia: grad.preferencia || null } : null,
      naJornada: c.naJornada,
    };
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'es'));
  const count = new Map();
  for (const p of programas) count.set(p.universidadeId, (count.get(p.universidadeId) || 0) + 1);
  const universidades = Object.values(UNIVERSITY_INFO)
    .map((u) => ({ id: u.id, sigla: u.sigla, nome: u.nome, cidade: u.cidade, logo: u.logo || null, total: count.get(u.id) || 0 }))
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'es'));
  const verificadas = d.sources.filter((s) => ['dua-catalogo', 'dua-fichas', 'ugr-catalogo'].includes(s.id)).map((s) => ({ id: s.id, titulo: s.rotuloPublico || s.titulo, verificadaEm: s.ultimaVerificacaoOk || null }));
  return { anoAcademico: list.anoAcademico, total: programas.length, comGraduacao: Boolean(curso), universidades, programas, fontes: verificadas };
}

// "Aberta" só com edital verificável: status editorial + prazo vigente (AAAA-MM-DD) + link do edital.
// Um status "aberta" sem prazo ou com prazo vencido nunca é contado nem anunciado como aberto.
const openScholarships = (now = Date.now()) => {
  const today = todayMadrid(new Date(now));
  return scholarships.filter((s) => s.status === 'aberta' && /^\d{4}-\d{2}-\d{2}$/.test(s.prazo || '') && s.prazo >= today && /^https:\/\//.test(s.url || ''));
};

function indicators(cards, user) {
  const d = data();
  return {
    abertas: cards.filter((c) => c.estado === 'abertas').length,
    anunciadas: cards.filter((c) => c.estado === 'anunciadas').length,
    programas: new Set(d.programs.filter((p) => !p.ausenteNoCatalogo).map((p) => p.id)).size,
    acompanhadosPorVoce: user ? d.subscriptions.filter((s) => s.userId === user.id && s.ativa !== false).length : null,
    bolsas: openScholarships().length,
    base: 'Calculado a partir dos registros verificados do Radar.',
  };
}

// ---------- Detalhe ----------

export function opportunityDetail(id, { user = null, now = Date.now() } = {}) {
  const d = data();
  const opp = d.opportunities.find((o) => o.id === id);
  if (!opp) return null;
  const c = card(opp, { user, now });
  const { windows, events } = cycleData(opp);
  const p = d.programs.find((x) => x.id === opp.programId);
  const sources = [...new Set([...windows.map((w) => w.sourceId), 'ugr-catalogo', p?.ficha ? 'ugr-fichas' : null, p?.fichaDua ? 'dua-fichas' : null].filter(Boolean))].map(sourceById).filter(Boolean);
  const admissao = admissionFromDua(p);
  const reqAcademico = admissao
    ? { tipo: 'academico', status: 'verificado', fonte: 'Ficha do máster: Distrito Único Andaluz', url: admissao.url,
      texto: [
        admissao.somenteNotaExpediente ? 'Seleção só pela nota média do histórico.' : `Seleção: ${admissao.criterios.map((c) => `${c.descricao} ${c.peso ?? '?'}%`).join(' · ')}.`,
        `Graduações com preferência: ${admissao.titulacoes.alta.length} alta, ${admissao.titulacoes.media.length} média, ${admissao.titulacoes.baixa.length} baixa.`,
        admissao.equivalentes.length ? `Título equivalente (caso comum do diploma estrangeiro): preferência ${admissao.equivalentes.map((e) => e.preferencia).filter(Boolean).join('/') || 'não informada'}.` : 'Diploma estrangeiro: a universidade enquadra sua graduação na lista por equivalência de área.',
      ].join(' ') }
    : { tipo: 'academico', texto: 'Título universitário que dê acesso a estudos de pós-graduação no país emissor. Requisitos específicos (área de formação, critérios de seleção) constam da ficha oficial do máster.', fonte: 'Ficha oficial: UGR', url: p?.fichaUrl, status: 'consultar-ficha' };
  const reqIdioma = admissao
    ? { tipo: 'idioma', status: 'verificado', fonte: 'Ficha do máster: Distrito Único Andaluz', url: admissao.url,
      texto: admissao.idiomas.length
        ? `${admissao.idiomas.map((i) => `${langLabel(i)}${i.obrigatorio ? ', obrigatório' : ''}${i.estrangeiros ? ' para quem não é nativo' : ''}`).join('; ')}. Texto oficial: “${admissao.idiomas.map((i) => i.texto).join('” / “')}”`
        : 'A ficha do DUA não traz exigência de idioma. As aulas costumam ser em espanhol: confirme o idioma de ensino na web do máster.' }
    : { tipo: 'idioma', texto: c.programa.idiomaEnsino ? `Idioma de ensino: ${c.programa.idiomaEnsino}.` : 'Idioma de ensino e nível exigido não constam da ficha coletada. Não presuma: confirme na web do máster ou com a coordenação.', fonte: 'Ficha oficial: UGR', url: c.programa.webPropria || p?.fichaUrl, status: c.programa.idiomaEnsino ? 'verificado' : 'nao-informado' };
  const cycleKey = `${opp.procedimentoId}:${opp.anoAcademico}`;
  const history = d.revisions
    .filter((r) => r.opportunityKey === cycleKey || r.opportunityKey === `program:${opp.programId}` || r.entidadeId === opp.programId || r.entidadeId === opp.id)
    .slice(-60).reverse();
  const sub = user ? d.subscriptions.find((s) => s.userId === user.id && s.opportunityId === opp.id && s.ativa !== false) : null;
  return {
    ...c,
    calendario: windows.sort((a, b) => a.fase - b.fase).map((w) => ({
      fase: w.fase, titulo: w.titulo, publico: w.publico, confirmacao: w.confirmacao, fusoHorario: w.fusoHorario,
      candidatura: { inicio: w.abertura, fim: w.encerramento, texto: w.textoOriginal },
      estado: c.fases.find((f) => f.fase === w.fase)?.estado,
      eventos: events.filter((e) => e.fase === w.fase).sort((a, b) => a.ordem - b.ordem).map((e) => ({ tipo: e.tipo, rotulo: e.rotulo, inicio: e.inicio, fim: e.fim, texto: e.textoOriginal })),
    })),
    admissao,
    requisitos: [
      reqAcademico,
      reqIdioma,
      { tipo: 'procedimento', texto: 'Estudantes com título estrangeiro podem concorrer na Fase 1 (exclusiva para estrangeiros) e nas fases seguintes, quando houver vagas.', fonte: 'Distrito Único Andaluz', url: sourceById('dua-calendario')?.url, status: windows.length ? 'verificado' : 'referencia' },
    ],
    documentos: ['Passaporte válido', 'Diploma (ou documento aceito na convocatória)', 'Histórico acadêmico oficial', 'Certificado de idioma, se o máster exigir', 'Documentos específicos pedidos pela ficha (currículo, cartas…)'],
    fontes: sources.map((s) => ({ id: s.id, titulo: s.titulo, instituicao: s.instituicao, url: s.url, ultimaVerificacao: s.ultimaVerificacaoOk, estado: s.estado, metodo: s.metodo })),
    historico: history.map((r) => ({ id: r.id, em: r.em, campo: r.campo, entidade: r.entidade, anterior: r.anterior, novo: r.novo, validacao: r.validacao, fonte: sourceById(r.evidencia?.sourceId)?.rotuloPublico, url: r.evidencia?.url, trecho: r.evidencia?.trecho })),
    acompanhamento: sub ? { eventos: sub.eventos, canal: sub.canal, desde: sub.criadaEm } : null,
    tiposDeAlerta: EVENT_TYPES,
    missoes: missionsFor(opp, windows, events),
    agenda: agendaSuggestions(opp, windows, events, now),
  };
}

// ---------- Missões (Rodada 3 — Conquistando minha vaga; Rodada 4 — matrícula) ----------
// Mapeamento fixo para os ids de missão da jornada (server/content/rounds.js).

const MISSION_MAP = [
  { missao: '3.1', titulo: 'Acessar o Distrito Único Andaluz', uso: 'Link oficial do portal de candidatura.' },
  { missao: '3.2', titulo: 'Identificar a fase de candidatura', uso: 'Fase e prazo oficiais do seu ano acadêmico.', tipo: 'candidatura' },
  { missao: '3.6', titulo: 'Enviar minha solicitação', uso: 'Prazo final da fase escolhida. Marque como concluída somente depois de enviar no portal oficial.', tipo: 'encerramento' },
  { missao: '3.9', titulo: 'Acompanhar a adjudicação', uso: 'Datas de publicação das listas.', tipo: 'adjudicacao' },
  { missao: '3.10', titulo: 'Acompanhar a lista de espera', uso: 'Datas das listas de resultas.', tipo: 'resultas' },
  { missao: '4.3', titulo: 'Realizar a ação dentro do prazo', uso: 'Prazos de matrícula, reserva ou confirmação.', tipo: 'confirmacao' },
];

function missionsFor(opp, windows, events) {
  const confirmed = windows.filter((w) => w.confirmacao === 'confirmado');
  return MISSION_MAP.map((m) => {
    let datas = [];
    if (m.tipo === 'candidatura') datas = confirmed.map((w) => ({ fase: w.fase, inicio: w.abertura, fim: w.encerramento }));
    else if (m.tipo === 'encerramento') datas = confirmed.map((w) => ({ fase: w.fase, fim: w.encerramento }));
    else if (m.tipo) datas = events.filter((e) => e.tipo === m.tipo && e.confirmacao === 'confirmado').map((e) => ({ fase: e.fase, inicio: e.inicio, fim: e.fim, rotulo: e.rotulo }));
    return { ...m, rodada: Number(m.missao.split('.')[0]), datas, semDatas: Boolean(m.tipo) && !datas.length };
  });
}

// ---------- Agenda: sugestões a partir de datas oficiais ----------

const addDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export function agendaSuggestions(opp, windows, events, now = Date.now()) {
  const today = todayMadrid(new Date(now));
  const out = [];
  for (const w of windows.filter((x) => x.confirmacao === 'confirmado' && x.encerramento >= today)) {
    const id = (k) => `${w.id}:${k}`;
    const before = (dias, k, titulo, categoria = 'documentacao') => out.push({ id: id(k), momento: 'antes-da-abertura', titulo, data: addDays(w.abertura, -dias), inicio: '19:00', fim: '20:00', categoria, oficial: false, base: { tipo: 'abertura', data: w.abertura, windowId: w.id } });
    before(30, 'passaporte', 'Conferir a validade do passaporte');
    before(21, 'diploma', 'Organizar diploma e histórico acadêmico');
    before(14, 'idioma', 'Verificar requisitos linguísticos do máster', 'academico');
    before(7, 'revisar', 'Revisar os documentos da candidatura');
    before(3, 'preferencias', 'Preparar a lista de preferências (até 6 mestrados)', 'academico');
    out.push({ id: id('abrir'), momento: 'na-abertura', titulo: `Acessar o portal oficial e iniciar a candidatura (Fase ${w.fase})`, data: w.abertura, inicio: '10:00', fim: '11:00', categoria: 'academico', oficial: false, base: { tipo: 'abertura', data: w.abertura, windowId: w.id } });
    out.push({ id: id('revisao-final'), momento: 'antes-do-encerramento', titulo: 'Revisar informações e finalizar o envio', data: addDays(w.encerramento, -2), inicio: '19:00', fim: '20:30', categoria: 'academico', oficial: false, base: { tipo: 'encerramento', data: w.encerramento, windowId: w.id } });
    out.push({ id: id('prazo'), momento: 'antes-do-encerramento', titulo: `Prazo oficial, fim da candidatura Fase ${w.fase}`, data: w.encerramento, inicio: '09:00', fim: '09:30', categoria: 'academico', oficial: true, base: { tipo: 'encerramento', data: w.encerramento, windowId: w.id } });
    out.push({ id: id('comprovante'), momento: 'apos-envio', titulo: 'Salvar o comprovante de envio', data: w.encerramento, inicio: '20:30', fim: '21:00', categoria: 'documentacao', oficial: false, base: { tipo: 'encerramento', data: w.encerramento, windowId: w.id } });
    const adj = events.find((e) => e.fase === w.fase && e.tipo === 'adjudicacao' && e.confirmacao === 'confirmado');
    if (adj) out.push({ id: `${adj.id}:acompanhar`, momento: 'apos-envio', titulo: `Consultar a ${adj.rotulo.toLowerCase()}`, data: adj.inicio, inicio: '10:00', fim: '10:30', categoria: 'academico', oficial: true, base: { tipo: 'evento', data: adj.inicio, eventId: adj.id } });
  }
  return out.filter((s) => s.data >= today).sort((a, b) => a.data.localeCompare(b.data));
}

/** Cria atividades na Agenda do estudante a partir de sugestões aprovadas (horários editáveis). */
export async function addToAgenda(user, oppId, items, usersStore) {
  const d = data();
  const opp = d.opportunities.find((o) => o.id === oppId);
  if (!opp) throw Object.assign(new Error('Oportunidade não encontrada.'), { status: 404 });
  const { windows, events } = cycleData(opp);
  const suggestions = agendaSuggestions(opp, windows, events);
  const journey = (user.journeys || []).find((j) => j.programaId === opp.programId);
  const created = [];
  for (const item of items) {
    const s = suggestions.find((x) => x.id === item.id);
    if (!s) continue;
    if (d.agendaLinks.some((l) => l.userId === user.id && l.suggestionId === s.id && l.ativo)) continue;
    const event = {
      // origem/oportunidade* são preservados pela Agenda quando o estudante edita o evento;
      // o "replan" da Agenda só remove origem 'agenda-ai', então estes ficam.
      id: newId(), origem: 'radar', oportunidadeId: opp.id, oportunidadeTipo: 'radar',
      titulo: s.titulo.slice(0, 80), categoria: s.categoria,
      data: s.oficial ? s.data : (item.data || s.data),
      inicio: item.inicio || s.inicio, fim: item.fim || s.fim,
      nota: `Radar de Oportunidades: ${s.oficial ? 'prazo oficial (data preservada)' : 'atividade sugerida'}. Base oficial: ${s.base.data}.`.slice(0, 300),
      ...(journey ? { journeyId: journey.id } : {}),
      criadoEm: new Date().toISOString(),
    };
    if (event.fim <= event.inicio) continue;
    created.push(event);
    d.agendaLinks.push({ id: newId(), userId: user.id, plannerEventId: event.id, opportunityId: opp.id, suggestionId: s.id, oficial: s.oficial, base: s.base, dataOficialNaCriacao: s.base.data, ativo: true, criadoEm: event.criadoEm });
  }
  if (created.length) {
    await usersStore.update(user.id, (u) => { (u.planner ??= []).push(...created); });
    await save();
  }
  return created;
}

/** Atividades da Agenda cuja data oficial de base mudou desde a criação (exigem confirmação). */
export function agendaChanges(user) {
  const d = data();
  return d.agendaLinks.filter((l) => l.userId === user.id && l.ativo).map((l) => {
    const current = l.base.windowId
      ? (() => { const w = d.windows.find((x) => x.id === l.base.windowId); return w && (l.base.tipo === 'abertura' ? w.abertura : w.encerramento); })()
      : d.events.find((e) => e.id === l.base.eventId)?.inicio;
    const ev = (user.planner || []).find((e) => e.id === l.plannerEventId);
    if (!ev) return null;
    if (!current || current === l.dataOficialNaCriacao) return null;
    const delta = daysBetween(l.dataOficialNaCriacao, current);
    return { linkId: l.id, plannerEventId: ev.id, titulo: ev.titulo, dataAtual: ev.data, dataOficialAnterior: l.dataOficialNaCriacao, dataOficialNova: current, sugestao: l.oficial ? current : addDays(ev.data, delta), oficial: l.oficial };
  }).filter(Boolean);
}

export async function confirmAgendaChange(user, linkId, aceitar, usersStore) {
  const d = data();
  const change = agendaChanges(user).find((c) => c.linkId === linkId);
  if (!change) throw Object.assign(new Error('Alteração não encontrada.'), { status: 404 });
  const link = d.agendaLinks.find((l) => l.id === linkId);
  if (aceitar) await usersStore.update(user.id, (u) => { const e = u.planner.find((x) => x.id === change.plannerEventId); if (e) e.data = change.sugestao; });
  link.dataOficialNaCriacao = change.dataOficialNova;
  await save();
  return change;
}

// ---------- Acompanhamento e alertas ----------

export async function subscribe(user, oppId, { eventos, canal = 'app' } = {}) {
  const d = data();
  if (!d.opportunities.some((o) => o.id === oppId)) throw Object.assign(new Error('Oportunidade não encontrada.'), { status: 404 });
  const list = (eventos?.length ? eventos : Object.keys(EVENT_TYPES)).filter((e) => EVENT_TYPES[e]);
  let sub = d.subscriptions.find((s) => s.userId === user.id && s.opportunityId === oppId);
  if (sub) Object.assign(sub, { eventos: list, canal, ativa: true });
  else {
    if (d.subscriptions.filter((s) => s.userId === user.id && s.ativa !== false).length >= 50) throw Object.assign(new Error('Você pode acompanhar até 50 oportunidades.'), { status: 409 });
    sub = { id: newId(), userId: user.id, opportunityId: oppId, eventos: list, canal, ativa: true, criadaEm: new Date().toISOString() };
    d.subscriptions.push(sub);
  }
  tick();
  await save();
  return sub;
}

export async function unsubscribe(user, oppId) {
  const d = data();
  d.subscriptions = d.subscriptions.filter((s) => !(s.userId === user.id && s.opportunityId === oppId));
  await save();
}

export function myRadar(user) {
  const d = data();
  const alerts = d.alerts.filter((a) => a.userId === user.id).slice(-100).reverse();
  return {
    alertas: alerts,
    naoLidas: alerts.filter((a) => !a.lidoEm).length,
    acompanhando: d.subscriptions.filter((s) => s.userId === user.id && s.ativa !== false).map((s) => {
      const o = d.opportunities.find((x) => x.id === s.opportunityId);
      return o ? { ...card(o, { user }), eventos: s.eventos } : null;
    }).filter(Boolean),
    agendaAlteracoes: agendaChanges(user),
  };
}

export async function markAlertsRead(user, ids) {
  const now = new Date().toISOString();
  for (const a of data().alerts) if (a.userId === user.id && !a.lidoEm && (!ids || ids.includes(a.id))) { a.lidoEm = now; a.estado = 'lida'; }
  await save();
}

/** Exclusão de conta / exportação de dados do estudante. */
export async function forgetUser(userId) {
  const d = data();
  d.subscriptions = d.subscriptions.filter((s) => s.userId !== userId);
  d.alerts = d.alerts.filter((a) => a.userId !== userId);
  d.agendaLinks = d.agendaLinks.filter((l) => l.userId !== userId);
  await save();
}
export const exportUser = (userId) => {
  const d = data();
  return { subscriptions: d.subscriptions.filter((s) => s.userId === userId), alerts: d.alerts.filter((a) => a.userId === userId), agendaLinks: d.agendaLinks.filter((l) => l.userId === userId) };
};

// ---------- Contratos para jornada, Agenda e assistente ----------

/** Programa do Radar no formato de catalog.programById (para criar jornadas). */
export function programForJourney(id) {
  const p = data().programs.find((x) => x.id === id);
  if (!p) return null;
  // Código DUA conferido manualmente (content/program-channels.js) quando o vínculo automático não resolveu.
  const duaCodigo = p.duaCodigo || MANUAL_DUA_LINKS[p.id] || null;
  return {
    id: p.id,
    universidadeId: p.universidadeId,
    nome: p.nome,
    area: p.ramos?.[0] || null,
    ciclo: shortYear(p.cursoCatalogo),
    duracaoMeses: p.ficha?.duracaoEstimadaAnos ? Math.round(p.ficha.duracaoEstimadaAnos * 12) : null,
    modalidade: p.ficha?.modalidade || null,
    url: p.fichaUrl,
    demo: false,
    radar: true,
    idioma: journeyLanguage(p),
    outrosIdiomas: fichaIdiomas(p.fichaDua).filter((i) => i.idioma !== 'espanhol').map(({ idioma, nivel, obrigatorio, texto }) => ({ idioma, nivel, obrigatorio, texto, fonte: 'O30' })),
    criterios: p.fichaDua ? p.fichaDua.baremo.map((c) => ({ descricao: criterioPt(c.descricao), peso: c.peso })) : null,
    somenteNotaExpediente: p.fichaDua?.somenteNotaExpediente ?? null,
    // Graduações de acesso pela ficha do DUA (Missão 1.4 compara com o curso do perfil).
    titulacoes: p.fichaDua ? { titulacoes: p.fichaDua.titulacoes || [], condicionadas: p.fichaDua.condicionadas || [], restoComAcesso: p.fichaDua.restoComAcesso || [], equivalentes: p.fichaDua.titulacoesEquivalentes || [] } : null,
    inicioCurso: p.fichaDua?.inicioCurso || null,
    fichaDuaUrl: duaCodigo ? duaSheetUrl(duaCodigo) : null,
    // Processo de candidatura (server/application-process.js): canal, fases com oferta e requisitos da ficha.
    duaCodigo,
    requisitosFicha: p.fichaDua ? (p.fichaDua.requisitos || []).map(({ codigo, texto, obrigatorio }) => ({ codigo, texto, obrigatorio })) : null,
    criteriosOriginais: p.fichaDua ? p.fichaDua.baremo.map((c) => ({ original: c.descricao, peso: c.peso })) : null,
    fichaVerificadaEm: p.fichaDua?.verificadaEm || null,
    requisitos: [
      { tipo: 'acesso', descricao: 'Título universitário que dê acesso à pós-graduação no país emissor', status: 'requerido', fonte: 'O1' },
      journeyLanguageRequirement(p),
    ],
  };
}

// Formato de catalog.js: { status: 'requerido'|'nao-requerido'|'verificar', nivel?, certificado?, fonte }.
function journeyLanguage(p) {
  const es = spanishRequirement(p);
  if (!es) return { status: 'verificar', fonte: 'O10' };
  if (!es.exige) return { status: 'nao-requerido', fonte: 'O30' };
  // "Acreditar"/"justificar" = comprovar com documento; sem esses verbos a ficha só cita o nível.
  const certificado = /ACREDIT|CERTIFIC|JUSTIFIC/.test(upperNorm(es.texto));
  return es.nivel ? { status: 'requerido', nivel: es.nivel, certificado, fonte: 'O30', texto: es.texto } : { status: 'verificar', fonte: 'O30', texto: es.texto };
}

function journeyLanguageRequirement(p) {
  const req = journeyLanguage(p);
  if (req.status === 'requerido') return { tipo: 'idioma', descricao: `Espanhol ${req.nivel}${req.certificado ? ' comprovado' : ''} (ficha do DUA)`, status: 'requerido', fonte: 'O30' };
  if (req.status === 'nao-requerido') return { tipo: 'idioma', descricao: 'A ficha do DUA não exige comprovação de espanhol', status: 'nao-requerido', fonte: 'O30' };
  return { tipo: 'idioma', descricao: req.texto ? 'A ficha do DUA cita espanhol sem informar o nível: confirme com a coordenação' : 'Exigência de idioma não informada na ficha coletada, confirme com a coordenação', status: 'verificar', fonte: req.fonte };
}

export const radarPrograms = () => data().programs.filter((p) => !p.ausenteNoCatalogo).map((p) => programForJourney(p.id));

/** Calendário oficial confirmado do procedimento do programa no ano acadêmico da jornada (processo de candidatura). */
export function processCalendar(jr, program) {
  const d = data();
  const p = d.programs.find((x) => x.id === program?.id);
  const proc = p ? UNIVERSITY_INFO[p.universidadeId]?.procedimentoId : null;
  const curso = longYear(jr?.anoAcademico);
  if (!proc || !curso) return { windows: [], events: [] };
  return {
    windows: d.windows.filter((x) => x.procedimentoId === proc && x.anoAcademico === curso && x.confirmacao === 'confirmado'),
    events: d.events.filter((x) => x.procedimentoId === proc && x.anoAcademico === curso && x.confirmacao === 'confirmado'),
  };
}

// Fases cujas datas valem para a jornada: a declarada na Missão 3.2; sem declaração, as três.
// (A exceção de quem ainda cursa a graduação, requisitos 4 e 5 do art. 2 de O2, é só para universidade espanhola/PARS.)
function journeyPhases(jr) {
  if (jr.dados?.faseDua) return { fases: [Number(jr.dados.faseDua)], declarada: true };
  return { fases: [1, 2, 3], declarada: false };
}

/**
 * Prazos oficiais confirmados das jornadas do estudante ligadas a programas do Radar, por fase.
 * Sem fase declarada, só entram datas futuras: um prazo vencido de uma fase que o estudante não escolheu
 * não pode aparecer como "prazo vencido" da missão.
 */
export function officialDeadlines(user, now = Date.now()) {
  const d = data();
  const out = [];
  const today = todayMadrid(new Date(now));
  for (const jr of user.journeys || []) {
    const p = d.programs.find((x) => x.id === jr.programaId);
    if (!p) continue;
    const { windows, events } = processCalendar(jr, { id: p.id });
    if (!windows.length && !events.length) continue;
    const { fases, declarada } = journeyPhases(jr);
    const vale = (fase, data) => fases.includes(Number(fase)) && (declarada || data >= today);
    const src = sourceById('dua-calendario');
    const add = (id, titulo, data, missaoId, fase) => { if (data && vale(fase, data)) out.push({ id: `radar-${jr.id}-${id}`, titulo, data, fonteUrl: src?.url, categoria: 'academico', journeyId: jr.id, missaoId, fase: Number(fase) }); };
    for (const w of windows) {
      add(`${w.id}-abertura`, `Abre a candidatura DUA: Fase ${w.fase}`, w.abertura, '3.2', w.fase);
      add(`${w.id}-fim`, `Fim da candidatura DUA: Fase ${w.fase}`, w.encerramento, '3.6', w.fase);
    }
    for (const e of events) {
      if (e.tipo === 'adjudicacao' || e.tipo === 'resultas') add(e.id, `${e.rotulo}: Fase ${e.fase}`, e.inicio || e.fim, e.tipo === 'resultas' ? '3.10' : '3.9', e.fase);
      else if (e.tipo === 'pagamento-titulo') add(e.id, `${e.rotulo}: Fase ${e.fase}`, e.fim || e.inicio, '2.2', e.fase);
      else if (e.tipo === 'confirmacao') add(e.id, `${e.rotulo}: Fase ${e.fase}`, e.fim || e.inicio, '4.2', e.fase);
    }
  }
  return out.sort((a, b) => a.data.localeCompare(b.data));
}

/** Duplicata contra oportunidades oficiais (usado pela Comunidade). Síncrona, sem rede. */
export function findOfficialMatch({ link, universidadeId, titulo } = {}) {
  const d = data();
  const url = (u) => norm(u).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  if (link) {
    const l = url(link);
    const p = d.programs.find((x) => [x.fichaUrl, x.webPropria, x.ficha?.webPropria].filter(Boolean).some((u) => url(u) === l));
    if (p) return matchOf(p);
  }
  if (titulo) {
    const t = norm(titulo).replace(/master universitario en /, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const p = d.programs.find((x) => (!universidadeId || x.universidadeId === universidadeId) && norm(x.nome).replace(/master universitario en /, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim() === t);
    if (p) return matchOf(p);
  }
  return { match: false };
}
function matchOf(p) {
  const opp = data().opportunities.filter((o) => o.programId === p.id).sort((a, b) => a.anoAcademico.localeCompare(b.anoAcademico)).at(-1);
  return { match: true, opportunityId: opp?.id, programa: p.nome, url: p.fichaUrl };
}

/**
 * Contexto verificado para o assistente. Retorna { relevante, texto, fontes } — o assistente deve
 * responder SOMENTE com estes fatos sobre datas/estados e nunca completar lacunas.
 */
export function radarContext(question, { user = null, now = Date.now() } = {}) {
  const d = data();
  const q = norm(question);
  if (!/inscri|candidat|abre|abert|prazo|calend|vaga|mestrad|master|bolsa|resultado|adjudica|encerr|certificad|espanhol|idioma|20\d{2}|dua|radar/.test(q)) return { relevante: false, texto: '', fontes: [] };
  const cycles = [...new Set(d.opportunities.map((o) => o.anoAcademico))].sort();
  const asked = /20\d{2}\s*\/\s*(20)?\d{2}/.exec(q)?.[0];
  const ano = longYear(asked) || cycles.at(-1);
  const src = sourceById('dua-calendario');
  const lines = [`RADAR DE OPORTUNIDADES, dados verificados (consulta em ${new Date(now).toISOString().slice(0, 16)}Z).`];
  lines.push(`Fonte do calendário: ${src?.rotuloPublico} - ${src?.url}. Última verificação bem-sucedida: ${src?.ultimaVerificacaoOk || 'nunca'}.`);

  for (const curso of [...new Set([...cycles, ano])].sort()) {
    const ws = d.windows.filter((w) => w.anoAcademico === curso && w.confirmacao === 'confirmado');
    if (ws.length) lines.push(`Calendário oficial DUA ${curso}: ${ws.sort((a, b) => a.fase - b.fase).map((w) => `Fase ${w.fase} (${w.publico === 'estrangeiros' ? 'só estrangeiros' : 'todos'}) candidatura ${w.abertura} a ${w.encerramento}`).join('; ')}.`);
    else lines.push(`Curso ${curso}: NÃO há calendário oficial confirmado. Não informe datas; ofereça acompanhar no Radar ("Avise-me quando abrir").`);
  }

  const tokens = q.split(/[^a-z0-9]+/).filter((t) => t.length > 3 && !['quando', 'mestrado', 'master', 'universidad', 'granada', 'abre', 'candidatura', 'inscricoes', 'inscricao', 'para', 'qual', 'quais', 'estao', 'esta', 'sobre'].includes(t));
  const scored = d.programs.map((p) => ({ p, s: tokens.filter((t) => norm(p.nome).includes(t)).length })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 5);
  for (const { p } of scored) {
    const opp = d.opportunities.find((o) => o.programId === p.id && o.anoAcademico === ano);
    if (!opp) continue;
    const c = card(opp, { user, now });
    lines.push(`Programa: ${p.nome} (${c.universidade.sigla}, código ${p.codigo}). Ano ${ano}: estado "${c.estadoLabel}". ${c.verificacao.texto.replace(/\.$/, '')}. Ficha oficial: ${p.fichaUrl}. Candidatura: ${c.candidatura?.url}. Oportunidade no Radar: #/oportunidades/${opp.id}.`);
    if (c.referenciaHistorica) lines.push(`  Referência histórica (NÃO são datas de ${ano}): ${c.referenciaHistorica.fases.map((f) => `Fase ${f.fase} ${f.abertura}–${f.encerramento}`).join('; ')}.`);
    if (p.ficha) lines.push(`  Ficha (${p.ficha.anoAcademico}): ${p.ficha.creditos} ECTS, modalidade ${p.ficha.modalidade || 'não informada'}, idioma de ensino não informado na ficha.`);
  }
  const all = d.opportunities.filter((o) => o.anoAcademico === ano).map((o) => card(o, { user, now }));
  const abertas = all.filter((c) => c.estado === 'abertas');
  lines.push(`Ano ${ano}: ${abertas.length} oportunidade(s) com inscrições abertas; ${all.filter((c) => c.estado === 'anunciadas').length} anunciada(s); ${all.length} programa(s) monitorado(s) (UGR). Bolsas com edital aberto na base: ${openScholarships().length}.`);
  lines.push('Requisitos de idioma: as fichas da UGR coletadas não informam idioma/nível, não afirme que um máster dispensa certificado de espanhol.');
  lines.push('Regra: nunca invente datas nem use o calendário de outro ano como se fosse do ano perguntado; previsões não são anúncios oficiais.');
  const fontes = [{ titulo: src?.titulo, url: src?.url, verificadoEm: src?.ultimaVerificacaoOk }];
  return { relevante: true, texto: lines.join('\n'), resposta: studentAnswer({ q, ano, scored, all, abertas, user, now, src }), fontes };
}

// Resposta pronta para o estudante (modo offline do assistente): só fatos verificados,
// ano acadêmico, fonte, última verificação, link do procedimento e próximo passo.
function studentAnswer({ q, ano, scored, all, abertas, user, now, src }) {
  const verif = `Fonte: ${src?.rotuloPublico} · última verificação: ${src?.ultimaVerificacaoOk ? new Date(src.ultimaVerificacaoOk).toLocaleString('pt-BR', { timeZone: 'Europe/Madrid' }) : 'nunca'} (horário de Madri).`;
  const fmt = (iso) => iso.split('-').reverse().join('/');
  const p = scored[0]?.p;
  const opp = p && data().opportunities.find((o) => o.programId === p.id && o.anoAcademico === ano);
  if (opp) {
    const c = card(opp, { user, now });
    const out = [`**${p.nome}** (${c.universidade.nome}), ano acadêmico **${ano}**: ${c.estadoLabel}.`];
    if (c.fases.length) {
      out.push(c.fases.map((f) => `- Fase ${f.fase}${f.publico === 'estrangeiros' ? ' (exclusiva para estrangeiros)' : ''}: candidatura de ${fmt(f.abertura)} a ${fmt(f.encerramento)}${f.confirmacao === 'confirmado' ? '' : ', previsão, não confirmada'}`).join('\n'));
      out.push(`Inscrição: ${c.candidatura?.url}`);
    } else {
      out.push('Ainda não encontrei um calendário oficial confirmado para esse curso acadêmico. Posso adicionar o programa ao seu Radar de Oportunidades para que você receba um alerta quando as datas forem publicadas.');
      if (c.referenciaHistorica) out.push(`_Só como referência histórica (não são as datas de ${ano}):_ no curso ${c.referenciaHistorica.anoAcademico}, ${c.referenciaHistorica.fases.map((f) => `Fase ${f.fase} de ${fmt(f.abertura)} a ${fmt(f.encerramento)}`).join('; ')}.`);
    }
    out.push(verif);
    const futuro = !c.fases.length || c.fases.some((f) => ['abertas', 'anunciadas', 'previsto'].includes(f.estado));
    if (!futuro) {
      const next = data().opportunities.find((o) => o.programId === p.id && o.anoAcademico > ano);
      out.push(`Os prazos de candidatura de ${ano} já passaram${c.estado === 'resultas' || c.estado === 'adjudicacoes' ? ' (seguem as publicações de listas para quem já se candidatou)' : ''}.${next ? ` Próximo passo: acompanhe o curso ${next.anoAcademico} em #/oportunidades/${next.id}.` : ''}`);
    } else {
      out.push(`Próximo passo: ${c.acompanhando ? 'você já acompanha esta oportunidade.' : c.estado === 'abertas' ? 'acesse o portal oficial e inicie a candidatura; registre o envio na Missão 3.6.' : 'toque em "Avise-me quando abrir"'}, #/oportunidades/${opp.id}.`);
    }
    return out.join('\n\n');
  }
  if (/abert/.test(q)) {
    return abertas.length
      ? [`Com inscrições abertas agora (${ano}):`, abertas.slice(0, 8).map((c) => `- ${c.programa.nome} (${c.universidade.sigla}), até ${fmt(c.prazoFinal)}`).join('\n'), verif].join('\n\n')
      : [`No momento não há inscrições abertas confirmadas para ${ano} nos ${all.length} programas que o Radar monitora.`, verif, 'Próximo passo: acompanhe os mestrados que te interessam em #/oportunidades para receber o alerta da abertura.'].join('\n\n');
  }
  if (/certificad|espanhol|idioma/.test(q)) {
    return ['As fichas oficiais coletadas não informam o idioma de ensino nem o nível exigido, então não posso afirmar que algum mestrado dispensa certificado de espanhol.', 'Confirme na web de cada máster ou com a coordenação (Missão 3.8).', verif].join('\n\n');
  }
  return [`O Radar monitora ${all.length} programa(s) para ${ano}: ${abertas.length} com inscrições abertas e ${all.filter((c) => c.estado === 'anunciadas').length} com datas anunciadas.`, verif, 'Diga o nome do mestrado para eu buscar as datas dele.'].join('\n\n');
}

// ---------- Consultas para o Mentor ----------

// Termos em português → radicais usados nos nomes oficiais (espanhol).
const PT_ES = [
  [/comput|informat/, ['informat', 'computac', 'software', 'datos', 'ciber']], [/software|programa[cç]/, ['software', 'desarrollo', 'informat']],
  [/desenvolv/, ['desarrollo']], [/dados/, ['datos']], [/intelig[eê]ncia artificial|\bia\b/, ['inteligencia artificial', 'datos']],
  [/direito/, ['derecho']], [/educa/, ['educac', 'profesorado', 'ensenanza']], [/econom/, ['econom']], [/administra|gest[aã]o|neg[oó]cio/, ['administracion', 'direccion', 'empresa', 'gestion']],
  [/psicolog/, ['psicolog']], [/engenh/, ['ingenier']], [/sa[uú]de/, ['salud']], [/enferm/, ['enfermer']], [/arquitet/, ['arquitect']],
  [/hist[oó]ria/, ['histor']], [/letras|literat/, ['literat', 'filolog', 'lengua']], [/tradu/, ['traduc']], [/turismo/, ['turismo']], [/comunica/, ['comunicac', 'periodism']],
  [/qu[ií]mic/, ['quimic']], [/f[ií]sic/, ['fisic']], [/matem/, ['matemat']], [/biolog/, ['biolog']], [/m[uú]sic/, ['music']], [/arte/, ['arte']], [/nutri/, ['nutric']], [/farm/, ['farmac']],
];

/** Busca programas do Radar por nome/área em português ou espanhol. Retorna cards ordenados por relevância. */
export function findPrograms(query = '', { user = null, ano = null, limit = 6, compativel = false, now = Date.now() } = {}) {
  const d = data();
  const cycles = [...new Set(d.opportunities.map((o) => o.anoAcademico))].sort();
  const curso = longYear(ano) || cycles.at(-1);
  const q = norm(query);
  const stems = new Set(q.split(/[^a-z0-9]+/).filter((t) => t.length > 3 && !['mestrado', 'mestrados', 'master', 'compativel', 'compativeis', 'quando', 'abre', 'abrem', 'abrir', 'abrirem', 'curso', 'cursos', 'area', 'para', 'sobre', 'encontre', 'procure', 'quero', 'universidade', 'avise', 'avisa', 'aviso', 'candidaturas', 'candidatura', 'inscricoes', 'inscricao', 'datas', 'prazo', 'prazos', 'comeca', 'termina', 'minha', 'formacao', 'perfil', 'quais', 'encontrar', 'indique'].includes(t)));
  for (const [re, es] of PT_ES) if (re.test(q)) es.forEach((s) => stems.add(s));
  const cards = d.opportunities.filter((o) => o.anoAcademico === curso).map((o) => card(o, { user, now }));
  const scored = cards.map((c) => {
    const name = norm(c.programa.nome);
    const s = [...stems].reduce((n, t) => n + (name.includes(t) ? 2 : norm(c.programa.ramos.join(' ')).includes(t) ? 1 : 0), 0);
    return { c, s };
  }).filter((x) => (stems.size ? x.s > 0 : true) && (!compativel || ['alta', 'media'].includes(x.c.compatibilidade)));
  const compatRank = { alta: 0, media: 1, baixa: 2 };
  scored.sort((a, b) => b.s - a.s || (compatRank[a.c.compatibilidade] ?? 3) - (compatRank[b.c.compatibilidade] ?? 3) || a.c.programa.nome.localeCompare(b.c.programa.nome, 'es'));
  return { anoAcademico: curso, total: scored.length, items: scored.slice(0, limit).map((x) => x.c), termos: [...stems] };
}

/** Oportunidade do Radar ligada a uma jornada (mesmo programa e ano acadêmico), ou null. */
export function journeyOpportunity(user, jr, { now = Date.now() } = {}) {
  const curso = longYear(jr?.anoAcademico);
  const opp = jr && data().opportunities.find((o) => o.programId === jr.programaId && (!curso || o.anoAcademico === curso));
  return opp ? card(opp, { user, now }) : null;
}

export const opportunityCard = (id, { user = null, now = Date.now() } = {}) => {
  const opp = data().opportunities.find((o) => o.id === id);
  return opp ? card(opp, { user, now }) : null;
};
