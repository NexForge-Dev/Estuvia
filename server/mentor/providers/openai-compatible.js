// Provedor genérico para APIs no formato "chat completions" com ferramentas
// (OpenAI e servidores locais/open-source como Ollama, LM Studio ou vLLM).
// Gemini e outros podem entrar como novos arquivos com a mesma interface (ver providers/index.js).
// Modelos locais evitam custo por mensagem, mas exigem hardware/hospedagem com GPU — avalie antes.
import { providerTimeoutMs } from './index.js';

export function openAICompatibleProvider({ baseUrl, apiKey, model, fetchImpl = globalThis.fetch } = {}) {
  if (!baseUrl || !model) throw new Error('defina MENTOR_BASE_URL e MENTOR_MODEL');
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

  const toOpenAI = (system, messages) => [
    { role: 'system', content: system },
    ...messages.flatMap((m) => {
      if (m.role === 'tool') return m.resultados.map((r) => ({ role: 'tool', tool_call_id: r.id, content: r.conteudo }));
      if (m.role === 'assistant' && m.chamadas?.length) {
        return [{ role: 'assistant', content: m.content || null, tool_calls: m.chamadas.map((c) => ({ id: c.id, type: 'function', function: { name: c.nome, arguments: JSON.stringify(c.input) } })) }];
      }
      return [{ role: m.role, content: m.content }];
    }),
  ];

  return {
    id: 'openai-compatible',
    nome: `Modelo compatível (${model})`,
    disponivel: true,
    async chat({ system, messages, tools, signal }) {
      // Sem prazo, um servidor travado prenderia a requisição do estudante indefinidamente.
      const res = await fetchImpl(url, {
        method: 'POST',
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(providerTimeoutMs())]) : AbortSignal.timeout(providerTimeoutMs()),
        headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
        body: JSON.stringify({
          model,
          messages: toOpenAI(system, messages),
          tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.descricao, parameters: t.entrada } })),
        }),
      });
      if (!res.ok) throw new Error(`erro do provedor (${res.status})`);
      let data;
      try { data = await res.json(); } catch { throw new Error('resposta do provedor não é JSON'); }
      const msg = data?.choices?.[0]?.message;
      if (!msg || typeof msg !== 'object') throw new Error('resposta do provedor sem mensagem');
      const chamadas = (Array.isArray(msg.tool_calls) ? msg.tool_calls : []).map((c) => {
        let input = {};
        try { input = JSON.parse(c.function?.arguments || '{}'); } catch { input = { __invalido: true }; }
        if (!input || typeof input !== 'object' || Array.isArray(input)) input = { __invalido: true };
        return { id: c.id, nome: c.function?.name, input };
      });
      const uso = data.usage ? { entrada: data.usage.prompt_tokens || 0, saida: data.usage.completion_tokens || 0 } : null;
      return { texto: typeof msg.content === 'string' ? msg.content : '', chamadas, parada: chamadas.length ? 'tool_use' : data.choices[0].finish_reason || 'stop', bruto: null, uso };
    },
  };
}
