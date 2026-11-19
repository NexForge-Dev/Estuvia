// "Meu Novo Lar": tipos, situações, verificação "Conferir antes de pagar" e onde procurar.
// A Estuvia não busca nem extrai anúncios (sem integração autorizada): organiza o que o estudante encontra.
// Links de busca só entram depois de conferidos; faixas de preço só com fonte.

export const HOUSING_TYPES = {
  quarto: { label: 'Quarto em apartamento compartilhado', curto: 'Quarto compartilhado', icone: 'users', desc: 'A opção mais comum e econômica entre estudantes.' },
  apartamento: { label: 'Apartamento individual', curto: 'Apartamento', icone: 'home2', desc: 'Mais privacidade, custo maior.' },
  residencia: { label: 'Residência universitária', curto: 'Residência', icone: 'cap', desc: 'Serviços incluídos e vida estudantil.' },
  temporario: { label: 'Alojamento temporário', curto: 'Temporário', icone: 'luggage', desc: 'Para os primeiros dias, enquanto procura com calma.' },
};

// Situação da negociação. Valores antigos continuam aceitos e são convertidos.
export const HOUSING_STATUS = {
  'quero-conhecer': { label: 'Quero conhecer', icone: 'search' },
  contato: { label: 'Entrei em contato', icone: 'chat' },
  aguardando: { label: 'Aguardando resposta', icone: 'hourglass' },
  visitado: { label: 'Visitado ou visto por vídeo', icone: 'play' },
  contrato: { label: 'Contrato em análise', icone: 'file' },
  escolhida: { label: 'Escolhido', icone: 'check' },
  descartada: { label: 'Descartado', icone: 'minus' },
};
export const LEGACY_STATUS = { pesquisando: 'quero-conhecer', negociando: 'contrato' };
export const normStatus = (s) => LEGACY_STATUS[s] || (HOUSING_STATUS[s] ? s : 'quero-conhecer');

// "Conferir antes de pagar". checklist[id] = true quando a resposta segura foi confirmada;
// sinais[id] = true quando a resposta é um sinal de alerta. "Não sei" = nenhum dos dois.
// Concluir não torna o anúncio seguro.
export const ANTIFRAUDE = [
  { id: 'identidade', pergunta: 'Você confirmou a identidade do anunciante?', texto: 'Confirmei a identidade do anunciante', ok: 'Sim', alerta: 'Não consegui', dica: 'Peça nome completo e documento; desconfie de quem evita vídeo-chamada.' },
  { id: 'contrato', pergunta: 'Recebeu um contrato ou as condições por escrito?', texto: 'Recebi e li o contrato ou as condições por escrito', ok: 'Sim', alerta: 'Não', dica: 'Sem contrato, não há como cobrar o combinado.' },
  { id: 'imovel', pergunta: 'Verificou o endereço e o imóvel (visita, vídeo ou mapa)?', texto: 'Conferi o endereço e o imóvel', ok: 'Sim', alerta: 'Não', dica: 'Uma vídeo-chamada mostrando o imóvel ajuda muito.' },
  { id: 'pagamento', pergunta: 'Conferiu o valor total (aluguel, contas e taxas)?', texto: 'Conferi o valor total e quem recebe o pagamento', ok: 'Sim', alerta: 'Não', dica: 'Pergunte o que está incluído e se há taxa de agência.' },
  { id: 'caucao', pergunta: 'Entendeu as condições da caução (valor e devolução)?', texto: 'Entendi as condições da caução', ok: 'Sim', alerta: 'Não', dica: 'Quanto é, quando volta e em quais casos pode ser descontada.' },
  { id: 'antecipado', pergunta: 'Pediram pagamento antecipado, por fora ou de forma estranha?', texto: 'Não há pedido suspeito de pagamento', ok: 'Não', alerta: 'Sim', invertida: true, dica: 'Pedido de transferência antes de ver o imóvel ou o contrato é um alerta clássico de golpe.' },
];

export const PREFERENCES = {
  universidade: 'Perto da universidade',
  contas: 'Contas incluídas',
  individual: 'Quarto individual',
  mobiliado: 'Mobiliado',
  contrato: 'Contrato compatível com os estudos',
  transporte: 'Boa conexão com transporte público',
};

// Onde procurar, por cidade (links de busca conferidos; cada site aplica os próprios filtros).
// Granada: 24/10/2026. Demais cidades: 19/11/2026 (o título de cada página confere a cidade).
// Em Sevilla, Spotahome e Uniplaces usam o nome em inglês ("seville").
const CITY_SLUGS = {
  Granada: { spot: 'granada', uni: 'granada', ha: 'Granada', foto: 'granada', em: '2026-10-24' },
  Sevilla: { spot: 'seville', uni: 'seville', ha: 'Sevilla', foto: 'sevilla', em: '2026-11-19' },
  'Málaga': { spot: 'malaga', uni: 'malaga', ha: 'M%C3%A1laga', foto: 'malaga', em: '2026-11-19' },
  'Córdoba': { spot: 'cordoba', uni: 'cordoba', ha: 'C%C3%B3rdoba', foto: 'cordoba', em: '2026-11-19' },
  'Cádiz': { spot: 'cadiz', uni: 'cadiz', ha: 'C%C3%A1diz', foto: 'cadiz', em: '2026-11-19' },
  Huelva: { spot: 'huelva', uni: 'huelva', ha: 'Huelva', foto: 'huelva', em: '2026-11-19' },
  'Jaén': { spot: 'jaen', uni: 'jaen', ha: 'Ja%C3%A9n', foto: 'jaen', em: '2026-11-19' },
  'Almería': { spot: 'almeria', uni: 'almeria', ha: 'Almer%C3%ADa', foto: 'almeria', em: '2026-11-19' },
};
export const SEARCH_SOURCES = Object.fromEntries(Object.entries(CITY_SLUGS).map(([cidade, c]) => [cidade, {
  sites: [
    { nome: 'Spotahome', url: `https://www.spotahome.com/es/s/${c.spot}`, tipos: ['quarto', 'apartamento', 'temporario'], desc: 'Quartos e apartamentos, muitos com vídeo do imóvel.' },
    { nome: 'Uniplaces', url: `https://www.uniplaces.com/es/accommodation/${c.uni}`, tipos: ['quarto', 'apartamento', 'residencia'], desc: 'Focado em estudantes: quartos, estúdios e apartamentos.' },
    { nome: 'HousingAnywhere', url: `https://housinganywhere.com/es/s/${c.ha}--Espa%C3%B1a`, tipos: ['quarto', 'apartamento', 'temporario'], desc: 'Quartos e apartamentos para estadias de média duração.' },
    { nome: 'Fotocasa', url: `https://www.fotocasa.es/es/alquiler/viviendas/${c.foto}-capital/todas-las-zonas/l`, tipos: ['apartamento'], desc: 'Portal espanhol de aluguel de apartamentos.' },
  ],
  verificadoEm: c.em,
}]));

// Página oficial de moradia de cada universidade (conferidas em 19/11/2026; UGR em 24/10/2026).
// Cidade com mais de uma universidade (Sevilla) mostra a da universidade da jornada. UNIA: sem página encontrada.
export const OFFICIAL_HOUSING = {
  ugr: { nome: 'Universidad de Granada, onde morar', url: 'https://internacional.ugr.es/en/students/ugr-services/acommodation', fonte: 'O16', desc: 'Página oficial da UGR com tipos de moradia, preços de referência e dicas.' },
  us: { nome: 'Universidad de Sevilla, serviços de alojamento (SACU)', url: 'https://sacu.us.es/spp-servicios-alojamiento', desc: 'Serviço de alojamento da US: residências, colégios maiores e apartamentos para alugar.' },
  upo: { nome: 'Universidad Pablo de Olavide, alojamento', url: 'https://www.upo.es/intl/alojamiento', fonte: 'O36', desc: 'Residências em Sevilla, bairros recomendados e preço de referência de quarto compartilhado.' },
  uma: { nome: 'Universidad de Málaga, ferramentas para buscar alojamento', url: 'https://www.uma.es/relaciones-internacionales/info/141097/accommodation-rrii', desc: 'Portal de aluguel do Serviço de Alojamento da UMA, HUB internacional e ESN. A UMA não oferece moradia própria.' },
  uco: { nome: 'Universidad de Córdoba, Serviço de Alojamento', url: 'https://www.uco.es/servicios/alojamiento/es/', desc: 'Residências e apartamentos universitários da UCO.' },
  uca: { nome: 'Universidad de Cádiz, alojamento universitário', url: 'https://oficinadelestudiante.uca.es/alojamiento', desc: 'Residências da UCA e serviços de busca de apartamento na província de Cádiz.' },
  uhu: { nome: 'Universidad de Huelva, antes de chegar', url: 'https://uhu.es/english/pre-arrival', desc: 'Guia de alojamento da UHU. O escritório internacional orienta, mas não reserva moradia.' },
  ujaen: { nome: 'Universidad de Jaén, prepare sua estadia', url: 'https://www.ujaen.es/internacional/en/node/133112', desc: 'Residências em Jaén e apoio na busca de alojamento.' },
  ual: { nome: 'Universidad de Almería, alojamentos', url: 'https://www.ual.es/vida-universitaria/alojamiento', desc: 'Página de alojamentos da UAL.' },
};

// Busca da jornada: sites da cidade + página oficial da universidade (quando houver).
export const housingSearchFor = (cidade, universidadeId) => {
  const city = cidade && SEARCH_SOURCES[cidade];
  if (!city) return null;
  return { ...city, oficial: OFFICIAL_HOUSING[universidadeId] || null };
};

// Reconhece o site de um link colado (só o nome: nenhum dado é baixado do anúncio).
/** @type {Array<[RegExp, string]>} */
export const KNOWN_SITES = [
  [/idealista\./i, 'Idealista'], [/fotocasa\./i, 'Fotocasa'], [/spotahome\./i, 'Spotahome'], [/uniplaces\./i, 'Uniplaces'],
  [/housinganywhere\./i, 'HousingAnywhere'], [/badi\./i, 'Badi'], [/pisos\.com/i, 'pisos.com'], [/milanuncios\./i, 'Milanuncios'],
  [/habitaclia\./i, 'Habitaclia'], [/facebook\./i, 'Facebook'], [/ugr\.es/i, 'Universidad de Granada'],
];
export const siteOf = (url) => {
  try { const host = new URL(url).hostname; return KNOWN_SITES.find(([re]) => re.test(host))?.[1] || host.replace(/^www\./, ''); } catch { return null; }
};
