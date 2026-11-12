// Composição da central de cada missão: QUAIS ferramentas aparecem e em que ordem.
// A quantidade acompanha a complexidade real da missão (simples ≈ 3, guiada ≈ 4, complexa até 8):
// nada de cards artificiais para preencher a grade.
//
// Ferramenta: { id, painel, titulo, desc, ic, cor, destaque?, objetivos?: [ids de objetivo que ela ajuda a cumprir] }
//   painel:  guia | oficial | documentos | agenda | ajuda | ferramenta | entender
//            simulador | comprovacao | dinheiro | alternativas | bolsas
//   objetivos: ligação com o progresso. Ferramentas sem "objetivos" são complementares e nunca bloqueiam a conclusão.

export const COLORS = ['turquesa', 'azul', 'verde', 'laranja', 'roxo', 'amarelo', 'rosa', 'ciano'];

const T = {
  simulador: { painel: 'simulador', titulo: 'Simulador financeiro', desc: 'Descubra quanto custa sua jornada.', ic: 'calculator', cor: 'turquesa' },
  comprovacao: { painel: 'comprovacao', titulo: 'Comprovação financeira', desc: 'Entenda o dinheiro exigido para o visto.', ic: 'shieldCheck', cor: 'azul' },
  dinheiro: { painel: 'dinheiro', titulo: 'Meu dinheiro', desc: 'Registre quanto você já possui.', ic: 'piggy', cor: 'verde' },
  alternativas: { painel: 'alternativas', titulo: 'Alternativas de financiamento', desc: 'Descubra caminhos para cobrir o que falta.', ic: 'bulb', cor: 'laranja' },
  bolsas: { painel: 'bolsas', titulo: 'Bolsas disponíveis', desc: 'Encontre bolsas para seu mestrado.', ic: 'cap', cor: 'roxo' },
  agenda: { painel: 'agenda', titulo: 'Meu planejamento', desc: 'Organize suas próximas atividades.', ic: 'calendarDays', cor: 'amarelo' },
  documentos: { painel: 'documentos', titulo: 'Meus documentos', desc: 'Situação de cada documento desta missão.', ic: 'file', cor: 'verde' },
  oficial: { painel: 'oficial', titulo: 'Site oficial', desc: 'Onde o procedimento é feito de verdade.', ic: 'globe', cor: 'azul' },
  ajuda: { painel: 'ajuda', titulo: 'Preciso de ajuda', desc: 'O Mentor já conhece esta missão.', ic: 'chat', cor: 'roxo' },
  entender: { painel: 'entender', titulo: 'Entender melhor', desc: 'Por quê, resultado esperado e erros comuns.', ic: 'book', cor: 'laranja' },
};
const tool = (id, extra = {}) => ({ id, ...T[id], ...extra });

// Missões com central própria (as demais usam a composição automática abaixo).
export const MISSION_TOOLS = {
  '1.5': {
    descricao: 'Descubra quanto sua jornada pode custar e registre os recursos que você já possui.',
    ferramentas: [
      tool('simulador', { destaque: true, objetivos: ['custos'] }),
      tool('comprovacao'),
      tool('dinheiro', { objetivos: ['recursos'] }),
      tool('alternativas'),
      tool('bolsas'),
      tool('agenda'),
    ],
  },
  '2.1': {
    descricao: 'Confira se o seu passaporte vale para toda a estadia.',
    ferramentas: [
      { id: 'conferir', painel: 'guia', titulo: 'Conferir meu passaporte', desc: 'Validade, dados e páginas livres.', ic: 'passport', cor: 'turquesa', destaque: true, objetivos: '*' },
      { id: 'solicitar', painel: 'oficial', titulo: 'Solicitar ou renovar', desc: 'Como pedir um passaporte novo.', ic: 'refresh', cor: 'azul' },
      tool('ajuda'),
    ],
  },
  '5.4': {
    descricao: 'Mostre que você tem recursos compatíveis com a exigência do visto.',
    ferramentas: [
      tool('comprovacao', { destaque: true }),
      tool('dinheiro'),
      { id: 'guia', painel: 'guia', titulo: 'Passo a passo', desc: 'Reunir e organizar os comprovantes.', ic: 'target', cor: 'turquesa', objetivos: '*' },
      tool('documentos'),
      tool('alternativas'),
    ],
  },
  // Viagem: o planejador "Minha viagem" é a ferramenta principal; os objetivos são marcados por ele.
  '6.3': {
    descricao: 'Compare rotas pelo custo total e compre a passagem no momento certo.',
    ferramentas: [
      { id: 'viagem', painel: 'link', rota: '/viagem', titulo: 'Minha viagem', desc: 'Rotas, cotações e a passagem escolhida.', ic: 'plane', cor: 'turquesa', destaque: true, objetivos: ['cotacoes', 'escolher', 'comprar'] },
      { id: 'guia', painel: 'guia', titulo: 'Passo a passo', desc: 'Cotar, escolher e comprar, com segurança.', ic: 'target', cor: 'azul' },
      tool('agenda'),
      tool('ajuda'),
    ],
  },
  '6.5': {
    descricao: 'Planeje o caminho do aeroporto até a sua moradia.',
    ferramentas: [
      { id: 'viagem', painel: 'link', rota: '/viagem', titulo: 'Minha chegada', desc: 'Aeroporto, transporte e endereço.', ic: 'pin', cor: 'turquesa', destaque: true, objetivos: ['chegada'] },
      { id: 'guia', painel: 'guia', titulo: 'Passo a passo', desc: 'Registrar a data prevista de chegada.', ic: 'target', cor: 'azul', objetivos: '*' },
      tool('ajuda'),
    ],
  },
  '9.1': { ferramentas: [tool('simulador', { destaque: true, objetivos: ['custos'] }), tool('comprovacao'), tool('agenda')] },
  '9.2': { ferramentas: [tool('comprovacao', { destaque: true }), { id: 'guia', painel: 'guia', titulo: 'Passo a passo', desc: 'Ler a regra e confirmar com o consulado.', ic: 'target', cor: 'turquesa', objetivos: '*' }, tool('ajuda')] },
  '9.3': { ferramentas: [tool('dinheiro', { destaque: true, objetivos: ['recursos'] }), tool('comprovacao'), tool('alternativas')] },
  '9.4': { ferramentas: [tool('bolsas', { destaque: true, objetivos: ['salvar'] }), { id: 'guia', painel: 'guia', titulo: 'Passo a passo', desc: 'Pesquisar e salvar oportunidades.', ic: 'target', cor: 'turquesa', objetivos: '*' }, tool('agenda'), tool('ajuda')] },
  '9.10': { ferramentas: [tool('simulador', { destaque: true }), tool('dinheiro'), tool('comprovacao'), tool('alternativas'), tool('bolsas'), { id: 'guia', painel: 'guia', titulo: 'Revisar o plano', desc: 'Confirmar a viabilidade, passo a passo.', ic: 'target', cor: 'turquesa', objetivos: '*' }] },
};

const TOOL_LABEL = {
  elegibilidade: ['Verificar elegibilidade', 'Compare seu perfil com os requisitos.', 'scale'],
  'comparar-opcoes': ['Comparar minhas opções', 'Suas opções lado a lado.', 'scale'],
  consulado: ['Meu consulado', 'Qual consulado atende você.', 'passport'],
  'email-consulado': ['E-mail ao consulado', 'Rascunho pronto para revisar.', 'mail'],
  'contato-academico': ['Contato acadêmico', 'Encontre e registre o contato oficial.', 'users'],
  viagem: ['Planejar a viagem', 'Rotas, custos e chegada.', 'plane'],
  'guia-cidade': ['Guia da cidade', 'Primeiros passos no destino.', 'pin'],
  catalogo: ['Catálogo de mestrados', 'Programas e requisitos.', 'search'],
  documentos: ['Área de documentos', 'Checklist completo.', 'file'],
  financeiro: ['Resumo financeiro', 'Seu plano em números.', 'euro'],
  'novo-lar': ['Meu novo lar', 'Compare moradias e riscos.', 'home'],
  bolsas: ['Buscador de bolsas', 'Bolsas e candidaturas.', 'cap'],
};

/** Ferramentas de uma missão: configuração própria ou composição pela complexidade. */
export function toolsFor(m) {
  const own = MISSION_TOOLS[m.id];
  if (own) return { descricao: own.descricao || null, ferramentas: own.ferramentas };
  const def = m.definicao;
  const level = m.complexidade || 'guiada';
  const out = [];
  const stepsTitle = level === 'simples' ? 'Fazer agora' : 'Passo a passo';
  out.push({ id: 'guia', painel: 'guia', titulo: stepsTitle, desc: level === 'simples' ? `Leva ${def.tempoEstimado}.` : `${m.objetivosTotal} passo(s), um de cada vez.`, ic: 'target', cor: 'turquesa', destaque: true, objetivos: '*' });
  if (def.ferramenta && TOOL_LABEL[def.ferramenta] && level !== 'simples') {
    const [titulo, desc, ic] = TOOL_LABEL[def.ferramenta];
    out.push({ id: 'ferramenta', painel: 'ferramenta', titulo, desc, ic, cor: 'ciano' });
  }
  if (m.documentos?.length && level !== 'simples') out.push(tool('documentos'));
  if (m.linkOficial?.url) out.push(tool('oficial', { titulo: m.linkOficial.rotulo?.length <= 32 ? m.linkOficial.rotulo : 'Site oficial' }));
  if (level !== 'simples' && (m.prazo || def.prazo || (def.duracaoMin || 0) >= 45)) out.push(tool('agenda', { desc: m.prazo ? 'Prazo e horários desta missão.' : 'Reserve um horário para esta missão.' }));
  if (level === 'complexa' && (def.porque || m.errosComuns?.length)) out.push(tool('entender'));
  if (level === 'simples') out.push(tool('ajuda'));
  const max = { simples: 3, guiada: 5, complexa: 8 }[level] || 5;
  return { descricao: null, ferramentas: out.slice(0, max) };
}
