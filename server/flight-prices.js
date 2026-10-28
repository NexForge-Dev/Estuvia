// Preços de passagens (gratuito): Aviasales Data API, via programa de afiliados Travelpayouts
// (cadastro grátis → token em TRAVELPAYOUTS_TOKEN). Endpoint: /aviasales/v3/prices_for_dates.
//
// O que esses preços SÃO: os menores preços que usuários do Aviasales encontraram nas últimas ~48 h para
// aquela rota e mês, vindos de cache. NÃO são ofertas garantidas nem compráveis aqui: o preço final, a
// bagagem e as regras da tarifa aparecem no site. Por isso cada valor vai com a fonte e a hora da consulta,
// e um valor desconhecido continua null (nunca 0). Sem token, a tela diz que o recurso está desligado.
//
// Alerta de preço: o estudante define um teto (em R$); um verificador a cada 6 h consulta as rotas de quem
// ativou (com cache compartilhado) e avisa ao vivo + guarda o aviso na viagem quando o menor preço visto
// fica abaixo do teto. Nada é comprado nem reservado.

import { users } from './store.js';
import { emitTo } from './events.js';
import { computeTravel, ensureTravel } from './travel-engine.js';

const API = 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates';
const SITE = 'https://www.aviasales.com';
const TTL_MS = 3 * 3600e3;
const WATCH_MS = 6 * 3600e3;
const TIMEOUT_MS = 12000;
export const PRICE_SOURCE = {
  nome: 'Aviasales (dados via Travelpayouts)',
  natureza: 'Menor preço visto por usuários do Aviasales nas últimas ~48 h. Não é oferta garantida: o preço final, a bagagem e as regras aparecem no site.',
};

export const pricesEnabled = () => Boolean(process.env.TRAVELPAYOUTS_TOKEN);

const cache = new Map();
// Depois de um 429 o provedor não é consultado por alguns minutos (senão cada tela aberta gasta a cota).
const COOLDOWN_MS = 10 * 60 * 1000;
let cooldownUntil = 0;
export const clearPriceCache = () => { cache.clear(); cooldownUntil = 0; };

const minutes = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
// Só caminhos relativos do próprio Aviasales: "//outro-site" e "/\outro-site" seriam resolvidos para outro domínio.
const safeLink = (path) => {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return null;
  try { const u = new URL(path, SITE); return u.origin === SITE ? u.href : null; } catch { return null; }
};

/** Normaliza um item da resposta da API (campos ausentes ficam null). */
export function normalizeOffer(it, moeda) {
  const preco = Number(it?.price);
  if (!(preco > 0)) return null;
  return {
    preco, moeda: moeda.toUpperCase(),
    origem: it.origin_airport || it.origin || null, destino: it.destination_airport || it.destination || null,
    companhia: typeof it.airline === 'string' ? it.airline : null, voo: it.flight_number != null ? String(it.flight_number) : null,
    partida: typeof it.departure_at === 'string' ? it.departure_at : null,
    conexoes: Number.isInteger(it.transfers) ? it.transfers : null,
    duracaoMin: minutes(it.duration_to ?? it.duration),
    link: safeLink(it.link),
  };
}

/**
 * Menores preços de uma rota num mês (YYYY-MM) ou dia (YYYY-MM-DD), só ida.
 * → { ok, ofertas[], consultadoEm, erro? }
 */
export async function routePrices({ origem, destino, quando, moeda = 'brl', limite = 5 }, { fetchImpl = globalThis.fetch, token = process.env.TRAVELPAYOUTS_TOKEN } = {}) {
  if (!token) return { ok: false, ofertas: [], erro: 'desligado' };
  if (!/^[A-Z]{3}$/.test(origem || '') || !/^[A-Z]{3}$/.test(destino || '') || !/^\d{4}-\d{2}(-\d{2})?$/.test(quando || '')) return { ok: false, ofertas: [], erro: 'rota inválida' };
  const key = `${origem}-${destino}-${quando}-${moeda}-${limite}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  if (Date.now() < cooldownUntil) return { ok: false, ofertas: [], erro: 'limite gratuito de consultas atingido; tente mais tarde', consultadoEm: new Date().toISOString() };
  const params = new URLSearchParams({ origin: origem, destination: destino, departure_at: quando, one_way: 'true', direct: 'false', sorting: 'price', currency: moeda, limit: String(limite), page: '1' });
  let value;
  try {
    const res = await fetchImpl(`${API}?${params}`, { headers: { 'X-Access-Token': token, Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 401 || res.status === 403) throw new Error('token do Travelpayouts inválido');
    if (res.status === 429) cooldownUntil = Date.now() + COOLDOWN_MS;
    if (res.status === 429) throw new Error('limite gratuito de consultas atingido; tente mais tarde');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (body?.success === false) throw new Error(String(body.error || 'consulta recusada'));
    const ofertas = (Array.isArray(body?.data) ? body.data : []).map((it) => normalizeOffer(it, moeda)).filter(Boolean).sort((a, b) => a.preco - b.preco);
    value = { ok: true, ofertas, consultadoEm: new Date().toISOString() };
  } catch (err) {
    // Erro não entra no cache: na próxima consulta tenta de novo.
    return { ok: false, ofertas: [], erro: err.name === 'TimeoutError' ? 'o serviço de preços demorou demais' : err.message, consultadoEm: new Date().toISOString() };
  }
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Mês da busca: data da viagem informada, senão o mês anterior ao início das aulas. */
export function searchMonth(plan) {
  if (plan.dataViagem) return plan.dataViagem.slice(0, 7);
  if (plan.destino.inicioAulas) {
    const d = new Date(`${plan.destino.inicioAulas.slice(0, 10)}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 7);
  }
  return null;
}

/** Preços para a viagem do estudante: origem do perfil × aeroportos do destino. */
export async function pricesForUser(user, jid, opts = {}) {
  const plan = computeTravel(user, jid);
  const base = { configurado: pricesEnabled() || Boolean(opts.token), fonte: PRICE_SOURCE, alerta: ensureTravel(user).alertaPreco || null };
  if (!base.configurado) return { ...base, rotas: [], motivo: 'A consulta de preços ainda não está ligada nesta Estuvia (precisa do token gratuito do Travelpayouts).' };
  const origem = plan.origem.iata;
  const mes = opts.quando || searchMonth(plan);
  if (!origem) return { ...base, rotas: [], motivo: 'Escolha o aeroporto de saída para ver preços.' };
  if (!mes) return { ...base, rotas: [], motivo: 'Informe a data (ou o mês) da viagem para ver preços.' };
  const rotas = [];
  for (const destino of plan.destino.aeroportos) {
    const r = await routePrices({ origem, destino, quando: mes, moeda: 'brl', limite: 3 }, opts);
    rotas.push({ origem, destino, ofertas: r.ofertas, consultadoEm: r.consultadoEm || null, erro: r.ok ? null : r.erro });
  }
  const todas = rotas.flatMap((r) => r.ofertas);
  return { ...base, origem, mes, rotas, menor: todas.length ? todas.reduce((a, b) => (b.preco < a.preco ? b : a)) : null };
}

// ---------- Alerta de preço ----------

/** Verifica os alertas ativos. Retorna os avisos gerados (para testes e logs). */
export async function checkPriceAlerts({ now = Date.now(), ...opts } = {}) {
  if (!pricesEnabled() && !opts.token) return [];
  const avisos = [];
  for (const u of users.all()) {
    const alerta = u.travel?.alertaPreco;
    if (!alerta?.ativo || !(alerta.teto > 0)) continue;
    let r;
    try { r = await pricesForUser(u, alerta.journeyId, opts); } catch { continue; }
    const menor = r.menor;
    if (!menor || menor.preco > alerta.teto) continue;
    const ultimo = alerta.ultimoAviso;
    // Sem repetir: só avisa de novo se o preço caiu ou se o último aviso tem mais de 3 dias.
    if (ultimo && menor.preco >= ultimo.preco && now - Date.parse(ultimo.em) < 3 * 86400e3) continue;
    const aviso = { preco: menor.preco, moeda: menor.moeda, origem: menor.origem, destino: menor.destino, partida: menor.partida, link: menor.link, em: new Date(now).toISOString() };
    await users.update(u.id, (x) => {
      const a = x.travel.alertaPreco;
      a.ultimoAviso = aviso;
      a.historico = [aviso, ...(a.historico || [])].slice(0, 10);
    });
    const valor = `R$ ${Math.round(menor.preco).toLocaleString('pt-BR')}`;
    emitTo(u.id, 'preco-passagem', { titulo: `${menor.origem} → ${menor.destino} por ${valor}, abaixo do seu teto. Confira no site antes de comprar.`, ...aviso });
    avisos.push({ userId: u.id, ...aviso });
  }
  return avisos;
}

let timer = null;
export function startPriceWatcher() {
  if (timer || !pricesEnabled()) return false;
  const run = () => checkPriceAlerts().then((a) => { if (a.length) console.log(`[precos] ${a.length} alerta(s) de preço enviado(s)`); }).catch((err) => console.error('[precos] falha:', err.message));
  timer = setInterval(run, WATCH_MS);
  timer.unref?.();
  setTimeout(run, 60e3).unref?.();
  return true;
}
