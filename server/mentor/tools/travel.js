// Ferramenta de viagem do Mentor: lê o plano salvo (percursos, cotações, rota escolhida, chegada).
// Sem cotação, não há preço; sem horário informado, não há horário. Diz o que falta.
import { z } from 'zod';
import { computeTravel } from '../../travel-engine.js';
import { defineTool } from './core.js';

export function travelForMentor(user, jid) {
  const t = computeTravel(user, jid);
  return {
    status: t.status, statusLabel: t.statusLabel,
    origem: t.origem, destino: { cidade: t.destino.cidade, universidade: t.destino.universidade?.nome || null, inicioAulas: t.destino.inicioAulas },
    dataViagem: t.dataViagem, malas: t.perfil?.malas ?? null,
    percursos: t.percursos.map((p) => ({ id: p.id, nome: p.nome, resumo: p.resumo, aeroportos: p.aeroportos, terrestre: p.terrestre, atencao: p.atencao, precoConhecido: p.precoConhecido, fontes: p.fontes.map((f) => ({ titulo: f.titulo, url: f.url })) })),
    cotacoes: t.cotacoes.map((c) => ({ id: c.id, rota: c.rota, percurso: c.percursoNome, total: c.custo.total, moeda: c.moeda || 'EUR', completo: c.custo.completo, faltam: c.custo.desconhecidas, partes: c.custo.partes.filter((p) => p.valor !== null), conexoes: c.conexoes ?? null, horarioChegada: c.horarioChegada || null, consideracoes: c.consideracoes.map((x) => x.texto), escolhida: Boolean(c.escolhida), comprada: Boolean(c.comprada), cotadoEm: c.cotadoEm })),
    escolhida: t.escolhida ? { rota: t.escolhida.rota, percurso: t.escolhida.percursoNome, comprada: Boolean(t.escolhida.comprada), dataViagem: t.escolhida.dataViagem || null } : null,
    chegada: { aeroporto: t.chegada.aeroporto, frase: t.chegada.frase, opcoes: t.chegada.opcoes, moradia: t.chegada.moradia, meio: t.chegada.meio },
    visto: t.visto,
    agendaAlteracoes: null,
  };
}

export const getTravelPlan = defineTool({
  name: 'get_travel_plan', efeito: 'leitura', permissao: 'moradia',
  descricao: 'Plano de viagem salvo: origem, destino da jornada, percursos possíveis (Madri, Málaga, aeroporto do destino) com fontes oficiais, cotações do estudante (custo por item, o que falta saber, alertas de conexão e horário), rota escolhida/comprada e plano de chegada até a moradia. Não contém preços nem horários que o estudante não informou.',
  entrada: z.object({ journeyId: z.string().max(60).optional() }).strict(),
  saida: '{ status, origem, destino, dataViagem, percursos[], cotacoes[{ rota, total, completo, faltam[], consideracoes[] }], escolhida, chegada, visto }',
  run: (ctx, { journeyId }) => travelForMentor(ctx.user, journeyId || ctx.contexto.journeyId),
});

export default [getTravelPlan];
