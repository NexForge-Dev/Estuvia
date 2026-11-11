// Regras de progressão da jornada (conteúdo puro; avaliadas em server/journey-engine.js).
//
// RoundUnlockRule: { rodada, sempre?, requisitos[cond] (todas), alternativas[cond] (qualquer uma basta), texto, acao? }
//   cond: { missao: id }                       — concluída, não aplicável ou ignorada (opcional)
//         { situacao: { campo, valores } }     — decisão externa registrada na jornada
//         { dado: campo, rotulo }              — fato declarado na jornada (ex.: data de entrada)
// Uma rodada desbloqueada fica registrada (UnlockEvent) e não volta a bloquear se um pré-requisito for reaberto.
//
// Trilhas paralelas: missões que não esperam o desbloqueio da rodada (só as próprias dependências),
// porque o estudante precisa conhecê-las cedo para decidir, se preparar ou não perder prazos.

const ENVIOU = ['aguardando', 'admitido', 'lista-espera', 'nao-admitido', 'exige-acao'];

export const ROUND_UNLOCK = [
  { rodada: 1, sempre: true, texto: 'Disponível desde o início.' },
  {
    rodada: 2,
    requisitos: [{ missao: '1.1' }, { missao: '1.3' }, { missao: '1.5' }],
    alternativas: [{ situacao: { campo: 'adjudicacao', valores: ENVIOU } }],
    texto: 'Defina seu perfil, escolha o mestrado e faça o planejamento financeiro inicial.',
  },
  {
    rodada: 3,
    requisitos: [{ missao: '2.4' }, { missao: '2.5' }, { missao: '2.6' }, { missao: '2.7' }],
    alternativas: [{ situacao: { campo: 'adjudicacao', valores: ENVIOU } }],
    texto: 'Organize sua documentação e verifique os requisitos aplicáveis ao seu mestrado.',
  },
  {
    rodada: 4,
    requisitos: [{ missao: '3.6' }],
    alternativas: [{ situacao: { campo: 'adjudicacao', valores: ENVIOU } }],
    texto: 'Envie sua candidatura no DUA (ou registre que já enviou). A matrícula só abre quando você registrar uma admissão.',
  },
  {
    rodada: 5,
    requisitos: [{ missao: '4.6' }],
    alternativas: [{ situacao: { campo: 'matricula', valores: ['matriculado'] } }, { situacao: { campo: 'visto', valores: ['apresentada', 'em-analise', 'doc-adicional', 'aprovado', 'indeferido'] } }],
    texto: 'Formalize a matrícula e obtenha os comprovantes acadêmicos. A preparação do dossiê consular já pode começar antes.',
  },
  {
    rodada: 6,
    requisitos: [{ missao: '5.9' }],
    alternativas: [{ situacao: { campo: 'visto', valores: ['aprovado'] } }],
    texto: 'Tenha o visto aprovado. A pesquisa de moradia e a comparação de passagens já estão liberadas antes disso.',
  },
  {
    rodada: 7,
    requisitos: [{ dado: 'dataEntrada', rotulo: 'Registrar a chegada à Espanha' }],
    texto: 'Registre sua chegada à Espanha para ativar o módulo de chegada.',
    acao: 'registrar-chegada',
  },
  {
    rodada: 8,
    requisitos: [{ dado: 'dataEntrada', rotulo: 'Registrar a chegada à Espanha' }],
    texto: 'Ativada pela data de entrada: o prazo da TIE conta a partir dela. Não depende das tarefas da Rodada 7.',
    acao: 'registrar-chegada',
  },
  { rodada: 9, sempre: true, texto: 'Trilha paralela: começa na Rodada 1.' },
];

export const PARALLEL_TRACKS = {
  financiamento: { titulo: 'Financiamento e bolsas', motivo: 'Comprovar recursos e buscar bolsas leva tempo: começa na Rodada 1.' },
  'visto-preparacao': { titulo: 'Preparação antecipada do visto', motivo: 'Requisitos e documentos consulares podem ser preparados antes da solicitação formal.' },
  'moradia-pesquisa': { titulo: 'Pesquisa de moradia', motivo: 'Pesquisar e comparar pode começar antes do visto; a contratação fica para depois.' },
  'viagem-pesquisa': { titulo: 'Comparação de passagens', motivo: 'Comparar rotas e tarifas flexíveis antes do visto evita decisões apressadas.' },
  'obrigacoes-legais': { titulo: 'Obrigações legais após a chegada', motivo: 'Saber antes de viajar se a TIE se aplica e qual é o prazo.' },
};

export const MISSION_TRACK = {
  '5.1': 'visto-preparacao', '5.2': 'visto-preparacao', '5.3': 'visto-preparacao', '5.4': 'visto-preparacao', '5.5': 'visto-preparacao', '5.6': 'visto-preparacao',
  '6.1': 'moradia-pesquisa', '6.3': 'viagem-pesquisa',
  '8.1': 'obrigacoes-legais', '8.2': 'obrigacoes-legais',
};
export const trackOf = (missionId, rodada) => MISSION_TRACK[missionId] || (rodada === 9 ? 'financiamento' : null);

// Evidência de conclusão: referência que o estudante registra (não é validação oficial).
export const EVIDENCE = {
  '3.6': { rotulo: 'Identificação do comprovante de envio no DUA (número, data ou nome do arquivo)', obrigatoria: true },
  '3.7': { rotulo: 'Onde o comprovante está guardado (ex.: "PDF na pasta Estuvia")', obrigatoria: false },
  '4.3': { rotulo: 'Referência da confirmação/reserva de vaga', obrigatoria: false },
  '5.7': { rotulo: 'Identificação do protocolo do pedido de visto (número ou data do atendimento)', obrigatoria: true },
  '8.6': { rotulo: 'Referência do atendimento da TIE (data ou número do resguardo)', obrigatoria: false },
};

// Progresso anterior (estudantes que não começam do zero). Cada etapa inclui as anteriores.
// Missões condicionais são incluídas quando a etapa as pressupõe; opcionais e bolsas ficam para o estudante decidir.
const R = (n, ids) => ids.map((i) => `${n}.${i}`);
export const PRIOR_STAGES = [
  { id: 'inicio', rotulo: 'Estou começando do zero', missoes: [] },
  { id: 'mestrado-escolhido', rotulo: 'Já escolhi meu mestrado', missoes: R(1, [1, 2, 3, 4]) },
  { id: 'documentos-prontos', rotulo: 'Já tenho os documentos da candidatura prontos', missoes: [...R(1, [5]), ...R(2, [1, 2, 3, 4, 5, 6, 7])] },
  { id: 'candidatura-enviada', rotulo: 'Já enviei a candidatura no DUA', missoes: R(3, [1, 2, 3, 4, 5, 6, 7]), situacao: { adjudicacao: 'aguardando' } },
  { id: 'admitido', rotulo: 'Já fui admitido(a)', missoes: R(3, [9]), situacao: { adjudicacao: 'admitido' } },
  { id: 'matriculado', rotulo: 'Já estou matriculado(a)', missoes: R(4, [1, 2, 3, 4, 5, 6, 7]), situacao: { matricula: 'matriculado' } },
  { id: 'visto-aprovado', rotulo: 'Já tenho o visto aprovado', missoes: [...R(5, [1, 3, 4, 5, 6, 7, 8, 9]), ...R(9, [1, 2, 3, 8, 9, 10])], situacao: { visto: 'aprovado' } },
  { id: 'na-espanha', rotulo: 'Já estou na Espanha', missoes: R(6, [1, 2, 3, 4, 5]), exigeDataEntrada: true },
];

// Ordem de "avanço" das situações: o progresso anterior nunca rebaixa uma situação já registrada.
// Resultados ainda não favoráveis (lista de espera, não admitido, exige ação, visto indeferido) ficam
// abaixo do resultado positivo: quem saiu da lista de espera ou teve um novo pedido aprovado consegue declarar.
export const SITUACAO_RANK = {
  adjudicacao: { 'nao-enviada': 0, aguardando: 1, 'lista-espera': 1, 'exige-acao': 1, 'nao-admitido': 1 },
  matricula: { 'nao-iniciada': 0, 'vaga-confirmada': 1, reservada: 1 },
  visto: { preparacao: 0, apresentada: 1, 'em-analise': 1, 'doc-adicional': 1, indeferido: 1 },
};
export const situacaoRank = (campo, valor) => SITUACAO_RANK[campo]?.[valor] ?? 2;

// ---------- Complexidade adaptativa ----------
// complexidade orienta a interface (simples: um card e uma ação · guiada: poucos passos · complexa: ambiente completo).
// risco é avaliado à parte: uma tarefa fácil pode ter consequência séria se for feita errado.
const SIMPLES = ['1.1', '1.2', '2.1', '2.2', '2.3', '2.6', '3.1', '3.2', '3.3', '3.7', '4.1', '4.4', '4.5', '4.7', '5.9', '6.4', '7.1', '7.2', '7.3', '7.4', '7.5', '7.6', '7.7', '7.8', '8.1', '8.2', '8.5', '8.7', '8.8', '9.2', '9.9'];
const COMPLEXAS = ['3.6', '5.4', '5.7', '9.6', '9.10'];
export const RISK = {
  '3.6': { nivel: 'alto', texto: 'Envie dentro do prazo da sua fase e guarde o comprovante: sem ele, você não consegue provar o envio.' },
  '4.3': { nivel: 'alto', texto: 'Perder o prazo de confirmação ou reserva pode significar perder a vaga.' },
  '5.4': { nivel: 'alto', texto: 'Recursos "previstos" não contam: vale o que você consegue comprovar, do jeito que o consulado pede.' },
  '5.7': { nivel: 'alto', texto: 'Vá com o dossiê completo, seguindo a lista do seu consulado: documento faltando atrasa ou prejudica o pedido.' },
  '6.2': { nivel: 'alto', texto: 'Nunca pague caução sem contrato e sem confirmar quem é o anunciante.' },
  '6.3': { nivel: 'alto', texto: 'Comprar passagem não reembolsável antes do visto aprovado é um risco financeiro.' },
  '8.3': { nivel: 'alto', texto: 'A TIE tem prazo contado a partir da entrada na Espanha: agende logo.' },
  '2.1': { nivel: 'medio', texto: 'A validade do passaporte precisa cobrir a sua estadia.' },
  '6.1': { nivel: 'medio', texto: 'Desconfie de preço muito abaixo do mercado e de quem pede pagamento antes da visita.' },
  '5.5': { nivel: 'medio', texto: 'Confira se o seguro cumpre as condições exigidas pelo consulado antes de contratar.' },
  '9.6': { nivel: 'medio', texto: 'O prazo do edital da bolsa é diferente do prazo do DUA.' },
};
export const complexityOf = (id) => (SIMPLES.includes(id) ? 'simples' : COMPLEXAS.includes(id) ? 'complexa' : 'guiada');
export const riskOf = (id) => RISK[id] || { nivel: 'baixo', texto: null };

// ---------- Requisitos que o estudante já atende (perguntados no onboarding, editáveis no perfil) ----------
// "Requisito já atendido" é diferente de "missão concluída na plataforma": fica registrado com outra origem.
// Só "tenho" muda a jornada (conclui as missões); as demais respostas mantêm a missão de providenciar/conferir.
// "verificar" foi acrescentado em todas as perguntas (aditivo: respostas antigas continuam válidas).
export const REQUIREMENTS = [
  { id: 'passaporte', pergunta: 'Você já tem passaporte válido?', opcoes: [['tenho', 'Sim, já tenho'], ['preciso', 'Não, preciso solicitar'], ['verificar', 'Tenho, mas preciso ver a validade']], missoes: ['2.1'], documento: 'passaporte' },
  { id: 'diploma', pergunta: 'Você já tem o diploma da graduação?', opcoes: [['tenho', 'Sim, já tenho'], ['aguardando', 'Já me formei, mas ainda não recebi'], ['nao', 'Ainda não me formei'], ['verificar', 'Preciso verificar']], missoes: ['2.2'], documento: 'diploma' },
  { id: 'historico', pergunta: 'Você já tem o histórico da faculdade?', opcoes: [['tenho', 'Sim, já tenho'], ['preciso', 'Ainda preciso pedir'], ['verificar', 'Preciso verificar']], missoes: ['2.3'], documento: 'historico' },
  { id: 'tie', pergunta: 'Você já tem a TIE (cartão de estrangeiro)?', opcoes: [['tenho', 'Sim, já tenho'], ['nao', 'Ainda não'], ['verificar', 'Preciso verificar']], missoes: ['8.1', '8.2', '8.3', '8.4', '8.5', '8.6', '8.7', '8.8'], somenteNaEspanha: true },
];
