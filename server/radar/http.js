// Coleta HTTP "educada": identifica-se, respeita robots.txt, limita a taxa por domínio,
// tem timeout e nunca envia credenciais nem tenta contornar bloqueios (401/403/429 = parar).

const USER_AGENT = 'EstuviaRadar/0.1 (monitoramento de calendarios academicos oficiais)';
const TIMEOUT_MS = 20000;
const MIN_INTERVAL_MS = 4000; // entre requisições ao mesmo domínio
const ROBOTS_TTL_MS = 12 * 3600 * 1000;

const lastHit = new Map();
const robotsCache = new Map();

export class FetchError extends Error {
  constructor(message, { status, blocked } = {}) {
    super(message);
    this.status = status;
    this.blocked = Boolean(blocked);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function throttle(host) {
  const wait = (lastHit.get(host) || 0) + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
}

function decode(buffer, contentType) {
  let charset = /charset=([\w-]+)/i.exec(contentType || '')?.[1];
  if (!charset) {
    const head = new TextDecoder('latin1').decode(buffer.slice(0, 2048));
    charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  }
  const label = /^(iso-8859-1|latin1|windows-1252)$/i.test(charset || '') ? 'windows-1252' : 'utf-8';
  return new TextDecoder(label).decode(buffer);
}

// Interpretação mínima de robots.txt (grupo "*"): Disallow por prefixo, com suporte a "*" e "$".
export function robotsAllows(robotsTxt, url) {
  const { pathname, search } = new URL(url);
  const target = pathname + search;
  let inStar = false;
  const rules = [];
  for (const line of String(robotsTxt).split(/\r?\n/)) {
    const [k, ...rest] = line.split(':');
    const key = k.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') inStar = value === '*';
    else if (inStar && (key === 'disallow' || key === 'allow') && value) rules.push({ allow: key === 'allow', value });
  }
  const toRegex = (v) => new RegExp(`^${v.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')}`);
  let best = null;
  for (const r of rules) {
    if (toRegex(r.value).test(target) && (!best || r.value.length > best.value.length)) best = r;
  }
  return !best || best.allow;
}

async function robotsFor(origin, fetchImpl) {
  const cached = robotsCache.get(origin);
  if (cached && Date.now() - cached.at < ROBOTS_TTL_MS) return cached.text;
  let text = '';
  try {
    const res = await fetchImpl(`${origin}/robots.txt`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.ok) text = await res.text();
  } catch { /* sem robots.txt acessível: seguimos com cautela (sem regras) */ }
  robotsCache.set(origin, { text, at: Date.now() });
  return text;
}

/**
 * Baixa uma página pública. Retorna { url, status, text, contentType, fetchedAt, etag, lastModified }.
 * Com "validadores" (ETag / Last-Modified da coleta anterior) faz uma requisição condicional:
 * se a página não mudou, o servidor responde 304 e devolvemos { naoModificada: true } sem baixar o conteúdo.
 */
export async function politeFetch(url, { fetchImpl = fetch, validadores = null } = {}) {
  const u = new URL(url);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new FetchError('Protocolo não suportado.');
  const robots = await robotsFor(u.origin, fetchImpl);
  if (!robotsAllows(robots, url)) throw new FetchError('robots.txt não permite a coleta desta página.', { blocked: true });
  await throttle(u.host);
  let res;
  try {
    const conditional = {};
    if (validadores?.etag) conditional['If-None-Match'] = validadores.etag;
    if (validadores?.lastModified) conditional['If-Modified-Since'] = validadores.lastModified;
    res = await fetchImpl(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,application/rss+xml;q=0.9,*/*;q=0.8', ...conditional },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new FetchError(`Fonte indisponível: ${err.name === 'TimeoutError' ? 'tempo esgotado' : err.message}`);
  }
  if ([401, 403, 429].includes(res.status)) {
    throw new FetchError(`A fonte recusou a coleta (HTTP ${res.status}). Não tentamos contornar.`, { status: res.status, blocked: true });
  }
  const etag = res.headers.get('etag') || validadores?.etag || null;
  const lastModified = res.headers.get('last-modified') || validadores?.lastModified || null;
  if (res.status === 304 && validadores) return { url, status: 304, naoModificada: true, text: null, fetchedAt: new Date().toISOString(), etag, lastModified };
  if (!res.ok) throw new FetchError(`HTTP ${res.status}`, { status: res.status });
  const contentType = res.headers.get('content-type') || '';
  const text = decode(new Uint8Array(await res.arrayBuffer()), contentType);
  return { url: res.url || url, status: res.status, text, contentType, fetchedAt: new Date().toISOString(), etag, lastModified };
}

// ---------- HTML → texto (sem dependências) ----------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', uuml: 'ü' };

export function htmlText(fragment) {
  return String(fragment || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
      return ENTITIES[e] ?? m;
    })
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}
