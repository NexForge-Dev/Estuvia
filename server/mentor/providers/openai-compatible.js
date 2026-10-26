// Provedor genérico para APIs no formato "chat completions" com ferramentas
// (OpenAI e servidores locais/open-source como Ollama, LM Studio ou vLLM).
// Gemini e outros podem entrar como novos arquivos com a mesma interface (ver providers/index.js).
// Modelos locais evitam custo por mensagem, mas exigem hardware/hospedagem com GPU — avalie antes.

export function openAICompatibleProvider({ baseUrl, apiKey, model } = {}) {
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
      const res = await fetch(url, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
        body: JSON.stringify({
          model,
          messages: toOpenAI(system, messages),
          tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.descricao, parameters: t.entrada } })),
        }),
      });
      if (!res.ok) throw new Error(`erro do provedor (${res.status})`);
      const data = await res.json();
      const msg = data.choices?.[0]?.message || {};
      const chamadas = (msg.tool_calls || []).map((c) => {
        let input = {};
        try { input = JSON.parse(c.function?.arguments || '{}'); } catch { input = { __invalido: true }; }
        return { id: c.id, nome: c.function?.name, input };
      });
      return { texto: msg.content || '', chamadas, parada: chamadas.length ? 'tool_use' : data.choices?.[0]?.finish_reason || 'stop', bruto: null };
    },
  };
}
