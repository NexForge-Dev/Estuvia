// Ferramentas financeiras: resumo, cálculo da diferença, registro de recursos e bolsas.
// Cálculos 100% determinísticos (finance-engine). Prometido ≠ comprovado; solicitado ≠ concedido.
import { z } from 'zod';
import { users, newId } from '../../store.js';
import { computeFinance, ensureFinance } from '../../finance-engine.js';
import { RESOURCE_TYPES } from '../../content/finance.js';
import { SCHOLARSHIPS, SCHOLARSHIP_STATUS } from '../../content/scholarships.js';
import { defineTool, ToolError, pickJourney, eur } from './core.js';

// Rótulos do estudante para os status do motor.
export const RESOURCE_STATUS = {
  disponivel: 'Disponível (já é seu)',
  previsto: 'Prometido (ainda não comprovado)',
  solicitado: 'Solicitado (aguardando resposta)',
  confirmado: 'Comprovado / concedido',
};
const CONTA = new Set(['disponivel', 'confirmado']);

function summary(user, jr) {
  const f = computeFinance(user, jr);
  // Valor desconhecido (null no motor) não entra como zero; premissas da Estuvia são estimativas.
  const linhas = f.linhas.filter((l) => l.origem && !l.desconhecido).map((l) => ({ id: l.id, rotulo: l.label, tipo: l.tipo, valorEur: Math.round(l.valor), totalEur: Math.round(l.total), origem: l.origem, situacao: l.status === 'pago' ? 'paga' : l.status === 'confirmado' ? 'confirmada' : 'estimada' }));
  return {
    moeda: 'EUR', meses: f.meses, cambio: f.cambio,
    exigenciaVisto: { valor: Math.round(f.exigenciaVisto), regra: f.iprem.regra, ipremAno: f.iprem.ano, ipremMensal: f.iprem.mensal, ipremStatus: f.iprem.status, fonte: f.iprem.fonteRegra, tipo: 'regra parametrizada, confirmar no consulado' },
    orcamento: { valor: Math.round(f.orcamento), custosInformados: f.custosInformados, tipo: 'estimativa do estudante' },
    recursos: f.recursos.map((r) => ({ id: r.id, tipo: r.tipo, tipoLabel: RESOURCE_TYPES[r.tipo] || r.tipo, descricao: r.descricao, valorEur: Math.round(r.valorEur), status: r.status, statusLabel: RESOURCE_STATUS[r.status] || r.status, contaComoGarantido: CONTA.has(r.status), automatico: Boolean(r.automatico) })),
    garantidos: Math.round(f.confirmados), naoGarantidos: Math.round(f.previstos),
    // Sem recursos informados, a diferença é DESCONHECIDA (null), não o custo inteiro.
    deficit: f.informouRecursos ? Math.round(f.deficit) : null, deficitVisto: f.informouRecursos ? Math.round(f.deficitVisto) : null, deficitOrcamento: f.informouRecursos ? Math.round(f.deficitOrcamento) : null,
    custosIncompletos: Boolean(f.parcial), faltamInformar: (f.faltamInformar || []).map((x) => x.label || x),
    viavel: f.viavel, informouRecursos: f.informouRecursos, mesesAteViagem: f.mesesAteViagem, economiaMensalNecessaria: Math.ceil(f.economiaMensal),
    maioresGastos: linhas.sort((a, b) => b.totalEur - a.totalEur).slice(0, 5),
    caminhos: f.caminhos.map((c) => ({ id: c.id, titulo: c.titulo, texto: c.texto, rota: c.rota })),
    bolsasAcompanhadas: (user.scholarshipApps || []).map((a) => ({ id: a.id, nome: a.nome, status: a.status, prazo: a.prazo || null, concedida: a.status === 'concedida' })),
  };
}

const jid = z.string().max(60).optional();

export const getFinancialSummary = defineTool({
  name: 'get_financial_summary', efeito: 'leitura', permissao: 'financas',
  descricao: 'Planejamento financeiro do estudante: exigência estimada do visto (regra IPREM), orçamento estimado, recursos por status (garantidos x não garantidos), déficit, maiores gastos e caminhos possíveis.',
  entrada: z.object({ journeyId: jid }).strict(),
  saida: '{ exigenciaVisto, orcamento, recursos[], garantidos, naoGarantidos, deficit, maioresGastos[], caminhos[], bolsasAcompanhadas[] }',
  run: (ctx, { journeyId }) => { ensureFinance(ctx.user); return summary(ctx.user, pickJourney(ctx.user, journeyId || ctx.contexto.journeyId)); },
});

export const calculateFinancialGap = defineTool({
  name: 'calculate_financial_gap', efeito: 'leitura', permissao: 'financas',
  descricao: 'Calcula quanto falta. Aceita uma simulação (ex.: "se eu tiver €2.000 a mais disponíveis" ou "se eu guardar €100 por mês") sem gravar nada.',
  entrada: z.object({ journeyId: jid, simularDisponivel: z.number().min(0).max(10_000_000).optional(), simularMoeda: z.enum(['EUR', 'BRL']).default('EUR'), economiaMensal: z.number().min(1).max(1_000_000).optional() }).strict(),
  saida: '{ necessario, garantidos, deficit, simulacao?{ valorEur, deficitDepois }, economia?{ porMes, mesesParaCobrir, mesesAteViagem, cobreAtempo } }',
  run: (ctx, { journeyId, simularDisponivel, simularMoeda, economiaMensal }) => {
    ensureFinance(ctx.user);
    const jr = pickJourney(ctx.user, journeyId || ctx.contexto.journeyId);
    const s = summary(ctx.user, jr);
    const necessario = Math.max(s.exigenciaVisto.valor, s.orcamento.valor);
    const out = { necessario, base: s.orcamento.valor > s.exigenciaVisto.valor ? 'orçamento estimado' : 'exigência estimada do visto', garantidos: s.garantidos, naoGarantidos: s.naoGarantidos, deficit: s.deficit, custosIncompletos: s.custosIncompletos, informouRecursos: s.informouRecursos, custosInformados: s.orcamento.custosInformados, exigenciaVisto: s.exigenciaVisto, orcamento: s.orcamento };
    if (simularDisponivel !== undefined) {
      const cambio = ctx.user.finance?.cambio || null;
      const v = simularMoeda === 'BRL' ? (cambio ? simularDisponivel / cambio : null) : simularDisponivel;
      if (v === null) throw new ToolError('sem-cambio', 'Para simular em reais preciso da cotação do euro. Cadastre o câmbio no planejamento financeiro.');
      out.simulacao = { valorEur: Math.round(v), deficitDepois: Math.max(0, Math.round(necessario - s.garantidos - v)), aviso: 'Simulação: nada foi gravado.' };
    }
    if (economiaMensal) {
      const meses = s.deficit ? Math.ceil(s.deficit / economiaMensal) : 0;
      out.economia = { porMes: economiaMensal, mesesParaCobrir: meses, mesesAteViagem: s.mesesAteViagem, cobreAtempo: meses <= s.mesesAteViagem };
    }
    return out;
  },
});

const resourceInput = z.object({
  operacao: z.enum(['adicionar', 'atualizar']),
  recursoId: z.string().max(60).optional(),
  tipo: z.enum(Object.keys(RESOURCE_TYPES)).optional(),
  descricao: z.string().trim().min(1).max(100).optional(),
  valor: z.number().min(0).max(10_000_000).optional(),
  moeda: z.enum(['EUR', 'BRL']).optional(),
  status: z.enum(Object.keys(RESOURCE_STATUS)).optional(),
  apoiador: z.string().trim().max(80).optional().describe('Só o vínculo (ex.: "padrasto"), sem dados pessoais.'),
}).strict().refine((i) => i.operacao === 'atualizar' ? Boolean(i.recursoId) : Boolean(i.tipo && i.descricao && i.valor !== undefined && i.moeda && i.status), 'Dados do recurso incompletos.');

export const updateFinancialResource = defineTool({
  name: 'update_financial_resource', efeito: 'escrita', permissao: 'financas',
  descricao: 'Adiciona ou atualiza um recurso financeiro (poupança, renda, apoio familiar, bolsa, financiamento). Status: disponivel, previsto (prometido), solicitado, confirmado (comprovado/concedido). Só disponivel e confirmado contam como garantidos.',
  entrada: resourceInput,
  saida: '{ resumo, deficitAntes, deficitDepois }',
  preview: (ctx, input) => {
    const fin = ensureFinance(ctx.user);
    if (input.operacao === 'adicionar' && fin.recursos.length >= 30) throw new ToolError('limite', 'Limite de recursos atingido.', 409);
    const atual = input.operacao === 'atualizar' ? fin.recursos.find((r) => r.id === input.recursoId) : null;
    if (input.operacao === 'atualizar' && !atual) throw new ToolError('nao-encontrado', 'Recurso não encontrado.', 404);
    const r = { ...atual, ...input };
    const valor = `${r.moeda === 'BRL' ? 'R$' : '€'} ${Number(r.valor).toLocaleString('pt-BR')}`;
    const avisos = CONTA.has(r.status) ? [] : [`Como está "${RESOURCE_STATUS[r.status].toLowerCase()}", esse valor NÃO entra como dinheiro garantido no cálculo.`];
    if (r.tipo === 'familiar') avisos.push('O consulado decide se aceita apoio de terceiros e quais documentos pede.');
    return { resumo: `${input.operacao === 'adicionar' ? 'Registrar' : 'Atualizar'} recurso: ${r.descricao} - ${valor} (${RESOURCE_STATUS[r.status]}).`, detalhes: [], avisos };
  },
  execute: async (ctx, input) => {
    const jr = pickJourney(ctx.user, ctx.contexto.journeyId);
    const antes = computeFinance(ctx.user, jr).deficit;
    const { operacao, recursoId, ...fields } = input;
    ctx.user = await users.update(ctx.user.id, (u) => {
      ensureFinance(u);
      if (operacao === 'adicionar') u.finance.recursos.push({ id: newId(), ...fields });
      else Object.assign(u.finance.recursos.find((r) => r.id === recursoId), fields);
      u.finance.informouRecursos = true;
    });
    const depois = computeFinance(ctx.user, pickJourney(ctx.user, ctx.contexto.journeyId)).deficit;
    return { resumo: `Registrado. Antes faltavam ${eur(antes)}; agora faltam ${eur(depois)} (estimativa).`, dados: { deficitAntes: Math.round(antes), deficitDepois: Math.round(depois) } };
  },
});

export const searchScholarships = defineTool({
  name: 'search_scholarships', efeito: 'leitura', permissao: 'financas',
  descricao: 'Bolsas do catálogo verificado da Estuvia, com situação do edital (aberto, futuro, encerrado, sem edital confirmado). Nunca afirma que uma bolsa cobre o mestrado do estudante.',
  entrada: z.object({ busca: z.string().max(80).optional(), somenteAbertas: z.boolean().optional() }).strict(),
  saida: '{ bolsas[{ id, nome, entidade, status, statusLabel, elegibilidade, cobertura, prazo, url, salva }], abertasConfirmadas }',
  run: (ctx, { busca, somenteAbertas }) => {
    const saved = new Set((ctx.user.scholarshipApps || []).map((a) => a.catalogId));
    const q = (busca || '').toLowerCase();
    // "brasileiros", "iberoamericano" etc. ajudam o filtro; o edital é que decide a elegibilidade.
    const nacional = /brasil|brasileir|iberoamer|latino/.test(q);
    let list = SCHOLARSHIPS.filter((s) => {
      if (!q) return true;
      const txt = `${s.nome} ${s.entidade} ${s.elegibilidade} ${s.abrangencia} ${(s.tags || []).join(' ')}`.toLowerCase();
      if (nacional) return (s.tags || []).includes('iberoamericano') || /brasil|iberoamer|latino/.test(txt);
      return q.split(/\s+/).some((w) => w.length > 3 && txt.includes(w));
    });
    if (!list.length) list = SCHOLARSHIPS;
    if (somenteAbertas) list = list.filter((s) => s.status === 'aberta');
    return {
      bolsas: list.map((s) => ({ id: s.id, nome: s.nome, entidade: s.entidade, status: s.status, statusLabel: SCHOLARSHIP_STATUS[s.status], elegibilidade: s.elegibilidade, cobertura: s.cobertura, prazo: s.prazo, url: s.url, salva: saved.has(s.id) })),
      abertasConfirmadas: SCHOLARSHIPS.filter((s) => s.status === 'aberta').length,
      aviso: 'Nenhuma bolsa cobre automaticamente o seu mestrado: confira o edital vigente.',
    };
  },
});

const DEFAULT_TASKS = ['Ler o edital oficial', 'Verificar elegibilidade', 'Reunir documentos do edital', 'Enviar a candidatura', 'Acompanhar o resultado'];

export const saveScholarship = defineTool({
  name: 'save_scholarship', efeito: 'escrita', permissao: 'financas',
  descricao: 'Salva uma bolsa do catálogo para acompanhar e cria as tarefas de candidatura (aparecem na Agenda). Status inicial: interesse, não é candidatura nem concessão.',
  entrada: z.object({ catalogId: z.enum(SCHOLARSHIPS.map((s) => s.id)) }).strict(),
  saida: '{ resumo, tarefas }',
  preview: (ctx, { catalogId }) => {
    const s = SCHOLARSHIPS.find((x) => x.id === catalogId);
    if ((ctx.user.scholarshipApps || []).some((a) => a.catalogId === catalogId)) throw new ToolError('duplicado', 'Esta bolsa já está salva.', 409);
    return { resumo: `Acompanhar a bolsa "${s.nome}" (${s.entidade}) e criar ${DEFAULT_TASKS.length} tarefas de candidatura.`, detalhes: DEFAULT_TASKS, avisos: [`Situação do edital: ${SCHOLARSHIP_STATUS[s.status]}.`] };
  },
  execute: async (ctx, { catalogId }) => {
    const s = SCHOLARSHIPS.find((x) => x.id === catalogId);
    ctx.user = await users.update(ctx.user.id, (u) => {
      ensureFinance(u);
      u.scholarshipApps.push({ id: newId(), status: 'interesse', moeda: 'EUR', catalogId, nome: s.nome, entidade: s.entidade, url: s.url, cobertura: s.cobertura, tarefas: DEFAULT_TASKS.map((texto) => ({ id: newId(), texto, feito: false })), salvaEm: new Date().toISOString() });
    });
    return { resumo: `Pronto: "${s.nome}" está salva e as tarefas aparecem na Agenda.`, dados: { tarefas: DEFAULT_TASKS.length } };
  },
});

export default [getFinancialSummary, calculateFinancialGap, updateFinancialResource, searchScholarships, saveScholarship];
