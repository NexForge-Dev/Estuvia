// Ferramentas do Radar de Oportunidades: busca de mestrados, prazos verificados e acompanhamento.
// Só dados oficiais verificados; sem calendário confirmado, a resposta diz isso explicitamente.
import { z } from 'zod';
import { computeJourney } from '../../journey-engine.js';
import { findPrograms, journeyOpportunity, opportunityCard, subscribe, officialDeadlines, radarContext, myRadar } from '../../radar/service.js';
import { EVENT_TYPES } from '../../radar/notify.js';
import { defineTool, ToolError, pickJourney } from './core.js';

const cardOut = (c) => ({
  id: c.id, programa: c.programa.nome, universidade: c.universidade.sigla, cidade: c.universidade.cidade, anoAcademico: c.anoAcademico,
  estado: c.estado, estadoLabel: c.estadoLabel, abertura: c.abertura, prazoFinal: c.prazoFinal, diasParaPrazo: c.diasParaPrazo,
  verificacao: c.verificacao?.texto || null, fichaUrl: c.programa.fichaUrl, candidaturaUrl: c.candidatura?.url || null,
  compatibilidade: c.compatibilidade, acompanhando: c.acompanhando, naJornada: c.naJornada, demo: c.demo,
  referenciaHistorica: c.referenciaHistorica ? { anoAcademico: c.referenciaHistorica.anoAcademico, aviso: c.referenciaHistorica.aviso } : null,
});

export const searchMasterPrograms = defineTool({
  name: 'search_master_programs', efeito: 'leitura', permissao: 'radar',
  descricao: 'Busca mestrados oficiais monitorados pelo Radar (nome ou área, em português ou espanhol), com situação das inscrições verificada na fonte oficial e compatibilidade com o perfil.',
  entrada: z.object({ busca: z.string().max(120).default(''), anoAcademico: z.string().max(12).optional(), compativel: z.boolean().optional(), somenteAbertas: z.boolean().optional(), limite: z.number().int().min(1).max(12).default(6) }).strict(),
  saida: '{ anoAcademico, total, programas[{ id, programa, universidade, estado, estadoLabel, abertura, prazoFinal, verificacao, fichaUrl, compatibilidade }] }',
  run: (ctx, { busca, anoAcademico, compativel, somenteAbertas, limite }) => {
    const r = findPrograms(busca, { user: ctx.user, ano: anoAcademico, limit: somenteAbertas ? 200 : limite, compativel });
    let items = r.items;
    if (somenteAbertas) items = items.filter((c) => c.estado === 'abertas').slice(0, limite);
    return { anoAcademico: r.anoAcademico, total: somenteAbertas ? items.length : r.total, programas: items.map(cardOut), aviso: 'Vagas ofertadas não significam vagas disponíveis; requisitos de idioma devem ser confirmados na ficha.' };
  },
});

export const getVerifiedDeadlines = defineTool({
  name: 'get_verified_deadlines', efeito: 'leitura', permissao: 'radar',
  descricao: 'Prazos verificados: calendário oficial do mestrado da jornada (Radar), prazos oficiais nas missões e prazos declarados pelo estudante, sempre com a origem. Com "pergunta", devolve também a resposta pronta do Radar sobre um programa/ano.',
  entrada: z.object({ journeyId: z.string().max(60).optional(), oportunidadeId: z.string().max(160).optional(), pergunta: z.string().max(300).optional() }).strict(),
  saida: '{ oportunidade?, oficiais[{ titulo, data, fonteUrl }], daJornada[{ titulo, data, origem }], radar?{ resposta, fontes } }',
  run: (ctx, { journeyId, oportunidadeId, pergunta }) => {
    const jr = pickJourney(ctx.user, journeyId || ctx.contexto.journeyId);
    const opp = oportunidadeId ? opportunityCard(oportunidadeId, { user: ctx.user }) : jr ? journeyOpportunity(ctx.user, jr) : null;
    const out = {
      oportunidade: opp ? cardOut(opp) : null,
      oficiais: officialDeadlines(ctx.user).filter((p) => !jr || p.journeyId === jr.id).map((p) => ({ titulo: p.titulo, data: p.data, fonteUrl: p.fonteUrl, missaoId: p.missaoId })),
      daJornada: jr ? computeJourney(ctx.user, jr).prazos.map((p) => ({ titulo: p.titulo, data: p.data, diasRestantes: p.diasRestantes, origem: p.origem, missao: p.label || null })) : [],
      alertasNaoLidos: myRadar(ctx.user).naoLidas,
    };
    if (pergunta) {
      const r = radarContext(pergunta, { user: ctx.user });
      if (r.relevante) out.radar = { resposta: r.resposta, fontes: r.fontes };
    }
    return out;
  },
});

export const subscribeToOpportunity = defineTool({
  name: 'subscribe_to_opportunity', efeito: 'escrita', permissao: 'radar',
  descricao: 'Ativa "Avise-me quando abrir" para uma oportunidade do Radar: alertas na plataforma quando o calendário oficial for publicado, as inscrições abrirem, o prazo estiver acabando ou saírem resultados. (Só notificações dentro da Estuvia.)',
  entrada: z.object({ oportunidadeId: z.string().max(160), eventos: z.array(z.enum(Object.keys(EVENT_TYPES))).max(7).optional() }).strict(),
  saida: '{ resumo, eventos[] }',
  preview: (ctx, { oportunidadeId, eventos }) => {
    const c = opportunityCard(oportunidadeId, { user: ctx.user });
    if (!c) throw new ToolError('nao-encontrada', 'Oportunidade não encontrada no Radar.', 404);
    if (c.acompanhando) throw new ToolError('duplicado', `Você já acompanha "${c.programa.nome}" (${c.anoAcademico}).`, 409);
    const list = eventos?.length ? eventos : Object.keys(EVENT_TYPES);
    return { resumo: `Acompanhar "${c.programa.nome}" (${c.universidade.sigla}, ${c.anoAcademico}) no Radar.`, detalhes: list.map((e) => EVENT_TYPES[e]), avisos: ['Os avisos aparecem aqui na Estuvia (ainda não enviamos e-mail).'] };
  },
  execute: async (ctx, { oportunidadeId, eventos }) => {
    const c = opportunityCard(oportunidadeId, { user: ctx.user });
    const sub = await subscribe(ctx.user, oportunidadeId, { eventos });
    return { resumo: `Pronto: vou te avisar aqui na Estuvia sobre "${c.programa.nome}" (${c.anoAcademico}).`, dados: { eventos: sub.eventos } };
  },
});

export { cardOut };
export default [searchMasterPrograms, getVerifiedDeadlines, subscribeToOpportunity];
