// Saúde da IA (painel admin): configuração das chaves, contadores de uso/erros e teste de conexão.
// O teste usa a listagem de modelos do provedor: confirma chave + modelo sem gastar tokens.
import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { analytics } from './store.js';
import { getProvider } from './mentor/providers/index.js';

const mask = (v) => (v ? `••••${String(v).slice(-4)}` : null);
const anthropicKey = () => process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || null;

// Contadores persistidos junto com o uso dos módulos (sobrevivem a reinícios).
// servico: 'mentor' | 'assistente'; resultado: 'ok' | 'erro' | 'guiado' | 'offline'
// `user` (opcional) soma o uso por estudante — mesma gravação agrupada dos acessos.
export function recordAI(servico, resultado, { erro, user } = {}) {
  analytics.mutate((a) => {
    if (user) {
      user.aiUso ||= {};
      const u = (user.aiUso[servico] ||= { mensagens: 0, ultimaEm: null });
      u.mensagens += 1;
      u.ultimaEm = new Date().toISOString();
    }
    a.ai ||= {};
    const s = (a.ai[servico] ||= { ok: 0, erro: 0, guiado: 0, offline: 0, ultimoOk: null, ultimoErro: null, erros: [] });
    s[resultado] = (s[resultado] || 0) + 1;
    const now = new Date().toISOString();
    if (resultado === 'ok') s.ultimoOk = now;
    if (resultado === 'erro') {
      s.ultimoErro = { em: now, mensagem: String(erro || 'erro desconhecido').slice(0, 200) };
      s.erros = [s.ultimoErro, ...(s.erros || [])].slice(0, 10);
    }
  });
}

// ---------- Orçamento diário de tokens por estudante (teto de custo da IA) ----------
// O limite por hora (rate limit) conta mensagens; este conta tokens, que é o que gera custo:
// uma mensagem do Mentor pode virar várias chamadas ao modelo. Somado entre Mentor e Assistente.
// AI_DAILY_TOKENS_PER_USER=0 desliga o teto.
const DEFAULT_DAILY_TOKENS = 300_000;
export const dailyTokenLimit = () => {
  const raw = process.env.AI_DAILY_TOKENS_PER_USER;
  const v = Number(raw);
  return raw && Number.isFinite(v) && v >= 0 ? v : DEFAULT_DAILY_TOKENS;
};
const utcDay = (now = new Date()) => now.toISOString().slice(0, 10);

/** Tokens gastos hoje pelo estudante e se o teto foi atingido. */
export function aiBudget(user, now = new Date()) {
  const limite = dailyTokenLimit();
  const hoje = user?.aiUso?.hoje;
  const usados = hoje?.dia === utcDay(now) ? hoje.tokens || 0 : 0;
  return { usados, limite, esgotado: limite > 0 && usados >= limite };
}

/** Soma tokens de UMA chamada ao modelo (entrada + saída) no uso do estudante e no total do serviço. */
export function recordTokens(user, servico, uso, now = new Date()) {
  const n = Math.max(0, Math.round(Number(uso?.entrada) || 0)) + Math.max(0, Math.round(Number(uso?.saida) || 0));
  if (!n) return 0;
  analytics.mutate((a) => {
    if (user) {
      user.aiUso ||= {};
      const dia = utcDay(now);
      if (user.aiUso.hoje?.dia !== dia) user.aiUso.hoje = { dia, tokens: 0 };
      user.aiUso.hoje.tokens += n;
      const u = (user.aiUso[servico] ||= { mensagens: 0, ultimaEm: null });
      u.tokens = (u.tokens || 0) + n;
    }
    a.ai ||= {};
    const s = (a.ai[servico] ||= { ok: 0, erro: 0, guiado: 0, offline: 0, ultimoOk: null, ultimoErro: null, erros: [] });
    s.tokens = (s.tokens || 0) + n;
  });
  return n;
}

export function aiStatus() {
  const provider = getProvider();
  const id = (process.env.MENTOR_PROVIDER || 'none').toLowerCase();
  const stats = analytics.read((a) => a.ai || {});
  return {
    mentor: {
      provedorConfigurado: id,
      ativo: provider.disponivel,
      nome: provider.nome,
      modelo: id === 'anthropic' ? (process.env.MENTOR_MODEL || 'claude-opus-5-5') : process.env.MENTOR_MODEL || null,
      chave: id === 'anthropic' ? mask(anthropicKey()) : id === 'openai-compatible' ? mask(process.env.MENTOR_API_KEY) : null,
      baseUrl: id === 'openai-compatible' ? process.env.MENTOR_BASE_URL || null : null,
      // Provedor pedido no .env mas não carregado (ex.: chave ausente) → caiu para o Modo Guiado.
      problemaConfig: id !== 'none' && !provider.disponivel ? `MENTOR_PROVIDER=${id}, mas o provedor não carregou (veja a chave/URL no .env).` : null,
      uso: stats.mentor || null,
    },
    assistente: {
      ativo: config.aiEnabled,
      modelo: config.anthropicModel,
      chave: mask(anthropicKey()),
      uso: stats.assistente || null,
    },
  };
}

const withTimeout = (ms) => AbortSignal.timeout(ms);

async function checkAnthropic(model) {
  if (!anthropicKey()) return { ok: false, detalhe: 'ANTHROPIC_API_KEY não definida no .env.' };
  const started = Date.now();
  try {
    const client = new Anthropic({ maxRetries: 0, timeout: 10_000 });
    const m = await client.models.retrieve(model);
    return { ok: true, latenciaMs: Date.now() - started, detalhe: `Chave válida. Modelo ${m.display_name || m.id} disponível.` };
  } catch (err) {
    const detalhe = err instanceof Anthropic.AuthenticationError ? 'Chave inválida ou revogada (401).'
      : err instanceof Anthropic.PermissionDeniedError ? 'A chave não tem permissão para este modelo (403).'
        : err instanceof Anthropic.NotFoundError ? `Modelo "${model}" não encontrado (404). Confira o nome no .env.`
          : err instanceof Anthropic.RateLimitError ? 'Limite de uso atingido (429). A chave funciona, mas está sem cota agora.'
            : err instanceof Anthropic.APIConnectionError ? 'Sem conexão com a API da Anthropic (rede/firewall).'
              : err instanceof Anthropic.APIError ? `Erro da API (${err.status}).` : err.message;
    return { ok: false, latenciaMs: Date.now() - started, detalhe };
  }
}

async function checkOpenAICompatible() {
  const base = process.env.MENTOR_BASE_URL;
  if (!base || !process.env.MENTOR_MODEL) return { ok: false, detalhe: 'Defina MENTOR_BASE_URL e MENTOR_MODEL no .env.' };
  const started = Date.now();
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/models`, {
      headers: process.env.MENTOR_API_KEY ? { Authorization: `Bearer ${process.env.MENTOR_API_KEY}` } : {},
      signal: withTimeout(10_000),
    });
    if (res.status === 401 || res.status === 403) return { ok: false, latenciaMs: Date.now() - started, detalhe: `Chave recusada pelo servidor (${res.status}).` };
    if (!res.ok) return { ok: false, latenciaMs: Date.now() - started, detalhe: `O servidor respondeu ${res.status}.` };
    const data = await res.json().catch(() => ({}));
    const ids = (data.data || data.models || []).map((x) => x.id || x.name);
    const found = !ids.length || ids.includes(process.env.MENTOR_MODEL);
    return { ok: found, latenciaMs: Date.now() - started, detalhe: found ? 'Servidor respondeu e o modelo está disponível.' : `Servidor respondeu, mas o modelo "${process.env.MENTOR_MODEL}" não está na lista.` };
  } catch (err) {
    return { ok: false, latenciaMs: Date.now() - started, detalhe: err.name === 'TimeoutError' ? 'Sem resposta em 10 s.' : `Falha de conexão: ${err.message}` };
  }
}

// Teste real de conexão (botão "Testar agora" no painel).
export async function checkAI() {
  const id = (process.env.MENTOR_PROVIDER || 'none').toLowerCase();
  const mentor = id === 'anthropic' ? await checkAnthropic(process.env.MENTOR_MODEL || 'claude-opus-5-5')
    : id === 'openai-compatible' ? await checkOpenAICompatible()
      : { ok: null, detalhe: 'Mentor em Modo Guiado (MENTOR_PROVIDER=none): funciona sem IA e sem custo.' };
  const assistente = config.aiEnabled ? await checkAnthropic(config.anthropicModel)
    : { ok: null, detalhe: 'Assistente em modo offline (sem ANTHROPIC_API_KEY): responde pela base local.' };
  return { testadoEm: new Date().toISOString(), mentor, assistente };
}
