// Pesquisa na web e vídeos: SOMENTE fontes gratuitas, cada resultado com a origem e a natureza dele.
//
//   oficial      Canal UGR (últimas notícias oficiais da Universidad de Granada) — feed RSS público, respeita robots.txt
//   imprensa     GDELT DOC 2.0 (índice aberto de notícias, sem chave; limite de 1 consulta a cada 5 s)
//   enciclopedia Wikipédia em português (explica conceitos; não é fonte oficial)
//   video        YouTube Data API v3 — cota gratuita, exige YOUTUBE_API_KEY (sem cartão).
//                Sem chave, devolvemos só o link da busca no YouTube: nunca inventamos vídeos.
//
// Regras: nada é resumido como "verdade" pela plataforma; o estudante vê título, fonte e data de cada item
// e é orientado a confirmar regras na fonte oficial. Resultados ficam em cache para respeitar os limites
// gratuitos de cada serviço. Textos vindos da web são dados, nunca instruções (ver prompt do Mentor).

import { politeFetch, htmlText } from '../radar/http.js';

const UA = 'EstuviaBusca/0.1 (plataforma educacional; pesquisa de fontes)';
const TIMEOUT_MS = 12000;
const TTL = { oficial: 60 * 60e3, imprensa: 30 * 60e3, enciclopedia: 24 * 3600e3, video: 12 * 3600e3 };
const MAX_CACHE = 400;
const GDELT_GAP_MS = 5500;

export const NATUREZA = {
  oficial: 'Fonte oficial',
  imprensa: 'Imprensa (não oficial)',
  enciclopedia: 'Enciclopédia (explica o conceito; não é fonte oficial)',
  video: 'Vídeo de terceiros (confira as regras na fonte oficial)',
};
export const AVISO = 'Resultados de busca na web: mostram o que foi publicado, com fonte e data. Regras, prazos e valores só valem quando confirmados na fonte oficial.';

const cache = new Map();
function cached(key, ttl) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  return undefined;
}
function remember(key, value) {
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), value });
  return value;
}
/** Para testes. */
export const clearSearchCache = () => { cache.clear(); feedCache.clear(); };

// ---------- Consulta ----------

const STOP = new Set('a o e as os de da do das dos em no na nos nas um uma para pra por com sem que qual quais como sobre me mim eu voce noticia noticias novidade novidades recente recentes pesquisa pesquise pesquisar procure procurar busque buscar web internet video videos aula aulas tutorial tutoriais youtube mostre mostra ache achar encontre encontrar tem ha alguma algum ultimas ultimos'.split(' '));
const plain = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Limpa a consulta (sem caracteres de controle, tamanho limitado). */
export function cleanQuery(q) {
  return String(q || '').replace(/[\u0000-\u001f<>"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

/** Palavras significativas (≥ 3 letras, sem palavras vazias): o GDELT recusa termos curtos. */
export function keywords(q) {
  return [...new Set(cleanQuery(q).split(/[\s,.;:!?()]+/).filter((w) => w.length >= 3 && !STOP.has(plain(w))))].slice(0, 6);
}

const safeUrl = (u) => {
  try {
    const url = new URL(String(u).trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch { return null; }
};
const isoDate = (d) => { const t = Date.parse(d); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
const clip = (s, n) => { const t = htmlText(s).replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

async function getJson(url, fetchImpl, headers = {}) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await res.text();
  if (res.status === 429) throw new Error('limite gratuito do serviço atingido agora; tente em alguns minutos');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  try { return JSON.parse(text); } catch { throw new Error('resposta inesperada do serviço'); }
}

// ---------- RSS (feeds oficiais) ----------

export function parseRss(xml) {
  const items = [];
  for (const m of String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const tag = (name) => {
      const v = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i').exec(m[1])?.[1] || '';
      return v.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1');
    };
    items.push({ titulo: clip(tag('title'), 200), url: safeUrl(htmlText(tag('link'))), publicadoEm: isoDate(tag('pubDate')), resumo: clip(tag('description'), 260) });
  }
  return items.filter((i) => i.titulo && i.url);
}

// Feeds oficiais de NOTÍCIAS RECENTES. Só entram fontes institucionais; cada uma diz quem publica.
// A busca do próprio site (?s=) leva 10–20 s; por isso lemos o feed das últimas notícias (≈ 40 itens),
// guardamos em cache (aquecido a cada 30 min pelo servidor) e filtramos aqui pelas palavras da pergunta.
export const OFFICIAL_FEEDS = [
  // O /feed/ geral do site traz itens antigos; os tipos de post "noticia" e "convocatoria" trazem os do dia.
  { id: 'canal-ugr-noticias', orgao: 'Universidad de Granada: Canal UGR (notícias)', url: 'https://canal.ugr.es/feed/?post_type=noticia' },
  { id: 'canal-ugr-convocatorias', orgao: 'Universidad de Granada: Canal UGR (convocatórias)', url: 'https://canal.ugr.es/feed/?post_type=convocatoria' },
];
const FEED_TTL = 30 * 60e3;
const feedCache = new Map(); // id → { at, itens }

async function feedItems(feed, fetchImpl, { force = false } = {}) {
  const hit = feedCache.get(feed.id);
  if (!force && hit && Date.now() - hit.at < FEED_TTL) return hit.itens;
  const page = await politeFetch(feed.url, { fetchImpl });
  const itens = parseRss(page.text).map((it) => ({ ...it, natureza: 'oficial', fonte: feed.orgao, dominio: new URL(it.url).hostname }));
  feedCache.set(feed.id, { at: Date.now(), itens });
  return itens;
}

/** Relevância simples: quantas palavras da pergunta aparecem no texto (sem acentos). */
const matches = (kw, text) => { const t = plain(text); return kw.filter((w) => t.includes(w)).length; };

async function searchOfficial(q, { fetchImpl, limite }) {
  const kw = keywords(q).map(plain);
  if (!kw.length) return [];
  const out = [];
  const seen = new Set();
  for (const feed of OFFICIAL_FEEDS) {
    for (const it of await feedItems(feed, fetchImpl)) {
      const score = matches(kw, `${it.titulo} ${it.resumo}`);
      if (score && !seen.has(it.url)) { seen.add(it.url); out.push({ ...it, score }); }
    }
  }
  return out.sort((a, b) => b.score - a.score || (b.publicadoEm || '').localeCompare(a.publicadoEm || '')).slice(0, limite).map(({ score, ...it }) => it);
}

/** Mantém os feeds oficiais em cache para a pesquisa no chat responder na hora. */
let warmTimer = null;
export function startFeedWarmer({ fetchImpl = globalThis.fetch } = {}) {
  if (warmTimer || process.env.NODE_TEST_CONTEXT) return false;
  const warm = () => Promise.all(OFFICIAL_FEEDS.map((f) => feedItems(f, fetchImpl, { force: true }).catch((err) => console.warn(`[busca] feed ${f.id}: ${err.message}`))));
  warm();
  warmTimer = setInterval(warm, FEED_TTL - 60e3);
  warmTimer.unref?.();
  return true;
}

// ---------- GDELT (imprensa) ----------

let gdeltNext = 0;
let gdeltChain = Promise.resolve();
const gdeltSlot = () => {
  const slot = gdeltChain.then(async () => {
    const wait = gdeltNext - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    gdeltNext = Date.now() + GDELT_GAP_MS;
  });
  gdeltChain = slot.catch(() => {});
  return slot;
};

// "20261027T153000Z" → ISO
const gdeltDate = (s) => (/^\d{8}T\d{6}Z$/.test(s || '') ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z` : null);

export function gdeltQuery(q) {
  const kw = keywords(q);
  if (!kw.length) return null;
  return `${kw.map((w) => (/^[\p{L}\d-]+$/u.test(w) ? w : `"${w}"`)).join(' ')} (sourcelang:portuguese OR sourcelang:spanish)`;
}

async function searchNews(q, { fetchImpl, limite }) {
  const query = gdeltQuery(q);
  if (!query) return [];
  await gdeltSlot();
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&format=json&maxrecords=${Math.min(limite * 2, 20)}&sort=datedesc&timespan=3months`;
  const res = await fetchImpl(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await res.text();
  if (res.status === 429 || /limit requests/i.test(text)) throw new Error('limite gratuito do serviço de notícias atingido agora; tente em alguns minutos');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  let body;
  try { body = JSON.parse(text); } catch { throw new Error('o serviço de notícias não entendeu a busca'); }
  const seen = new Set();
  return (body.articles || []).map((a) => ({
    titulo: clip(a.title, 200), url: safeUrl(a.url), publicadoEm: gdeltDate(a.seendate), resumo: '',
    natureza: 'imprensa', fonte: a.domain || null, dominio: a.domain || null, idioma: a.language || null, pais: a.sourcecountry || null,
  })).filter((a) => a.titulo && a.url && !seen.has(a.titulo.toLowerCase()) && seen.add(a.titulo.toLowerCase())).slice(0, limite);
}

// ---------- Wikipédia (conceitos) ----------

async function searchEncyclopedia(q, { fetchImpl, limite }) {
  const terms = cleanQuery(q);
  if (terms.length < 3) return [];
  const kw = keywords(q).map(plain);
  const body = await getJson(`https://pt.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(terms)}&limit=5`, fetchImpl);
  // A busca da Wikipédia também devolve páginas que só citam a palavra no meio do texto:
  // ficam só as páginas cujo TÍTULO tem uma palavra da pergunta.
  return (body.pages || []).filter((p) => matches(kw, p.title)).slice(0, Math.min(limite, 3)).map((p) => ({
    titulo: clip(p.title, 160), url: safeUrl(`https://pt.wikipedia.org/wiki/${encodeURIComponent(p.key)}`), publicadoEm: null,
    resumo: clip(p.excerpt || p.description || '', 260), natureza: 'enciclopedia', fonte: 'Wikipédia', dominio: 'pt.wikipedia.org',
  })).filter((p) => p.url);
}

// ---------- API pública ----------

const PROVIDERS = { oficial: searchOfficial, noticias: searchNews, conceito: searchEncyclopedia };
const KIND_TTL = { oficial: TTL.oficial, noticias: TTL.imprensa, conceito: TTL.enciclopedia };
const LABEL = { oficial: 'Canal UGR', noticias: 'notícias (GDELT)', conceito: 'Wikipédia' };

/**
 * Pesquisa na web nas fontes gratuitas.
 * tipos: 'oficial' | 'noticias' | 'conceito' (padrão: oficial + notícias; a Wikipédia só para explicar conceitos).
 * Falha de uma fonte não derruba as outras.
 * → { consulta, consultadoEm, itens[{ titulo, url, publicadoEm, resumo, natureza, naturezaLabel, fonte }], falhas[{ fonte, motivo }], aviso }
 */
export async function searchWeb(consulta, { tipos = ['oficial', 'noticias'], limite = 4, fetchImpl = globalThis.fetch } = {}) {
  const q = cleanQuery(consulta);
  if (q.length < 2) return { consulta: q, consultadoEm: new Date().toISOString(), itens: [], falhas: [], aviso: AVISO };
  // Testes não dependem de internet: sem fetch injetado, nenhuma fonte é consultada.
  if (process.env.NODE_TEST_CONTEXT && fetchImpl === globalThis.fetch) return { consulta: q, consultadoEm: new Date().toISOString(), itens: [], falhas: [{ fonte: 'web', motivo: 'desligada nos testes' }], aviso: AVISO };
  const falhas = [];
  const blocks = await Promise.all(tipos.filter((t) => PROVIDERS[t]).map(async (t) => {
    const key = `${t}:${plain(q)}:${limite}`;
    const hit = cached(key, KIND_TTL[t]);
    if (hit) return hit;
    try {
      return remember(key, await PROVIDERS[t](q, { fetchImpl, limite }));
    } catch (err) {
      falhas.push({ fonte: LABEL[t], motivo: err.message });
      return [];
    }
  }));
  const itens = blocks.flat().map((i) => ({ ...i, naturezaLabel: NATUREZA[i.natureza] }));
  return { consulta: q, consultadoEm: new Date().toISOString(), itens, falhas, aviso: AVISO };
}

export const videosEnabled = () => Boolean(process.env.YOUTUBE_API_KEY) && !process.env.NODE_TEST_CONTEXT;
export const youtubeSearchLink = (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery(q))}`;

/**
 * Vídeos/aulas no YouTube (API oficial, cota gratuita). Sem YOUTUBE_API_KEY: { configurado: false, linkBusca }.
 * Só vídeos incorporáveis, busca segura, com preferência por português e publicados nos últimos 3 anos.
 */
export async function searchVideos(consulta, { limite = 4, fetchImpl = globalThis.fetch, apiKey = process.env.YOUTUBE_API_KEY, now = new Date() } = {}) {
  const q = cleanQuery(consulta);
  const base = { consulta: q, linkBusca: youtubeSearchLink(q), aviso: NATUREZA.video, consultadoEm: new Date().toISOString() };
  if (!apiKey || (process.env.NODE_TEST_CONTEXT && fetchImpl === globalThis.fetch)) return { ...base, configurado: false, itens: [], falha: null };
  if (q.length < 2) return { ...base, configurado: true, itens: [], falha: null };
  const key = `video:${plain(q)}:${limite}`;
  const hit = cached(key, TTL.video);
  if (hit) return { ...base, configurado: true, itens: hit, falha: null };
  const desde = new Date(now.getTime() - 3 * 365 * 24 * 3600e3).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const params = new URLSearchParams({
    part: 'snippet', type: 'video', q, maxResults: String(Math.min(limite, 8)), relevanceLanguage: 'pt', regionCode: 'BR',
    safeSearch: 'strict', videoEmbeddable: 'true', publishedAfter: desde, key: apiKey,
  });
  try {
    const body = await getJson(`https://www.googleapis.com/youtube/v3/search?${params}`, fetchImpl);
    const itens = (body.items || []).filter((i) => /^[\w-]{11}$/.test(i.id?.videoId || '')).map((i) => ({
      id: i.id.videoId,
      titulo: clip(i.snippet?.title, 160),
      canal: clip(i.snippet?.channelTitle, 80),
      publicadoEm: isoDate(i.snippet?.publishedAt),
      resumo: clip(i.snippet?.description, 200),
      thumb: `https://i.ytimg.com/vi/${i.id.videoId}/mqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${i.id.videoId}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${i.id.videoId}`,
      natureza: 'video', naturezaLabel: NATUREZA.video,
    }));
    remember(key, itens);
    return { ...base, configurado: true, itens, falha: null };
  } catch (err) {
    // Chave inválida/cota esgotada: o estudante ainda recebe o link da busca.
    return { ...base, configurado: true, itens: [], falha: /403|quota/i.test(err.message) ? 'cota gratuita do YouTube esgotada hoje ou chave inválida' : err.message };
  }
}

export function webSearchStatus() {
  return {
    oficial: OFFICIAL_FEEDS.map((f) => f.orgao),
    noticias: 'GDELT (gratuito, sem chave)',
    conceito: 'Wikipédia (gratuito)',
    videos: videosEnabled() ? 'YouTube Data API (cota gratuita)' : 'desligado, defina YOUTUBE_API_KEY (gratuita) para listar vídeos',
  };
}
