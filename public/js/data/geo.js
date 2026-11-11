// Países e divisões administrativas usados no onboarding e no perfil.
// Sem API externa: nomes de países vêm do próprio navegador/Node (Intl.DisplayNames, dados CLDR) e as
// divisões são listas oficiais estáticas. Módulo puro: importado pelo frontend e pelo servidor.
//
// Contrato com o motor (server/journey-engine.js, document-engine.js, places.js):
//   - paisResidencia/nacionalidade guardam o NOME do país em português ("Brasil"), como sempre guardaram.
//   - no Brasil, `estado` guarda a SIGLA da UF ("BA"): é ela que escolhe o consulado (places.js).
//   - nos demais países, `estado` guarda o nome da divisão (ex.: "Granada", "Jalisco").

// ISO 3166-1 alfa-2 (países e territórios com código atribuído).
export const COUNTRY_CODES = [
  'AD', 'AE', 'AF', 'AG', 'AL', 'AM', 'AO', 'AR', 'AT', 'AU', 'AZ', 'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BN', 'BO', 'BR', 'BS', 'BT', 'BW', 'BY', 'BZ',
  'CA', 'CD', 'CF', 'CG', 'CH', 'CI', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE', 'EG', 'ER', 'ES', 'ET',
  'FI', 'FJ', 'FM', 'FR', 'GA', 'GB', 'GD', 'GE', 'GH', 'GM', 'GN', 'GQ', 'GR', 'GT', 'GW', 'GY', 'HK', 'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IN', 'IQ', 'IR',
  'IS', 'IT', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA',
  'MC', 'MD', 'ME', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MR', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA', 'NE', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NZ',
  'OM', 'PA', 'PE', 'PG', 'PH', 'PK', 'PL', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SI', 'SK', 'SL', 'SM',
  'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SY', 'SZ', 'TD', 'TG', 'TH', 'TJ', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'US', 'UY', 'UZ', 'VA',
  'VC', 'VE', 'VN', 'VU', 'WS', 'XK', 'YE', 'ZA', 'ZM', 'ZW',
];

// Público principal da Estuvia primeiro (lusófonos e América Latina), depois o resto em ordem alfabética.
export const PRIORITY_COUNTRIES = ['BR', 'PT', 'AO', 'MZ', 'CV', 'AR', 'CO', 'MX', 'CL', 'PE', 'UY', 'PY', 'BO', 'EC', 'VE', 'US', 'ES'];

let names = null;
function displayNames() {
  if (names) return names;
  try { names = new Intl.DisplayNames(['pt-BR'], { type: 'region' }); } catch { names = { of: (c) => c }; }
  return names;
}

export const countryName = (code) => {
  try { return displayNames().of(code) || code; } catch { return code; }
};

let cache = null;
/** [{ code, nome }] ordenado em pt-BR. */
export function countries() {
  if (cache) return cache;
  const collator = new Intl.Collator('pt-BR');
  cache = COUNTRY_CODES.map((code) => ({ code, nome: countryName(code) })).sort((a, b) => collator.compare(a.nome, b.nome));
  return cache;
}

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

// Valores antigos do campo livre de nacionalidade (ex.: "Brasileira") → país.
const LEGACY_NATIONALITY = {
  brasileira: 'BR', brasileiro: 'BR', portuguesa: 'PT', portugues: 'PT', angolana: 'AO', angolano: 'AO', mocambicana: 'MZ', mocambicano: 'MZ',
  argentina: 'AR', argentino: 'AR', colombiana: 'CO', colombiano: 'CO', mexicana: 'MX', mexicano: 'MX', chilena: 'CL', chileno: 'CL',
  peruana: 'PE', peruano: 'PE', uruguaia: 'UY', uruguaio: 'UY', paraguaia: 'PY', paraguaio: 'PY', boliviana: 'BO', boliviano: 'BO',
  equatoriana: 'EC', equatoriano: 'EC', venezuelana: 'VE', venezuelano: 'VE', espanhola: 'ES', espanhol: 'ES', italiana: 'IT', italiano: 'IT',
};

/** Código ISO a partir do nome guardado no perfil (aceita valores antigos). null se não reconhecer. */
export function countryCode(value) {
  const f = fold(value);
  if (!f) return null;
  if (/^bra[sz]il$/.test(f)) return 'BR';
  if (LEGACY_NATIONALITY[f]) return LEGACY_NATIONALITY[f];
  return countries().find((c) => fold(c.nome) === f || c.code.toLowerCase() === f)?.code || null;
}

// ---------- Divisões administrativas ----------
// value: o que fica salvo em profile.estado (≤ 40 caracteres). group: agrupamento opcional na lista.
const list = (arr) => arr.map((nome) => ({ value: nome, label: nome }));

const BR = [
  ['AC', 'Acre'], ['AL', 'Alagoas'], ['AP', 'Amapá'], ['AM', 'Amazonas'], ['BA', 'Bahia'], ['CE', 'Ceará'], ['DF', 'Distrito Federal'],
  ['ES', 'Espírito Santo'], ['GO', 'Goiás'], ['MA', 'Maranhão'], ['MT', 'Mato Grosso'], ['MS', 'Mato Grosso do Sul'], ['MG', 'Minas Gerais'],
  ['PA', 'Pará'], ['PB', 'Paraíba'], ['PR', 'Paraná'], ['PE', 'Pernambuco'], ['PI', 'Piauí'], ['RJ', 'Rio de Janeiro'], ['RN', 'Rio Grande do Norte'],
  ['RS', 'Rio Grande do Sul'], ['RO', 'Rondônia'], ['RR', 'Roraima'], ['SC', 'Santa Catarina'], ['SP', 'São Paulo'], ['SE', 'Sergipe'], ['TO', 'Tocantins'],
];
export const BR_UFS = BR.map(([uf]) => uf);

const ES_PROVINCES = {
  'Andalucía': ['Almería', 'Cádiz', 'Córdoba', 'Granada', 'Huelva', 'Jaén', 'Málaga', 'Sevilla'],
  'Aragón': ['Huesca', 'Teruel', 'Zaragoza'],
  'Principado de Asturias': ['Asturias'],
  'Illes Balears': ['Illes Balears'],
  'Canarias': ['Las Palmas', 'Santa Cruz de Tenerife'],
  'Cantabria': ['Cantabria'],
  'Castilla-La Mancha': ['Albacete', 'Ciudad Real', 'Cuenca', 'Guadalajara', 'Toledo'],
  'Castilla y León': ['Ávila', 'Burgos', 'León', 'Palencia', 'Salamanca', 'Segovia', 'Soria', 'Valladolid', 'Zamora'],
  'Cataluña': ['Barcelona', 'Girona', 'Lleida', 'Tarragona'],
  'Comunitat Valenciana': ['Alicante', 'Castellón', 'Valencia'],
  'Extremadura': ['Badajoz', 'Cáceres'],
  'Galicia': ['A Coruña', 'Lugo', 'Ourense', 'Pontevedra'],
  'Comunidad de Madrid': ['Madrid'],
  'Región de Murcia': ['Murcia'],
  'Comunidad Foral de Navarra': ['Navarra'],
  'País Vasco': ['Álava', 'Bizkaia', 'Gipuzkoa'],
  'La Rioja': ['La Rioja'],
  'Ciudades autónomas': ['Ceuta', 'Melilla'],
};

export const DIVISIONS = {
  BR: { rotulo: 'Estado', options: BR.map(([uf, nome]) => ({ value: uf, label: `${nome} (${uf})` })) },
  ES: { rotulo: 'Província', ajuda: 'Agrupadas por comunidade autônoma.', options: Object.entries(ES_PROVINCES).flatMap(([group, provs]) => provs.map((p) => ({ value: p, label: p, group }))) },
  PT: { rotulo: 'Distrito ou região autónoma', options: list(['Aveiro', 'Beja', 'Braga', 'Bragança', 'Castelo Branco', 'Coimbra', 'Évora', 'Faro', 'Guarda', 'Leiria', 'Lisboa', 'Portalegre', 'Porto', 'Santarém', 'Setúbal', 'Viana do Castelo', 'Vila Real', 'Viseu', 'Região Autónoma dos Açores', 'Região Autónoma da Madeira']) },
  US: { rotulo: 'Estado', options: list(['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming']) },
  MX: { rotulo: 'Estado', options: list(['Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua', 'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Estado de México', 'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas']) },
  AR: { rotulo: 'Província', options: list(['Buenos Aires', 'Catamarca', 'Chaco', 'Chubut', 'Ciudad Autónoma de Buenos Aires', 'Córdoba', 'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán']) },
  CO: { rotulo: 'Departamento', options: list(['Amazonas', 'Antioquia', 'Arauca', 'Atlántico', 'Bogotá D.C.', 'Bolívar', 'Boyacá', 'Caldas', 'Caquetá', 'Casanare', 'Cauca', 'Cesar', 'Chocó', 'Córdoba', 'Cundinamarca', 'Guainía', 'Guaviare', 'Huila', 'La Guajira', 'Magdalena', 'Meta', 'Nariño', 'Norte de Santander', 'Putumayo', 'Quindío', 'Risaralda', 'San Andrés y Providencia', 'Santander', 'Sucre', 'Tolima', 'Valle del Cauca', 'Vaupés', 'Vichada']) },
  CL: { rotulo: 'Região', options: list(['Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo', 'Valparaíso', 'Región Metropolitana de Santiago', "O'Higgins", 'Maule', 'Ñuble', 'Biobío', 'La Araucanía', 'Los Ríos', 'Los Lagos', 'Aysén', 'Magallanes']) },
  PE: { rotulo: 'Região', options: list(['Amazonas', 'Áncash', 'Apurímac', 'Arequipa', 'Ayacucho', 'Cajamarca', 'Callao', 'Cusco', 'Huancavelica', 'Huánuco', 'Ica', 'Junín', 'La Libertad', 'Lambayeque', 'Lima', 'Loreto', 'Madre de Dios', 'Moquegua', 'Pasco', 'Piura', 'Puno', 'San Martín', 'Tacna', 'Tumbes', 'Ucayali']) },
  UY: { rotulo: 'Departamento', options: list(['Artigas', 'Canelones', 'Cerro Largo', 'Colonia', 'Durazno', 'Flores', 'Florida', 'Lavalleja', 'Maldonado', 'Montevideo', 'Paysandú', 'Río Negro', 'Rivera', 'Rocha', 'Salto', 'San José', 'Soriano', 'Tacuarembó', 'Treinta y Tres']) },
  PY: { rotulo: 'Departamento', options: list(['Asunción', 'Alto Paraguay', 'Alto Paraná', 'Amambay', 'Boquerón', 'Caaguazú', 'Caazapá', 'Canindeyú', 'Central', 'Concepción', 'Cordillera', 'Guairá', 'Itapúa', 'Misiones', 'Ñeembucú', 'Paraguarí', 'Presidente Hayes', 'San Pedro']) },
  BO: { rotulo: 'Departamento', options: list(['Beni', 'Chuquisaca', 'Cochabamba', 'La Paz', 'Oruro', 'Pando', 'Potosí', 'Santa Cruz', 'Tarija']) },
  EC: { rotulo: 'Província', options: list(['Azuay', 'Bolívar', 'Cañar', 'Carchi', 'Chimborazo', 'Cotopaxi', 'El Oro', 'Esmeraldas', 'Galápagos', 'Guayas', 'Imbabura', 'Loja', 'Los Ríos', 'Manabí', 'Morona Santiago', 'Napo', 'Orellana', 'Pastaza', 'Pichincha', 'Santa Elena', 'Santo Domingo de los Tsáchilas', 'Sucumbíos', 'Tungurahua', 'Zamora Chinchipe']) },
  VE: { rotulo: 'Estado', options: list(['Amazonas', 'Anzoátegui', 'Apure', 'Aragua', 'Barinas', 'Bolívar', 'Carabobo', 'Cojedes', 'Delta Amacuro', 'Distrito Capital', 'Falcón', 'Guárico', 'La Guaira', 'Lara', 'Mérida', 'Miranda', 'Monagas', 'Nueva Esparta', 'Portuguesa', 'Sucre', 'Táchira', 'Trujillo', 'Yaracuy', 'Zulia']) },
  CA: { rotulo: 'Província ou território', options: list(['Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador', 'Nova Scotia', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan', 'Northwest Territories', 'Nunavut', 'Yukon']) },
  IT: { rotulo: 'Região', options: list(['Abruzzo', 'Basilicata', 'Calabria', 'Campania', 'Emilia-Romagna', 'Friuli-Venezia Giulia', 'Lazio', 'Liguria', 'Lombardia', 'Marche', 'Molise', 'Piemonte', 'Puglia', 'Sardegna', 'Sicilia', 'Toscana', 'Trentino-Alto Adige', 'Umbria', "Valle d'Aosta", 'Veneto']) },
  DE: { rotulo: 'Estado', options: list(['Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg', 'Hessen', 'Mecklenburg-Vorpommern', 'Niedersachsen', 'Nordrhein-Westfalen', 'Rheinland-Pfalz', 'Saarland', 'Sachsen', 'Sachsen-Anhalt', 'Schleswig-Holstein', 'Thüringen']) },
  FR: { rotulo: 'Região', options: list(['Auvergne-Rhône-Alpes', 'Bourgogne-Franche-Comté', 'Bretagne', 'Centre-Val de Loire', 'Corse', 'Grand Est', 'Hauts-de-France', 'Île-de-France', 'Normandie', 'Nouvelle-Aquitaine', 'Occitanie', 'Pays de la Loire', "Provence-Alpes-Côte d'Azur", 'Guadeloupe', 'Martinique', 'Guyane', 'La Réunion', 'Mayotte']) },
};

/** Divisões do país (nome salvo no perfil ou código ISO); null quando não há lista relevante. */
export function divisionsFor(country) {
  const code = country && country.length === 2 && country === country.toUpperCase() ? country : countryCode(country);
  return (code && DIVISIONS[code]) || null;
}

export function divisionLabel(country, value) {
  if (!value) return '';
  const d = divisionsFor(country);
  return d?.options.find((o) => o.value === value)?.label || value;
}
