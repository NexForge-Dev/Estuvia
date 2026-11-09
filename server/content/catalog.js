// Catálogo piloto. Universidades públicas andaluzas que usam o DUA.
// Os PROGRAMAS são dados demonstrativos (demo: true, fonte DEMO): mostram como regras
// diferentes por programa geram jornadas diferentes. Não use para decisões reais.
//
// RequirementRule estruturada por programa:
//   idioma: { status: 'requerido'|'nao-requerido'|'verificar', nivel?: 'B1'|'B2'|'C1', certificado?: bool, fonte }

export const UNIVERSITIES = [
  { id: 'ugr', sigla: 'UGR', nome: 'Universidad de Granada', cidade: 'Granada', pais: 'Espanha', capa: '/img/cities/granada.svg', logo: '/img/universities/ugr.jpg', url: 'https://www.ugr.es' },
  { id: 'us', sigla: 'US', nome: 'Universidad de Sevilla', cidade: 'Sevilla', pais: 'Espanha', capa: '/img/cities/sevilla.svg', logo: '/img/universities/us.png', url: 'https://www.us.es' },
  { id: 'uma', sigla: 'UMA', nome: 'Universidad de Málaga', cidade: 'Málaga', pais: 'Espanha', capa: '/img/cities/malaga.svg', logo: '/img/universities/uma.png', url: 'https://www.uma.es' },
  { id: 'uco', sigla: 'UCO', nome: 'Universidad de Córdoba', cidade: 'Córdoba', pais: 'Espanha', capa: '/img/cities/cordoba.svg', logo: '/img/universities/uco.jpg', url: 'https://www.uco.es' },
  { id: 'uca', sigla: 'UCA', nome: 'Universidad de Cádiz', cidade: 'Cádiz', pais: 'Espanha', capa: '/img/cities/cadiz.svg', logo: '/img/universities/uca.gif', url: 'https://www.uca.es' },
  { id: 'uhu', sigla: 'UHU', nome: 'Universidad de Huelva', cidade: 'Huelva', pais: 'Espanha', capa: '/img/cities/andaluzia.svg', logo: '/img/universities/uhu.svg', url: 'https://www.uhu.es' },
  { id: 'ujaen', sigla: 'UJA', nome: 'Universidad de Jaén', cidade: 'Jaén', pais: 'Espanha', capa: '/img/cities/andaluzia.svg', logo: '/img/universities/ujaen.png', url: 'https://www.ujaen.es' },
  { id: 'ual', sigla: 'UAL', nome: 'Universidad de Almería', cidade: 'Almería', pais: 'Espanha', capa: '/img/cities/andaluzia.svg', logo: '/img/universities/ual.png', url: 'https://www.ual.es' },
  { id: 'upo', sigla: 'UPO', nome: 'Universidad Pablo de Olavide', cidade: 'Sevilla', pais: 'Espanha', capa: '/img/cities/sevilla.svg', logo: '/img/universities/upo.png', url: 'https://www.upo.es' },
];

const acesso = { tipo: 'acesso', descricao: 'Título universitário que dê acesso à pós-graduação no país emissor', status: 'requerido', fonte: 'O1' };

export const PROGRAMS = [
  {
    id: 'ugr-demo-eng',
    universidadeId: 'ugr',
    nome: 'Mestrado em Engenharia, exemplo A (exige B2)',
    area: 'Engenharia e Arquitetura',
    ciclo: '2026/27',
    duracaoMeses: 12,
    modalidade: 'Presencial',
    url: 'https://masteres.ugr.es/ramas/ingenieria-arquitectura',
    demo: true,
    idioma: { status: 'requerido', nivel: 'B2', certificado: true, fonte: 'DEMO' },
    requisitos: [acesso, { tipo: 'idioma', descricao: 'Espanhol B2 com certificado (exemplo demonstrativo)', status: 'requerido', fonte: 'DEMO' }],
  },
  {
    id: 'ugr-demo-arq',
    universidadeId: 'ugr',
    nome: 'Mestrado em Arquitetura, exemplo B (sem certificado)',
    area: 'Engenharia e Arquitetura',
    ciclo: '2026/27',
    duracaoMeses: 18,
    modalidade: 'Presencial',
    url: 'https://masteres.ugr.es/ramas/ingenieria-arquitectura',
    demo: true,
    idioma: { status: 'nao-requerido', fonte: 'DEMO' },
    requisitos: [acesso, { tipo: 'idioma', descricao: 'Sem exigência de certificado de idioma (exemplo demonstrativo)', status: 'nao-requerido', fonte: 'DEMO' }],
  },
  {
    id: 'ugr-demo-ciencias',
    universidadeId: 'ugr',
    nome: 'Mestrado em Ciências, exemplo C (idioma a confirmar)',
    area: 'Ciências',
    ciclo: '2026/27',
    duracaoMeses: 12,
    modalidade: 'Presencial',
    url: 'https://www.juntadeandalucia.es/economiaconocimientoempresasyuniversidad/sguit/?q=masteres',
    demo: true,
    idioma: { status: 'verificar', fonte: 'O3' },
    requisitos: [acesso, { tipo: 'idioma', descricao: 'Exigência de idioma não confirmada na ficha', status: 'verificar', fonte: 'O3' }],
  },
  {
    id: 'us-demo-adm',
    universidadeId: 'us',
    nome: 'Mestrado em Administração, exemplo D (B1, sem certificado formal)',
    area: 'Ciências Sociais e Jurídicas',
    ciclo: '2026/27',
    duracaoMeses: 12,
    modalidade: 'Presencial',
    url: 'https://www.juntadeandalucia.es/economiaconocimientoempresasyuniversidad/sguit/?q=masteres',
    demo: true,
    idioma: { status: 'requerido', nivel: 'B1', certificado: false, fonte: 'DEMO' },
    requisitos: [acesso, { tipo: 'idioma', descricao: 'Espanhol B1, comprovação sem certificado formal (exemplo demonstrativo)', status: 'requerido', fonte: 'DEMO' }],
  },
  {
    id: 'uma-demo-tur',
    universidadeId: 'uma',
    nome: 'Mestrado em Turismo, exemplo E (idioma a confirmar)',
    area: 'Ciências Sociais e Jurídicas',
    ciclo: '2026/27',
    duracaoMeses: 10,
    modalidade: 'Semipresencial',
    url: 'https://www.juntadeandalucia.es/economiaconocimientoempresasyuniversidad/sguit/?q=masteres',
    demo: true,
    idioma: { status: 'verificar', fonte: 'O3' },
    requisitos: [acesso, { tipo: 'idioma', descricao: 'Exigência de idioma não confirmada na ficha', status: 'verificar', fonte: 'O3' }],
  },
];

// Fontes externas de programas (ex.: Radar de Oportunidades) registradas em tempo de execução,
// sem import direto (evita dependência circular). Programas do catálogo local têm prioridade.
const externalSources = [];
export const registerProgramSource = (fn) => { if (!externalSources.includes(fn)) externalSources.push(fn); };
export const programById = (id) => {
  if (!id) return null;
  const local = PROGRAMS.find((p) => p.id === id);
  if (local) return local;
  for (const fn of externalSources) {
    try { const p = fn(id); if (p) return p; } catch { /* fonte indisponível */ }
  }
  return null;
};
export const universityById = (id) => UNIVERSITIES.find((u) => u.id === id) || null;
