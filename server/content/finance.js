// Parâmetros financeiros versionados por ano. NUNCA usar um valor fixo no código:
// a regra lê esta tabela pelo ano do início dos estudos.

export const IPREM = {
  2026: {
    mensal: 600,
    moeda: 'EUR',
    fonte: 'Guia oficial para estudantes: €600/mês (100% do IPREM); os Orçamentos do Estado de 2023 seguem prorrogados em 2026. Confirme a lista e o cálculo aceito pelo consulado competente.',
    status: 'verificado',
    atualizadoEm: '2026-11-09',
  },
};

// Regra de referência para visto de estudos: % do IPREM mensal por mês de estadia.
export const VISA_RULE = {
  percentualEstudante: 1.0,
  descricao: 'Estimativa de referência: 100% do IPREM mensal para o estudante por mês. Dependentes podem elevar o valor (75% do IPREM para o primeiro familiar e 50% para cada um dos demais); alojamento pago antecipadamente pode alterar o cálculo. O simulador não calcula esses ajustes: confirme o valor e as provas aceitas no consulado competente.',
  fonte: 'O6',
  fontes: ['O6', 'O28', 'O29'],
};

export function ipremFor(year) {
  const y = Number(year);
  if (IPREM[y]) return { ano: y, ...IPREM[y], aproximado: false };
  // Ano sem valor cadastrado: usa o mais recente e sinaliza como desatualizado.
  const last = Math.max(...Object.keys(IPREM).map(Number));
  return { ano: last, ...IPREM[last], aproximado: true };
}

export const COST_FIELDS = [
  { id: 'matricula', label: 'Matrícula / taxas acadêmicas', tipo: 'unico' },
  { id: 'documentos', label: 'Documentos, traduções e taxas', tipo: 'unico' },
  { id: 'passagens', label: 'Passagens aéreas', tipo: 'unico', derivavel: 'viagem' },
  { id: 'caucao', label: 'Caução da moradia', tipo: 'unico', derivavel: 'moradia' },
  { id: 'seguro', label: 'Seguro saúde (total)', tipo: 'unico' },
  { id: 'reserva', label: 'Reserva para emergências', tipo: 'unico' },
  { id: 'moradia', label: 'Moradia (por mês)', tipo: 'mensal', derivavel: 'moradia' },
  { id: 'alimentacao', label: 'Alimentação (por mês)', tipo: 'mensal' },
  { id: 'transporte', label: 'Transporte (por mês)', tipo: 'mensal' },
  { id: 'outros', label: 'Outros gastos (por mês)', tipo: 'mensal' },
];

export const RESOURCE_TYPES = {
  poupanca: 'Poupança / investimentos',
  renda: 'Renda existente',
  familiar: 'Apoio familiar',
  bolsa: 'Bolsa de estudos',
  financiamento: 'Financiamento educacional',
  outro: 'Outro',
};
