// Acompanhamento proativo: avisos gerados por REGRAS a partir de dados confiáveis
// (prazos cadastrados, Radar verificado, estado das missões, documentos, finanças, chegada).
// Nenhum aviso é inventado por IA. Cada um diz de qual regra veio e respeita as preferências do estudante.

import crypto from 'node:crypto';
import { computeJourney } from '../journey-engine.js';
import { computeFinance } from '../finance-engine.js';
import { journeyOpportunity, myRadar, agendaChanges } from '../radar/service.js';
import { mentorState, openNotes } from './memory.js';
import { requiredDocuments } from './tools/documents.js';
import { flatMissions } from './tools/core.js';
import { addDays, fmtDate, todayIn } from './parse.js';
import { daysBetween } from '../radar/dates.js';

const PRIORITY = { alta: 0, media: 1, baixa: 2 };
const STALE_DAYS = 21;
const sig = (...parts) => crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);
const say = (mensagem, rotulo) => ({ tipo: 'mensagem', mensagem, rotulo });
const route = (rota, rotulo) => ({ tipo: 'rota', rota, rotulo });

export function insights(user, { now = new Date(), limit = 6 } = {}) {
  const st = mentorState(user);
  if (st.preferencias.proativo === false) return [];
  const today = todayIn(user.agenda?.disponibilidade?.fuso || 'America/Sao_Paulo', now);
  const out = [];
  const add = (i) => { if (st.preferencias.tiposAviso[i.tipo] !== false && st.permissoes[i.permissao || 'jornada'] !== false && !st.dispensados[i.id]) out.push(i); };

  // Radar: alertas não lidos e alterações oficiais que afetam a agenda.
  if (st.permissoes.radar !== false) {
    try {
      const r = myRadar(user);
      for (const a of r.alertas.filter((x) => !x.lidoEm).slice(0, 2)) {
        add({ id: sig('radar-alerta', a.id), tipo: 'radar', permissao: 'radar', prioridade: a.evento === 'abertura' || a.evento === 'encerramento' ? 'alta' : 'media', titulo: a.titulo, texto: `${a.corpo} Quer organizar as tarefas de preparação?`, acao: say('Organize minha semana', 'Organizar tarefas'), origem: `regra:radar-alerta:${a.evento}`, base: { alertaId: a.id, fonteUrl: a.dados?.fonteUrl || null } });
      }
      for (const c of agendaChanges(user).slice(0, 1)) {
        add({ id: sig('radar-agenda', c.linkId, c.dataOficialNova), tipo: 'radar', permissao: 'radar', prioridade: 'alta', titulo: 'Data oficial alterada', texto: `A data oficial de "${c.titulo}" mudou de ${fmtDate(c.dataOficialAnterior)} para ${fmtDate(c.dataOficialNova)}. Confirme antes de eu mudar sua agenda.`, acao: route('/oportunidades', 'Revisar no Radar'), origem: 'regra:radar-agenda-alterada', base: c });
      }
    } catch { /* Radar indisponível: sem avisos dele */ }
  }

  for (const jr of user.journeys || []) {
    const j = computeJourney(user, jr, now);
    const sigla = j.destino.universidade?.sigla || 'Jornada';
    const ms = flatMissions(j);

    // Inscrições prestes a abrir (Radar, mestrado da jornada).
    if (st.permissoes.radar !== false) {
      const c = journeyOpportunity(user, jr);
      if (c && c.estado === 'anunciadas' && c.abertura) {
        const dias = daysBetween(today, c.abertura);
        if (dias >= 0 && dias <= 30) add({ id: sig('abre', c.id, c.abertura), tipo: 'radar', permissao: 'radar', prioridade: dias <= 7 ? 'alta' : 'media', titulo: 'Candidatura abre em breve', texto: `A candidatura do ${c.programa.nome} abre em ${fmtDate(c.abertura)} (faltam ${dias} dia(s)), segundo a fonte oficial. Quer organizar as tarefas de preparação?`, acao: say('Monte um plano para concluir os documentos antes da inscrição', 'Organizar preparação'), origem: 'regra:radar-abertura-proxima', base: { oportunidadeId: c.id, abertura: c.abertura } });
      }
      if (c && c.estado === 'abertas' && c.prazoFinal && j.situacao.adjudicacao === 'nao-enviada') {
        add({ id: sig('aberta', c.id, c.prazoFinal), tipo: 'radar', permissao: 'radar', prioridade: 'alta', titulo: 'Inscrições abertas', texto: `As inscrições do ${c.programa.nome} estão abertas até ${fmtDate(c.prazoFinal)} (fonte oficial). Você ainda não registrou o envio.`, acao: route(`/j/${jr.id}/m/3.6`, 'Abrir Missão 3.6'), origem: 'regra:radar-abertas', base: { oportunidadeId: c.id } });
      }
    }

    // Prazos se aproximando (missões abertas).
    for (const m of ms.filter((x) => x.prazo && x.prazo.diasRestantes >= 0 && x.prazo.diasRestantes <= 14 && !['concluida', 'nao-aplicavel', 'ignorada', 'bloqueada'].includes(x.status)).slice(0, 2)) {
      add({ id: sig('prazo', jr.id, m.id, m.prazo.data), tipo: 'prazo', prioridade: m.prazo.diasRestantes <= 3 ? 'alta' : 'media', titulo: `Prazo em ${m.prazo.diasRestantes} dia(s)`, texto: `Missão ${m.label} - ${m.titulo}: prazo em ${fmtDate(m.prazo.data)} (${m.prazo.origem === 'oficial' ? 'prazo oficial' : m.prazo.origem === 'previsto' ? 'previsão' : 'prazo informado por você'}). Quer reservar um horário?`, acao: say(`Agende para amanhã a Missão ${m.label}`, 'Reservar horário'), origem: 'regra:prazo-proximo', base: { journeyId: jr.id, missaoId: m.id, data: m.prazo.data } });
    }

    // Missões paradas: iniciadas há muito tempo, sem conclusão nem espera de terceiros.
    for (const m of ms.filter((x) => x.status === 'em-andamento')) {
      const ini = jr.missions?.[m.id]?.iniciadaEm;
      if (ini && (now - new Date(ini)) / 86400000 >= STALE_DAYS) {
        add({ id: sig('parada', jr.id, m.id, ini.slice(0, 10)), tipo: 'missao', prioridade: 'baixa', titulo: 'Missão parada', texto: `Você começou a Missão ${m.label} - ${m.titulo} há mais de ${STALE_DAYS} dias. Travou em alguma parte?`, acao: say(`Estou com dificuldade na Missão ${m.label}`, 'Pedir ajuda'), origem: 'regra:missao-parada', base: { journeyId: jr.id, missaoId: m.id } });
        break;
      }
    }

    // Chegada à Espanha: TIE (estada > 6 meses: até 1 mês após a entrada — Missões 8.1/8.2).
    if (j.chegada) {
      const tie = ms.find((x) => x.id === '8.1');
      if (tie && !['concluida', 'nao-aplicavel'].includes(tie.status)) {
        const limite = addDays(j.chegada, 30);
        const dias = daysBetween(today, limite);
        add({ id: sig('tie', jr.id, j.chegada), tipo: 'chegada', prioridade: dias <= 10 ? 'alta' : 'media', titulo: 'Vamos ver a sua TIE?', texto: `Você informou que chegou à Espanha em ${fmtDate(j.chegada)}. ${Number(j.destino.duracaoMeses) > 6 ? `Como seu curso dura ${j.destino.duracaoMeses} meses, a orientação oficial prevê pedir a TIE em até um mês após a entrada (por volta de ${fmtDate(limite)}).` : 'Vamos verificar se a TIE é obrigatória no seu caso.'}`, acao: route(`/j/${jr.id}/m/8.1`, 'Abrir Missão 8.1'), origem: 'regra:chegada-tie', base: { journeyId: jr.id, chegada: j.chegada } });
      }
    }

    // Documentos pendentes da rodada de documentação, quando ela está em andamento.
    if (st.permissoes.documentos !== false && [2, 3].includes(j.rodadaAtual)) {
      const pend = requiredDocuments(user, jr, 'dua').filter((d) => d.pendente && d.exigencia === 'requerido');
      if (pend.length) add({ id: sig('docs', jr.id, pend.map((d) => d.id).join(',')), tipo: 'documentos', permissao: 'documentos', prioridade: 'media', titulo: `${pend.length} documento(s) da candidatura pendente(s)`, texto: `Ainda faltam: ${pend.slice(0, 3).map((d) => d.nome).join(', ')}${pend.length > 3 ? '…' : ''}.`, acao: say('Quais documentos ainda faltam?', 'Ver pendências'), origem: 'regra:documentos-pendentes', base: { journeyId: jr.id } });
    }

    // Finanças: rodadas que dependem do planejamento sem recursos registrados.
    if (st.permissoes.financas !== false && j.rodadaAtual >= 4) {
      const f = computeFinance(user, jr, now);
      if (!f.informouRecursos) add({ id: sig('fin', jr.id, 'sem-recursos'), tipo: 'financas', permissao: 'financas', prioridade: 'media', titulo: 'Planejamento financeiro', texto: `Você está na Rodada ${j.rodadaAtual} (${sigla}) e ainda não registrou seus recursos. Sem isso não consigo calcular quanto falta para o visto.`, acao: say('Quanto dinheiro falta para eu conseguir ir?', 'Calcular agora'), origem: 'regra:financas-sem-recursos', base: { journeyId: jr.id } });
    }
  }

  // Bolsas com prazo próximo e tarefas pendentes.
  if (st.permissoes.financas !== false) {
    for (const a of (user.scholarshipApps || []).filter((x) => x.prazo && !['concedida', 'negada', 'desisti', 'enviada'].includes(x.status))) {
      const dias = daysBetween(today, a.prazo);
      if (dias >= 0 && dias <= 14 && (a.tarefas || []).some((t) => !t.feito)) add({ id: sig('bolsa', a.id, a.prazo), tipo: 'bolsa', permissao: 'financas', prioridade: dias <= 5 ? 'alta' : 'media', titulo: `Bolsa: prazo em ${dias} dia(s)`, texto: `O prazo de "${a.nome}" (informado por você) é ${fmtDate(a.prazo)} e há tarefas pendentes.`, acao: route('/financiamento#bolsas', 'Abrir bolsas'), origem: 'regra:bolsa-prazo', base: { bolsaId: a.id } });
    }
  }

  // Pendências que o estudante contou (memória autorizada), depois de 2 dias.
  if (st.permissoes.memoria !== false) {
    for (const n of openNotes(user).filter((x) => (now - new Date(x.criadaEm)) / 86400000 >= 2).slice(0, 1)) {
      add({ id: sig('nota', n.id), tipo: 'memoria', permissao: 'memoria', prioridade: 'baixa', titulo: 'Conseguiu resolver?', texto: `Você me contou: "${n.texto}". Conseguiu resolver?`, acao: say(n.documentoId ? `Consegui o ${n.documentoId.replace('-', ' ')}` : 'Já resolvi aquela pendência', 'Sim, resolvi'), origem: 'regra:memoria-pendencia', base: { notaId: n.id } });
    }
  }

  return out.sort((a, b) => PRIORITY[a.prioridade] - PRIORITY[b.prioridade]).slice(0, limit);
}
