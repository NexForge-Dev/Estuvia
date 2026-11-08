// Cliente da API. O cabeçalho X-Requested-With é exigido pelo servidor (proteção CSRF).

async function request(method, url, body) {
  const res = await fetch(`/api${url}`, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'travessia' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Não foi possível concluir. Tente novamente.');
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  patch: (url, body) => request('PATCH', url, body),
  del: (url, body) => request('DELETE', url, body),

  // Lê a resposta do assistente como Server-Sent Events via fetch (permite POST + cookie).
  async ask(payload, { onDelta, onReplace, onDone }) {
    const res = await fetch('/api/assistant/ask', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'travessia' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'O assistente não respondeu.');
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const event = /^event: (.+)$/m.exec(chunk)?.[1];
        const data = JSON.parse(/^data: (.+)$/m.exec(chunk)?.[1] || '{}');
        if (event === 'delta') onDelta?.(data.text);
        else if (event === 'replace') onReplace?.(data.text);
        else if (event === 'done') onDone?.(data);
      }
    }
  },
};
