// Planejador financeiro: itens de despesa (ExpenseItem), perfis de gasto e premissas por destino.
// Regra: nenhum valor sem origem. Onde não há fonte confiável, o valor fica DESCONHECIDO (null),
// nunca zero, e a interface pede para o estudante informar ou confirmar.

// grupo: instalacao (paga uma vez, antes/no início) · mensal (recorrente durante a estadia)
export const EXPENSE_ITEMS = [
  { id: 'matricula', label: 'Taxas acadêmicas (matrícula)', grupo: 'instalacao', categoria: 'academico', icone: 'cap', dica: 'O valor é publicado pela universidade para cada mestrado e ano.' },
  { id: 'documentos', label: 'Documentos, traduções e apostilas', grupo: 'instalacao', categoria: 'documentos', icone: 'file', dica: 'Só traduza e apostile o que a lista oficial pedir.' },
  { id: 'visto', label: 'Taxa do visto e ida ao consulado', grupo: 'instalacao', categoria: 'documentos', icone: 'passport', dica: 'Confira a taxa no site do seu consulado.' },
  { id: 'seguro', label: 'Seguro saúde (estadia inteira)', grupo: 'instalacao', categoria: 'seguro', icone: 'shield', dica: 'Peça cotações que cumpram as exigências do consulado.' },
  { id: 'passagens', label: 'Passagens e deslocamento até a cidade', grupo: 'instalacao', categoria: 'viagem', icone: 'plane', derivavel: 'viagem', dica: 'Vem automaticamente da rota escolhida no planejamento de viagem.' },
  { id: 'caucao', label: 'Caução do aluguel', grupo: 'instalacao', categoria: 'moradia', icone: 'home2', derivavel: 'moradia', reembolsavel: true, dica: 'É dinheiro que você precisa ter no início, mas costuma ser devolvido no fim do contrato.' },
  { id: 'reserva', label: 'Reserva para imprevistos', grupo: 'instalacao', categoria: 'reserva', icone: 'shield', dica: 'Um colchão para emergências. Não é gasto obrigatório, é segurança.' },
  { id: 'moradia', label: 'Moradia (aluguel)', grupo: 'mensal', categoria: 'moradia', icone: 'home2', derivavel: 'moradia' },
  { id: 'contas', label: 'Contas da casa (luz, água, internet)', grupo: 'mensal', categoria: 'moradia', icone: 'home', derivavel: 'moradia', dica: 'Muitas vezes são pagas à parte do aluguel.' },
  { id: 'alimentacao', label: 'Alimentação', grupo: 'mensal', categoria: 'alimentacao', icone: 'euro' },
  { id: 'transporte', label: 'Transporte', grupo: 'mensal', categoria: 'transporte', icone: 'map', dica: 'Pergunte pelas tarifas de estudante do transporte urbano.' },
  { id: 'outros', label: 'Despesas pessoais (celular, higiene, lazer)', grupo: 'mensal', categoria: 'outros', icone: 'sparkles' },
];
export const itemById = (id) => EXPENSE_ITEMS.find((i) => i.id === id) || null;

export const CATEGORY_LABEL = {
  academico: 'Universidade', documentos: 'Documentos e visto', seguro: 'Seguro', viagem: 'Viagem', reserva: 'Reserva',
  moradia: 'Moradia', alimentacao: 'Alimentação', transporte: 'Transporte', outros: 'Outros',
};

// Perfis de gasto: premissas explícitas e editáveis (o estudante vê e pode trocar cada valor).
export const SPEND_PROFILES = {
  economico: { label: 'Econômico', resumo: 'Quarto compartilhado no valor mais baixo da faixa e compras enxutas.', faixaMoradia: 'min', multAlimentacao: 0.85 },
  equilibrado: { label: 'Equilibrado', resumo: 'Quarto compartilhado no meio da faixa e alimentação na média.', faixaMoradia: 'meio', multAlimentacao: 1 },
  confortavel: { label: 'Confortável', resumo: 'Quarto no topo da faixa e mais folga na alimentação.', faixaMoradia: 'max', multAlimentacao: 1.25 },
  personalizado: { label: 'Personalizado', resumo: 'Parte do equilibrado; você ajusta cada item.', faixaMoradia: 'meio', multAlimentacao: 1 },
};
export const PROFILE_IDS = Object.keys(SPEND_PROFILES);

// Premissas por destino. Cada valor traz fonte e data de consulta; o que não tem fonte fica de fora.
const INE_ALIMENTACAO_MES = Math.round((13626 * 0.158) / 12); // €179: média nacional por pessoa (todas as idades)
export const DESTINATION_ASSUMPTIONS = {
  // Espanha inteira: só alimentação tem referência oficial nacional.
  ES: {
    alimentacao: {
      base: INE_ALIMENTACAO_MES, fonte: 'O17', consultadoEm: '2026-10-24',
      nota: 'Cálculo da Estuvia: 15,8% do gasto médio anual por pessoa na Espanha (INE, 2024), dividido por 12. É uma média nacional, não um valor de estudante.',
    },
  },
  Granada: {
    moradia: {
      faixa: { min: 250, meio: 300, max: 350 }, fonte: 'O15', fonteExtra: 'O16', consultadoEm: '2026-10-24',
      nota: 'Quarto em apartamento compartilhado. A UGR publica €200–300 (O15) e €300–350 (O16); usamos 250 / 300 / 350. As páginas não informam a data de atualização.',
    },
  },
};

// Premissas de cálculo da própria Estuvia (sem preço envolvido): sempre identificadas como premissa.
export const PLANNING_RULES = {
  caucaoMeses: { valor: 1, nota: 'Premissa: caução de 1 mês de aluguel, prática comum. Confirme no contrato.' },
  reservaMeses: { valor: 1, nota: 'Premissa: reserva de 1 mês de custo de vida para imprevistos.' },
};

// Recursos: o que conta como garantido e o que ainda é incerto.
export const RESOURCE_GROUPS = {
  disponivel: { label: 'Disponível', texto: 'Dinheiro que você já tem.', conta: true },
  'bolsa-concedida': { label: 'Bolsa concedida', texto: 'Benefício confirmado, nas condições do edital.', conta: true },
  prometido: { label: 'Prometido', texto: 'Apoio informado, mas ainda não comprovado.', conta: false },
  'bolsa-solicitada': { label: 'Bolsa solicitada', texto: 'Financiamento incerto até o resultado.', conta: false },
  'a-verificar': { label: 'A verificar', texto: 'Valores cuja disponibilidade precisa ser confirmada.', conta: false },
};
