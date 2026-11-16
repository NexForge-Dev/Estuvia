// Universidades públicas andaluzas que usam o DUA.
// Os mestrados vêm do Radar (fichas oficiais do Distrito Único Andaluz), registrado como fonte de
// programas em server/routes/journey.js. Não há programas locais nem dados demonstrativos.
//
// RequirementRule estruturada por programa (formato de programForJourney, server/radar/service.js):
//   idioma: { status: 'requerido'|'nao-requerido'|'verificar', nivel?: 'B1'|'B2'|'C1', certificado?: bool, fonte }

export const UNIVERSITIES = [
  { id: 'ugr', sigla: 'UGR', nome: 'Universidad de Granada', cidade: 'Granada', pais: 'Espanha', capa: '/img/universities/campus/ugr.jpg', logo: '/img/universities/ugr.jpg', url: 'https://www.ugr.es' },
  { id: 'us', sigla: 'US', nome: 'Universidad de Sevilla', cidade: 'Sevilla', pais: 'Espanha', capa: '/img/universities/campus/us.jpg', logo: '/img/universities/us.png', url: 'https://www.us.es' },
  { id: 'uma', sigla: 'UMA', nome: 'Universidad de Málaga', cidade: 'Málaga', pais: 'Espanha', capa: '/img/universities/campus/uma.jpg', logo: '/img/universities/uma.png', url: 'https://www.uma.es' },
  { id: 'uco', sigla: 'UCO', nome: 'Universidad de Córdoba', cidade: 'Córdoba', pais: 'Espanha', capa: '/img/universities/campus/uco.jpg', logo: '/img/universities/uco.jpg', url: 'https://www.uco.es' },
  { id: 'uca', sigla: 'UCA', nome: 'Universidad de Cádiz', cidade: 'Cádiz', pais: 'Espanha', capa: '/img/universities/campus/uca.jpg', logo: '/img/universities/uca.gif', url: 'https://www.uca.es' },
  { id: 'uhu', sigla: 'UHU', nome: 'Universidad de Huelva', cidade: 'Huelva', pais: 'Espanha', capa: '/img/universities/campus/uhu.jpg', logo: '/img/universities/uhu.svg', url: 'https://www.uhu.es' },
  { id: 'ujaen', sigla: 'UJA', nome: 'Universidad de Jaén', cidade: 'Jaén', pais: 'Espanha', capa: '/img/universities/campus/ujaen.jpg', logo: '/img/universities/ujaen.png', url: 'https://www.ujaen.es' },
  { id: 'ual', sigla: 'UAL', nome: 'Universidad de Almería', cidade: 'Almería', pais: 'Espanha', capa: '/img/universities/campus/ual.jpg', logo: '/img/universities/ual.png', url: 'https://www.ual.es' },
  { id: 'upo', sigla: 'UPO', nome: 'Universidad Pablo de Olavide', cidade: 'Sevilla', pais: 'Espanha', capa: '/img/universities/campus/upo.jpg', logo: '/img/universities/upo.png', url: 'https://www.upo.es' },
  // Sede em Sevilla; os mestrados acontecem também nas sedes de Baeza, La Rábida (Huelva) e Málaga: confira na ficha.
  { id: 'unia', sigla: 'UNIA', nome: 'Universidad Internacional de Andalucía', cidade: 'Sevilla', pais: 'Espanha', capa: '/img/universities/campus/unia.jpg', url: 'https://www.unia.es' },
];

// Fontes de programas (o Radar) registradas em tempo de execução, sem import direto (evita dependência circular).
const externalSources = [];
export const registerProgramSource = (fn) => { if (!externalSources.includes(fn)) externalSources.push(fn); };
export const programById = (id) => {
  if (!id) return null;
  for (const fn of externalSources) {
    try { const p = fn(id); if (p) return p; } catch { /* fonte indisponível */ }
  }
  return null;
};
export const universityById = (id) => UNIVERSITIES.find((u) => u.id === id) || null;
