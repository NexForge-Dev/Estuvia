// Motor da jornada: regras de negócio puras (sem Express, sem DOM).
// Entrada: definições (content/rounds.js) + dados do estudante. Saída: estado calculado.
// O progresso nunca é armazenado como número: é recalculado a partir dos fatos
// (objetivos marcados, missões concluídas, dados declarados e decisões externas registradas).

import { ROUNDS, MILESTONES, SITUACAO, missionById, missionLabel, JOURNEY_TEMPLATE } from './content/rounds.js';
import { programById, universityById } from './content/catalog.js';
import { DOCUMENTS, DOC_STATUS_LABEL } from './content/documents.js';
import { sourceById } from './content/sources.js';
import { consulateForState, consulateResult, CONSULATE_LIST_URL } from './content/places.js';
import { computeFinance } from './finance-engine.js';
import { ROUND_UNLOCK, PARALLEL_TRACKS, trackOf, EVIDENCE, PRIOR_STAGES, situacaoRank, complexityOf, riskOf, REQUIREMENTS } from './content/progression.js';

export const STATUS = {
  bloqueada: 'Bloqueada',
  disponivel: 'Disponível',
  'em-andamento': 'Em andamento',
  aguardando: 'Aguardando terceiros',
  atencao: 'Atenção necessária',
  concluida: 'Concluída',
  'nao-aplicavel': 'Não aplicável',
  ignorada: 'Ignorada (opcional)',
};
// Códigos estáveis (contrato com integrações e auditoria).
export const STATUS_CODE = {
  bloqueada: 'LOCKED', disponivel: 'AVAILABLE', 'em-andamento': 'IN_PROGRESS', aguardando: 'WAITING_EXTERNAL',
  atencao: 'NEEDS_ATTENTION', concluida: 'COMPLETED', 'nao-aplicavel': 'NOT_APPLICABLE', ignorada: 'SKIPPED',
};
const RESOLVED = new Set(['concluida', 'nao-aplicavel', 'ignorada']);

export const PRIORITY_LABEL = { critica: 'Crítica', alta: 'Alta', media: 'Normal', baixa: 'Baixa' };
const LANG_LEVELS = ['nenhum', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'nativo'];
const PRIORITY_RANK = { critica: 0, alta: 1, media: 2, baixa: 3 };
const ATTENTION_DAYS = 14;
const CRITICAL_DAYS = 7;
const DAY = 24 * 3600 * 1000;
export const DEFAULT_SITUACAO = { adjudicacao: 'nao-enviada', matricula: 'nao-iniciada', visto: 'preparacao' };

// ---------- Contexto ----------
// Um estudante pode ter várias jornadas (ex.: Brasil → UGR e Brasil → Sevilla).
// Pessoa (perfil, documentos, finanças, moradia, viagem) é compartilhada; destino, progresso,
// situação externa e contatos acadêmicos pertencem a cada jornada.

export function ensureJourney(jr) {
  jr.missions ??= {};
  jr.dados ??= {};
  jr.situacao = { ...DEFAULT_SITUACAO, ...(jr.situacao || {}) };
  jr.contatos ??= [];
  jr.desbloqueios ??= [];
  return jr;
}

export function buildContext(user, jr, now = new Date()) {
  ensureJourney(jr);
  const profile = user.profile || {};
  const program = programById(jr.programaId);
  return {
    now,
    user,
    profile,
    journey: jr,
    program,
    university: program ? universityById(program.universidadeId) : universityById(jr.universidadeId),
    choices: user.choices || [],
    documents: user.documents || {},
    dados: jr.dados,
    missions: jr.missions,
    situacao: jr.situacao,
    duracaoMeses: Number(jr.duracaoMeses) || program?.duracaoMeses || null,
    get finance() { return (this._fin ??= computeFinance(user, jr, now)); },
  };
}

// ---------- Objetivos automáticos (dados verificáveis da própria plataforma) ----------

const docsDone = (ctx, ids) => ids.every((id) => ['pronto', 'enviado', 'nao-se-aplica'].includes(ctx.documents[id]));

const AUTO_RULES = {
  perfilOrigem: (ctx) => Boolean(ctx.profile.nacionalidade && ctx.profile.paisResidencia),
  perfilFormacao: (ctx) => Boolean(ctx.profile.formacao),
  perfilIdioma: (ctx) => Boolean(ctx.profile.espanhol),
  temEstado: (ctx) => Boolean(ctx.profile.estado) || (ctx.profile.paisResidencia && ctx.profile.paisResidencia !== 'Brasil'),
  temProgramaPrincipal: (ctx) => Boolean(ctx.program),
  temAnoAcademico: (ctx) => Boolean(ctx.journey.anoAcademico),
  temOpcoes: (ctx) => ctx.choices.length > 0,
  certificadoAtende: (ctx) => {
    const req = ctx.program?.idioma;
    if (!req?.nivel) return false;
    const cert = ctx.profile.certificadoEspanhol;
    if (!cert || cert === 'nenhum') return false;
    return LANG_LEVELS.indexOf(ctx.profile.certificadoNivel) >= LANG_LEVELS.indexOf(req.nivel);
  },
  docsCandidaturaProntos: (ctx) => docsDone(ctx, ['passaporte', 'diploma', 'historico']),
  temCustos: (ctx) => ctx.finance.planoIniciado,
  temRecursosInformados: (ctx) => ctx.finance.informouRecursos,
  recursosCobremVisto: (ctx) => ctx.finance.informouRecursos && ctx.finance.deficitVisto === 0,
  planoViavel: (ctx) => ctx.finance.viavel,
  temBolsas: (ctx) => (ctx.user.scholarshipApps || []).length > 0 || Boolean(ctx.user.finance?.nenhumaBolsaAplicavel),
  bolsaEnviada: (ctx) => (ctx.user.scholarshipApps || []).some((a) => ['enviada', 'concedida', 'negada'].includes(a.status)),
  bolsaDecidida: (ctx) => (ctx.user.scholarshipApps || []).some((a) => ['concedida', 'negada'].includes(a.status)),
  temContatoAcademico: (ctx) => ctx.journey.contatos.length > 0,
  contatoEnviado: (ctx) => ctx.journey.contatos.some((c) => c.enviadoEm),
  temMoradias: (ctx) => (ctx.user.housing || []).length >= 2,
  moradiaEscolhida: (ctx) => (ctx.user.housing || []).some((x) => x.status === 'escolhida'),
  comparouMoradias: (ctx) => Boolean(ctx.user.housingSearch?.comparadoEm),
  contratoConferido: (ctx) => (ctx.user.housing || []).some((x) => x.status === 'escolhida' && ['contrato', 'pagamento', 'caucao'].every((k) => x.checklist?.[k])),
  temCotacoes: (ctx) => (ctx.user.travel?.opcoes || []).length >= 2,
  rotaEscolhida: (ctx) => (ctx.user.travel?.opcoes || []).some((o) => o.escolhida),
  passagemComprada: (ctx) => (ctx.user.travel?.opcoes || []).some((o) => o.comprada),
  chegadaRegistrada: (ctx) => Boolean(ctx.user.travel?.chegada?.aeroporto),
  temEntrada: (ctx) => Boolean(ctx.dados.dataEntrada),
};

const AUTO_HINTS = {
  perfilOrigem: 'Preenchido a partir do seu perfil.',
  perfilFormacao: 'Preenchido a partir do seu perfil.',
  perfilIdioma: 'Preenchido a partir do seu perfil.',
  temEstado: 'Preenchido a partir do seu perfil.',
  temProgramaPrincipal: 'Marcado quando a jornada tem um mestrado definido.',
  temAnoAcademico: 'Marcado quando a jornada tem o ano acadêmico definido.',
  temOpcoes: 'Marcado quando há programas em "Minhas opções".',
  certificadoAtende: 'Marcado quando o certificado declarado no perfil atinge o nível exigido (declaração sua, não validação oficial).',
  docsCandidaturaProntos: 'Marcado quando passaporte, diploma e histórico estão "Pronto", "Enviado" ou "Não se aplica" na área de documentos.',
  temCustos: 'Marcado quando você começa o planejamento financeiro ("Calcular meus custos") ou informa algum custo.',
  temRecursosInformados: 'Marcado quando você registra seus recursos no simulador.',
  recursosCobremVisto: 'Calculado pelo simulador: recursos confirmados × exigência estimada do visto.',
  planoViavel: 'Calculado pelo simulador: recursos confirmados cobrem a exigência do visto e o orçamento.',
  temBolsas: 'Marcado quando você salva uma bolsa no buscador (ou registra que nenhuma se aplica).',
  bolsaEnviada: 'Marcado quando uma candidatura a bolsa está como "enviada".',
  bolsaDecidida: 'Marcado quando você registra o resultado de uma bolsa.',
  temContatoAcademico: 'Marcado quando você registra um contato encontrado em fonte oficial.',
  contatoEnviado: 'Marcado quando você registra que enviou a mensagem.',
  temMoradias: 'Marcado quando há 2 ou mais opções no "Meu novo lar".',
  moradiaEscolhida: 'Marcado quando uma opção do "Meu novo lar" está como escolhida.',
  comparouMoradias: 'Marcado quando você compara opções em "Comparar opções" no Meu novo lar.',
  contratoConferido: 'Marcado quando, na moradia escolhida, você confirma contrato, valor total e caução em "Conferir antes de pagar".',
  temCotacoes: 'Marcado quando há 2 ou mais rotas cotadas no planejamento de viagem.',
  rotaEscolhida: 'Marcado quando você escolhe uma rota.',
  passagemComprada: 'Marcado quando você registra em "Minha viagem" que a passagem foi comprada.',
  chegadaRegistrada: 'Marcado quando você registra o aeroporto de chegada.',
  temEntrada: 'Marcado quando a data de entrada é registrada na Missão 7.1.',
};

// Onde o estudante resolve um objetivo automático (o guia mostra um único botão para lá).
const AUTO_ROUTE = {
  perfilOrigem: ['/perfil', 'Completar meu perfil'], perfilFormacao: ['/perfil', 'Completar meu perfil'], perfilIdioma: ['/perfil', 'Informar meu espanhol'], temEstado: ['/perfil', 'Informar meu estado'],
  temProgramaPrincipal: ['/mestrados', 'Escolher meu mestrado'], temOpcoes: ['/mestrados', 'Adicionar às minhas opções'], certificadoAtende: ['/perfil', 'Informar meu certificado'],
  docsCandidaturaProntos: ['/documentos', 'Atualizar meus documentos'], temCustos: ['/financiamento', 'Calcular meus custos'],
  temRecursosInformados: ['/financiamento#recursos', 'Registrar meus recursos'], recursosCobremVisto: ['/financiamento#recursos', 'Ver meus recursos'], planoViavel: ['/financiamento', 'Revisar meu plano'],
  temBolsas: ['/financiamento#bolsas', 'Procurar bolsas'], bolsaEnviada: ['/financiamento#bolsas', 'Atualizar minha bolsa'], bolsaDecidida: ['/financiamento#bolsas', 'Registrar o resultado'],
  temMoradias: ['/novo-lar', 'Adicionar moradias'], moradiaEscolhida: ['/novo-lar', 'Escolher minha moradia'], comparouMoradias: ['/novo-lar', 'Comparar opções'], contratoConferido: ['/novo-lar', 'Conferir antes de pagar'],
  temCotacoes: ['/viagem', 'Comparar rotas'], rotaEscolhida: ['/viagem', 'Escolher minha rota'], passagemComprada: ['/viagem', 'Registrar a compra'], chegadaRegistrada: ['/viagem', 'Registrar minha chegada'],
};

function objectiveDone(obj, ctx, mp) {
  if (obj.tipo === 'auto') return Boolean(AUTO_RULES[obj.regra]?.(ctx));
  if (obj.tipo === 'data' || obj.tipo === 'texto') return Boolean(ctx.dados[obj.campo]);
  if (obj.tipo === 'situacao') return !obj.concluiQuandoNao.includes(ctx.situacao[obj.campo]);
  return Boolean(mp.objetivos?.[obj.id]);
}

const matches = (cond, ctx) => cond && cond.valores.includes(ctx.situacao[cond.campo]);

// ---------- Aplicabilidade (RequirementRule) ----------

function applicability(mission, ctx, mp) {
  if (mission.condicional && mp.naoAplicavel) {
    return { aplicavel: false, motivo: 'Você conferiu e marcou que esta missão não se aplica ao seu caso.' };
  }
  const rule = mission.regra;
  if (!rule) return { aplicavel: true };

  if (rule.tipo === 'requisito-programa' && rule.requisito === 'idioma') {
    if (!ctx.program) return { aplicavel: true, atencao: 'Defina o mestrado desta jornada para saber se esta missão é obrigatória.' };
    const req = ctx.program.idioma || { status: 'verificar' };
    const demo = req.fonte === 'DEMO' ? ' (dado demonstrativo)' : '';
    if (req.status === 'nao-requerido') return { aplicavel: false, motivo: `Seu mestrado não exige certificado de idioma${demo}.` };
    if (req.status === 'verificar') return { aplicavel: true, atencao: 'A exigência de idioma do seu mestrado não está confirmada na ficha. Confirme com a coordenação.' };
    if (rule.exigeCertificado && !req.certificado) return { aplicavel: false, motivo: `Seu mestrado pede espanhol ${req.nivel}, mas sem certificado formal${demo}.` };
    return { aplicavel: true, info: `Seu mestrado exige espanhol ${req.nivel || ''}${req.certificado ? ' com certificado' : ''}${demo}.` };
  }

  if (rule.tipo === 'situacao') {
    return ctx.situacao[rule.campo] && rule.valores.includes(ctx.situacao[rule.campo])
      ? { aplicavel: true }
      : { aplicavel: false, motivo: 'Esta missão só se aplica em uma situação específica da sua candidatura.' };
  }

  if (rule.tipo === 'perfil') {
    const value = rule.campo === 'duracaoMeses' ? ctx.duracaoMeses : ctx.profile[rule.campo];
    if (value === undefined || value === null || value === '') {
      return { aplicavel: true, atencao: 'Complete seu perfil para confirmar se esta missão se aplica a você.' };
    }
    const ok = rule.igual !== undefined ? value === rule.igual : rule.maiorQue !== undefined ? Number(value) > rule.maiorQue : true;
    if (ok) return { aplicavel: true };
    if (rule.senao === 'nao-aplicavel') return { aplicavel: false, motivo: rule.campo === 'duracaoMeses' ? 'Sua estadia é de até 6 meses: a TIE não se aplica pela regra cadastrada.' : 'Pelo seu perfil, esta missão não se aplica.' };
    return { aplicavel: true, atencao: rule.motivo || 'Verifique se esta missão se aplica ao seu perfil.' };
  }
  return { aplicavel: true };
}

// ---------- Prazos (Deadline) ----------
// Só existem prazos com regra oficial cadastrada ou declarados pelo estudante. Nunca inventamos datas.

function deadlineFor(mission, ctx, mp) {
  const p = mission.prazo;
  if (!p) return null;
  if (p.tipo === 'usuario') {
    const off = officialFor(ctx, mission.id);
    if (off) return { data: off.data, rotulo: off.titulo || p.rotulo, origem: 'oficial', fonteUrl: off.fonteUrl };
    if (!mp.prazo) return null;
    return { data: mp.prazo, rotulo: p.rotulo, origem: 'declarado' };
  }
  if (p.tipo === 'relativo') {
    const real = ctx.dados[p.base];
    const previsto = p.base === 'dataEntrada' ? ctx.dados.dataChegadaPrevista : null;
    const base = real || previsto;
    if (!base) return null;
    const date = new Date(new Date(`${base}T12:00:00Z`).getTime() + p.dias * DAY).toISOString().slice(0, 10);
    return { data: date, rotulo: p.rotulo, origem: real ? 'oficial' : 'previsto', fonte: p.fonte };
  }
  return null;
}

// Prazos oficiais confirmados por fontes externas (ex.: Radar) — registrados em tempo de execução.
const officialProviders = [];
export const registerOfficialDeadlines = (fn) => { if (!officialProviders.includes(fn)) officialProviders.push(fn); };
function officialFor(ctx, missionId) {
  ctx._official ??= officialProviders.flatMap((fn) => { try { return fn(ctx.user) || []; } catch { return []; } }).filter((d) => d.journeyId === ctx.journey.id);
  return ctx._official.find((d) => d.missaoId === missionId) || null;
}

const daysUntil = (iso, now) => Math.ceil((new Date(`${iso}T23:59:59Z`).getTime() - now.getTime()) / DAY);
const fmtDate = (iso) => iso.split('-').reverse().join('/');

// ---------- Desbloqueio de rodadas (RoundUnlockRule) ----------
// Avaliado no servidor a partir de fatos persistidos. Uma rodada já registrada como desbloqueada
// (UnlockEvent em jr.desbloqueios) continua aberta mesmo que um pré-requisito seja reaberto.

export function roundUnlock(n, ctx, cache = new Map()) {
  ctx._rounds ??= new Map();
  if (ctx._rounds.has(n)) return ctx._rounds.get(n);
  const rule = ROUND_UNLOCK.find((r) => r.rodada === n) || { sempre: true };
  const evalCond = (c) => {
    if (c.missao) {
      const s = missionState(missionById(c.missao), ctx, cache);
      return { ok: RESOLVED.has(s.status), id: c.missao, label: s.label, titulo: s.titulo };
    }
    if (c.situacao) return { ok: c.situacao.valores.includes(ctx.situacao[c.situacao.campo]), titulo: c.rotulo || 'Decisão externa registrada' };
    if (c.dado) return { ok: Boolean(ctx.dados[c.dado]), titulo: c.rotulo || c.dado, acao: rule.acao || null };
    return { ok: false, titulo: '?' };
  };
  const reqs = (rule.requisitos || []).map(evalCond);
  const registrado = (ctx.journey.desbloqueios || []).some((e) => e.entidade === `rodada:${n}`);
  let motivo = null;
  if (rule.sempre) motivo = 'inicio';
  else if (registrado) motivo = 'registrado';
  else if (reqs.every((r) => r.ok)) motivo = 'pre-requisitos';
  else if ((rule.alternativas || []).some((c) => evalCond(c).ok)) motivo = 'situacao-externa';
  const res = {
    desbloqueada: Boolean(motivo),
    motivo,
    texto: rule.texto,
    faltam: motivo ? [] : reqs.filter((r) => !r.ok).map(({ ok, ...r }) => r),
    acao: motivo ? null : rule.acao || null,
  };
  ctx._rounds.set(n, res);
  return res;
}

// ---------- Estado de uma missão ----------

export function missionState(mission, ctx, cache = new Map()) {
  if (cache.has(mission.id)) return cache.get(mission.id);
  const mp = ctx.missions[mission.id] || {};
  const app = applicability(mission, ctx, mp);
  const objetivos = mission.objetivos.map((o) => ({ id: o.id, feito: objectiveDone(o, ctx, mp) }));
  const feitos = objetivos.filter((o) => o.feito).length;
  const total = objetivos.length;
  const alertas = [];
  if (app.atencao) alertas.push({ tipo: 'requisito', texto: app.atencao });
  if (matches(mission.atencaoSe, ctx)) alertas.push({ tipo: 'externo', texto: mission.atencaoSe.texto });

  const prazo = deadlineFor(mission, ctx, mp);
  if (prazo) prazo.diasRestantes = daysUntil(prazo.data, ctx.now);

  const deps = (mission.dependencias || []).map((id) => missionState(missionById(id), ctx, cache));
  const bloqueadaPor = deps.filter((d) => !RESOLVED.has(d.status)).map((d) => ({ id: d.id, label: d.label, titulo: d.titulo }));
  // Missões da progressão principal esperam o desbloqueio da rodada; trilhas paralelas, só as próprias dependências.
  const trilha = trackOf(mission.id, mission.rodada);
  const rodada = mission.rodada ? roundUnlock(mission.rodada, ctx, cache) : { desbloqueada: true };
  if (!rodada.desbloqueada && !trilha) bloqueadaPor.unshift({ id: null, label: null, titulo: `Desbloquear a Rodada ${mission.rodada}`, rodada: mission.rodada });
  // Decisão externa (ex.: admissão) — não é falha do estudante, por isso vem separada.
  const externo = mission.requer && !matches(mission.requer, ctx) ? mission.requer.rotulo : null;
  if (externo) bloqueadaPor.push({ id: null, label: null, titulo: externo, externo: true });

  let status;
  if (!app.aplicavel) status = 'nao-aplicavel';
  else if (mp.concluidaEm) status = 'concluida';
  else if (mission.opcional && mp.ignorada) status = 'ignorada';
  else if (bloqueadaPor.length) status = 'bloqueada';
  else {
    if (prazo && prazo.diasRestantes < 0) alertas.push({ tipo: 'prazo', texto: `Prazo vencido em ${fmtDate(prazo.data)}. Confira a situação na fonte oficial.` });
    else if (prazo && prazo.diasRestantes <= ATTENTION_DAYS) alertas.push({ tipo: 'prazo', texto: `Faltam ${prazo.diasRestantes} dia(s) para o prazo (${fmtDate(prazo.data)}).` });
    if (mp.aguardando || matches(mission.aguardandoSe, ctx)) status = 'aguardando';
    else if (alertas.length) status = 'atencao';
    else if (feitos > 0 || mp.execucao === 'fazendo') status = 'em-andamento';
    else status = 'disponivel';
  }

  const aberta = !RESOLVED.has(status);
  const critica = aberta && status !== 'bloqueada' && (matches(mission.urgenteSe, ctx) || (prazo && prazo.diasRestantes <= CRITICAL_DAYS));
  const prioridade = critica ? 'critica' : mission.prioridade;

  const state = {
    id: mission.id,
    label: missionLabel(mission.id),
    rodada: mission.rodada,
    titulo: mission.titulo,
    status,
    statusLabel: status === 'concluida' && mp.requisitoAtendido ? 'Requisito já atendido' : status === 'concluida' && mp.declarada ? 'Feita antes da Estuvia' : STATUS[status],
    codigo: STATUS_CODE[status],
    // Origem da conclusão: feita na plataforma, declarada como anterior ou requisito que o estudante já atendia.
    conclusao: status !== 'concluida' ? null : mp.requisitoAtendido ? 'requisito-atendido' : mp.declarada ? 'declarada' : 'plataforma',
    complexidade: complexityOf(mission.id),
    risco: riskOf(mission.id).nivel,
    trilha: trilha ? { id: trilha, titulo: PARALLEL_TRACKS[trilha].titulo } : null,
    declarada: Boolean(mp.declarada),
    prioridade,
    prioridadeLabel: PRIORITY_LABEL[prioridade],
    opcional: Boolean(mission.opcional),
    objetivosFeitos: feitos,
    objetivosTotal: total,
    progresso: RESOLVED.has(status) ? 1 : total ? feitos / total : 0,
    bloqueadaPor,
    bloqueioExterno: Boolean(externo),
    alertas,
    info: app.info || null,
    motivoNaoAplicavel: app.aplicavel ? null : app.motivo,
    prazo,
    concluidaEm: mp.concluidaEm || null,
    aguardando: status === 'aguardando',
    aguardandoAuto: !mp.aguardando && matches(mission.aguardandoSe, ctx),
    podeConcluir: ['disponivel', 'em-andamento', 'atencao', 'aguardando'].includes(status) && feitos === total,
    _objetivos: objetivos,
  };
  cache.set(mission.id, state);
  return state;
}

// Missão opcional não iniciada não conta como pendência.
const counts = (m) => m.status !== 'nao-aplicavel' && m.status !== 'ignorada' && !(m.opcional && m.status !== 'concluida' && m.objetivosFeitos === 0);

// ---------- Jornada completa ----------

export function computeJourney(user, jr, now = new Date()) {
  const ctx = buildContext(user, jr, now);
  const cache = new Map();

  const rounds = ROUNDS.map((r) => {
    const lock = roundUnlock(r.numero, ctx, cache);
    const missions = r.missoes.map((m) => {
      const s = missionState({ ...m, rodada: r.numero }, ctx, cache);
      const { _objetivos, ...pub } = s;
      return { ...pub, resumo: m.resumo, tempoEstimado: m.tempoEstimado, duracaoMin: m.duracaoMin || 60, temPrazo: Boolean(m.prazo), marco: m.marco || null };
    });
    const applicable = missions.filter(counts);
    const done = applicable.filter((m) => m.status === 'concluida').length;
    // Missão não concluída vale no máximo 85% do seu peso: a rodada só chega a 100% com conclusões reais.
    const progresso = applicable.length ? applicable.reduce((sum, m) => sum + (m.status === 'concluida' ? 1 : m.progresso * 0.85), 0) / applicable.length : 1;
    let status;
    if (!lock.desbloqueada) status = 'bloqueada';
    else if (applicable.length && done === applicable.length) status = 'concluida';
    else if (!applicable.length) status = 'nao-aplicavel';
    else if (applicable.some((m) => ['em-andamento', 'aguardando', 'atencao', 'concluida'].includes(m.status))) status = 'em-andamento';
    else if (applicable.some((m) => m.status === 'disponivel')) status = 'disponivel';
    else status = 'bloqueada';
    return {
      numero: r.numero, sigla: r.sigla || null, transversal: Boolean(r.transversal),
      titulo: r.titulo, etapa: r.etapa, banner: r.banner, resumo: r.resumo, conclusao: r.conclusao, icone: r.icone,
      status, progresso, concluidas: done, total: applicable.length,
      atencao: applicable.filter((m) => m.status === 'atencao').length,
      aguardando: applicable.filter((m) => m.status === 'aguardando').length,
      criticas: applicable.filter((m) => m.prioridade === 'critica').length,
      desbloqueada: lock.desbloqueada,
      desbloqueio: { motivo: lock.motivo, texto: lock.texto, faltam: lock.faltam, acao: lock.acao },
      paralelasAbertas: missions.filter((m) => m.trilha && !['bloqueada', 'nao-aplicavel'].includes(m.status) && !RESOLVED.has(m.status)).length,
      missoes: missions,
    };
  });

  const all = rounds.flatMap((r) => r.missoes);
  const applicable = all.filter(counts);
  const count = Object.fromEntries(Object.keys(STATUS).map((k) => [k, applicable.filter((m) => m.status === k).length]));
  count['nao-aplicavel'] = all.filter((m) => m.status === 'nao-aplicavel').length;
  const progresso = applicable.length ? applicable.reduce((s, m) => s + (m.status === 'concluida' ? 1 : m.progresso * 0.85), 0) / applicable.length : 0;

  const main = rounds.filter((r) => !r.transversal);
  const rodadaAtual =
    main.find((r) => r.status === 'em-andamento') || main.find((r) => r.status === 'disponivel') || main.find((r) => !['concluida', 'nao-aplicavel'].includes(r.status)) || main[main.length - 1];

  const prazos = all
    .filter((m) => m.prazo && !['concluida', 'nao-aplicavel'].includes(m.status))
    .map((m) => ({ missao: m.id, label: m.label, titulo: m.titulo, ...m.prazo }));
  if (jr.inicioAulas) {
    prazos.push({ missao: null, titulo: 'Início das aulas', rotulo: 'Início das aulas', data: jr.inicioAulas, origem: 'declarado', diasRestantes: daysUntil(jr.inicioAulas, now) });
  }
  prazos.sort((a, b) => a.data.localeCompare(b.data));

  const marcos = MILESTONES.map((ms) => {
    const m = all.find((x) => x.marco === ms.id);
    return { ...ms, missao: m?.id, label: m?.label, conquistado: m?.status === 'concluida', em: m?.concluidaEm || null };
  });

  const fin = ctx.finance;
  const status = applicable.length && count.concluida === applicable.length ? 'concluida' : all.some((m) => m.status === 'concluida' || m.objetivosFeitos > 0) ? 'em-andamento' : 'nao-iniciada';

  return {
    id: jr.id,
    criadaEm: jr.criadaEm,
    status,
    template: JOURNEY_TEMPLATE,
    onboardingConcluido: Boolean(ctx.profile.onboardingConcluido),
    situacao: jr.situacao,
    progressoAnterior: jr.progressoAnterior || null,
    chegada: jr.dados.dataEntrada || null,
    destino: {
      origem: ctx.profile.paisResidencia || 'Brasil',
      universidade: ctx.university ? { id: ctx.university.id, nome: ctx.university.nome, sigla: ctx.university.sigla, capa: ctx.university.capa } : null,
      programa: ctx.program ? { id: ctx.program.id, nome: ctx.program.nome, demo: Boolean(ctx.program.demo), url: ctx.program.url } : null,
      cidade: ctx.university?.cidade || null,
      pais: ctx.university?.pais || 'Espanha',
      anoAcademico: jr.anoAcademico || null,
      inicioAulas: jr.inicioAulas || null,
      duracaoMeses: ctx.duracaoMeses,
    },
    progresso,
    contagem: { ...count, total: all.length, aplicaveis: applicable.length, pendentes: applicable.length - count.concluida },
    rodadaAtual: rodadaAtual.numero,
    proximaMissao: recommend(all),
    prazos,
    marcos,
    financas: { planejado: fin.orcamento, exigenciaVisto: fin.exigenciaVisto, disponivel: fin.confirmados, diferenca: fin.confirmados - Math.max(fin.orcamento, fin.exigenciaVisto), deficit: fin.deficit, viavel: fin.viavel, informouRecursos: fin.informouRecursos, moeda: 'EUR', tipo: 'estimativa' },
    rodadas: rounds,
  };
}

// Próxima missão: crítica → prazo mais próximo → atenção → em andamento → disponível; depois prioridade e ordem.
function recommend(all) {
  const rank = { atencao: 0, 'em-andamento': 1, disponivel: 2 };
  const candidates = all.filter((m) => ['atencao', 'em-andamento', 'disponivel'].includes(m.status) && !(m.opcional && m.objetivosFeitos === 0));
  candidates.sort((a, b) => {
    if ((a.prioridade === 'critica') !== (b.prioridade === 'critica')) return a.prioridade === 'critica' ? -1 : 1;
    const da = a.prazo?.diasRestantes ?? Infinity;
    const db = b.prazo?.diasRestantes ?? Infinity;
    if (da !== db) return da - db;
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    if (PRIORITY_RANK[a.prioridade] !== PRIORITY_RANK[b.prioridade]) return PRIORITY_RANK[a.prioridade] - PRIORITY_RANK[b.prioridade];
    return a.rodada - b.rodada;
  });
  const m = candidates[0];
  return m ? { id: m.id, label: m.label, titulo: m.titulo, resumo: m.resumo, rodada: m.rodada, status: m.status, statusLabel: m.statusLabel, prioridade: m.prioridade, progresso: m.progresso } : null;
}

// ---------- Elegibilidade preliminar (Missão 1.4) — sem afirmar elegibilidade ----------

export function eligibility(ctx) {
  const p = ctx.profile;
  const prog = ctx.program;
  if (!prog) return [];
  const items = [];
  items.push(p.formacao
    ? { requisito: 'Titulação de acesso', status: 'declarado', texto: `Você declarou: ${p.formacao}. A universidade verifica a equivalência de nível e o direito de acesso à pós-graduação no Brasil.`, fonte: 'O1' }
    : { requisito: 'Titulação de acesso', status: 'falta-informar', texto: 'Informe sua graduação no perfil.', fonte: 'O1' });
  const req = prog.idioma || { status: 'verificar' };
  const lvl = LANG_LEVELS.indexOf(p.espanhol || 'nenhum');
  if (req.status === 'nao-requerido') items.push({ requisito: 'Idioma', status: 'nao-exigido', texto: 'O programa não exige certificado de idioma (confirme na ficha).', fonte: req.fonte });
  else if (req.status === 'verificar') items.push({ requisito: 'Idioma', status: 'nao-confirmado', texto: 'Exigência não confirmada na ficha. Pergunte à coordenação.', fonte: req.fonte });
  else {
    const need = LANG_LEVELS.indexOf(req.nivel);
    const certOk = p.certificadoEspanhol && p.certificadoEspanhol !== 'nenhum' && LANG_LEVELS.indexOf(p.certificadoNivel) >= need;
    if (req.certificado) {
      items.push(certOk
        ? { requisito: 'Idioma', status: 'declarado', texto: `Você declarou certificado ${p.certificadoEspanhol} ${p.certificadoNivel} (exigido: ${req.nivel} com certificado). Só a universidade valida o documento.`, fonte: req.fonte }
        : { requisito: 'Idioma', status: 'falta-comprovar', texto: `Exigido: ${req.nivel} com certificado. Você ainda não declarou certificado nesse nível.`, fonte: req.fonte });
    } else {
      items.push(lvl >= need
        ? { requisito: 'Idioma', status: 'declarado', texto: `Exigido: ${req.nivel}. Seu nível declarado: ${p.espanhol}. Confirme como o programa comprova o nível.`, fonte: req.fonte }
        : { requisito: 'Idioma', status: 'falta-comprovar', texto: `Exigido: ${req.nivel}. Seu nível declarado (${p.espanhol || 'nenhum'}) está abaixo.`, fonte: req.fonte });
    }
  }
  items.push({ requisito: 'Critérios de seleção e documentos específicos', status: 'nao-confirmado', texto: 'Consulte a ficha oficial: a plataforma não avalia critérios de seleção.', fonte: 'O3' });
  return items;
}

// ---------- Tipo da missão → composição de cards na tela "Conteúdo da Missão" ----------
export function missionType(def) {
  if (def.tipoMissao) return def.tipoMissao;
  if (def.rodada === 8) return 'tie';
  if (['9.4', '9.5', '9.6', '9.7'].includes(def.id)) return 'bolsas';
  if (def.rodada === 9 || ['1.5', '5.4', '4.4', '4.5'].includes(def.id)) return 'financeiro';
  if (['6.1', '6.2'].includes(def.id)) return 'moradia';
  if (['6.3', '6.5'].includes(def.id)) return 'viagem';
  if (def.rodada === 3 || def.rodada === 4) return 'candidatura';
  if (def.rodada === 2 || ['5.3', '5.6', '6.4'].includes(def.id)) return 'documental';
  return 'geral';
}

const ERROS_POR_TIPO = {
  candidatura: ['Usar prazos de um ciclo anterior.', 'Enviar com anexos faltando ou ilegíveis.', 'Achar que "admitido" já significa "matriculado".'],
  documental: ['Nome diferente entre documentos.', 'Traduzir ou apostilar o que não é exigido (ou esquecer o que é).', 'Deixar para pedir documentos em cima do prazo.'],
  financeiro: ['Confundir o orçamento real com a exigência de comprovação do visto.', 'Contar recursos "previstos" como se já estivessem disponíveis.', 'Presumir que qualquer declaração de apoio familiar será aceita.'],
  bolsas: ['Supor que a bolsa cobre o seu mestrado sem ler o edital.', 'Perder o prazo do edital (diferente do prazo do DUA).', 'Enviar documentos fora do formato pedido.'],
  moradia: ['Pagar caução sem contrato ou sem verificar o anunciante.', 'Comparar só o aluguel e esquecer despesas adicionais.', 'Fechar antes de ter segurança sobre a data de viagem.'],
  viagem: ['Comprar passagem não reembolsável antes do visto.', 'Esquecer o custo do trecho terrestre e da bagagem.'],
  tie: ['Perder o prazo de um mês após a entrada.', 'Ir ao atendimento sem o comprovante da taxa.', 'Tratar a TIE como obrigatória numa estadia de até 6 meses.'],
  geral: ['Marcar como feito sem ter concluído no canal oficial.', 'Não guardar comprovantes.'],
};

// ---------- Detalhe de uma missão (para a tela de execução) ----------

export function missionDetail(user, jr, id, now = new Date()) {
  const def = missionById(id);
  if (!def) return null;
  const ctx = buildContext(user, jr, now);
  const state = missionState(def, ctx);
  const mp = ctx.missions[id] || {};
  const { _objetivos, ...pub } = state;
  const round = ROUNDS.find((r) => r.numero === def.rodada);
  const source = (sid) => {
    const s = sourceById(sid);
    return s ? { id: s.id, titulo: s.titulo, orgao: s.orgao, url: s.url, revisadoEm: s.revisadoEm, pendente: Boolean(s.pendente) } : null;
  };
  const extra = {};
  if (def.ferramenta === 'elegibilidade') extra.elegibilidade = eligibility(ctx);
  if (def.ferramenta === 'consulado' || def.ferramenta === 'email-consulado') {
    const c = consulateForState(ctx.profile.estado);
    extra.consulado = { sugerido: c, estado: ctx.profile.estado || null, listaUrl: CONSULATE_LIST_URL, resultado: consulateResult(ctx.profile.estado, { pais: ctx.profile.paisResidencia || 'Brasil' }) };
  }
  if (def.ferramenta === 'contato-academico') extra.contatos = jr.contatos;
  // Fluxo do processo: o que vem antes, o que depende desta missão e o que pode correr em paralelo.
  const cache = new Map();
  const st = (id) => missionState(missionById(id), ctx, cache);
  const all = ROUNDS.flatMap((r) => r.missoes);
  extra.dependentes = all.filter((x) => (x.dependencias || []).includes(id)).map((x) => { const s = st(x.id); return { id: x.id, label: s.label, titulo: x.titulo, status: s.status, statusLabel: s.statusLabel }; });
  const related = new Set([id, ...(def.dependencias || []), ...extra.dependentes.map((d) => d.id)]);
  extra.paralelas = all.filter((x) => !related.has(x.id) && (x.rodada ?? ROUNDS.find((r) => r.missoes.includes(x)).numero) === def.rodada)
    .map((x) => { const s = st(x.id); return { id: x.id, label: s.label, titulo: x.titulo, status: s.status, statusLabel: s.statusLabel }; })
    .filter((x) => ['disponivel', 'em-andamento', 'atencao', 'aguardando'].includes(x.status)).slice(0, 4);
  extra.antes = (def.dependencias || []).map((d) => { const s = st(d); return { id: d, label: s.label, titulo: s.titulo, status: s.status, statusLabel: s.statusLabel }; });
  const tipo = missionType(def);
  extra.tipo = tipo;
  extra.errosComuns = def.errosComuns || ERROS_POR_TIPO[tipo] || ERROS_POR_TIPO.geral;
  extra.resultado = def.resultado || def.criterio;
  extra.dificuldade = def.dificuldade || (def.prioridade === 'alta' && (def.duracaoMin || 60) >= 60 ? 'Média' : (def.duracaoMin || 60) >= 120 ? 'Alta' : 'Baixa');
  const revisoes = (def.fontes || []).map((sid) => sourceById(sid)?.revisadoEm).filter(Boolean).sort();
  extra.ultimaVerificacao = revisoes[0] || null;
  extra.execucao = mp.execucao || null;
  extra.evidencia = EVIDENCE[id] ? { ...EVIDENCE[id], valor: mp.evidencia || '' } : null;
  extra.riscoInfo = riskOf(id);
  extra.tutorial = def.tutorial || null; // só tutoriais verificados (nenhum cadastrado ainda)
  const oficial = (def.acoes || []).find((a) => a.tipo === 'oficial');
  extra.linkOficial = oficial ? { rotulo: oficial.rotulo, url: sourceById(oficial.fonte)?.url, orgao: sourceById(oficial.fonte)?.orgao || null } : def.acoes?.some((a) => a.tipo === 'programa') && ctx.program ? { rotulo: 'Abrir ficha oficial do mestrado', url: ctx.program.url } : null;
  if (!extra.linkOficial) {
    const s = (def.fontes || []).map(sourceById).find((x) => x?.url && x.tipo === 'oficial');
    if (s) extra.linkOficial = { rotulo: 'Abrir site oficial', url: s.url, orgao: s.orgao };
  }
  if (def.ferramenta === 'financeiro') {
    const f = ctx.finance;
    extra.financeiro = { exigenciaVisto: f.exigenciaVisto, orcamento: f.orcamento, confirmados: f.confirmados, deficit: f.deficit, viavel: f.viavel, iprem: f.iprem, meses: f.meses };
  }
  return {
    ...pub,
    definicao: {
      id: def.id,
      label: missionLabel(def.id),
      rodada: def.rodada,
      rodadaTitulo: round?.titulo,
      rodadaSigla: round?.sigla || null,
      rodadaBanner: round?.banner,
      titulo: def.titulo,
      resumo: def.resumo,
      objetivo: def.objetivo,
      porque: def.porque,
      comoExecutar: def.comoExecutar || [],
      criterio: def.criterio,
      prioridadeBase: def.prioridade,
      tempoEstimado: def.tempoEstimado,
      tag: def.tag,
      aguardavel: Boolean(def.aguardavel),
      condicional: Boolean(def.condicional),
      condicaoTexto: def.condicaoTexto || null,
      opcional: Boolean(def.opcional),
      ferramenta: def.ferramenta || null,
      prazo: def.prazo ? { tipo: def.prazo.tipo, rotulo: def.prazo.rotulo } : null,
      marco: def.marco ? MILESTONES.find((m) => m.id === def.marco) : null,
      dependencias: (def.dependencias || []).map((d) => ({ id: d, label: missionLabel(d), titulo: missionById(d)?.titulo })),
      requer: def.requer ? { ...def.requer } : null,
    },
    objetivos: def.objetivos.map((o, i) => ({
      id: o.id,
      texto: o.texto,
      tipo: o.tipo || 'check',
      feito: _objetivos[i].feito,
      valor: o.tipo === 'situacao' ? ctx.situacao[o.campo] : o.campo ? ctx.dados[o.campo] || '' : null,
      opcoes: o.tipo === 'situacao' ? SITUACAO[o.campo] : null,
      acao: o.tipo === 'auto' && AUTO_ROUTE[o.regra] ? { rota: AUTO_ROUTE[o.regra][0], rotulo: AUTO_ROUTE[o.regra][1] } : null,
      dica: o.tipo === 'auto' ? AUTO_HINTS[o.regra] : o.tipo === 'situacao' ? 'Decisão externa registrada por você: a plataforma não consulta o sistema oficial.' : null,
    })),
    documentos: (def.documentos || []).map((docId) => {
      const d = DOCUMENTS.find((x) => x.id === docId);
      return d ? { ...d, status: user.documents?.[docId] || 'pendente', statusLabel: DOC_STATUS_LABEL[user.documents?.[docId] || 'pendente'] } : null;
    }).filter(Boolean),
    fontes: (def.fontes || []).map(source).filter(Boolean),
    acoes: (def.acoes || []).map((a) => {
      if (a.tipo === 'oficial') return { ...a, url: sourceById(a.fonte)?.url };
      if (a.tipo === 'programa') return ctx.program ? { ...a, tipo: 'oficial', url: ctx.program.url } : { tipo: 'interna', rota: '/mestrados', rotulo: 'Defina seu mestrado primeiro' };
      return a;
    }),
    prazoDeclarado: mp.prazo || null,
    nota: mp.nota || '',
    naoAplicavelMarcado: Boolean(mp.naoAplicavel),
    ignoradaMarcada: Boolean(mp.ignorada),
    ...extra,
  };
}

// ---------- Mutações (validadas aqui, persistidas pela rota) ----------

export class JourneyError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function editable(user, jr, id) {
  const def = missionById(id);
  if (!def) throw new JourneyError(404, 'Missão não encontrada.');
  const state = missionState(def, buildContext(user, jr));
  return { def, state };
}

export function setSituacao(jr, campo, valor) {
  if (!SITUACAO[campo]) throw new JourneyError(400, 'Situação desconhecida.');
  if (!SITUACAO[campo].some(([v]) => v === valor)) throw new JourneyError(400, 'Valor de situação inválido.');
  ensureJourney(jr).situacao[campo] = valor;
}

export function setObjective(user, jr, missionId, objId, { feito, valor }) {
  const { def, state } = editable(user, jr, missionId);
  const obj = def.objetivos.find((o) => o.id === objId);
  if (!obj) throw new JourneyError(404, 'Objetivo não encontrado.');
  if (state.status === 'nao-aplicavel') throw new JourneyError(409, 'Esta missão não se aplica ao seu perfil.');
  if (state.status === 'concluida') throw new JourneyError(409, 'Missão concluída. Reabra-a para editar.');
  // Situações externas podem ser registradas mesmo com dependência pendente (a decisão aconteceu).
  if (obj.tipo === 'situacao') return setSituacao(jr, obj.campo, valor);
  if (state.status === 'bloqueada') throw new JourneyError(409, 'Esta missão está bloqueada. Conclua as dependências primeiro.');
  if (obj.tipo === 'auto') throw new JourneyError(400, 'Este objetivo é verificado automaticamente pela plataforma.');

  const journey = ensureJourney(jr);
  const mp = (journey.missions[missionId] ??= { objetivos: {} });
  mp.objetivos ??= {};
  mp.iniciadaEm ??= new Date().toISOString();

  if (obj.tipo === 'data') {
    if (valor && !/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw new JourneyError(400, 'Data inválida.');
    if (valor) journey.dados[obj.campo] = valor;
    else delete journey.dados[obj.campo];
  } else if (obj.tipo === 'texto') {
    const v = String(valor || '').trim().slice(0, 300);
    if (v) journey.dados[obj.campo] = v;
    else delete journey.dados[obj.campo];
  } else if (feito) mp.objetivos[objId] = new Date().toISOString();
  else delete mp.objetivos[objId];
}

export function completeMission(user, jr, missionId, confirmo, evidencia) {
  const { state } = editable(user, jr, missionId);
  if (!confirmo) throw new JourneyError(400, 'Confirme que realizou o procedimento.');
  const ev = EVIDENCE[missionId];
  const ref = String(evidencia || '').trim().slice(0, 200);
  if (ev?.obrigatoria && !ref && state.podeConcluir) throw new JourneyError(400, `Registre a evidência: ${ev.rotulo}.`);
  if (!state.podeConcluir) {
    throw new JourneyError(409, state.status === 'bloqueada' ? 'Missão bloqueada por dependências.' : 'Conclua todos os objetivos antes de finalizar a missão.');
  }
  const mp = (ensureJourney(jr).missions[missionId] ??= { objetivos: {} });
  mp.concluidaEm = new Date().toISOString();
  mp.aguardando = false;
  if (ref) mp.evidencia = ref;
}

export function reopenMission(user, jr, missionId) {
  const { state } = editable(user, jr, missionId);
  if (state.status !== 'concluida') throw new JourneyError(409, 'A missão não está concluída.');
  const mp = ensureJourney(jr).missions[missionId];
  delete mp.concluidaEm;
  delete mp.declarada;
  delete mp.requisitoAtendido;
}

// Requisitos que o estudante já atende (ex.: passaporte válido): a missão deixa de ser pendência,
// registrada como "requisito já atendido". Idempotente; mudar a resposta desfaz só o que ela marcou.
export function applyRequirements(user, jr, now = new Date()) {
  ensureJourney(jr);
  const answers = user.requisitos || {};
  for (const r of REQUIREMENTS) {
    const ok = answers[r.id] === 'tenho' && (!r.somenteNaEspanha || Boolean(jr.dados.dataEntrada));
    for (const id of r.missoes) {
      const mp = jr.missions[id];
      if (ok && !mp?.concluidaEm) Object.assign(mp_(jr, id), { concluidaEm: now.toISOString(), requisitoAtendido: true, aguardando: false });
      else if (!ok && mp?.requisitoAtendido) { delete mp.concluidaEm; delete mp.requisitoAtendido; }
    }
  }
}

export const EXECUCAO = ['nao-comecei', 'fazendo', 'ajuda'];
const mp_ = (jr, id) => (ensureJourney(jr).missions[id] ??= { objetivos: {} });

export function setMissionFlags(user, jr, missionId, { aguardando, naoAplicavel, prazo, nota, execucao, ignorada }) {
  const { def, state } = editable(user, jr, missionId);
  // Missão bloqueada: o conteúdo ainda não foi liberado, então nada pode ser registrado nela.
  if (state.status === 'bloqueada') throw new JourneyError(409, 'Esta missão ainda está bloqueada. Conclua os pré-requisitos primeiro.');
  if (ignorada !== undefined) {
    if (!def.opcional) throw new JourneyError(400, 'Só missões opcionais podem ser ignoradas.');
    if (state.status === 'concluida') throw new JourneyError(409, 'Missão concluída. Reabra-a antes.');
    mp_(jr, missionId).ignorada = Boolean(ignorada);
  }
  const mp = (ensureJourney(jr).missions[missionId] ??= { objetivos: {} });
  if (aguardando !== undefined) {
    if (!def.aguardavel) throw new JourneyError(400, 'Esta missão não depende de terceiros.');
    if (['bloqueada', 'concluida', 'nao-aplicavel'].includes(state.status) && aguardando) throw new JourneyError(409, 'Não é possível marcar como aguardando neste estado.');
    mp.aguardando = Boolean(aguardando);
  }
  if (naoAplicavel !== undefined) {
    if (!def.condicional && !def.opcional) throw new JourneyError(400, 'Esta missão é necessária para o seu perfil.');
    mp.naoAplicavel = Boolean(naoAplicavel);
    if (mp.naoAplicavel) mp.aguardando = false;
  }
  if (prazo !== undefined) {
    if (def.prazo?.tipo !== 'usuario') throw new JourneyError(400, 'Esta missão não aceita prazo declarado.');
    if (prazo && !/^\d{4}-\d{2}-\d{2}$/.test(prazo)) throw new JourneyError(400, 'Data inválida.');
    if (prazo) mp.prazo = prazo;
    else delete mp.prazo;
  }
  if (nota !== undefined) mp.nota = String(nota).slice(0, 500);
  // Registro do estudante sobre a execução (não conclui nada sozinho).
  if (execucao !== undefined) {
    if (execucao && !EXECUCAO.includes(execucao)) throw new JourneyError(400, 'Estado de execução inválido.');
    if (execucao) { mp.execucao = execucao; if (execucao === 'fazendo') mp.iniciadaEm ??= new Date().toISOString(); } else delete mp.execucao;
  }
}

// ---------- Progresso anterior e chegada (fatos declarados pelo estudante, com confirmação) ----------

const today = (now) => now.toISOString().slice(0, 10);
function validEntry(dataEntrada, now) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataEntrada || '')) throw new JourneyError(400, 'Informe a data de entrada na Espanha.');
  if (dataEntrada > today(now)) throw new JourneyError(400, 'A data de entrada não pode estar no futuro.');
}

// Registra etapas já cumpridas fora da Estuvia. Nunca rebaixa uma situação nem desfaz conclusões.
export function declarePriorProgress(user, jr, etapa, { dataEntrada, confirmo } = {}, now = new Date()) {
  if (!confirmo) throw new JourneyError(400, 'Confirme que estas etapas já foram realizadas.');
  const idx = PRIOR_STAGES.findIndex((s) => s.id === etapa);
  if (idx < 0) throw new JourneyError(400, 'Etapa desconhecida.');
  const stages = PRIOR_STAGES.slice(0, idx + 1);
  if (stages.some((s) => s.exigeDataEntrada)) validEntry(dataEntrada, now);
  ensureJourney(jr);
  const iso = now.toISOString();
  const marcadas = [];
  for (const st of stages) {
    for (const [campo, valor] of Object.entries(st.situacao || {})) {
      if (situacaoRank(campo, valor) > situacaoRank(campo, jr.situacao[campo])) jr.situacao[campo] = valor;
    }
    for (const id of st.missoes) {
      const mp = mp_(jr, id);
      if (mp.concluidaEm) continue;
      Object.assign(mp, { concluidaEm: iso, declarada: true, aguardando: false });
      marcadas.push(id);
    }
  }
  if (stages.some((s) => s.exigeDataEntrada)) jr.dados.dataEntrada = dataEntrada;
  jr.progressoAnterior = { etapa, em: iso, missoes: marcadas.length };
  return marcadas;
}

// Chegada à Espanha: ativa as Rodadas 7 e 8 (o prazo da TIE conta a partir da entrada).
export function registerArrival(user, jr, { dataEntrada, confirmo }, now = new Date()) {
  if (!confirmo) throw new JourneyError(400, 'Confirme que você já entrou na Espanha.');
  validEntry(dataEntrada, now);
  const ctx = buildContext(user, jr, now);
  const visto = missionState(missionById('5.9'), ctx);
  if (ctx.situacao.visto !== 'aprovado' && visto.status !== 'concluida') {
    throw new JourneyError(409, 'Registre primeiro a aprovação do visto (situação da jornada ou Missão 5.9).');
  }
  ensureJourney(jr).dados.dataEntrada = dataEntrada;
}

// ---------- Registro idempotente de desbloqueios (UnlockEvent) ----------
// Compara o estado calculado com o histórico da jornada e acrescenta só o que é novo.
export function recordUnlocks(jr, journey, now = new Date()) {
  ensureJourney(jr);
  const known = new Set(jr.desbloqueios.map((e) => e.entidade));
  const novos = [];
  const add = (entidade, tipo, motivo) => {
    if (known.has(entidade)) return;
    known.add(entidade);
    novos.push({ entidade, tipo, motivo, em: now.toISOString() });
  };
  for (const r of journey.rodadas) {
    if (r.desbloqueada) add('rodada:' + r.numero, 'rodada', r.desbloqueio.motivo);
    for (const m of r.missoes) {
      if (!['bloqueada', 'nao-aplicavel'].includes(m.status)) add('missao:' + m.id, 'missao', m.conclusao === 'requisito-atendido' ? 'requisito-atendido' : m.declarada ? 'progresso-anterior' : m.trilha && !r.desbloqueada ? 'trilha-paralela' : 'pre-requisitos');
    }
  }
  jr.desbloqueios.push(...novos);
  return novos;
}

// ---------- O que o navegador pode ver ----------
// Rodada bloqueada: só a visão geral e as missões de trilhas paralelas; as demais ficam ocultas.
export function journeyForClient(j) {
  return {
    ...j,
    rodadas: j.rodadas.map((r) => {
      if (r.desbloqueada) return r;
      const visiveis = r.missoes.filter((m) => m.trilha || m.status === 'concluida');
      return { ...r, missoes: visiveis, ocultas: r.missoes.length - visiveis.length };
    }),
  };
}

// Missão bloqueada: nome, objetivo resumido e o que falta — sem guia, checklist nem ferramentas.
export function missionForClient(user, jr, id, now = new Date()) {
  const d = missionDetail(user, jr, id, now);
  if (!d || d.status !== 'bloqueada') return d;
  const def = d.definicao;
  const lock = roundUnlock(def.rodada, buildContext(user, jr, now));
  return {
    id: d.id, label: d.label, titulo: d.titulo, status: d.status, statusLabel: d.statusLabel, codigo: d.codigo,
    rodada: def.rodada, bloqueada: true, trilha: d.trilha, prazo: d.prazo, bloqueadaPor: d.bloqueadaPor, bloqueioExterno: d.bloqueioExterno,
    previa: { resumo: def.resumo, objetivo: def.objetivo, rodadaTitulo: def.rodadaTitulo, rodadaSigla: def.rodadaSigla, rodadaBanner: def.rodadaBanner, tempoEstimado: def.tempoEstimado },
    rodadaDesbloqueio: lock.desbloqueada ? null : { texto: lock.texto, faltam: lock.faltam, acao: lock.acao },
  };
}

// Eventos para feedback visual, comparando o estado antes e depois de uma mutação.
export function diffEvents(before, after, missionId) {
  const events = [];
  const flat = (j) => j.rodadas.flatMap((r) => r.missoes);
  const mb = missionId && flat(before).find((m) => m.id === missionId);
  const ma = missionId && flat(after).find((m) => m.id === missionId);
  if (ma && mb?.status !== 'concluida' && ma.status === 'concluida') {
    const def = missionById(missionId);
    const round = after.rodadas.find((r) => r.numero === ma.rodada);
    events.push({ tipo: 'missao-concluida', id: missionId, label: ma.label, titulo: ma.titulo, resultado: def?.resultado || def?.criterio || null, rodada: ma.rodada, progressoRodada: round?.progresso ?? null });
  }
  after.rodadas.forEach((r, i) => {
    if (before.rodadas[i].status !== 'concluida' && r.status === 'concluida') events.push({ tipo: 'rodada-concluida', numero: r.numero, sigla: r.sigla, titulo: r.titulo, conclusao: r.conclusao });
  });
  after.rodadas.forEach((r, i) => {
    if (!before.rodadas[i].desbloqueada && r.desbloqueada) events.push({ tipo: 'rodada-desbloqueada', numero: r.numero, sigla: r.sigla, titulo: r.titulo, etapa: r.etapa, banner: r.banner });
  });
  after.marcos.forEach((m, i) => {
    if (m.conquistado && !before.marcos[i].conquistado) events.push({ tipo: 'marco', id: m.id, titulo: m.titulo, icone: m.icone });
  });
  const open = (m) => !['bloqueada', 'nao-aplicavel'].includes(m.status);
  const beforeOpen = new Set(flat(before).filter(open).map((m) => m.id));
  const desbloqueadas = flat(after).filter((m) => open(m) && m.status !== 'concluida' && !beforeOpen.has(m.id));
  if (desbloqueadas.length) events.push({ tipo: 'desbloqueio', missoes: desbloqueadas.map((m) => ({ id: m.id, label: m.label, titulo: m.titulo, rodada: m.rodada })) });
  const criticasAntes = new Set(flat(before).filter((m) => m.prioridade === 'critica').map((m) => m.id));
  const novasCriticas = flat(after).filter((m) => m.prioridade === 'critica' && !criticasAntes.has(m.id));
  if (novasCriticas.length) events.push({ tipo: 'urgente', missoes: novasCriticas.map((m) => ({ id: m.id, label: m.label, titulo: m.titulo })) });
  for (const e of events) e.journeyId = after.id;
  return events;
}
