// Regras da comunidade sem efeitos colaterais: análise de links, prevenção de spam, proteção de
// dados pessoais, detecção de duplicatas, relevância e estado efetivo de verificação.
import { community } from './store.js';
import {
  INSTITUTIONAL_DOMAINS, URL_SHORTENERS, RISKY_TLDS, IMPERSONATED_BRANDS, SPAM_TERMS, COMMUNITY_CATEGORIES,
} from './content/community.js';

const today = () => new Date().toISOString().slice(0, 10);

// ---------- Links ----------

export const isInstitutional = (host) => INSTITUTIONAL_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));

// nivel: 'institucional' (domínio conhecido), 'comum', 'atencao' (sem https) ou 'suspeito'.
export function analyzeLink(raw) {
  let url;
  try { url = new URL(raw); } catch { return { url: raw, valido: false, nivel: 'suspeito', motivos: ['Endereço inválido.'] }; }
  if (!['http:', 'https:'].includes(url.protocol)) return { url: raw, valido: false, nivel: 'suspeito', motivos: ['Só são aceitos links http(s).'] };
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const motivos = [];
  if (url.username || url.password) motivos.push('O link esconde o destino real (credenciais na URL).');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) motivos.push('Aponta para um IP, não para um domínio.');
  if (host.split('.').some((label) => label.startsWith('xn--'))) motivos.push('Usa caracteres que imitam letras (punycode).');
  if (URL_SHORTENERS.includes(host)) motivos.push('Encurtador de link: não dá para saber o destino.');
  if (RISKY_TLDS.includes(host.split('.').pop())) motivos.push('Terminação de domínio muito usada em golpes.');
  if (host.split('.').length > 5) motivos.push('Excesso de subdomínios.');
  const institutional = isInstitutional(host);
  const tokens = host.split(/[.-]/);
  if (!institutional && IMPERSONATED_BRANDS.some((b) => tokens.includes(b)) && tokens.length > 2) {
    motivos.push('Usa o nome de um órgão ou universidade, mas não é o domínio oficial.');
  }
  const nivel = motivos.length ? 'suspeito' : institutional ? 'institucional' : url.protocol === 'http:' ? 'atencao' : 'comum';
  if (nivel === 'atencao') motivos.push('Conexão sem https.');
  return { url: url.href, host, valido: true, nivel, motivos };
}

export const extractLinks = (text) => [...new Set(String(text).match(/\bhttps?:\/\/[^\s<>"')\]]+/gi) || [])];

// Normaliza para comparar: sem protocolo, www, barra final, âncora e parâmetros de rastreio.
export function normalizeUrl(raw) {
  try {
    const u = new URL(raw);
    [...u.searchParams.keys()].filter((k) => /^(utm_|fbclid|gclid|ref$)/i.test(k)).forEach((k) => u.searchParams.delete(k));
    const qs = u.searchParams.toString();
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}${qs ? `?${qs}` : ''}`.toLowerCase();
  } catch { return null; }
}

// ---------- Dados pessoais ----------
// Documentos e contatos pessoais são mascarados antes de publicar (LGPD/RGPD).

const PII = [
  { tipo: 'CPF', re: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g },
  { tipo: 'NIE/DNI', re: /\b[XYZ]-?\d{7}-?[A-Z]\b|\b\d{8}-?[A-Z]\b/gi },
  { tipo: 'passaporte', re: /\b[A-Z]{2}\d{6}\b/g },
  { tipo: 'telefone', re: /(?:\+\d{2}\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b|\+34\s?\d{3}\s?\d{3}\s?\d{3}\b/g },
  { tipo: 'e-mail pessoal', re: /\b[\w.+-]+@(?:gmail|hotmail|outlook|yahoo|icloud|live|uol|bol|terra)\.[a-z.]+\b/gi },
];

export function maskPersonalData(text) {
  const encontrados = new Set();
  let out = String(text);
  for (const { tipo, re } of PII) {
    out = out.replace(re, () => {
      encontrados.add(tipo);
      return '[dado pessoal removido]';
    });
  }
  return { texto: out, encontrados: [...encontrados] };
}

// Aplica a máscara em todo texto livre sem tocar nos links (que são analisados à parte).
export function protectText(text) {
  const links = extractLinks(text);
  const placeholders = links.map((_, i) => `\u0000${i}\u0000`);
  let tmp = String(text);
  links.forEach((l, i) => { tmp = tmp.split(l).join(placeholders[i]); });
  const masked = maskPersonalData(tmp);
  links.forEach((l, i) => { masked.texto = masked.texto.split(placeholders[i]).join(l); });
  return masked;
}

// ---------- Spam ----------

export function spamSignals({ texto, links, autor, recentes }) {
  const motivos = [];
  let score = 0;
  const lower = texto.toLowerCase();
  const terms = SPAM_TERMS.filter((t) => new RegExp(`(^|[^\\p{L}])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'u').test(lower));
  if (terms.length) { score += 2 * terms.length; motivos.push(`Termos típicos de spam: ${terms.join(', ')}.`); }
  if (links.length > 3) { score += 2; motivos.push('Muitos links na mesma publicação.'); }
  if (links.some((l) => l.nivel === 'suspeito')) { score += 3; motivos.push('Contém link suspeito.'); }
  const letters = texto.replace(/[^\p{L}]/gu, '');
  if (letters.length > 30 && letters.replace(/[^\p{Lu}]/gu, '').length / letters.length > 0.6) { score += 1; motivos.push('Texto quase todo em maiúsculas.'); }
  if (/(.)\1{7,}/u.test(texto)) { score += 1; motivos.push('Caracteres repetidos em excesso.'); }
  const minutes = (Date.now() - new Date(autor.createdAt).getTime()) / 60000;
  if (minutes < 10 && links.length) { score += 1; motivos.push('Conta muito recente publicando links.'); }
  const repetida = recentes.some((p) => p.texto.trim().toLowerCase() === texto.trim().toLowerCase());
  return { score, motivos, repetida, revisar: score >= 4 };
}

// ---------- Oportunidades ----------

const words = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2);

export function opportunityFingerprint(op) {
  return {
    link: normalizeUrl(op.linkOficial),
    titulo: [...new Set([...words(op.instituicao), ...words(op.titulo)])].sort().join(' '),
  };
}

// Duas oportunidades são a mesma se apontam para o mesmo edital ou têm instituição+título equivalentes.
export function isDuplicate(a, b) {
  if (!a || !b) return false;
  if (a.link && a.link === b.link) return true;
  const wa = new Set(a.titulo.split(' ')); const wb = new Set(b.titulo.split(' '));
  if (wa.size < 3 || wb.size < 3) return false;
  const inter = [...wa].filter((w) => wb.has(w)).length;
  return inter / Math.max(wa.size, wb.size) >= 0.85;
}

// Uma oportunidade verificada com prazo vencido passa a ser exibida como desatualizada.
export function effectiveVerification(post, now = today()) {
  const v = post.verificacao?.status || 'nao-verificada';
  if (v === 'verificada' && post.oportunidade?.prazo && post.oportunidade.prazo < now) {
    return { status: 'desatualizada', automatico: true, motivo: 'O prazo informado já passou.' };
  }
  return { status: v, automatico: false };
}

export const isVerifiable = (post) => post.tipo === 'oportunidade' || post.natureza === 'orientacao-oficial';

// ---------- Relevância ----------
// Engajamento + confiança + proximidade com as jornadas do estudante, com decaimento por idade.
export function relevance(post, { viewer, grupos = [], commentsCount, now = Date.now() }) {
  const ageDays = (now - new Date(post.criadoEm).getTime()) / 86400000;
  const v = effectiveVerification(post).status;
  let score = post.curtidas.length * 2 + commentsCount * 3 + post.salvos.length * 3 + (post.compartilhamentos || 0);
  if (v === 'verificada') score += 12;
  if (v === 'rejeitada') score -= 20;
  if (post.oportunidade?.prazo && post.oportunidade.prazo >= today()) score += 4;
  const unis = new Set((viewer.journeys || []).map((j) => j.universidadeId));
  if (post.local?.universidadeId && unis.has(post.local.universidadeId)) score += 8;
  if (post.grupoId && grupos.includes(post.grupoId)) score += 5;
  score -= (post.denuncias || 0) * 4;
  return (score + 5) * 0.5 ** (ageDays / 4);
}

export const categoryLabel = (id) => COMMUNITY_CATEGORIES[id]?.label || id;

// ---------- Radar ----------
// Contrato consumido pelo Radar (server/radar): oportunidades verificadas pela moderação, publicadas,
// com prazo vigente e sem duplicatas. Independe de quem está vendo; postId é estável.
export function communityRadarFeed() {
  return community.read((c) => {
    const verified = c.posts
      .filter((p) => p.tipo === 'oportunidade' && p.oportunidade.prazo && p.moderacao.estado === 'publicado' && effectiveVerification(p).status === 'verificada')
      .sort((a, b) => (a.verificacao.verificadaEm || '').localeCompare(b.verificacao.verificadaEm || ''));
    const unique = [];
    for (const p of verified) {
      if (!unique.some((u) => isDuplicate(opportunityFingerprint(u.oportunidade), opportunityFingerprint(p.oportunidade)))) unique.push(p);
    }
    return unique.sort((a, b) => a.oportunidade.prazo.localeCompare(b.oportunidade.prazo)).map((p) => ({
      postId: p.id, ...structuredClone(p.oportunidade), categoria: p.categoria, local: { ...p.local }, verificadaEm: p.verificacao.verificadaEm, origem: 'comunidade',
    }));
  });
}
