// Câmbio de referência EUR→BRL. Usa a taxa de referência do Banco Central Europeu (via api.frankfurter.app),
// com cache. Se o serviço falhar ou estiver desligado (FX_PROVIDER=off), não há taxa automática:
// o estudante informa a taxa e ela aparece como "informada por você". Nunca fingimos atualização.

const TTL = 6 * 3600 * 1000;
const URL_ = 'https://api.frankfurter.app/latest?from=EUR&to=BRL';
let cache = null; // { taxa, data, obtidoEm, fonte, url }
let inflight = null;
// Falha recente (sem rede, serviço fora do ar): não tenta de novo por 10 min, para não atrasar cada tela.
const RETRY_AFTER = 10 * 60 * 1000;
let failedAt = 0;

// Desligado também sob o executor de testes (NODE_TEST_CONTEXT): testes não dependem de internet.
export const fxEnabled = () => (process.env.FX_PROVIDER || 'frankfurter') !== 'off' && !process.env.NODE_TEST_CONTEXT;

// Taxa em memória (síncrona, para os cálculos). Pode ser null.
export const cachedRate = () => cache;

export async function refreshRate({ force = false, fetchImpl = globalThis.fetch } = {}) {
  if (!fxEnabled()) return null;
  if (!force && cache && Date.now() - new Date(cache.obtidoEm).getTime() < TTL) return cache;
  if (!force && Date.now() - failedAt < RETRY_AFTER) return cache;
  inflight ??= (async () => {
    try {
      const res = await fetchImpl(URL_, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      const taxa = Number(body?.rates?.BRL);
      if (!(taxa > 0)) throw new Error('resposta sem taxa');
      cache = { taxa, data: body.date, obtidoEm: new Date().toISOString(), fonte: 'Banco Central Europeu, taxa de referência (via Frankfurter)', url: 'https://www.frankfurter.app/' };
      failedAt = 0;
    } catch {
      failedAt = Date.now();
      // Mantém a última taxa conhecida (com a data dela) ou nenhuma.
    } finally {
      inflight = null;
    }
    return cache;
  })();
  return inflight;
}

// Só para testes.
export const setRateForTests = (v) => { cache = v; };
