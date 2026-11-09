// SourceRegistry inicial. "prioridade" é a autoridade normativa em caso de conflito (menor = mais forte):
// o BOJA publica as resoluções que regem o procedimento; o portal do DUA as operacionaliza; a UGR
// é a autoridade sobre o conteúdo acadêmico de cada máster. O sistema nunca escolhe arbitrariamente:
// um conflito abre revisão e a decisão registra qual autoridade foi seguida.
//
// metodo:
//   html-publico     página pública coletada automaticamente (respeitando robots.txt)
//   revisao-manual   sem coleta automática (formulário dinâmico, PDF ou sem estrutura estável):
//                    a equipe confere e registra pelo painel administrativo

export const SOURCE_SEED = [
  {
    id: 'dua-calendario',
    titulo: 'Calendário de pré-inscrição em másteres',
    instituicao: 'Junta de Andalucía: Distrito Único Andaluz',
    rotuloPublico: 'Distrito Único Andaluz',
    url: 'https://www.juntadeandalucia.es/economiaconocimientoempresasyuniversidad/sguit/?q=masteres&d=mo_calendario.php',
    tipo: 'calendario',
    prioridade: 1,
    autoridade: ['datas-candidatura'],
    metodo: 'html-publico',
    conector: 'dua-calendar',
    frequenciaHoras: 6,
  },
  {
    id: 'ugr-catalogo',
    titulo: 'Listado de másteres oficiais',
    instituicao: 'Universidad de Granada',
    rotuloPublico: 'Universidad de Granada, masteres.ugr.es',
    url: 'https://masteres.ugr.es/informacion/titulaciones',
    tipo: 'catalogo',
    prioridade: 1,
    autoridade: ['catalogo'],
    metodo: 'html-publico',
    conector: 'ugr-catalog',
    frequenciaHoras: 24,
  },
  {
    id: 'ugr-fichas',
    titulo: 'Fichas dos másteres (uma página por programa)',
    instituicao: 'Universidad de Granada',
    rotuloPublico: 'Ficha oficial do máster: UGR',
    url: 'https://masteres.ugr.es/informacion/titulaciones/',
    tipo: 'programa',
    prioridade: 1,
    autoridade: ['dados-programa'],
    metodo: 'html-publico',
    conector: 'ugr-program',
    // 12 fichas a cada 2 h: as ~140 fichas são reconferidas cerca de uma vez por dia, sem rajadas.
    frequenciaHoras: 2,
    lote: 12,
  },
  {
    id: 'boja',
    titulo: 'Boletín Oficial de la Junta de Andalucía',
    instituicao: 'Junta de Andalucía',
    rotuloPublico: 'BOJA',
    url: 'https://www.juntadeandalucia.es/boja/',
    tipo: 'normativa',
    prioridade: 0,
    autoridade: ['datas-candidatura', 'normativa'],
    metodo: 'revisao-manual',
    frequenciaHoras: 24,
    nota: 'Resoluções do procedimento DUA. Conferência manual: o buscador do BOJA é bloqueado por robots.txt.',
  },
  {
    id: 'dua-catalogo',
    titulo: 'Catálogo de másteres do DUA',
    instituicao: 'Junta de Andalucía: Distrito Único Andaluz',
    rotuloPublico: 'Distrito Único Andaluz',
    url: 'https://www.juntadeandalucia.es/economiaconocimientoempresasyuniversidad/sguit/?q=masteres&d=mo_catalogo_top.php',
    tipo: 'catalogo',
    prioridade: 1,
    autoridade: ['oferta-dua'],
    metodo: 'html-publico',
    conector: 'dua-catalog',
    frequenciaHoras: 24,
    nota: 'Consulta pública da listagem por universidade e fase; o conteúdo interno das fichas ainda não é coletado automaticamente.',
  },
  {
    id: 'dua-portal',
    titulo: 'Portal do Distrito Único Andaluz',
    instituicao: 'Junta de Andalucía',
    rotuloPublico: 'Distrito Único Andaluz',
    // Destino oficial do link curto lajunta.es/portaldua (307 temporário, conferido em 28/10/2026).
    url: 'https://www.juntadeandalucia.es/economiaconocimientoempresasyuniversidad/sguit',
    tipo: 'portal-candidatura',
    prioridade: 1,
    autoridade: ['canal-candidatura'],
    metodo: 'revisao-manual',
    frequenciaHoras: 24,
  },
  {
    id: 'ugr-saap',
    titulo: 'Servicio de Acceso, Admisión y Permanencia',
    instituicao: 'Universidad de Granada',
    rotuloPublico: 'UGR: SAAP',
    url: 'https://saap.ugr.es/',
    tipo: 'orientacao',
    prioridade: 2,
    autoridade: ['orientacao-admissao'],
    metodo: 'revisao-manual',
    frequenciaHoras: 72,
  },
];

// Únicos domínios que o atualizador pode baixar (inclusive como destino de redirecionamento):
// os das fontes com coleta automática. URLs de fichas vêm do catálogo da UGR, mas são sempre
// montadas sobre masteres.ugr.es; nenhuma URL informada por usuário é coletada.
export const COLLECTION_HOSTS = [...new Set(SOURCE_SEED.filter((s) => s.metodo === 'html-publico').map((s) => new URL(s.url).hostname))];

// Canal oficial onde a candidatura é feita (Estado "abertas" exige canal confirmado).
export const APPLICATION_CHANNEL = {
  'dua-masteres': {
    url: 'https://www.juntadeandalucia.es/economiaconocimientoempresasyuniversidad/sguit/?q=masteres',
    rotulo: 'Portal de másteres do Distrito Único Andaluz',
    fonte: 'dua-calendario',
  },
};

export const UNIVERSITY_INFO = {
  ual: { id: 'ual', sigla: 'UAL', nome: 'Universidad de Almería', cidade: 'Almería', pais: 'Espanha', regiao: 'Andaluzia', procedimentoId: 'dua-masteres', capa: '/img/cities/andaluzia.svg', logo: '/img/universities/ual.png' },
  uca: { id: 'uca', sigla: 'UCA', nome: 'Universidad de Cádiz', cidade: 'Cádiz', pais: 'Espanha', regiao: 'Andaluzia', procedimentoId: 'dua-masteres', capa: '/img/cities/cadiz.svg', logo: '/img/universities/uca.gif' },
  uco: { id: 'uco', sigla: 'UCO', nome: 'Universidad de Córdoba', cidade: 'Córdoba', pais: 'Espanha', regiao: 'Andaluzia', procedimentoId: 'dua-masteres', capa: '/img/cities/cordoba.svg', logo: '/img/universities/uco.jpg' },
  ugr: { id: 'ugr', sigla: 'UGR', nome: 'Universidad de Granada', cidade: 'Granada', pais: 'Espanha', regiao: 'Andaluzia', procedimentoId: 'dua-masteres', capa: '/img/cities/granada.svg', logo: '/img/universities/ugr.jpg' },
  uhu: { id: 'uhu', sigla: 'UHU', nome: 'Universidad de Huelva', cidade: 'Huelva', pais: 'Espanha', regiao: 'Andaluzia', procedimentoId: 'dua-masteres', capa: '/img/cities/andaluzia.svg', logo: '/img/universities/uhu.svg' },
  unia: { id: 'unia', sigla: 'UNIA', nome: 'Universidad Internacional de Andalucía', cidade: 'Sevilla', pais: 'Espanha', regiao: 'Andaluzia', procedimentoId: 'dua-masteres', capa: '/img/cities/andaluzia.svg' },
  ujaen: { id: 'ujaen', sigla: 'UJA', nome: 'Universidad de Jaén', cidade: 'Jaén', pais: 'Espanha', regiao: 'Andaluzia', procedimentoId: 'dua-masteres', capa: '/img/cities/andaluzia.svg', logo: '/img/universities/ujaen.png' },
  uma: { id: 'uma', sigla: 'UMA', nome: 'Universidad de Málaga', cidade: 'Málaga', pais: 'Espanha', regiao: 'Andaluzia', procedimentoId: 'dua-masteres', capa: '/img/cities/malaga.svg', logo: '/img/universities/uma.png' },
  upo: { id: 'upo', sigla: 'UPO', nome: 'Universidad Pablo de Olavide', cidade: 'Sevilla', pais: 'Espanha', regiao: 'Andaluzia', procedimentoId: 'dua-masteres', capa: '/img/cities/sevilla.svg', logo: '/img/universities/upo.png' },
  us: { id: 'us', sigla: 'US', nome: 'Universidad de Sevilla', cidade: 'Sevilla', pais: 'Espanha', regiao: 'Andaluzia', procedimentoId: 'dua-masteres', capa: '/img/cities/sevilla.svg', logo: '/img/universities/us.png' },
};
