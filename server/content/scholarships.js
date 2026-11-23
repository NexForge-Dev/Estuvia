// Catálogo inicial de bolsas (Scholarship). Status editorial "sem edital confirmado" até a
// conferência do edital vigente: nada aqui afirma que a bolsa cobre o mestrado escolhido.

export const SCHOLARSHIP_STATUS = {
  aberta: 'Edital aberto',
  futura: 'Edital futuro',
  encerrada: 'Encerrada',
  'sem-edital': 'Aguardando edital',
};

export const SCHOLARSHIPS = [
  {
    id: 'auip-garcia-lorca',
    nome: 'Bolsas de mobilidade AUIP (universidades andaluzas e iberoamericanas)',
    entidade: 'AUIP: Asociación Universitaria Iberoamericana de Postgrado',
    elegibilidade: 'Estudantes de pós-graduação de universidades associadas à AUIP; origem e destino precisam ser instituições associadas. Não é bolsa para cursar o mestrado inteiro. Na consulta de 23/11/2026, a AUIP não publicava bolsa de mestrado completo na Andaluzia.',
    abrangencia: 'Estadias curtas (20 dias a 3 meses) entre universidades andaluzas e iberoamericanas associadas.',
    financia: 'Ajuda de viagem de €1.500 (Andaluzia–América Latina) no edital 2027. Não cobre matrícula nem manutenção do mestrado.',
    cobertura: 'Parcial: só deslocamento de uma estadia curta.',
    prazo: null,
    documentos: 'Definidos no edital.',
    status: 'sem-edital',
    fonte: 'O12',
    url: 'https://auip.org/',
    tags: ['andaluzia', 'mestrado-oficial', 'iberoamericano'],
  },
  {
    id: 'fundacion-carolina',
    nome: 'Bolsas de pós-graduação',
    entidade: 'Fundación Carolina',
    elegibilidade: 'Programas para nacionais de países iberoamericanos; requisitos variam por convocatória e programa.',
    abrangencia: 'Programas específicos listados em cada convocatória, o seu mestrado pode não estar incluído.',
    financia: 'Varia por programa (confirmar).',
    cobertura: 'Confirmar no edital.',
    prazo: null,
    documentos: 'Definidos na convocatória.',
    status: 'sem-edital',
    fonte: 'O13',
    url: 'https://www.fundacioncarolina.es/',
    tags: ['iberoamericano', 'pos-graduacao'],
  },
  {
    id: 'bolsas-universidade',
    nome: 'Bolsas e ajudas da universidade',
    entidade: 'Universidade de destino (ex.: UGR)',
    elegibilidade: 'Conforme convocatórias próprias da instituição.',
    abrangencia: 'Estudantes da instituição, conforme cada ajuda.',
    financia: 'Varia (matrícula, mobilidade, ajudas pontuais).',
    cobertura: 'Confirmar nos canais oficiais da universidade.',
    prazo: null,
    documentos: 'Definidos em cada convocatória.',
    status: 'sem-edital',
    fonte: 'O10',
    url: 'https://masteres.ugr.es/',
    tags: ['universidade'],
  },
  {
    id: 'erasmus-mundus',
    nome: 'Bolsas Erasmus Mundus (mestrados conjuntos)',
    entidade: 'Consórcios Erasmus Mundus / Comissão Europeia',
    elegibilidade: 'Aplica-se a mestrados conjuntos do catálogo Erasmus Mundus, não a qualquer mestrado oficial.',
    abrangencia: 'Somente programas do catálogo Erasmus Mundus.',
    financia: 'Conforme o consórcio de cada programa.',
    cobertura: 'Confirmar no programa.',
    prazo: null,
    documentos: 'Definidos por cada consórcio.',
    status: 'sem-edital',
    fonte: 'O14',
    url: 'https://www.eacea.ec.europa.eu/scholarships/erasmus-mundus-catalogue_en',
    tags: ['europa', 'mestrado-conjunto'],
  },
];

export const APPLICATION_STATUS = ['interesse', 'verificando', 'preparando', 'enviada', 'concedida', 'negada', 'desisti'];
