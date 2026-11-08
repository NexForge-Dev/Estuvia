// Atualizações ao vivo (Server-Sent Events): o servidor avisa o navegador quando algo muda, sem recarregar.
//
//   emitTo(userId, tipo, dados)   alerta pessoal (ex.: "inscrições abertas" do Radar, preço de passagem)
//   broadcast(tipo, dados)        mudança pública (ex.: o Radar publicou um calendário oficial novo)
//
// Só avisos curtos trafegam aqui; os dados completos continuam vindo da API (com as mesmas permissões).
// Grátis: sem serviço externo. Com vários processos (escala horizontal), troque este barramento por
// Redis pub/sub ou PostgreSQL LISTEN/NOTIFY mantendo a mesma interface.

const MAX_PER_USER = 5;
const HEARTBEAT_MS = 25000;
const clients = new Map(); // userId → Set<res>

const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

function write(res, chunk) {
  try { res.write(chunk); } catch { /* conexão já fechada: será removida no "close" */ }
}

/** Registra uma conexão SSE já aberta (cabeçalhos enviados pela rota). */
export function subscribe(userId, res) {
  const set = clients.get(userId) || new Set();
  // Muitas abas abertas: fecha a mais antiga para não acumular conexões.
  if (set.size >= MAX_PER_USER) { const oldest = set.values().next().value; set.delete(oldest); oldest.end(); }
  set.add(res);
  clients.set(userId, set);
  const beat = setInterval(() => write(res, `: ping ${Date.now()}\n\n`), HEARTBEAT_MS);
  beat.unref?.();
  const drop = () => {
    clearInterval(beat);
    set.delete(res);
    if (!set.size) clients.delete(userId);
  };
  res.on('close', drop);
  return drop;
}

export function emitTo(userId, event, data = {}) {
  const set = clients.get(userId);
  if (!set) return 0;
  const chunk = frame(event, { ...data, em: new Date().toISOString() });
  for (const res of set) write(res, chunk);
  return set.size;
}

export function broadcast(event, data = {}) {
  const chunk = frame(event, { ...data, em: new Date().toISOString() });
  let n = 0;
  for (const set of clients.values()) for (const res of set) { write(res, chunk); n += 1; }
  return n;
}

export const liveStats = () => ({ usuarios: clients.size, conexoes: [...clients.values()].reduce((n, s) => n + s.size, 0) });
