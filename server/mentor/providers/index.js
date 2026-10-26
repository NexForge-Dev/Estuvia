// AI Provider: camada de abstração. A lógica de negócio (ferramentas, regras, confirmações)
// não depende de nenhum fornecedor. Hoje o padrão é "nenhum" → Modo Guiado (sem custo).
//
// Interface de um provedor:
//   { id, nome, disponivel: boolean,
//     async chat({ system, messages, tools, signal }) → { texto, chamadas: [{ id, nome, input }], parada, bruto } }
// messages (formato neutro):
//   { role: 'user'|'assistant', content: string }
//   { role: 'assistant', content: string, chamadas: [{ id, nome, input }] }
//   { role: 'tool', resultados: [{ id, nome, conteudo (string JSON), erro: boolean }] }
//
// Configuração (.env):
//   MENTOR_PROVIDER = none | anthropic | openai-compatible     (padrão: none)
//   MENTOR_MODEL    = modelo do provedor (anthropic: claude-opus-5-5)
//   MENTOR_BASE_URL / MENTOR_API_KEY   (openai-compatible: OpenAI, Ollama, LM Studio, vLLM…)

import { anthropicProvider } from './anthropic.js';
import { openAICompatibleProvider } from './openai-compatible.js';

const none = { id: 'none', nome: 'Modo Guiado (sem IA generativa)', disponivel: false };

let cached = null;
export function getProvider() {
  if (cached) return cached;
  const id = (process.env.MENTOR_PROVIDER || 'none').toLowerCase();
  try {
    if (id === 'anthropic') cached = anthropicProvider({ model: process.env.MENTOR_MODEL });
    else if (id === 'openai-compatible') cached = openAICompatibleProvider({ baseUrl: process.env.MENTOR_BASE_URL, apiKey: process.env.MENTOR_API_KEY, model: process.env.MENTOR_MODEL });
    else cached = none;
  } catch (err) {
    console.error(`[mentor] provedor "${id}" indisponível: ${err.message}. Usando Modo Guiado.`);
    cached = none;
  }
  return cached;
}

/** Para testes: injeta um provedor falso. */
export function setProvider(p) { cached = p; }
