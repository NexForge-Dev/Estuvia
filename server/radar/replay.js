// Importação de páginas oficiais coletadas em outra máquina.
//
// Alguns sites oficiais (a Junta de Andalucía, que hospeda o DUA) recusam conexões vindas de servidores
// em nuvem, como os da Vercel. Nesse caso a coleta roda num computador comum (npm run radar:import),
// grava cada resposta exatamente como veio e envia as páginas para cá. Aqui elas passam pelo MESMO
// pipeline da coleta normal (runSource): extração, validação, revisões e histórico são idênticos;
// só a rede é substituída por um "replay" das respostas gravadas.
//
// Nada além de páginas públicas das fontes oficiais cadastradas é aceito (hosts de COLLECTION_HOSTS).

import { COLLECTION_HOSTS } from './registry.js';
import { runSource } from './pipeline.js';
import { data } from './db.js';

const norm = (url) => new URL(url).href;
export const pageKey = (method, url, body) => `${String(method || 'GET').toUpperCase()} ${norm(url)}\n${body ?? ''}`;

/** fetch falso que devolve as respostas gravadas. robots: { origin: texto do robots.txt }. */
export function replayFetch(paginas, robots = {}) {
  const pages = new Map(paginas.map((p) => [pageKey(p.method, p.url, p.body), p]));
  async function fetchImpl(url, opts = {}) {
    const u = new URL(url);
    if (u.pathname === '/robots.txt' && Object.hasOwn(robots, u.origin)) {
      return new Response(robots[u.origin], { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    const p = pages.get(pageKey(opts.method, url, opts.body));
    if (!p) throw new Error('página não incluída na importação');
    if (p.status >= 300 && p.status < 400) return new Response(null, { status: p.status, headers: { location: p.location || '' } });
    return new Response(p.text, { status: p.status, headers: { 'content-type': 'text/html; charset=utf-8', 'x-estuvia-coletado-em': p.coletadoEm } });
  }
  const has = (method, url, body) => pages.has(pageKey(method, url, body));
  return { fetchImpl, has };
}

/**
 * Processa as páginas importadas de uma fonte. Só entram os alvos com TODAS as páginas presentes
 * (no catálogo do DUA, as três fases de cada universidade). Devolve a execução, como uma coleta normal.
 */
export async function importCollected(sourceId, { paginas, robots = {} }) {
  const source = data().sources.find((s) => s.id === sourceId);
  if (!source) throw Object.assign(new Error(`Fonte desconhecida: ${sourceId}.`), { status: 404 });
  if (source.metodo !== 'html-publico') throw Object.assign(new Error('Esta fonte não é coletada de página pública.'), { status: 400 });
  for (const p of paginas) {
    const host = new URL(p.url).hostname.toLowerCase();
    if (!COLLECTION_HOSTS.includes(host)) throw Object.assign(new Error(`Domínio fora das fontes oficiais: ${host}.`), { status: 400 });
  }
  for (const origin of Object.keys(robots)) {
    if (!COLLECTION_HOSTS.includes(new URL(origin).hostname.toLowerCase())) throw Object.assign(new Error(`robots.txt de domínio fora das fontes oficiais: ${origin}.`), { status: 400 });
  }
  const { fetchImpl, has } = replayFetch(paginas, robots);
  const bodyOf = (b) => (b === undefined || b === null ? null : String(b));
  const onlyTargets = (t) => (t.queries
    ? t.queries.every((q) => has(q.method, t.url, bodyOf(q.body)))
    : has(t.method || 'GET', t.url, bodyOf(t.body)));
  return runSource(sourceId, { fetchImpl, lote: Infinity, onlyTargets, replay: true, origem: 'importada' });
}
