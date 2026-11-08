// Planejador financeiro (FinancialPlan) — cálculos determinísticos e testáveis, sem LLM.
// Três contas que NUNCA se misturam:
//   A. Preparar a viagem: custos de instalação + o primeiro mês no destino (dinheiro antes/no início).
//   B. Manter-se no exterior: custo mensal × meses de estadia.
//   C. Comprovação do visto: exigência de DEMONSTRAR recursos (regra oficial parametrizada por ano).
//      Não é despesa e não é somada ao custo da jornada.
// Despesas têm origem (premissa com fonte, estudante, moradia, viagem) e estado (estimado, confirmado, pago).
// Valor desconhecido é null — nunca zero.

import { ipremFor, VISA_RULE, COST_FIELDS } from './content/finance.js';
import { programById, universityById } from './content/catalog.js';
import { EXPENSE_ITEMS, itemById, SPEND_PROFILES, PROFILE_IDS, DESTINATION_ASSUMPTIONS, PLANNING_RULES, RESOURCE_GROUPS, CATEGORY_LABEL } from './content/costs.js';
import { sourceById } from './content/sources.js';
import { cachedRate, rateIsStale } from './fx.js';

export function ensureFinance(user) {
  user.finance ??= {};
  const f = user.finance;
  f.custos ??= {};
  f.itens ??= {};
  f.recursos ??= [];
  f.cenarios ??= [];
  f.realizado ??= [];
  // Migração dos custos da versão anterior (planilha): viram itens informados pelo estudante.
  for (const [id, c] of Object.entries(f.custos)) {
    if (itemById(id) && !f.itens[id] && c && Number.isFinite(Number(c.valor))) f.itens[id] = { valor: Number(c.valor), moeda: c.moeda || 'EUR', status: 'estimado' };
  }
  user.scholarshipApps ??= [];
  user.housing ??= [];
  user.travel ??= { opcoes: [], chegada: {} };
  user.travel.opcoes ??= [];
  user.travel.chegada ??= {};
  return f;
}

export function startYear(jr) {
  const m = /^(\d{4})/.exec(jr?.anoAcademico || '');
  return m ? Number(m[1]) : new Date().getFullYear();
}

export function chosenHousing(user) {
  return (user.housing || []).find((x) => x.status === 'escolhida') || null;
}

export function chosenRoute(user) {
  return (user.travel?.opcoes || []).find((o) => o.escolhida) || null;
}

// Custo único da viagem: voo + bagagem + trecho terrestre + transporte local + pernoite + outros (só o que existir).
export const ROUTE_PARTS = [['voo', 'voo'], ['bagagem', 'bagagem'], ['terrestre', 'terrestre'], ['transporteLocal', 'transporte local'], ['pernoite', 'pernoite'], ['outros', 'outros']];
export const routeTotal = (o) => ROUTE_PARTS.reduce((s, [k]) => s + (Number(o[k]) || 0), 0);

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const src = (id) => { const s = sourceById(id); return s ? { id: s.id, titulo: s.titulo, orgao: s.orgao, url: s.url, revisadoEm: s.revisadoEm } : null; };

// Câmbio efetivo: taxa informada pelo estudante > taxa de referência em cache > nenhuma.
// Taxa de referência antiga (o serviço falhou desde então) continua valendo, mas vem marcada como desatualizada.
export function exchange(fin, now = new Date()) {
  const manual = num(fin.cambio);
  const spreadPct = num(fin.spreadPct) || 0;
  if (manual) return { taxa: manual, origem: 'manual', fonte: 'Informada por você', data: fin.cambioEm || null, spreadPct };
  const ref = cachedRate();
  if (ref) return { taxa: ref.taxa, origem: 'referencia', fonte: ref.fonte, data: ref.data, obtidoEm: ref.obtidoEm, url: ref.url, spreadPct, desatualizada: rateIsStale(ref, now) };
  return { taxa: null, origem: null, fonte: null, data: null, spreadPct };
}

// Converte para euro (moeda-base). Sem taxa, um valor em reais é desconhecido em euros.
const toEurWith = (fx) => (valor, moeda = 'EUR', { conversao = false } = {}) => {
  const v = num(valor);
  if (v === null) return null;
  if (moeda !== 'BRL') return v;
  if (!fx.taxa) return null;
  const eur = v / fx.taxa;
  return conversao ? eur * (1 - (fx.spreadPct || 0) / 100) : eur;
};

function destinationOf(jr) {
  const program = jr ? programById(jr.programaId) : null;
  const uni = program ? universityById(program.universidadeId) : jr ? universityById(jr.universidadeId) : null;
  return { program, uni, cidade: uni?.cidade || null, pais: uni?.pais || 'Espanha' };
}

// ---------- Custos (ExpenseItem) para um perfil de gasto ----------
function buildItems(user, jr, perfilId, overrides, fx) {
  const fin = user.finance;
  const toEur = toEurWith(fx);
  const { cidade } = destinationOf(jr);
  const perfil = SPEND_PROFILES[perfilId] || SPEND_PROFILES.equilibrado;
  const country = DESTINATION_ASSUMPTIONS.ES;
  const city = (cidade && DESTINATION_ASSUMPTIONS[cidade]) || {};
  const housing = chosenHousing(user);
  const route = chosenRoute(user);

  // Valores de premissa (com fonte), por item.
  const premise = {};
  if (city.moradia) premise.moradia = { valor: city.moradia.faixa[perfil.faixaMoradia], fonte: src(city.moradia.fonte), fonteExtra: src(city.moradia.fonteExtra), nota: city.moradia.nota };
  if (country.alimentacao) {
    premise.alimentacao = {
      valor: Math.round(country.alimentacao.base * perfil.multAlimentacao), fonte: src(country.alimentacao.fonte),
      nota: `${country.alimentacao.nota}${perfil.multAlimentacao !== 1 ? ` Perfil ${perfil.label.toLowerCase()}: ${perfil.multAlimentacao > 1 ? '+' : '−'}${Math.round(Math.abs(perfil.multAlimentacao - 1) * 100)}%.` : ''}`,
    };
  }

  const items = EXPENSE_ITEMS.map((def) => {
    const ov = overrides[def.id];
    let valorEur = null; let valorOriginal = null; let moeda = 'EUR'; let origemTipo = null; let status = null;
    let fonte = null; let fonteExtra = null; let nota = null; let editavel = true;

    // 1) Dados de outros módulos (fonte única da verdade, sem duplicar).
    // Moradia escolhida: aluguel, contas e caução vêm dela. O que ela não informa continua desconhecido (contas) ou premissa (caução).
    const fromHousing = housing && def.derivavel === 'moradia' && !(def.id === 'contas' && !housing.contasIncluidas && num(housing.adicionais) === null) && !(def.id === 'caucao' && num(housing.caucao) === null);
    if (fromHousing) {
      moeda = housing.moeda || 'EUR';
      const v = def.id === 'moradia' ? (num(housing.aluguel) ?? 0) + (housing.contasIncluidas ? 0 : num(housing.adicionais) ?? 0) : def.id === 'caucao' ? num(housing.caucao) : null;
      if (def.id === 'contas') { nota = housing.contasIncluidas ? 'Incluídas no aluguel da moradia escolhida.' : 'Incluídas no valor da moradia escolhida (aluguel + despesas adicionais).'; valorOriginal = 0; valorEur = 0; }
      else { valorOriginal = v; valorEur = toEur(v, moeda); }
      origemTipo = 'moradia'; status = 'confirmado'; editavel = false;
      if (def.id === 'moradia') nota = `"${housing.nome}": aluguel${num(housing.adicionais) ? ' + despesas adicionais' : ''}.`;
    } else if (def.derivavel === 'viagem' && route && num(route.voo) !== null) {
      // Cotação sem preço do voo não vira "passagens = 0": vale o valor do estudante ou fica desconhecido.
      moeda = route.moeda || 'EUR';
      valorOriginal = routeTotal(route); valorEur = toEur(valorOriginal, moeda);
      // Comprada = confirmado; só cotada = estimado.
      origemTipo = 'viagem'; status = route.comprada ? 'confirmado' : 'estimado'; editavel = false;
      const parts = ROUTE_PARTS.filter(([k]) => Number(route[k]) > 0).map(([k, l]) => `${l} ${Math.round(Number(route[k]))}`);
      nota = `Rota ${route.comprada ? 'comprada' : 'escolhida (cotação)'}: ${route.rota}${parts.length ? ` - ${parts.join(' + ')}` : ''}.`;
    } else if (ov && num(ov.valor) !== null) {
      // 2) Valor do estudante.
      moeda = ov.moeda || 'EUR'; valorOriginal = num(ov.valor); valorEur = toEur(valorOriginal, moeda);
      origemTipo = 'usuario'; status = ov.status || 'estimado';
    } else if (premise[def.id]) {
      // 3) Premissa com fonte.
      valorOriginal = premise[def.id].valor; valorEur = valorOriginal; origemTipo = 'premissa'; status = 'estimado';
      fonte = premise[def.id].fonte; fonteExtra = premise[def.id].fonteExtra || null; nota = premise[def.id].nota;
    }
    const pago = origemTipo === 'usuario' && status === 'pago';
    return {
      id: def.id, label: def.label, grupo: def.grupo, categoria: def.categoria, categoriaLabel: CATEGORY_LABEL[def.categoria], icone: def.icone,
      reembolsavel: Boolean(def.reembolsavel), dica: def.dica || null,
      valorEur, valorOriginal, moeda, status, origemTipo, fonte, fonteExtra, nota, editavel, pago,
      vencimento: ov?.vencimento || null,
      precisaCambio: valorEur === null && valorOriginal !== null && moeda === 'BRL',
    };
  });

  // Premissas que dependem de outros itens (regras de planejamento, sem preço inventado).
  const get = (id) => items.find((i) => i.id === id);
  const mensalConhecido = items.filter((i) => i.grupo === 'mensal' && i.valorEur !== null).reduce((s, i) => s + i.valorEur, 0);
  const caucao = get('caucao');
  if (caucao.origemTipo === null && get('moradia').valorEur !== null) {
    Object.assign(caucao, { valorEur: get('moradia').valorEur * PLANNING_RULES.caucaoMeses.valor, origemTipo: 'premissa', status: 'estimado', nota: PLANNING_RULES.caucaoMeses.nota });
  }
  const reserva = get('reserva');
  if (reserva.origemTipo === null && mensalConhecido > 0) {
    Object.assign(reserva, { valorEur: Math.round(mensalConhecido * PLANNING_RULES.reservaMeses.valor), origemTipo: 'premissa', status: 'estimado', nota: PLANNING_RULES.reservaMeses.nota });
  }
  // Taxa de agência da moradia escolhida: gasto único, não reembolsável ("Para entrar" no Meu novo lar).
  const taxaAgencia = housing ? num(housing.taxaAgencia) : null;
  if (taxaAgencia !== null && taxaAgencia > 0) {
    const moeda = housing.moeda || 'EUR';
    const valorEur = toEur(taxaAgencia, moeda);
    items.splice(items.indexOf(caucao) + 1, 0, {
      id: 'taxaAgencia', label: 'Taxa de agência da moradia', grupo: 'instalacao', categoria: 'moradia', categoriaLabel: CATEGORY_LABEL.moradia, icone: 'home2',
      reembolsavel: false, dica: null, valorEur, valorOriginal: taxaAgencia, moeda, status: 'confirmado', origemTipo: 'moradia', fonte: null, fonteExtra: null,
      nota: `"${housing.nome}": taxa de agência (não costuma ser devolvida).`, editavel: false, pago: false, vencimento: null,
      precisaCambio: valorEur === null && moeda === 'BRL',
    });
  }
  return items;
}

function summarize(items, meses) {
  const known = (arr) => arr.filter((i) => i.valorEur !== null);
  const sum = (arr) => known(arr).reduce((s, i) => s + i.valorEur, 0);
  const inst = items.filter((i) => i.grupo === 'instalacao');
  const men = items.filter((i) => i.grupo === 'mensal');
  const instalacao = sum(inst);
  const mensal = sum(men);
  const mensalTotal = mensal * meses;
  const reembolsavel = sum(inst.filter((i) => i.reembolsavel));
  const jaPago = sum(items.filter((i) => i.pago).map((i) => ({ ...i, valorEur: i.grupo === 'mensal' ? i.valorEur * meses : i.valorEur })));
  const orcamento = instalacao + mensalTotal;
  return {
    instalacao, mensal, mensalTotal, reembolsavel,
    preparar: instalacao + mensal, // A: antes de partir + o primeiro mês no destino
    orcamento, // necessidade total de caixa (inclui a caução)
    custoDefinitivo: orcamento - reembolsavel,
    jaPago, aDesembolsar: Math.max(0, orcamento - jaPago),
    reserva: items.find((i) => i.id === 'reserva')?.valorEur ?? null,
    faltamInformar: items.filter((i) => i.valorEur === null).map((i) => i.id),
  };
}

// ---------- Recursos (FinancialResource / ScholarshipFunding) ----------
function groupOf(r) {
  if (r.tipo === 'bolsa') return r.status === 'confirmado' ? 'bolsa-concedida' : ['previsto', 'prometido', 'solicitado'].includes(r.status) ? 'bolsa-solicitada' : r.status === 'disponivel' ? 'bolsa-concedida' : 'a-verificar';
  if (['disponivel', 'confirmado'].includes(r.status)) return 'disponivel';
  if (['previsto', 'prometido', 'solicitado'].includes(r.status)) return 'prometido';
  return 'a-verificar';
}

function buildResources(user, fx) {
  const fin = user.finance;
  const toEur = toEurWith(fx);
  const own = fin.recursos.map((r) => ({ ...r, valorEur: toEur(r.valor, r.moeda, { conversao: true }), grupo: groupOf(r) }));
  const apps = (user.scholarshipApps || []).filter((a) => num(a.valorTotal) > 0 && ['concedida', 'enviada', 'interesse', 'preparando'].includes(a.status))
    .map((a) => ({
      id: `bolsa-${a.id}`, tipo: 'bolsa', descricao: a.nome, valor: num(a.valorTotal), moeda: a.moeda || 'EUR', automatico: true,
      status: a.status === 'concedida' ? 'confirmado' : 'solicitado', grupo: a.status === 'concedida' ? 'bolsa-concedida' : 'bolsa-solicitada',
      valorEur: toEur(a.valorTotal, a.moeda || 'EUR', { conversao: true }), condicoes: a.cobertura || null,
    }));
  const todos = [...own, ...apps];
  const grupos = Object.fromEntries(Object.entries(RESOURCE_GROUPS).map(([k, g]) => {
    const list = todos.filter((r) => r.grupo === k);
    return [k, { ...g, total: list.reduce((s, r) => s + (r.valorEur || 0), 0), itens: list.length, semCambio: list.filter((r) => r.valorEur === null).length }];
  }));
  const confirmados = todos.filter((r) => RESOURCE_GROUPS[r.grupo].conta).reduce((s, r) => s + (r.valorEur || 0), 0);
  const previstos = todos.filter((r) => !RESOURCE_GROUPS[r.grupo].conta).reduce((s, r) => s + (r.valorEur || 0), 0);
  return { todos, grupos, confirmados, previstos };
}

// ---------- Plano completo ----------
export function computeFinance(user, jr, now = new Date()) {
  const fin = ensureFinance(user);
  const fx = exchange(fin, now);
  const { program, uni, cidade, pais } = destinationOf(jr);
  const meses = Number(jr?.duracaoMeses) || program?.duracaoMeses || 12;
  const ano = startYear(jr);
  const iprem = ipremFor(ano);
  const perfil = PROFILE_IDS.includes(fin.perfil) ? fin.perfil : 'equilibrado';

  // C. Comprovação do visto — separada; não entra no custo.
  const exigenciaVisto = iprem.mensal * VISA_RULE.percentualEstudante * meses;

  const itens = buildItems(user, jr, perfil, fin.itens, fx);
  const totals = summarize(itens, meses);
  const res = buildResources(user, fx);
  const confirmados = res.confirmados;

  const falta = Math.max(0, totals.aDesembolsar - confirmados);
  const deficitVisto = Math.max(0, exigenciaVisto - confirmados);
  const deficit = Math.max(deficitVisto, falta);
  const custosInformados = itens.filter((i) => ['usuario', 'moradia', 'viagem'].includes(i.origemTipo)).length;
  const planoIniciado = Boolean(fin.iniciadoEm) || custosInformados > 0;
  const informouRecursos = Boolean(fin.informouRecursos);
  const viavel = planoIniciado && informouRecursos && deficit === 0 && totals.faltamInformar.length === 0;

  // Plano de economia até a partida (data das aulas > data simulada > setembro do ano de início).
  const partida = jr?.inicioAulas || fin.partida || `${ano}-09-01`;
  const alvo = new Date(`${partida}T12:00:00`);
  const mesesAteViagem = Math.max(1, Math.round((alvo - now) / (30.44 * 24 * 3600 * 1000)));
  const economiaMensal = deficit > 0 ? deficit / mesesAteViagem : 0;

  // Cenários comparáveis: os três perfis, mantendo o que o estudante informou e o que veio de outros módulos.
  const cenarios = ['economico', 'equilibrado', 'confortavel'].map((p) => {
    const t = summarize(buildItems(user, jr, p, fin.itens, fx), meses);
    return { perfil: p, label: SPEND_PROFILES[p].label, resumo: SPEND_PROFILES[p].resumo, instalacao: t.instalacao, mensal: t.mensal, orcamento: t.orcamento, reserva: t.reserva, diferenca: confirmados - t.aDesembolsar, faltamInformar: t.faltamInformar.length };
  });
  const salvos = fin.cenarios.map((c) => {
    const t = summarize(buildItems(user, jr, c.perfil, c.itens || {}, fx), meses);
    return { id: c.id, nome: c.nome, perfil: c.perfil, criadoEm: c.criadoEm, principal: fin.cenarioPrincipal === c.id, orcamento: t.orcamento, mensal: t.mensal, instalacao: t.instalacao, diferenca: confirmados - t.aDesembolsar };
  });

  const familiar = res.todos.some((r) => r.tipo === 'familiar');
  const caminhos = deficit > 0 ? [
    { id: 'bolsas', titulo: 'Procurar bolsas de estudo', texto: 'Veja bolsas que combinam com sua universidade e seu mestrado. Nenhuma bolsa cobre automaticamente: confira o edital.', rota: '/financiamento#bolsas', icone: 'trophy' },
    { id: 'economia', titulo: 'Montar um plano de economia', texto: `Guardando cerca de € ${Math.ceil(economiaMensal).toLocaleString('pt-BR')} por mês, você cobre a diferença em ${mesesAteViagem} mês(es), até a partida.`, rota: null, icone: 'euro' },
    { id: 'familiar', titulo: familiar ? 'Documentar o apoio da família' : 'Avaliar apoio da família', texto: 'O consulado define se e como o apoio de terceiros é aceito e quais documentos pedir. Não é automático.', rota: '/financiamento#recursos', icone: 'users' },
    { id: 'reduzir', titulo: 'Reduzir meus custos', texto: perfil === 'economico' ? 'Compare outras moradias e despesas no "Meu novo lar".' : 'Experimente o perfil econômico e compare moradias mais baratas.', rota: '/novo-lar', icone: 'home2' },
    { id: 'periodo', titulo: 'Rever minha data de partida', texto: 'Ingressar depois dá mais meses para guardar dinheiro e buscar bolsas.', rota: null, icone: 'calendar' },
    { id: 'destinos', titulo: 'Comparar destinos com custo menor', texto: 'O custo de vida muda entre cidades. Compare jornadas para outros destinos.', rota: '/jornadas', icone: 'map' },
  ] : [];

  // Compatibilidade: "linhas" no formato antigo (id, label, tipo, valor, total, origem).
  const ORIGEM = { usuario: 'informado por você', moradia: 'moradia escolhida', viagem: 'rota escolhida', premissa: 'estimativa da Estuvia' };
  const linhas = itens.map((i) => ({ id: i.id, label: i.label, tipo: i.grupo === 'mensal' ? 'mensal' : 'unico', valor: i.valorEur ?? 0, total: (i.valorEur ?? 0) * (i.grupo === 'mensal' ? meses : 1), origem: ORIGEM[i.origemTipo] || null, status: i.status, desconhecido: i.valorEur === null }));

  // Acompanhamento durante a estadia (previsto × realizado), depois da chegada.
  const realizado = (fin.realizado || []).map((r) => ({ ...r, valorEur: toEurWith(fx)(r.valor, r.moeda) }));
  const porCategoria = {};
  for (const r of realizado) (porCategoria[r.categoria] ??= []).push(r);
  const mesesReais = new Set(realizado.map((r) => r.mes)).size;
  const acompanhamento = jr?.dados?.dataEntrada ? {
    ativo: true, meses: mesesReais, lancamentos: realizado.slice(-60),
    categorias: [...new Set(itens.filter((i) => i.grupo === 'mensal').map((i) => i.categoria))].map((cat) => {
      const previsto = itens.filter((i) => i.grupo === 'mensal' && i.categoria === cat && i.valorEur !== null).reduce((s, i) => s + i.valorEur, 0);
      const total = (porCategoria[cat] || []).reduce((s, r) => s + (r.valorEur || 0), 0);
      return { categoria: cat, label: CATEGORY_LABEL[cat], previstoMes: previsto, realizadoMes: mesesReais ? total / mesesReais : null };
    }),
  } : { ativo: false };

  return {
    ano, meses, perfil, perfis: SPEND_PROFILES,
    destino: { cidade, pais, moeda: 'EUR', universidade: uni ? { id: uni.id, nome: uni.nome, sigla: uni.sigla } : null, programa: program ? { id: program.id, nome: program.nome, demo: Boolean(program.demo) } : null, anoAcademico: jr?.anoAcademico || null, premissasLocais: Boolean(cidade && DESTINATION_ASSUMPTIONS[cidade]) },
    cambio: fx.taxa, cambioInfo: fx,
    iprem: { ...iprem, regra: VISA_RULE.descricao, fonteRegra: VISA_RULE.fonte, percentual: VISA_RULE.percentualEstudante },
    exigenciaVisto,
    visto: { valor: exigenciaVisto, cobertoPct: exigenciaVisto ? Math.min(1, confirmados / exigenciaVisto) : 1, falta: deficitVisto, fonte: src(VISA_RULE.fonte), verificadoEm: iprem.atualizadoEm, status: iprem.status, aproximado: iprem.aproximado },
    itens, linhas, custosInformados, planoIniciado,
    ...totals,
    parcial: totals.faltamInformar.length > 0,
    recursos: res.todos, gruposRecursos: res.grupos, confirmados, previstos: res.previstos,
    falta, metaPct: totals.aDesembolsar ? Math.min(1, confirmados / totals.aDesembolsar) : 0,
    deficitVisto, deficitOrcamento: falta, deficit, viavel, informouRecursos,
    partida, partidaOrigem: jr?.inicioAulas ? 'inicio-aulas' : fin.partida ? 'simulada' : 'setembro-estimado',
    mesesAteViagem, economiaMensal, caminhos, cenarios, cenariosSalvos: salvos,
    acompanhamento,
    moradia: chosenHousing(user) ? { id: chosenHousing(user).id, nome: chosenHousing(user).nome } : null,
    rota: chosenRoute(user) ? { id: chosenRoute(user).id, rota: chosenRoute(user).rota } : null,
  };
}

// Compromissos financeiros com data (para a Agenda): itens com vencimento ainda não pagos.
export function financialDeadlines(user) {
  const fin = ensureFinance(user);
  return Object.entries(fin.itens).filter(([id, i]) => i?.vencimento && i.status !== 'pago' && itemById(id))
    .map(([id, i]) => ({ id: `fin-${id}`, titulo: `Pagamento: ${itemById(id).label}`, data: i.vencimento, origem: 'financeiro', tipo: 'pagamento' }));
}

export { COST_FIELDS };
