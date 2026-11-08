// Atualizações ao vivo (Server-Sent Events em /api/events). O navegador reconecta sozinho se a conexão cair.
// Cada aviso vira um toast e um evento "estuvia:live" no window; as telas que mostram aqueles dados
// (Radar, Minha viagem) escutam e recarregam o que for delas. Nada é alterado sem o estudante ver.
import { toast } from './ui.js';

let source = null;

const MESSAGES = {
  'radar-alerta': (d) => `${d.titulo}`,
  'radar-atualizado': (d) => `Dados oficiais atualizados agora (${d.fonte}).`,
  'preco-passagem': (d) => `${d.titulo}`,
};

export function startLive() {
  if (source || typeof EventSource === 'undefined') return;
  source = new EventSource('/api/events', { withCredentials: true });
  for (const type of Object.keys(MESSAGES)) {
    source.addEventListener(type, (e) => {
      let data = {};
      try { data = JSON.parse(e.data); } catch { return; }
      toast(MESSAGES[type](data), 'info');
      window.dispatchEvent(new CustomEvent('estuvia:live', { detail: { type, data } }));
    });
  }
  // Sessão expirada: o servidor responde 401 e o navegador desiste; paramos de vez até o próximo login.
  source.addEventListener('error', () => { if (source?.readyState === EventSource.CLOSED) stopLive(); });
}

export function stopLive() {
  source?.close();
  source = null;
}

/** Escuta avisos ao vivo enquanto o elemento estiver na tela. */
export function onLive(el, types, handler) {
  const listener = (e) => {
    if (!el.isConnected) return window.removeEventListener('estuvia:live', listener);
    if (types.includes(e.detail.type)) handler(e.detail);
  };
  window.addEventListener('estuvia:live', listener);
}
