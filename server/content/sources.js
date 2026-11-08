// Fontes oficiais rastreáveis (RN-09). Toda regra exibida aponta para uma destas fontes.
// revisadoEm = data em que a fonte foi conferida pela equipe editorial.

export const SOURCES = [
  {
    id: 'M',
    orgao: 'Idealizador do projeto',
    titulo: 'Roteiro: Como se inscrever em um Mestrado na Universidad de Granada (UGR)',
    url: null,
    revisadoEm: '2026-10-24',
    tipo: 'manual-base',
  },
  {
    id: 'O1',
    orgao: 'Junta de Andalucía (BOJA)',
    titulo: 'Procedimento DUA 2026/27, fase 1, título estrangeiro',
    url: 'https://www.juntadeandalucia.es/boja/2025/245/50',
    revisadoEm: '2026-10-24',
    tipo: 'oficial',
  },
  {
    id: 'O2',
    orgao: 'Junta de Andalucía (BOJA)',
    titulo: 'Procedimento geral DUA 2026/27',
    url: 'https://www.juntadeandalucia.es/boja/2026/84/46',
    revisadoEm: '2026-10-24',
    tipo: 'oficial',
  },
  {
    id: 'O3',
    orgao: 'Distrito Único Andaluz',
    titulo: 'Requisitos e fases do procedimento',
    url: 'https://www.juntadeandalucia.es/economiaconocimientoempresasyuniversidad/sguit/mo_requisitos_procedimiento.php',
    revisadoEm: '2026-10-24',
    tipo: 'oficial',
  },
  {
    id: 'O4',
    orgao: 'Universidad de Granada',
    titulo: 'Catálogo de másteres (Engenharia e Arquitetura)',
    url: 'https://masteres.ugr.es/ramas/ingenieria-arquitectura',
    revisadoEm: '2026-10-24',
    tipo: 'oficial',
  },
  {
    id: 'O5',
    orgao: 'Distrito Único Andaluz',
    titulo: 'Portal de másteres',
    url: 'https://www.juntadeandalucia.es/economiaconocimientoempresasyuniversidad/sguit/?q=masteres',
    revisadoEm: '2026-10-24',
    tipo: 'oficial',
  },
  {
    id: 'O6',
    orgao: 'Ministerio de Inclusión, Seguridad Social y Migraciones',
    titulo: 'Estancia por estudios / TIE',
    url: 'https://inclusion.gob.es/web/migraciones/w/estancia-por-estudios',
    revisadoEm: '2026-10-24',
    tipo: 'oficial',
  },
  {
    id: 'O7',
    orgao: 'Consulado da Espanha em Salvador',
    titulo: 'Visto nacional de estudos',
    url: 'https://www.exteriores.gob.es/Consulados/salvadordebahia/es/ServiciosConsulares/Paginas/index.aspx?scca=Visados&scco=Brasil&scd=250&scs=Visados+Nacionales+-+Visado+de+estudios',
    revisadoEm: '2026-10-24',
    tipo: 'oficial',
  },
  {
    id: 'O8',
    orgao: 'Junta de Andalucía',
    titulo: 'Portal do Distrito Único Andaluz (Acceso a la Universidad)',
    // O link curto informado pelo idealizador (https://lajunta.es/portaldua) foi conferido em
    // 28/10/2026: responde HTTP 307 (redirecionamento TEMPORÁRIO) para esta página oficial, cujo
    // título é "Distrito Único Andaluz". Usamos o endereço de destino, não o encurtador.
    url: 'https://www.juntadeandalucia.es/economiaconocimientoempresasyuniversidad/sguit',
    linkCurto: 'https://lajunta.es/portaldua',
    revisadoEm: '2026-10-28',
    tipo: 'oficial',
  },
  {
    id: 'O9',
    orgao: 'Universidad de Granada',
    titulo: 'Diretório oficial de pessoal da UGR',
    url: 'https://directorio.ugr.es/',
    revisadoEm: '2026-10-24',
    tipo: 'oficial',
  },
  {
    id: 'O10',
    orgao: 'Universidad de Granada',
    titulo: 'Portal de másteres da UGR',
    url: 'https://masteres.ugr.es/',
    revisadoEm: '2026-10-24',
    tipo: 'oficial',
  },
  {
    id: 'O11',
    orgao: 'Consulado Geral da Espanha em Salvador da Bahia',
    titulo: 'Site oficial do consulado',
    url: 'https://www.exteriores.gob.es/Consulados/salvadordebahia',
    // Endereço, telefone e e-mail de vistos conferidos em 28/10/2026 na página oficial
    // "Horario, localización y contacto" (exteriores.gob.es).
    revisadoEm: '2026-10-28',
    tipo: 'oficial',
  },
  {
    id: 'O12',
    orgao: 'AUIP: Asociación Universitaria Iberoamericana de Postgrado',
    titulo: 'Programas de bolsas da AUIP (incl. Programa Federico García Lorca)',
    url: 'https://auip.org/',
    revisadoEm: '2026-10-24',
    tipo: 'oficial',
  },
  {
    id: 'O13',
    orgao: 'Fundación Carolina',
    titulo: 'Bolsas de pós-graduação da Fundación Carolina',
    url: 'https://www.fundacioncarolina.es/',
    revisadoEm: '2026-10-24',
    tipo: 'oficial',
  },
  {
    id: 'O14',
    orgao: 'Comissão Europeia (EACEA)',
    titulo: 'Catálogo de mestrados Erasmus Mundus',
    url: 'https://www.eacea.ec.europa.eu/scholarships/erasmus-mundus-catalogue_en',
    revisadoEm: '2026-10-24',
    tipo: 'oficial',
  },
  // Custo de vida: só o que tem fonte institucional. As páginas não trazem data de atualização.
  {
    id: 'O15',
    orgao: 'Universidad de Granada',
    titulo: 'Living in Granada, custos aproximados (quarto em apartamento compartilhado: €200–300/mês)',
    url: 'https://www.ugr.es/en/study/living-in-granada',
    revisadoEm: '2026-10-24',
    tipo: 'oficial',
  },
  {
    id: 'O16',
    orgao: 'Universidad de Granada: Vicerrectorado de Internacionalización',
    titulo: 'Accommodation, quarto em apartamento compartilhado: €300–350/mês; contas geralmente à parte',
    url: 'https://internacional.ugr.es/en/students/ugr-services/acommodation',
    revisadoEm: '2026-10-24',
    tipo: 'oficial',
  },
  {
    id: 'O17',
    orgao: 'INE: Instituto Nacional de Estadística',
    titulo: 'Encuesta de Presupuestos Familiares 2024 (gasto médio por pessoa: €13.626/ano; alimentos e bebidas não alcoólicas: 15,8%)',
    url: 'https://ine.es/dyngs/Prensa/EPF2024.htm',
    revisadoEm: '2026-10-24',
    tipo: 'oficial',
  },
  // ---------- Carteira de documentos (links conferidos em 27/10/2026) ----------
  { id: 'O18', orgao: 'Conselho Nacional de Justiça (CNJ)', titulo: 'Apostila da Haia, o que é e onde providenciar', url: 'https://www.cnj.jus.br/poder-judiciario/relacoes-internacionais/apostila-da-haia/', revisadoEm: '2026-10-27', tipo: 'oficial' },
  { id: 'O19', orgao: 'Policía Nacional (Espanha)', titulo: 'Sede eletrônica, trâmites de documentação de estrangeiros (TIE)', url: 'https://sede.policia.gob.es/', revisadoEm: '2026-10-27', tipo: 'oficial' },
  { id: 'O20', orgao: 'Governo da Espanha: Administración Electrónica', titulo: 'Cita previa para trâmites de estrangeiros (ICP)', url: 'https://icp.administracionelectronica.gob.es/icpplus/index.html', revisadoEm: '2026-10-27', tipo: 'oficial' },
  { id: 'O21', orgao: 'Ministerio de Asuntos Exteriores (Espanha)', titulo: 'Portal oficial, consulados e serviços consulares', url: 'https://www.exteriores.gob.es/', revisadoEm: '2026-10-27', tipo: 'oficial' },
  { id: 'O22', orgao: 'Governo Federal (gov.br): Polícia Federal', titulo: 'Emitir certidão de antecedentes criminais', url: 'https://www.gov.br/pt-br/servicos/emitir-certidao-de-antecedentes-criminais', revisadoEm: '2026-10-27', tipo: 'oficial' },
  { id: 'O23', orgao: 'Governo Federal (gov.br): Polícia Federal', titulo: 'Obter passaporte comum para brasileiro', url: 'https://www.gov.br/pt-br/servicos/obter-passaporte-comum-para-brasileiro', revisadoEm: '2026-10-27', tipo: 'oficial' },
  { id: 'O24', orgao: 'Ministerio de Asuntos Exteriores (Espanha)', titulo: 'Tradutores e intérpretes juramentados (traductores jurados)', url: 'https://www.exteriores.gob.es/es/ServiciosAlCiudadano/Paginas/Traductores-Interpretes-Jurados.aspx', revisadoEm: '2026-10-27', tipo: 'oficial' },
  { id: 'O25', orgao: 'Seguridad Social (Espanha)', titulo: 'Portal da Seguridad Social, número de afiliação (NUSS)', url: 'https://www.seg-social.es/', revisadoEm: '2026-10-27', tipo: 'oficial' },
  { id: 'O26', orgao: 'Receita Federal (gov.br)', titulo: 'Meu CPF', url: 'https://www.gov.br/receitafederal/pt-br/assuntos/meu-cpf', revisadoEm: '2026-10-27', tipo: 'oficial' },
  { id: 'O27', orgao: 'Ministério da Saúde (gov.br)', titulo: 'Vacinação', url: 'https://www.gov.br/saude/pt-br/vacinacao', revisadoEm: '2026-10-27', tipo: 'oficial' },
  {
    id: 'DEMO',
    orgao: 'Plataforma (protótipo)',
    titulo: 'Dados demonstrativos, não usar para decisões reais',
    url: null,
    revisadoEm: '2026-10-24',
    tipo: 'demo',
  },
];

export const sourceById = (id) => SOURCES.find((s) => s.id === id) || null;

// Etiquetas obrigatórias de conteúdo (seção 2.3 do documento de visão).
export const TAGS = {
  verificado: { label: 'Fonte oficial verificada', tone: 'ok' },
  pratica: { label: 'Orientação prática', tone: 'info' },
  estimativa: { label: 'Estimativa', tone: 'warn' },
  pendente: { label: 'Pendente de confirmação', tone: 'pending' },
};
