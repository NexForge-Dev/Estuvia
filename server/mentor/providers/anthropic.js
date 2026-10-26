// Provedor Anthropic (Claude) via SDK oficial. Só é carregado com MENTOR_PROVIDER=anthropic
// e credencial no backend (ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN). As chaves nunca vão ao navegador.
import Anthropic from '@anthropic-ai/sdk';

export function anthropicProvider({ model } = {}) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) throw new Error('credencial Anthropic ausente');
  const client = new Anthropic();
  const MODEL = model || 'claude-opus-5-5';

  const toAnthropic = (messages) => messages.map((m) => {
    if (m.role === 'tool') {
      return { role: 'user', content: m.resultados.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: r.conteudo, ...(r.erro ? { is_error: true } : {}) })) };
    }
    // Resposta anterior do modelo: devolvida sem alterações (inclui blocos de raciocínio).
    if (m.role === 'assistant' && m.bruto) return { role: 'assistant', content: m.bruto };
    return { role: m.role, content: m.content };
  });

  return {
    id: 'anthropic',
    nome: `Claude (${MODEL})`,
    disponivel: true,
    async chat({ system, messages, tools, signal }) {
      try {
        const res = await client.beta.messages.create({
          model: MODEL,
          max_tokens: 16000,
          output_config: { effort: 'low' },
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          tools: tools.map((t) => ({ name: t.name, description: t.descricao, input_schema: t.entrada })),
          messages: toAnthropic(messages),
        }, { signal });
        const texto = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
        const chamadas = res.content.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, nome: b.name, input: b.input }));
        return { texto, chamadas, parada: res.stop_reason, bruto: res.content };
      } catch (err) {
        if (err instanceof Anthropic.RateLimitError) throw Object.assign(new Error('limite de uso da IA atingido'), { retry: true });
        if (err instanceof Anthropic.AuthenticationError) throw new Error('credencial Anthropic inválida');
        if (err instanceof Anthropic.APIError) throw new Error(`erro da API (${err.status})`);
        throw err;
      }
    },
  };
}
