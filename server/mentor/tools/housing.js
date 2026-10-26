// Ferramentas de moradia ("Meu novo lar"). A Estuvia não busca anúncios na internet:
// organiza e compara o que o estudante encontrou e aponta sinais de risco — nunca afirma que é seguro.
import { z } from 'zod';
import { users, newId } from '../../store.js';
import { ensureFinance } from '../../finance-engine.js';
import { ANTIFRAUDE } from '../../routes/living.js';
import { defineTool, ToolError, pickJourney } from './core.js';
import { normalize } from '../knowledge.js';

const total = (h) => (Number(h.aluguel) || 0) + (Number(h.adicionais) || 0);
const sym = (h) => (h.moeda === 'BRL' ? 'R$' : '€');

function option(h, meses) {
  const checklist = ANTIFRAUDE.map((a) => ({ id: a.id, texto: a.texto, feito: Boolean(h.checklist?.[a.id]) }));
  return {
    id: h.id, nome: h.nome, tipo: h.tipo, bairro: h.bairro || null, moeda: h.moeda || 'EUR', status: h.status,
    aluguel: Number(h.aluguel) || 0, adicionais: Number(h.adicionais) || 0, mensal: total(h), caucao: Number(h.caucao) || 0,
    entrada: (Number(h.caucao) || 0) + total(h), totalPeriodo: total(h) * meses + (Number(h.caucao) || 0),
    inclusas: h.inclusas || null, distancia: h.distancia || null, link: h.link || null,
    checklistFeito: checklist.filter((c) => c.feito).length, checklistTotal: checklist.length, checklistPendente: checklist.filter((c) => !c.feito).map((c) => c.texto),
  };
}

const monthsOf = (ctx) => Number(pickJourney(ctx.user, ctx.contexto.journeyId)?.duracaoMeses) || 12;

export const getHousingOptions = defineTool({
  name: 'get_housing_options', efeito: 'leitura', permissao: 'moradia',
  descricao: 'Opções de moradia que o estudante salvou no "Meu novo lar", com custo mensal, caução, valor de entrada e checklist antifraude. A Estuvia não busca anúncios externos.',
  entrada: z.object({ incluirDescartadas: z.boolean().optional() }).strict(),
  saida: '{ opcoes[{ id, nome, mensal, caucao, entrada, totalPeriodo, status, checklistFeito, checklistTotal }], meses }',
  run: (ctx, { incluirDescartadas }) => {
    ensureFinance(ctx.user);
    const meses = monthsOf(ctx);
    const opcoes = ctx.user.housing.filter((h) => incluirDescartadas || h.status !== 'descartada').map((h) => option(h, meses)).sort((a, b) => a.mensal - b.mensal);
    return { opcoes, meses, aviso: 'Valores informados por você ou pelo anunciante; confira no contrato.' };
  },
});

export const compareHousingOptions = defineTool({
  name: 'compare_housing_options', efeito: 'leitura', permissao: 'moradia',
  descricao: 'Compara opções salvas pelo custo total (aluguel + despesas), valor de entrada (caução + 1º mês), total no período do curso e verificações antifraude pendentes.',
  entrada: z.object({ ids: z.array(z.string().max(60)).min(2).max(6).optional() }).strict(),
  saida: '{ comparacao[], maisBarata, menorEntrada, observacoes[] }',
  run: (ctx, { ids }) => {
    ensureFinance(ctx.user);
    const meses = monthsOf(ctx);
    let list = ctx.user.housing.filter((h) => h.status !== 'descartada');
    if (ids) list = list.filter((h) => ids.includes(h.id));
    if (list.length < 2) throw new ToolError('poucas-opcoes', 'Preciso de pelo menos duas opções salvas no "Meu novo lar" para comparar.', 409);
    const comp = list.map((h) => option(h, meses));
    const moedas = new Set(comp.map((c) => c.moeda));
    const obs = [];
    if (moedas.size > 1) obs.push('As opções estão em moedas diferentes: compare depois de converter.');
    for (const c of comp) if (c.checklistFeito < c.checklistTotal) obs.push(`${c.nome}: faltam ${c.checklistTotal - c.checklistFeito} verificação(ões) antifraude.`);
    for (const c of comp) if (!c.inclusas) obs.push(`${c.nome}: não sei o que está incluso (contas, internet). Pergunte ao anunciante.`);
    return { comparacao: comp, meses, maisBarata: [...comp].sort((a, b) => a.mensal - b.mensal)[0].id, menorEntrada: [...comp].sort((a, b) => a.entrada - b.entrada)[0].id, observacoes: obs };
  },
});

// Sinais de risco identificáveis num anúncio ou conversa colada pelo estudante.
const RED_FLAGS = [
  [/western union|moneygram|transferwise|wise\b|pix|bitcoin|cripto|gift ?card/, 'Pedido de pagamento por meio difícil de rastrear ou estornar.'],
  [/(adiant|antecip|reserv|sinal|pag\w*|deposit\w*|transfer\w*).{0,40}\b(antes|sem)\b.{0,30}(ver|visit|contrato|chave|assin)|pague (agora|hoje)|deposit\w* (ja|agora|hoje)/, 'Pedido de dinheiro antes de ver o imóvel ou o contrato.'],
  [/\b(estou|moro|vivo|trabalho|morando|viajando)\b.{0,25}\b(fora do pais|no exterior|em outro pais|inglaterra|londres|eua|estados unidos|alemanha|franca|portugal|italia|suica)\b|nao (estou|estarei) na (cidade|espanha)/, 'O anunciante diz estar fora do país e não pode mostrar o imóvel.'],
  [/(chave|chaves).{0,30}(correio|envio|mand|airbnb)/, 'Promessa de enviar as chaves pelo correio ou por terceiros.'],
  [/(sem|nao precisa de?) (contrato|visita)|nao (faco|tem) contrato/, 'Sem contrato ou sem possibilidade de visita/vídeo-chamada.'],
  [/(urgente|muita gente interessada|ultima vaga|so hoje|decid\w* rapido)/, 'Pressão para decidir rápido.'],
  [/(so|apenas) (por )?(whatsapp|telegram|e-?mail)|nao atendo (ligac|video)/, 'Contato apenas por mensagem, recusando chamada de vídeo.'],
  [/(envi\w*|mand\w*|ped\w*|precis\w*).{0,30}(copia|foto|scan).{0,20}(passaporte|rg|documento)/,'Pedido de documentos pessoais antes de qualquer contrato (cuidado com uso indevido).'],
];

export const assessListingRisk = defineTool({
  name: 'assess_listing_risk', efeito: 'leitura', permissao: 'moradia',
  descricao: 'Aponta sinais de risco identificáveis num anúncio (texto colado) ou numa opção salva, e o checklist antifraude pendente. Nunca afirma que o anúncio é seguro.',
  entrada: z.object({ texto: z.string().max(3000).optional(), opcaoId: z.string().max(60).optional(), precoMedioReferencia: z.number().min(0).optional() }).strict(),
  saida: '{ sinais[], checklistPendente[], conclusao }',
  run: (ctx, { texto, opcaoId }) => {
    ensureFinance(ctx.user);
    const h = opcaoId ? ctx.user.housing.find((x) => x.id === opcaoId) : null;
    if (opcaoId && !h) throw new ToolError('nao-encontrada', 'Opção de moradia não encontrada.', 404);
    const t = normalize(`${texto || ''} ${h?.notas || ''}`);
    const sinais = RED_FLAGS.filter(([re]) => re.test(t)).map(([, s]) => s);
    if (h && !h.link) sinais.push('A opção não tem link do anúncio salvo: guarde a origem para conferir depois.');
    const others = ctx.user.housing.filter((x) => x.id !== h?.id && x.status !== 'descartada' && (x.moeda || 'EUR') === (h?.moeda || 'EUR'));
    if (h && others.length >= 2) {
      const avg = others.reduce((s, x) => s + total(x), 0) / others.length;
      if (total(h) < avg * 0.6) sinais.push(`Preço bem abaixo das outras opções que você salvou (${sym(h)} ${total(h)} contra média de ${sym(h)} ${Math.round(avg)}). Preço "bom demais" é um sinal clássico de golpe.`);
    }
    const pend = ANTIFRAUDE.filter((a) => !h?.checklist?.[a.id]).map((a) => a.texto);
    return {
      sinais, checklistPendente: pend,
      conclusao: sinais.length ? 'Encontrei sinais de alerta. Não envie dinheiro antes de esclarecer cada um.' : 'Não encontrei sinais de alerta no que analisei — isso NÃO garante que o anúncio é seguro. Complete o checklist antifraude.',
    };
  },
});

const housingInput = z.object({
  nome: z.string().trim().min(1).max(100), tipo: z.enum(['quarto', 'apartamento', 'residencia', 'temporario']),
  aluguel: z.number().min(0).max(1_000_000), caucao: z.number().min(0).max(1_000_000).optional(), adicionais: z.number().min(0).max(1_000_000).optional(),
  moeda: z.enum(['EUR', 'BRL']).optional(), bairro: z.string().trim().max(100).optional(), link: z.url().max(400).refine((u) => u.startsWith('https://'), 'Use um link https.').optional(),
  notas: z.string().trim().max(500).optional(),
}).strict();

export const saveHousingOption = defineTool({
  name: 'save_housing_option', efeito: 'escrita', permissao: 'moradia',
  descricao: 'Salva uma opção de moradia que o estudante encontrou no "Meu novo lar" (status: pesquisando).',
  entrada: housingInput,
  saida: '{ resumo, id }',
  preview: (ctx, input) => {
    ensureFinance(ctx.user);
    if (ctx.user.housing.length >= 40) throw new ToolError('limite', 'Limite de opções atingido.', 409);
    const s = input.moeda === 'BRL' ? 'R$' : '€';
    return { resumo: `Salvar "${input.nome}" (${input.tipo}) — ${s} ${input.aluguel}/mês${input.caucao ? `, caução ${s} ${input.caucao}` : ''}.`, detalhes: [], avisos: ['Salvar não significa que o anúncio foi verificado.'] };
  },
  execute: async (ctx, input) => {
    const item = { id: newId(), status: 'pesquisando', moeda: 'EUR', checklist: {}, ...input, criadoEm: new Date().toISOString() };
    ctx.user = await users.update(ctx.user.id, (u) => { ensureFinance(u); u.housing.push(item); });
    return { resumo: `Pronto: "${item.nome}" está salva no Meu novo lar.`, dados: { id: item.id } };
  },
});

export default [getHousingOptions, compareHousingOptions, assessListingRisk, saveHousingOption];
