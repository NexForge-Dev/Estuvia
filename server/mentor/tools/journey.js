// Ferramentas da jornada: leitura do estado e atualização de missões pelas regras do motor.
import { z } from 'zod';
import {
  computeJourney, missionForClient, setObjective, completeMission, setMissionFlags, registerArrival,
} from '../../journey-engine.js';
import { missionById } from '../../content/rounds.js';
import { EVIDENCE } from '../../content/progression.js';
import { defineTool, ToolError, requireJourney, flatMissions, mutateJourney, dryRunJourney } from './core.js';
import { fmtDate } from '../parse.js';

const jid = z.string().max(60).optional().describe('Id da jornada; se omitido, usa a jornada em foco ou a primeira.');
const mid = z.string().regex(/^\d\.\d{1,2}$/).describe('Id da missão, ex.: "2.3".');

const missionSummary = (m) => ({
  id: m.id, label: m.label, titulo: m.titulo, rodada: m.rodada, status: m.status, statusLabel: m.statusLabel,
  prioridade: m.prioridade, prazo: m.prazo ? { data: m.prazo.data, diasRestantes: m.prazo.diasRestantes, origem: m.prazo.origem } : null,
  objetivos: `${m.objetivosFeitos}/${m.objetivosTotal}`, bloqueadaPor: (m.bloqueadaPor || []).map((b) => b.label ? `${b.label} ${b.titulo}` : b.titulo),
  trilha: m.trilha?.titulo || null,
});

export function journeyOverview(user, jr) {
  const j = computeJourney(user, jr);
  const atual = j.rodadas.find((r) => r.numero === j.rodadaAtual);
  return {
    id: j.id,
    destino: { universidade: j.destino.universidade?.nome || null, sigla: j.destino.universidade?.sigla || null, cidade: j.destino.cidade, programa: j.destino.programa?.nome || null, programaDemo: Boolean(j.destino.programa?.demo), anoAcademico: j.destino.anoAcademico, duracaoMeses: j.destino.duracaoMeses, inicioAulas: j.destino.inicioAulas },
    progresso: Math.round(j.progresso * 100),
    rodadaAtual: { numero: atual.numero, titulo: atual.titulo, progresso: Math.round(atual.progresso * 100) },
    situacao: j.situacao, chegada: j.chegada,
    proximaMissao: j.proximaMissao ? { id: j.proximaMissao.id, label: j.proximaMissao.label, titulo: j.proximaMissao.titulo, statusLabel: j.proximaMissao.statusLabel, resumo: j.proximaMissao.resumo } : null,
    contagem: { pendentes: j.contagem.pendentes, concluidas: j.contagem.concluida, aguardando: j.contagem.aguardando, atencao: j.contagem.atencao },
    proximosPrazos: j.prazos.filter((p) => p.diasRestantes >= 0).slice(0, 5).map((p) => ({ titulo: p.titulo, data: p.data, diasRestantes: p.diasRestantes, origem: p.origem, missao: p.label || null })),
    rodadas: j.rodadas.map((r) => ({ numero: r.numero, titulo: r.titulo, status: r.status, desbloqueada: r.desbloqueada, concluidas: r.concluidas, total: r.total, falta: r.desbloqueada ? null : r.desbloqueio.texto })),
  };
}

export const getUserJourney = defineTool({
  name: 'get_user_journey', efeito: 'leitura', permissao: 'jornada',
  descricao: 'Resumo da jornada do estudante: destino, progresso, rodada atual, próxima missão recomendada, prazos e situação (candidatura, matrícula, visto, chegada).',
  entrada: z.object({ journeyId: jid }).strict(),
  saida: '{ id, destino, progresso(%), rodadaAtual, situacao, chegada, proximaMissao, contagem, proximosPrazos[], rodadas[] }',
  run: (ctx, { journeyId }) => {
    const jr = requireJourney(ctx, journeyId);
    return { ...journeyOverview(ctx.user, jr), outrasJornadas: (ctx.user.journeys || []).filter((j) => j.id !== jr.id).length };
  },
});

/** Missão no formato seguro para o Mentor: missão bloqueada só expõe a prévia (regra do motor). */
export function missionForMentor(user, jr, id) {
  const d = missionForClient(user, jr, id);
  if (!d) return null;
  if (d.bloqueada) return { id: d.id, label: d.label, titulo: d.titulo, status: d.status, statusLabel: d.statusLabel, bloqueada: true, resumo: d.previa.resumo, objetivo: d.previa.objetivo, bloqueadaPor: d.bloqueadaPor.map((b) => (b.label ? `${b.label} ${b.titulo}` : b.titulo)), rodadaFalta: d.rodadaDesbloqueio?.texto || null };
  return {
    id: d.id, label: d.label, titulo: d.definicao.titulo, status: d.status, statusLabel: d.statusLabel, bloqueada: false,
    resumo: d.definicao.resumo, objetivo: d.definicao.objetivo, porque: d.definicao.porque,
    objetivosLista: d.objetivos.map((o) => ({ id: o.id, texto: o.texto, tipo: o.tipo, feito: o.feito })),
    comoExecutar: d.definicao.comoExecutar.map((c) => ({ titulo: c.titulo, texto: c.texto })),
    documentos: d.documentos.map((x) => ({ id: x.id, nome: x.nome, status: x.status, statusLabel: x.statusLabel, dica: x.dica })),
    prazo: d.prazo ? { data: d.prazo.data, diasRestantes: d.prazo.diasRestantes, origem: d.prazo.origem } : null,
    aguardavel: d.definicao.aguardavel, condicional: d.definicao.condicional, podeConcluir: d.podeConcluir,
    evidencia: d.evidencia ? { rotulo: d.evidencia.rotulo, obrigatoria: Boolean(d.evidencia.obrigatoria) } : null,
    linkOficial: d.linkOficial, errosComuns: d.errosComuns, tempoEstimado: d.definicao.tempoEstimado,
    fontes: d.fontes.map((f) => ({ id: f.id, titulo: f.titulo, url: f.url, revisadoEm: f.revisadoEm })),
    journeyId: jr.id,
  };
}

export const getCurrentMission = defineTool({
  name: 'get_current_mission', efeito: 'leitura', permissao: 'jornada',
  descricao: 'Detalhe da missão em foco (a que o estudante está vendo) ou, se não houver, da próxima missão recomendada. Missões bloqueadas mostram só nome, objetivo resumido e o que falta.',
  entrada: z.object({ journeyId: jid, missaoId: mid.optional() }).strict(),
  saida: '{ id, label, titulo, status, bloqueada, resumo, objetivo, objetivosLista[], comoExecutar[], documentos[], prazo, evidencia, linkOficial, fontes[] }',
  run: (ctx, { journeyId, missaoId }) => {
    const jr = requireJourney(ctx, journeyId);
    const id = missaoId || ctx.contexto.missaoId || computeJourney(ctx.user, jr).proximaMissao?.id;
    if (!id) return { nenhuma: true, motivo: 'Não há missões disponíveis agora: as restantes estão concluídas, aguardando terceiros ou bloqueadas.' };
    const m = missionForMentor(ctx.user, jr, id);
    if (!m) throw new ToolError('nao-encontrada', 'Missão não encontrada.', 404);
    return { ...m, emFoco: Boolean(missaoId || ctx.contexto.missaoId) };
  },
});

export const getPendingMissions = defineTool({
  name: 'get_pending_missions', efeito: 'leitura', permissao: 'jornada',
  descricao: 'Missões que faltam, agrupadas por situação: para fazer agora, em andamento, aguardando terceiros, com atenção e bloqueadas (com o que falta).',
  entrada: z.object({ journeyId: jid, rodada: z.number().int().min(1).max(9).optional() }).strict(),
  saida: '{ agora[], emAndamento[], atencao[], aguardando[], bloqueadas[], total }',
  run: (ctx, { journeyId, rodada }) => {
    const jr = requireJourney(ctx, journeyId);
    const j = computeJourney(ctx.user, jr);
    const ms = flatMissions(j).filter((m) => (!rodada || m.rodada === rodada) && !['concluida', 'nao-aplicavel', 'ignorada'].includes(m.status) && !(m.opcional && m.objetivosFeitos === 0));
    const by = (s) => ms.filter((m) => m.status === s).map(missionSummary);
    return { journeyId: jr.id, agora: by('disponivel'), emAndamento: by('em-andamento'), atencao: by('atencao'), aguardando: by('aguardando'), bloqueadas: by('bloqueada').slice(0, 8), total: ms.length };
  },
});

// ---------- Escrita ----------

const OPERACOES = ['marcar-objetivo', 'desmarcar-objetivo', 'concluir', 'aguardando', 'parar-aguardar', 'execucao', 'nota'];

function describeOp(def, input, mission) {
  const obj = (id) => def.objetivos.find((o) => o.id === id)?.texto || id;
  switch (input.operacao) {
    case 'marcar-objetivo': return `Marcar como feito: "${obj(input.objetivoId)}" (Missão ${mission.label}).`;
    case 'desmarcar-objetivo': return `Desmarcar: "${obj(input.objetivoId)}" (Missão ${mission.label}).`;
    case 'concluir': return `Concluir a Missão ${mission.label} - ${def.titulo}.`;
    case 'aguardando': return `Marcar a Missão ${mission.label} como "aguardando terceiros".`;
    case 'parar-aguardar': return `Tirar a Missão ${mission.label} de "aguardando".`;
    case 'execucao': return `Registrar na Missão ${mission.label}: ${{ 'nao-comecei': 'ainda não comecei', fazendo: 'estou fazendo', ajuda: 'preciso de ajuda' }[input.execucao] || 'situação'}.`;
    case 'nota': return `Salvar nota na Missão ${mission.label}: "${input.nota}".`;
    default: return '';
  }
}

function applyOp(user, jr, input) {
  const { missaoId: id } = input;
  const def = missionById(id);
  switch (input.operacao) {
    case 'marcar-objetivo': return setObjective(user, jr, id, input.objetivoId, { feito: true });
    case 'desmarcar-objetivo': return setObjective(user, jr, id, input.objetivoId, { feito: false });
    case 'concluir':
      // "Terminei": marca os objetivos manuais que o estudante declarou e conclui (o motor recusa se faltar algo automático).
      if (input.marcarPendentes) for (const o of def.objetivos.filter((x) => (x.tipo || 'check') === 'check')) setObjective(user, jr, id, o.id, { feito: true });
      return completeMission(user, jr, id, true, input.evidencia);
    case 'aguardando': return setMissionFlags(user, jr, id, { aguardando: true });
    case 'parar-aguardar': return setMissionFlags(user, jr, id, { aguardando: false });
    case 'execucao': return setMissionFlags(user, jr, id, { execucao: input.execucao });
    case 'nota': return setMissionFlags(user, jr, id, { nota: input.nota });
    default: throw new ToolError('entrada', 'Operação inválida.');
  }
}

export const updateMissionProgress = defineTool({
  name: 'update_mission_progress', efeito: 'escrita', permissao: 'jornada',
  descricao: 'Atualiza uma missão: marcar/desmarcar objetivo, concluir (opcionalmente marcando os objetivos manuais pendentes), marcar como aguardando terceiros, registrar execução ou nota. O backend verifica dependências, objetivos automáticos e evidências obrigatórias; dependências nunca são ignoradas.',
  entrada: z.object({
    journeyId: jid, missaoId: mid, operacao: z.enum(OPERACOES),
    objetivoId: z.string().max(40).optional(), marcarPendentes: z.boolean().optional(),
    evidencia: z.string().trim().max(200).optional().describe('Obrigatória em algumas missões (ex.: número do comprovante do DUA na 3.6).'),
    execucao: z.enum(['nao-comecei', 'fazendo', 'ajuda']).optional(), nota: z.string().trim().max(500).optional(),
  }).strict().refine((i) => !['marcar-objetivo', 'desmarcar-objetivo'].includes(i.operacao) || i.objetivoId, 'Informe o objetivo.'),
  saida: '{ resumo, missao{ id, status, statusLabel }, eventos[] (missão concluída, rodada desbloqueada…) }',
  preview: (ctx, input) => {
    const jr = requireJourney(ctx, input.journeyId);
    const def = missionById(input.missaoId);
    if (!def) throw new ToolError('nao-encontrada', 'Missão não encontrada.', 404);
    const mission = flatMissions(computeJourney(ctx.user, jr)).find((m) => m.id === input.missaoId);
    const ev = EVIDENCE[input.missaoId];
    if (input.operacao === 'concluir' && ev?.obrigatoria && !input.evidencia) throw new ToolError('evidencia', `Para concluir a Missão ${mission.label} preciso que você informe: ${ev.rotulo}.`);
    dryRunJourney(ctx, jr.id, (draft) => applyOp(ctx.user, draft, input)); // recusa aqui se o motor não permitir
    const detalhes = [];
    if (input.operacao === 'concluir' && input.marcarPendentes) {
      const det = missionForMentor(ctx.user, jr, input.missaoId);
      const marcar = det.objetivosLista.filter((o) => !o.feito && o.tipo === 'check').map((o) => o.texto);
      if (marcar.length) detalhes.push(`Objetivos que serão marcados como feitos: ${marcar.join('; ')}.`);
    }
    return { resumo: describeOp(def, input, mission), detalhes, avisos: input.operacao === 'concluir' ? ['Concluir aqui registra o seu progresso na Estuvia; não envia nada a nenhum órgão oficial.'] : [] };
  },
  execute: async (ctx, input) => {
    const jr = requireJourney(ctx, input.journeyId);
    const def = missionById(input.missaoId);
    const r = await mutateJourney(ctx, jr.id, (draft) => applyOp(ctx.user, draft, input), { missionId: input.missaoId });
    const m = flatMissions(r.journey).find((x) => x.id === input.missaoId);
    return { resumo: `${describeOp(def, input, m).replace(/^(Marcar|Desmarcar|Concluir|Tirar|Registrar|Salvar)/, (w) => ({ Marcar: 'Marquei', Desmarcar: 'Desmarquei', Concluir: 'Concluí', Tirar: 'Tirei', Registrar: 'Registrei', Salvar: 'Salvei' })[w])} Situação atual: ${m?.statusLabel || '-'}.`, dados: { missao: m ? { id: m.id, status: m.status, statusLabel: m.statusLabel } : null, eventos: r.eventos, journeyId: jr.id } };
  },
});

export const registerArrivalTool = defineTool({
  name: 'register_arrival', efeito: 'escrita', permissao: 'jornada',
  descricao: 'Registra a data de entrada na Espanha (ativa as Rodadas 7 e 8; prazos como o da TIE contam dessa data). Exige o visto aprovado registrado.',
  entrada: z.object({ journeyId: jid, dataEntrada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict(),
  saida: '{ resumo, eventos[] }',
  preview: (ctx, input) => {
    const jr = requireJourney(ctx, input.journeyId);
    dryRunJourney(ctx, jr.id, (draft) => registerArrival(ctx.user, draft, { dataEntrada: input.dataEntrada, confirmo: true }, ctx.now));
    return { resumo: `Registrar sua chegada à Espanha em ${fmtDate(input.dataEntrada)}.`, detalhes: ['Isso libera as missões de chegada (Rodada 7) e da TIE (Rodada 8).'], avisos: ['Confirme a data: ela é usada para calcular prazos legais.'] };
  },
  execute: async (ctx, input) => {
    const jr = requireJourney(ctx, input.journeyId);
    const r = await mutateJourney(ctx, jr.id, (draft) => registerArrival(ctx.user, draft, { dataEntrada: input.dataEntrada, confirmo: true }, ctx.now));
    return { resumo: `Registrei sua chegada em ${fmtDate(input.dataEntrada)}. As missões de chegada e da TIE foram liberadas.`, dados: { eventos: r.eventos, journeyId: jr.id } };
  },
});

export default [getUserJourney, getCurrentMission, getPendingMissions, updateMissionProgress, registerArrivalTool];
