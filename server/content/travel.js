// Planejamento de viagem: PERCURSOS POSSÍVEIS (não voos), aeroportos e links de pesquisa.
// Nada aqui é preço, horário ou disponibilidade: esses dados vêm só de cotações do estudante
// ou de integrações autorizadas (nenhuma conectada hoje).

export const TRAVEL_STATUS = {
  pesquisando: { rotulo: 'Pesquisando', ordem: 0 },
  cotacao: { rotulo: 'Cotação salva', ordem: 1 },
  escolhida: { rotulo: 'Rota escolhida', ordem: 2 },
  comprada: { rotulo: 'Passagem comprada', ordem: 3 },
  concluida: { rotulo: 'Viagem concluída', ordem: 4 },
};

// Aeroportos brasileiros mais usados (código IATA → cidade). Estado → aeroporto sugerido.
export const BR_AIRPORTS = {
  GRU: 'São Paulo (Guarulhos)', VCP: 'Campinas (Viracopos)', GIG: 'Rio de Janeiro (Galeão)', BSB: 'Brasília', CNF: 'Belo Horizonte (Confins)',
  SSA: 'Salvador', REC: 'Recife', FOR: 'Fortaleza', NAT: 'Natal', JPA: 'João Pessoa', MCZ: 'Maceió', AJU: 'Aracaju', SLZ: 'São Luís', THE: 'Teresina',
  BEL: 'Belém', MAO: 'Manaus', POA: 'Porto Alegre', CWB: 'Curitiba', FLN: 'Florianópolis', VIX: 'Vitória', GYN: 'Goiânia', CGB: 'Cuiabá', CGR: 'Campo Grande',
  PMW: 'Palmas', PVH: 'Porto Velho', RBR: 'Rio Branco', BVB: 'Boa Vista', MCP: 'Macapá',
};
export const STATE_AIRPORT = {
  SP: 'GRU', RJ: 'GIG', DF: 'BSB', MG: 'CNF', BA: 'SSA', PE: 'REC', CE: 'FOR', RN: 'NAT', PB: 'JPA', AL: 'MCZ', SE: 'AJU', MA: 'SLZ', PI: 'THE',
  PA: 'BEL', AM: 'MAO', RS: 'POA', PR: 'CWB', SC: 'FLN', ES: 'VIX', GO: 'GYN', MT: 'CGB', MS: 'CGR', TO: 'PMW', RO: 'PVH', AC: 'RBR', RR: 'BVB', AP: 'MCP',
};

// Fontes conferidas em 25/10/2026 (páginas oficiais dos aeroportos e da Renfe).
const S = {
  mad: { titulo: 'Aeropuerto Adolfo Suárez Madrid-Barajas (Aena)', url: 'https://www.aena.es/es/adolfo-suarez-madrid-barajas.html', verificadoEm: '2026-10-25' },
  agp: { titulo: 'Aeropuerto de Málaga-Costa del Sol (Aena)', url: 'https://www.aena.es/es/malaga-costa-del-sol.html', verificadoEm: '2026-10-25' },
  grx: { titulo: 'Aeropuerto F.G.L. Granada-Jaén (Aena)', url: 'https://www.aena.es/es/f.g.l.-granada-jaen.html', verificadoEm: '2026-10-25' },
  // Acrescentadas em 18/11/2026 para as demais cidades; ainda não reconferidas (verificadoEm: null).
  svq: { titulo: 'Aeropuerto de Sevilla (Aena)', url: 'https://www.aena.es/es/sevilla.html', verificadoEm: null },
  xry: { titulo: 'Aeropuerto de Jerez (Aena)', url: 'https://www.aena.es/es/jerez.html', verificadoEm: null },
  lei: { titulo: 'Aeropuerto de Almería (Aena)', url: 'https://www.aena.es/es/almeria.html', verificadoEm: null },
  renfe: { titulo: 'Renfe, trens na Espanha', url: 'https://www.renfe.com/es/es', verificadoEm: '2026-10-25' },
  alsa: { titulo: 'ALSA, ônibus de média e longa distância (confira no site)', url: 'https://www.alsa.es/', verificadoEm: null },
};

// Percursos por cidade de destino. "etapas" descrevem o caminho — sem horários, durações ou preços.
export const ROUTE_TEMPLATES = {
  Granada: [
    {
      id: 'via-madri', nome: 'Via Madri', imagem: '/img/travel/madri.svg',
      resumo: 'Voo internacional até Madri e depois trem, ônibus ou voo doméstico até Granada.',
      aeroportos: ['MAD'], conexoesAereasTipicas: 'Diretos ou com uma conexão, conforme a sua cidade.', terrestre: true,
      etapas: [
        { de: 'origem', para: 'Madri (MAD)', meio: 'aviao', rotulo: 'Voo internacional' },
        { de: 'Madri (MAD)', para: 'Madri, estação', meio: 'trem-urbano', rotulo: 'Cercanías ou metrô do aeroporto até a estação' },
        { de: 'Madri, estação', para: 'Granada', meio: 'trem', rotulo: 'Trem (Renfe) ou ônibus de longa distância' },
      ],
      atencao: ['Inclui troca de meio de transporte em Madri: deixe folga entre a chegada do voo e o trem/ônibus.', 'Se comprar voo e trem separados, um atraso do voo não garante remarcação do trem.'],
      fontes: [S.mad, S.renfe, S.alsa],
    },
    {
      id: 'via-malaga', nome: 'Via Málaga', imagem: '/img/travel/malaga.svg',
      resumo: 'Voo (geralmente com conexão na Europa) até Málaga e ônibus ou trem até Granada.',
      aeroportos: ['AGP'], conexoesAereasTipicas: 'Normalmente uma conexão em outro aeroporto europeu.', terrestre: true,
      etapas: [
        { de: 'origem', para: 'conexão na Europa', meio: 'aviao', rotulo: 'Voo internacional' },
        { de: 'conexão na Europa', para: 'Málaga (AGP)', meio: 'aviao', rotulo: 'Voo de conexão' },
        { de: 'Málaga (AGP)', para: 'Granada', meio: 'onibus', rotulo: 'Ônibus de longa distância ou trem (via estação de Málaga)' },
      ],
      atencao: ['Confira se a conexão está no mesmo bilhete: bilhetes separados aumentam o risco de perder o próximo voo.'],
      fontes: [S.agp, S.alsa, S.renfe],
    },
    {
      id: 'via-granada', nome: 'Direto ao aeroporto de Granada', imagem: '/img/travel/granada.svg',
      resumo: 'Voo com conexão até o aeroporto de Granada-Jaén e ônibus até o centro.',
      aeroportos: ['GRX'], conexoesAereasTipicas: 'Sempre com conexão (não há voos diretos do Brasil).', terrestre: false,
      etapas: [
        { de: 'origem', para: 'conexão na Espanha/Europa', meio: 'aviao', rotulo: 'Voo internacional' },
        { de: 'conexão na Espanha/Europa', para: 'Granada (GRX)', meio: 'aviao', rotulo: 'Voo de conexão' },
        { de: 'Granada (GRX)', para: 'Granada, centro', meio: 'onibus', rotulo: 'Ônibus do aeroporto ou táxi' },
      ],
      atencao: ['Oferece menos opções de conexão: compare com cuidado o horário de chegada.'],
      fontes: [S.grx],
    },
  ],
};


// Demais cidades: mesmos tipos de percurso, montados a partir do aeroporto de chegada.
// Nada de horário, duração ou preço: só o caminho e as fontes oficiais.
const AIRPORT = {
  MAD: { nome: 'Madri', fonte: S.mad }, AGP: { nome: 'Málaga', fonte: S.agp }, GRX: { nome: 'Granada-Jaén', fonte: S.grx },
  SVQ: { nome: 'Sevilha', fonte: S.svq }, XRY: { nome: 'Jerez', fonte: S.xry }, LEI: { nome: 'Almería', fonte: S.lei },
};
/**
 * @param {string} id
 * @param {string} iata
 * @param {string} cidade
 * @param {{ nome?: string, resumo?: string, terrestreRotulo?: string }} [textos]
 */
function viaHub(id, iata, cidade, { nome, resumo, terrestreRotulo } = {}) {
  const a = AIRPORT[iata];
  const madri = iata === 'MAD';
  return {
    id, nome: nome || `Via ${a.nome}`, imagem: madri ? '/img/travel/madri.svg' : iata === 'AGP' ? '/img/travel/malaga.svg' : '/img/travel/granada.svg',
    resumo: resumo || `Voo até ${a.nome} (${iata}) e depois trem ou ônibus até ${cidade}.`,
    aeroportos: [iata], conexoesAereasTipicas: madri ? 'Diretos ou com uma conexão, conforme a sua cidade.' : 'Normalmente uma conexão em outro aeroporto europeu.', terrestre: true,
    etapas: [
      { de: 'origem', para: `${a.nome} (${iata})`, meio: 'aviao', rotulo: madri ? 'Voo internacional' : 'Voo internacional com conexão' },
      { de: `${a.nome} (${iata})`, para: cidade, meio: madri ? 'trem' : 'onibus', rotulo: terrestreRotulo || 'Trem (Renfe) ou ônibus de longa distância' },
    ],
    atencao: ['Inclui troca de meio de transporte: deixe folga entre a chegada do voo e o trem/ônibus.', 'Se comprar voo e trem/ônibus separados, um atraso do voo não garante remarcação.'],
    fontes: [a.fonte, S.renfe, S.alsa],
  };
}
function direto(id, iata, cidade) {
  const a = AIRPORT[iata];
  return {
    id, nome: `Direto ao aeroporto de ${a.nome}`, imagem: iata === 'AGP' ? '/img/travel/malaga.svg' : '/img/travel/granada.svg',
    resumo: `Voo com conexão até o aeroporto de ${a.nome} (${iata}) e transporte local até ${cidade}.`,
    aeroportos: [iata], conexoesAereasTipicas: 'Em geral com conexão: confira se há voo direto da sua cidade.', terrestre: false,
    etapas: [
      { de: 'origem', para: `${a.nome} (${iata})`, meio: 'aviao', rotulo: 'Voo internacional (com ou sem conexão)' },
      { de: `${a.nome} (${iata})`, para: `${cidade}, centro`, meio: 'onibus', rotulo: 'Ônibus do aeroporto, trem ou táxi' },
    ],
    atencao: ['Compare o horário de chegada: à noite pode faltar transporte do aeroporto.'],
    fontes: [a.fonte],
  };
}
Object.assign(ROUTE_TEMPLATES, {
  Sevilla: [direto('via-sevilla', 'SVQ', 'Sevilla'), viaHub('via-madri', 'MAD', 'Sevilla'), viaHub('via-malaga', 'AGP', 'Sevilla')],
  Málaga: [direto('via-malaga', 'AGP', 'Málaga'), viaHub('via-madri', 'MAD', 'Málaga')],
  Córdoba: [viaHub('via-madri', 'MAD', 'Córdoba'), viaHub('via-sevilla', 'SVQ', 'Córdoba'), viaHub('via-malaga', 'AGP', 'Córdoba')],
  Cádiz: [viaHub('via-jerez', 'XRY', 'Cádiz', { terrestreRotulo: 'Trem (Renfe Cercanías) ou ônibus' }), viaHub('via-sevilla', 'SVQ', 'Cádiz'), viaHub('via-madri', 'MAD', 'Cádiz')],
  Huelva: [viaHub('via-sevilla', 'SVQ', 'Huelva'), viaHub('via-madri', 'MAD', 'Huelva')],
  Jaén: [viaHub('via-granada', 'GRX', 'Jaén', { terrestreRotulo: 'Ônibus ou táxi até Jaén' }), viaHub('via-madri', 'MAD', 'Jaén'), viaHub('via-malaga', 'AGP', 'Jaén')],
  Almería: [direto('via-almeria', 'LEI', 'Almería'), viaHub('via-madri', 'MAD', 'Almería'), viaHub('via-malaga', 'AGP', 'Almería')],
});
// Id do percurso pelo aeroporto de chegada (usado ao ler cotações e links de busca).
export const ROUTE_BY_IATA = { MAD: 'via-madri', AGP: 'via-malaga', GRX: 'via-granada', SVQ: 'via-sevilla', XRY: 'via-jerez', LEI: 'via-almeria' };
export const ROUTE_IDS = Object.values(ROUTE_BY_IATA);

const IATA_DEST = Object.fromEntries(Object.entries(ROUTE_TEMPLATES).map(([c, ts]) => [c, ts.flatMap((t) => t.aeroportos)]));

/** Links de pesquisa (o estudante vê os preços reais no site; a Estuvia não lê nem inventa preços). */
export function searchLinks({ origem, destinoIata, data }) {
  if (!origem || !destinoIata) return [];
  const q = encodeURIComponent(`voos de ${origem} para ${destinoIata}${data ? ` em ${data}` : ''}`);
  const out = [{ id: 'google', rotulo: 'Google Voos', url: `https://www.google.com/travel/flights?q=${q}&hl=pt-BR&curr=EUR` }];
  if (data) {
    const yymmdd = data.slice(2).replace(/-/g, '');
    out.push({ id: 'skyscanner', rotulo: 'Skyscanner', url: `https://www.skyscanner.com.br/transporte/passagens-aereas/${origem.toLowerCase()}/${destinoIata.toLowerCase()}/${yymmdd}/` });
  }
  return out;
}

export const destinationAirports = (cidade) => IATA_DEST[cidade] || [];
