// Operação do servidor (painel admin → Status e Logs): logs e métricas de requisições, só em memória.
// Sem dependências de propósito: é importado antes de tudo para capturar também os avisos da inicialização.
// Tudo zera quando o servidor reinicia (o painel diz isso).

const MAX_LOGS = 500;
const MAX_REQS = 20000;
const startedAt = Date.now();
const logs = [];
const reqs = []; // { t, status, ms }

const text = (args) => args.map((a) => (a instanceof Error ? a.stack || a.message : typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })())).join(' ');

export function addLog(nivel, mensagem) {
  logs.push({ at: new Date().toISOString(), nivel, mensagem: String(mensagem).slice(0, 2000) });
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
}

// Espelha console.log/warn/error no buffer (o terminal continua recebendo tudo normalmente).
for (const [metodo, nivel] of [['log', 'info'], ['info', 'info'], ['warn', 'aviso'], ['error', 'erro']]) {
  const original = console[metodo].bind(console);
  console[metodo] = (...args) => {
    try { addLog(nivel, text(args).trim()); } catch { /* nunca quebra o log */ }
    original(...args);
  };
}

// Middleware: conta requisições da API, tempo de resposta e erros 5xx.
export function requestMetrics(req, res, next) {
  const t = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - t;
    reqs.push({ t, status: res.statusCode, ms });
    if (reqs.length > MAX_REQS) reqs.splice(0, reqs.length - MAX_REQS);
    if (res.statusCode >= 500) addLog('erro', `${req.method} ${req.originalUrl.split('?')[0]} → ${res.statusCode} (${ms} ms)`);
  });
  next();
}

export function recentLogs({ nivel = null, q = '', limit = 300 } = {}) {
  const term = q.trim().toLowerCase();
  const out = [];
  for (let i = logs.length - 1; i >= 0 && out.length < limit; i -= 1) {
    const l = logs[i];
    if (nivel && l.nivel !== nivel) continue;
    if (term && !l.mensagem.toLowerCase().includes(term)) continue;
    out.push(l);
  }
  const contagem = { info: 0, aviso: 0, erro: 0 };
  logs.forEach((l) => { contagem[l.nivel] += 1; });
  return { logs: out, contagem, total: logs.length, max: MAX_LOGS };
}

export function requestStats(horas = 24) {
  const desde = Date.now() - horas * 3600e3;
  const janela = reqs.filter((r) => r.t >= desde);
  const ms = janela.map((r) => r.ms).sort((a, b) => a - b);
  const erros = janela.filter((r) => r.status >= 500).length;
  return {
    horas,
    requisicoes: janela.length,
    erros,
    clientes4xx: janela.filter((r) => r.status >= 400 && r.status < 500).length,
    taxaErro: janela.length ? erros / janela.length : 0,
    mediaMs: ms.length ? Math.round(ms.reduce((s, x) => s + x, 0) / ms.length) : null,
    p95Ms: ms.length ? ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.95))] : null,
    errosLog: logs.filter((l) => l.nivel === 'erro' && Date.parse(l.at) >= desde).length,
  };
}

export const uptimeMs = () => Date.now() - startedAt;
export const startedAtIso = () => new Date(startedAt).toISOString();
