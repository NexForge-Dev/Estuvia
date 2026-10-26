// Catálogo inicial de bolsas (Scholarship). Status editorial "sem edital confirmado" até a
// conferência do edital vigente: nada aqui afirma que a bolsa cobre o mestrado escolhido.

export const SCHOLARSHIP_STATUS = {
  aberta: 'Edital aberto',
  futura: 'Edital futuro',
  encerrada: 'Encerrada',
  'sem-edital': 'Sem edital confirmado',
};

export const SCHOLARSHIPS = [
  {
    id: 'auip-garcia-lorca',
    nome: 'Programa Federico García Lorca',
    entidade: 'AUIP — Asociación Universitaria Iberoamericana de Postgrado',
    elegibilidade: 'Já ofereceu bolsas para mestrados oficiais de universidades públicas andaluzas a estudantes iberoamericanos. Confirme elegibilidade no edital vigente.',
    abrangencia: 'Mestrados oficiais de universidades públicas andaluzas participantes (conforme edital).',
    financia: 'Em edições anteriores, modalidades com matrícula, alojamento e manutenção.',
    cobertura: 'Variável por modalidade — confirmar no edital.',
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
    abrangencia: 'Programas específicos listados em cada convocatória — o seu mestrado pode não estar incluído.',
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
    elegibilidade: 'Aplica-se a mestrados conjuntos do catálogo Erasmus Mundus — não a qualquer mestrado oficial.',
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
