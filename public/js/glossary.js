// Glossário em linguagem simples: quem nunca passou pelo processo não precisa pesquisar termos.
// As definições explicam o sentido geral; a regra exata de cada caso continua na fonte oficial.
export const GLOSSARY = [
  { termo: 'DUA', re: /\bDUA\b|Distrito Único Andaluz/i, texto: 'Distrito Único Andaluz: o site único onde você se candidata aos mestrados das universidades públicas da Andaluzia.' },
  { termo: 'Máster oficial', re: /m[aá]ster (universitario|oficial)/i, texto: 'Mestrado reconhecido pelo governo espanhol (diferente de um "título propio", que é um curso da própria universidade).' },
  { termo: 'Adjudicação', re: /adjudica/i, texto: 'É a divulgação do resultado: em cada lista você aparece como admitido, em lista de espera ou não admitido.' },
  { termo: 'Lista de espera', re: /lista de espera/i, texto: 'Você ainda não tem a vaga, mas pode ser chamado se alguém desistir. É preciso acompanhar as próximas listas.' },
  { termo: 'Matrícula', re: /matr[ií]cula/i, texto: 'É o passo que garante a sua vaga de verdade, normalmente com pagamento de taxas. Ser admitido não é o mesmo que estar matriculado.' },
  { termo: 'Homologação', re: /homologa/i, texto: 'Reconhecimento oficial do diploma estrangeiro. Para se candidatar a mestrado oficial, normalmente não é preciso fazer antes.' },
  { termo: 'Apostila de Haia', re: /apostil/i, texto: 'Um selo oficial que valida um documento brasileiro no exterior. Só faça quando a lista oficial pedir.' },
  { termo: 'Tradução juramentada', re: /tradu[cç][aã]o (juramentada|oficial)/i, texto: 'Tradução feita por tradutor oficial. Só é necessária quando a lista oficial pedir.' },
  { termo: 'Consulado', re: /consulad|consular/i, texto: 'Escritório do governo da Espanha no Brasil. É lá que você pede o visto. Cada consulado atende alguns estados.' },
  { termo: 'Visto de estudos', re: /visto/i, texto: 'Autorização para entrar na Espanha para estudar. Você pede antes de viajar, no consulado que atende o seu estado.' },
  { termo: 'Meios econômicos', re: /meios econ[oô]micos|comprova[cç][aã]o financeira|comprovar recursos|IPREM/i, texto: 'Mostrar que você tem dinheiro para se manter durante os estudos. O valor mínimo segue uma regra oficial (calculada com base no IPREM).' },
  { termo: 'IPREM', re: /\bIPREM\b/, texto: 'Índice oficial espanhol usado como base para calcular quanto dinheiro você precisa comprovar para o visto.' },
  { termo: 'NIE', re: /\bNIE\b/, texto: 'Número de Identidade de Estrangeiro: o seu número pessoal na Espanha. Não é um documento físico.' },
  { termo: 'TIE', re: /\bTIE\b/, texto: 'Tarjeta de Identidad de Extranjero: o cartão físico de estrangeiro. Para estadias de mais de 6 meses, é preciso pedir logo depois de chegar.' },
  { termo: 'Cita previa', re: /cita previa/i, texto: 'Agendamento online obrigatório para ser atendido em órgãos públicos espanhóis (como para a TIE).' },
  { termo: 'Empadronamiento', re: /empadronamiento|padr[oó]n/i, texto: 'Registro do seu endereço na prefeitura da cidade onde você vai morar.' },
  { termo: 'Seguro saúde', re: /seguro sa[uú]de/i, texto: 'Plano de saúde válido na Espanha. Para o visto, ele precisa cumprir as condições exigidas pelo consulado.' },
  { termo: 'Antecedentes criminais', re: /antecedentes/i, texto: 'Certidão que mostra que você não tem condenações. Pode ser pedida no visto, conforme o caso.' },
  { termo: 'Escala de notas', re: /escala de notas/i, texto: 'Documento da sua faculdade explicando a nota mínima e a máxima, para a universidade entender seu histórico.' },
  { termo: 'Caução', re: /cau[cç][aã]o|fianza/i, texto: 'Depósito de garantia do aluguel. Nunca pague antes de ver o contrato e confirmar quem é o anunciante.' },
];

// Termos que aparecem nos textos da missão (no máximo 5, para não poluir a tela).
export function termsIn(...texts) {
  const all = texts.flat().filter(Boolean).join(' \n ');
  return GLOSSARY.filter((g) => g.re.test(all)).slice(0, 5);
}
