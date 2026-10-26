// Parâmetros financeiros versionados por ano. NUNCA usar um valor fixo no código:
// a regra lê esta tabela pelo ano do início dos estudos.

export const IPREM = {
  2026: {
    mensal: 600,
    moeda: 'EUR',
    fonte: 'Informado pelo idealizador (IPREM 2026). Confirme no BOE / Lei de Orçamentos do ano.',
    status: 'pendente', // passa a "verificado" após revisão editorial com link oficial
    atualizadoEm: '2026-10-24',
  },
};

// Regra de referência para visto de estudos: % do IPREM mensal por mês de estadia.
export const VISA_RULE = {
  percentualEstudante: 1.0,
  descricao: 'Referência geral: 100% do IPREM mensal para o estudante, por mês de estadia. Deduções (ex.: alojamento ou bolsa já pagos) e condições específicas dependem do consulado.',
  fonte: 'O6',
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
