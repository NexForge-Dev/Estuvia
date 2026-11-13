// Coleta HTTP "educada": identifica-se, respeita robots.txt, limita a taxa por domínio,
// tem timeout e nunca envia credenciais nem tenta contornar bloqueios (401/403/429 = parar).

const USER_AGENT = 'EstuviaRadar/0.1 (monitoramento de fontes academicas oficiais)';
const TIMEOUT_MS = 20000;
const MIN_INTERVAL_MS = 4000; // entre requisições ao mesmo domínio
const ROBOTS_TTL_MS = 12 * 3600 * 1000;
const MAX_BYTES = 5 * 1024 * 1024; // página oficial maior que isso não é um calendário: recusamos
const MAX_REDIRECTS = 5;

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

export function decode(buffer, contentType) {
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

// RFC 9309 §2.3.1: robots.txt inexistente (4xx) = sem restrições; robots.txt INACESSÍVEL
// (5xx, rede, tempo esgotado) = tudo proibido até conseguirmos lê-lo. Inacessível não vai para o cache.
async function robotsFor(origin, fetchImpl) {
  const cached = robotsCache.get(origin);
  if (cached && Date.now() - cached.at < ROBOTS_TTL_MS) return cached.text;
  let text = '';
  try {
    const res = await fetchImpl(`${origin}/robots.txt`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status >= 500) return null;
    if (res.ok) text = new TextDecoder().decode(await readLimited(res, MAX_BYTES));
  } catch {
    return null;
  }
  robotsCache.set(origin, { text, at: Date.now() });
  return text;
}

/** Lê o corpo com teto de tamanho (Content-Length e contagem real). Retorna Uint8Array. */
async function readLimited(res, maxBytes) {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new FetchError(`Resposta grande demais (${declared} bytes).`);
  if (!res.body?.getReader) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) throw new FetchError(`Resposta grande demais (${buf.byteLength} bytes).`);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new FetchError(`Resposta grande demais (mais de ${maxBytes} bytes).`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}

function checkTarget(u, allowedHosts) {
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new FetchError('Protocolo não suportado.', { blocked: true });
  if (u.username || u.password) throw new FetchError('URL com credenciais não é aceita.', { blocked: true });
  if (allowedHosts && !allowedHosts.includes(u.hostname.toLowerCase())) {
    throw new FetchError(`Domínio fora da lista de fontes oficiais: ${u.hostname}.`, { blocked: true });
  }
}

/**
 * Baixa uma página pública. Retorna { url, status, text, contentType, fetchedAt, etag, lastModified }.
 * Com "validadores" (ETag / Last-Modified da coleta anterior) faz uma requisição condicional:
 * se a página não mudou, o servidor responde 304 e devolvemos { naoModificada: true } sem baixar o conteúdo.
 */
// replay: páginas já coletadas por outra máquina (importação, ver radar/replay.js). Sem espera entre
// requisições (nada sai para a rede) e com a data real da coleta, que vem no cabeçalho x-estuvia-coletado-em.
export async function politeFetch(url, { fetchImpl = fetch, validadores = null, allowedHosts = null, maxBytes = MAX_BYTES, method = 'GET', body = null, replay = false } = {}) {
  let u = new URL(url);
  const verb = String(method || 'GET').toUpperCase();
  if (!['GET', 'POST'].includes(verb)) throw new FetchError(`Método ${verb} não permitido.`, { blocked: true });
  checkTarget(u, allowedHosts);
  const conditional = {};
  if (verb === 'GET' && validadores?.etag) conditional['If-None-Match'] = validadores.etag;
  if (verb === 'GET' && validadores?.lastModified) conditional['If-Modified-Since'] = validadores.lastModified;
  let res;
  // Redirecionamentos seguidos manualmente: cada salto é validado (protocolo, domínio permitido,
  // robots.txt do destino). Um redirecionamento para fora das fontes oficiais é recusado.
  for (let hop = 0; ; hop += 1) {
    const robots = await robotsFor(u.origin, fetchImpl);
    if (robots === null) throw new FetchError(`robots.txt de ${u.host} inacessível: coleta adiada (RFC 9309).`);
    if (!robotsAllows(robots, u.href)) throw new FetchError('robots.txt não permite a coleta desta página.', { blocked: true });
    if (!replay) await throttle(u.host);
    try {
      res = await fetchImpl(u.href, {
        method: verb,
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,application/rss+xml;q=0.9,*/*;q=0.8', ...(verb === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' } : {}), ...conditional },
        ...(verb === 'POST' && body !== null ? { body: String(body) } : {}),
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new FetchError(`Fonte indisponível: ${err.name === 'TimeoutError' ? 'tempo esgotado' : err.message}`);
    }
    if (![301, 302, 303, 307, 308].includes(res.status)) break;
    const location = res.headers.get('location');
    if (!location) throw new FetchError(`HTTP ${res.status} sem destino.`, { status: res.status });
    if (hop + 1 >= MAX_REDIRECTS) throw new FetchError('Redirecionamentos demais.', { status: res.status });
    if (verb === 'POST') throw new FetchError(`A fonte redirecionou uma consulta POST (HTTP ${res.status}); a coleta foi interrompida sem reenviar os dados.`, { status: res.status, blocked: true });
    const next = new URL(location, u);
    checkTarget(next, allowedHosts);
    if (u.protocol === 'https:' && next.protocol !== 'https:') throw new FetchError('Redirecionamento para HTTP sem criptografia recusado.', { blocked: true });
    u = next;
  }
  if ([401, 403, 429].includes(res.status)) {
    throw new FetchError(`A fonte recusou a coleta (HTTP ${res.status}). Não tentamos contornar.`, { status: res.status, blocked: true });
  }
  const etag = res.headers.get('etag') || validadores?.etag || null;
  const lastModified = res.headers.get('last-modified') || validadores?.lastModified || null;
  if (res.status === 304 && validadores) return { url: u.href, status: 304, naoModificada: true, text: null, fetchedAt: new Date().toISOString(), etag, lastModified };
  if (!res.ok) throw new FetchError(`HTTP ${res.status}`, { status: res.status });
  const contentType = res.headers.get('content-type') || '';
  const text = decode(await readLimited(res, maxBytes), contentType);
  const collectedAt = replay ? Date.parse(res.headers.get('x-estuvia-coletado-em') || '') : NaN;
  return { url: u.href, status: res.status, text, contentType, fetchedAt: Number.isFinite(collectedAt) ? new Date(collectedAt).toISOString() : new Date().toISOString(), etag, lastModified };
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
