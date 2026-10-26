// Custos e comparação de moradias — funções puras e testáveis.
// Desconhecido é null (nunca zero). A comparação aponta diferenças; não elege a "melhor" opção.

import { ANTIFRAUDE, normStatus, HOUSING_TYPES } from './content/housing.js';

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const eur = (v) => `€ ${Math.round(v).toLocaleString('pt-BR')}`;

export function housingCosts(h, meses = 12) {
  const aluguel = num(h.aluguel);
  const adicionais = h.contasIncluidas ? 0 : num(h.adicionais);
  const caucao = num(h.caucao);
  const taxa = num(h.taxaAgencia);
  const mensal = aluguel === null ? null : aluguel + (adicionais ?? 0);
  return {
    aluguel, adicionais, caucao, taxaAgencia: taxa,
    mensal, // aluguel + contas/despesas (se informadas)
    contasDesconhecidas: !h.contasIncluidas && adicionais === null,
    inicial: aluguel === null ? null : aluguel + (caucao ?? 0) + (taxa ?? 0), // 1º aluguel + caução + taxa
    inicialParcial: caucao === null,
    totalEstadia: mensal === null ? null : mensal * meses + (taxa ?? 0), // gasto definitivo na estadia
    caucaoReembolsavel: caucao, // volta no fim do contrato, se cumpridas as condições
    meses,
  };
}

export function safetySummary(h) {
  const respostas = ANTIFRAUDE.map((q) => ({ id: q.id, estado: h.checklist?.[q.id] ? 'ok' : h.sinais?.[q.id] ? 'alerta' : 'pendente' }));
  const alertas = ANTIFRAUDE.filter((q) => h.sinais?.[q.id]).map((q) => q.pergunta);
  return {
    respostas,
    confirmadas: respostas.filter((r) => r.estado === 'ok').length,
    total: ANTIFRAUDE.length,
    alertas,
    nivel: alertas.length ? 'alerta' : respostas.every((r) => r.estado === 'ok') ? 'conferido' : 'incompleto',
  };
}

export function decorate(h, meses) {
  return { ...h, status: normStatus(h.status), tipoLabel: HOUSING_TYPES[h.tipo]?.curto || h.tipo, custos: housingCosts(h, meses), seguranca: safetySummary(h) };
}

// Diferenças relevantes entre 2 ou 3 opções, em frases curtas.
export function compareHousing(list, meses = 12) {
  const opts = list.map((h) => decorate(h, meses));
  const diferencas = [];
  const known = opts.filter((o) => o.custos.mensal !== null).sort((a, b) => a.custos.mensal - b.custos.mensal);
  const base = known[0];
  for (const o of known.slice(1)) {
    const dm = o.custos.mensal - base.custos.mensal;
    if (dm === 0) { diferencas.push(`${base.nome} e ${o.nome} têm o mesmo custo mensal informado.`); continue; }
    let s = `${base.nome} custa ${eur(dm)} a menos por mês que ${o.nome}`;
    const cb = base.custos.caucao; const co = o.custos.caucao;
    if (cb !== null && co !== null && cb > co) s += `, mas exige uma caução ${eur(cb - co)} maior`;
    else if (cb === null) s += ', mas a caução dela ainda não foi informada';
    if (base.custos.contasDesconhecidas && !o.custos.contasDesconhecidas) s += ' (e as contas ainda não foram informadas)';
    diferencas.push(`${s}.`);
    diferencas.push(`Na estadia de ${meses} meses, a diferença chega a ${eur(dm * meses)}.`);
  }
  for (const o of opts) {
    if (o.custos.mensal === null) diferencas.push(`${o.nome}: aluguel ainda não informado — não dá para comparar o custo.`);
    if (o.seguranca.alertas.length) diferencas.push(`${o.nome}: ${o.seguranca.alertas.length} sinal(is) de alerta em "Conferir antes de pagar".`);
  }
  const desconhecidos = opts.map((o) => ({ id: o.id, itens: [o.custos.caucao === null && 'caução', o.custos.contasDesconhecidas && 'contas', !o.duracaoContrato && 'duração do contrato', !o.distancia && 'distância da universidade'].filter(Boolean) }));
  return { opcoes: opts, diferencas, desconhecidos, meses, aviso: 'O menor preço não é automaticamente a melhor escolha: considere contrato, localização, segurança e o que ainda não se sabe.' };
}
