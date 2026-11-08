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

const IATA_DEST = { Granada: ['GRX', 'MAD', 'AGP'] };

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
