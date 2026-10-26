// Comunidade colaborativa: categorias, estados de verificação, grupos iniciais e listas
// usadas na análise de links. Conteúdo editorial — versionado em código como o resto de content/.
import { SOURCES } from './sources.js';
import { UNIVERSITIES } from './catalog.js';
import { SCHOLARSHIPS } from './scholarships.js';

export const COMMUNITY_CATEGORIES = {
  'vagas-mestrado': { label: 'Vagas de mestrado e oportunidades acadêmicas', curto: 'Mestrados', icone: 'cap', sensivel: false },
  bolsas: { label: 'Bolsas de estudo', curto: 'Bolsas', icone: 'trophy', sensivel: false },
  'estagios-empregos': { label: 'Estágios e empregos', curto: 'Estágios e empregos', icone: 'target', sensivel: false },
  moradia: { label: 'Moradia e alojamento', curto: 'Moradia', icone: 'home', sensivel: false },
  'documentacao-vistos': { label: 'Documentação e vistos', curto: 'Docs e vistos', icone: 'passport', sensivel: true },
  'custo-de-vida': { label: 'Economia e custo de vida', curto: 'Custo de vida', icone: 'euro', sensivel: true },
  experiencias: { label: 'Experiências e dúvidas de estudantes', curto: 'Experiências', icone: 'chat', sensivel: false },
};

// Natureza da informação: relato pessoal nunca é apresentado como orientação oficial.
export const NATURE = {
  'relato-pessoal': { label: 'Relato pessoal', descricao: 'Experiência de quem publicou. Pode não valer para o seu caso.' },
  duvida: { label: 'Dúvida', descricao: 'Pergunta para a comunidade.' },
  dica: { label: 'Dica da comunidade', descricao: 'Sugestão prática, sem valor oficial.' },
  'orientacao-oficial': { label: 'Baseado em fonte oficial', descricao: 'Resume uma fonte oficial citada. Só é tratado como oficial depois da verificação.' },
};

// Estados de verificação de oportunidades e orientações oficiais.
export const VERIFICATION = {
  'nao-verificada': { label: 'Não verificada', descricao: 'Compartilhada pela comunidade. Ninguém conferiu ainda.' },
  'em-verificacao': { label: 'Em verificação', descricao: 'A equipe está conferindo link oficial, requisitos e datas.' },
  verificada: { label: 'Verificada', descricao: 'Conferida pela equipe na fonte oficial. Pode alimentar o Radar.' },
  desatualizada: { label: 'Informação desatualizada', descricao: 'O prazo passou ou o edital mudou. Confirme na fonte oficial.' },
  rejeitada: { label: 'Rejeitada', descricao: 'Não foi possível confirmar, é duplicada ou contém informação incorreta.' },
};

// Transições permitidas para a moderação (o estudante só pode pedir verificação).
export const VERIFICATION_FLOW = {
  'nao-verificada': ['em-verificacao', 'rejeitada'],
  'em-verificacao': ['verificada', 'rejeitada', 'nao-verificada'],
  verificada: ['desatualizada', 'em-verificacao'],
  desatualizada: ['em-verificacao', 'rejeitada'],
  rejeitada: ['em-verificacao'],
};

export const REPORT_REASONS = {
  spam: 'Spam ou propaganda',
  'link-suspeito': 'Link suspeito ou golpe',
  'dados-pessoais': 'Expõe dados pessoais',
  'informacao-falsa': 'Informação falsa ou enganosa',
  desatualizada: 'Informação desatualizada',
  ofensivo: 'Conteúdo ofensivo',
  outro: 'Outro motivo',
};

// Grupos iniciais (por universidade, cidade ou país). Estudantes podem criar outros.
export const SEED_GROUPS = [
  { id: 'brasileiros-na-ugr', nome: 'Brasileiros na UGR', tipo: 'universidade', universidadeId: 'ugr', cidade: 'Granada', pais: 'Espanha', descricao: 'Quem estuda, foi admitido ou quer estudar na Universidad de Granada.' },
  { id: 'estudantes-em-granada', nome: 'Estudantes em Granada', tipo: 'cidade', cidade: 'Granada', pais: 'Espanha', descricao: 'Moradia, transporte, custo de vida e vida estudantil em Granada.' },
  { id: 'bolsas-na-espanha', nome: 'Bolsas na Espanha', tipo: 'pais', pais: 'Espanha', categoria: 'bolsas', descricao: 'Editais e experiências com bolsas para estudar na Espanha.' },
  { id: 'estudantes-em-sevilla', nome: 'Estudantes em Sevilla', tipo: 'cidade', cidade: 'Sevilla', pais: 'Espanha', descricao: 'Para quem vai para a US ou a UPO.' },
  { id: 'brasileiros-na-uma', nome: 'Brasileiros na UMA', tipo: 'universidade', universidadeId: 'uma', cidade: 'Málaga', pais: 'Espanha', descricao: 'Comunidade da Universidad de Málaga.' },
];

// Domínios institucionais conhecidos. Um link para eles NÃO torna a publicação oficial:
// só indica que a moderação tem uma fonte primária para conferir.
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; } };
const rootDomain = (host) => host.split('.').slice(-2).join('.');
export const INSTITUTIONAL_DOMAINS = [...new Set([
  ...[...SOURCES, ...UNIVERSITIES, ...SCHOLARSHIPS].map((s) => s.url && hostOf(s.url)).filter(Boolean)
    .map((host) => (host.endsWith('.gob.es') || host.endsWith('.europa.eu') ? host : rootDomain(host))),
  'gob.es', 'boe.es', 'juntadeandalucia.es', 'lajunta.es', 'sepie.es', 'europa.eu', 'gov.br', 'capes.gov.br', 'cnpq.br',
])];

export const URL_SHORTENERS = ['bit.ly', 'tinyurl.com', 't.co', 'cutt.ly', 'encurtador.com.br', 'rb.gy', 'is.gd', 'ow.ly', 'shorturl.at', 'tiny.cc', 'goo.gl', 'linktr.ee'];
export const RISKY_TLDS = ['zip', 'mov', 'xyz', 'top', 'click', 'link', 'work', 'loan', 'gq', 'tk', 'ml', 'cf'];
// Marcas que golpistas costumam imitar (ex.: "ugr-matricula.com", "visto-gob-es.net").
export const IMPERSONATED_BRANDS = ['ugr', 'uma', 'us', 'gob', 'exteriores', 'consulado', 'visado', 'visto', 'junta', 'dua', 'carolina', 'auip', 'erasmus'];

export const SPAM_TERMS = [
  'visto garantido', 'aprovação garantida', 'aprovacao garantida', '100% aprovado', 'ganhe dinheiro', 'renda extra',
  'clique aqui', 'chama no whats', 'chama no zap', 'me chama no privado', 'pix', 'promoção imperdível', 'vagas limitadas, corra',
  'assessoria garantida', 'compre seguidores',
];
