// Camada de persistência do MVP: JSON local ou estado JSONB no Supabase.
// Toda leitura/escrita passa por estas funções (ver docs/03-arquitetura.md).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { loadState, loadIfChanged, saveState, usesSupabase, checkDatabaseEnvironment, projectRef, assertProjectAllowed } from './database.js';

const EMPTY_COMMUNITY = () => ({ posts: [], comments: [], groups: [], reports: [], media: [] });
const EMPTY = { users: [], audit: [], community: EMPTY_COMMUNITY(), analytics: { days: {} } };
let db = load();
let writing = Promise.resolve();
let remoteVersion = null;

function load() {
  try {
    const raw = fs.readFileSync(config.dataFile, 'utf8');
    const data = { ...structuredClone(EMPTY), ...JSON.parse(raw) };
    data.community = { ...EMPTY_COMMUNITY(), ...data.community };
    data.analytics = { days: {}, ...data.analytics };
    return data;
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('[store] falha ao ler base, iniciando vazia:', err.message);
    return structuredClone(EMPTY);
  }
}

const normalize = (value) => {
  const data = { ...structuredClone(EMPTY), ...(value || {}) };
  data.community = { ...EMPTY_COMMUNITY(), ...data.community };
  data.analytics = { days: {}, ...data.analytics };
  return data;
};

/** Run before accepting requests when DB_PROVIDER=supabase. */
export async function initStore() {
  if (!['json', 'supabase'].includes(config.databaseProvider)) throw new Error('DB_PROVIDER must be json or supabase.');
  if (!usesSupabase()) return;
  const ref = projectRef(config.supabaseUrl);
  assertProjectAllowed(); // barreira por URL (também aplicada em todo cliente Supabase: database.js e storage.js)
  // Primeira execução copia a base JSON local para a linha nova; em produção, nunca (dados pessoais de DEV).
  const remote = await loadState('main', config.appEnv === 'production' ? structuredClone(EMPTY) : db);
  const state = normalize(remote.state);
  const env = checkDatabaseEnvironment({ appEnv: config.appEnv, ref, prodRef: config.supabaseProdRef, devRef: config.supabaseDevRef, marker: state.meta?.ambiente || null, users: state.users.length });
  if (!env.ok) throw new Error(`[store] ${env.erro}`);
  db = state;
  remoteVersion = remote.version;
  lastWriteError = null;
  if (env.aviso) console.warn(`[store] ${env.aviso}`);
  if (env.marcar) {
    db.meta = { ...(db.meta || {}), ambiente: env.marcar, marcadoEm: new Date().toISOString() };
    await persist();
    console.log(`[store] Banco ${ref} vazio marcado como "${env.marcar}".`);
  }
}

/**
 * Na Vercel há várias instâncias, cada uma com sua cópia em memória. Antes de cada requisição /api,
 * recarrega a base se outra instância gravou (ex.: conta criada lá → sem isto, esta responde 401).
 * Espera as gravações pendentes desta instância para nunca trocar o estado no meio de uma escrita.
 */
export async function syncStore() {
  if (!usesSupabase() || remoteVersion === null) return;
  await writing;
  const remote = await loadIfChanged('main', remoteVersion);
  if (!remote) return;
  db = normalize(remote.state);
  remoteVersion = remote.version;
}

// Última falha de gravação (null quando a última escrita deu certo): exposta em /api/health.
let lastWriteError = null;
export const storeHealth = () => ({ ok: !lastWriteError, erro: lastWriteError });

function persist() {
  // Serializa as escritas e grava em arquivo temporário + rename (evita JSON corrompido).
  // A promessa devolvida REJEITA se a gravação falhar: quem chamou não pode responder "salvo".
  const snapshot = JSON.stringify(db, null, 2);
  const run = writing.then(async () => {
    if (usesSupabase()) {
      if (remoteVersion === null) throw new Error('Supabase store was not initialized before writing.');
      remoteVersion = await saveState('main', JSON.parse(snapshot), remoteVersion);
      lastWriteError = null;
      return;
    }
    await fs.promises.mkdir(path.dirname(config.dataFile), { recursive: true });
    const tmp = `${config.dataFile}.${process.pid}.tmp`;
    await fs.promises.writeFile(tmp, snapshot, { mode: 0o600 });
    await fs.promises.rename(tmp, config.dataFile);
    lastWriteError = null;
  });
  // A fila continua andando mesmo após uma falha (a próxima escrita grava o estado completo).
  writing = run.catch((err) => {
    lastWriteError = { mensagem: err.message, em: new Date().toISOString() };
    console.error('[store] falha ao gravar:', err.message);
  });
  return run;
}

export const newId = () => crypto.randomUUID();

export const users = {
  findByEmail(email) {
    return db.users.find((u) => u.email === email.toLowerCase()) || null;
  },
  findById(id) {
    return db.users.find((u) => u.id === id) || null;
  },
  async create(user) {
    db.users.push(user);
    await persist();
    return user;
  },
  async update(id, mutate) {
    const user = this.findById(id);
    if (!user) return null;
    mutate(user);
    user.updatedAt = new Date().toISOString();
    await persist();
    return user;
  },
  // Aplica a mesma mutação a vários estudantes (ex.: prazo de edital confirmado pela moderação).
  async updateWhere(predicate, mutate) {
    const touched = db.users.filter(predicate);
    touched.forEach((u) => { mutate(u); u.updatedAt = new Date().toISOString(); });
    if (touched.length) await persist();
    return touched.length;
  },
  all() {
    return db.users;
  },
  // Registra atividade (último acesso, IP, dias ativos) sem mexer em updatedAt.
  async touch(id, mutate) {
    const user = this.findById(id);
    if (!user) return null;
    mutate(user);
    await persist();
    return user;
  },
  async remove(id) {
    db.users = db.users.filter((u) => u.id !== id);
    await persist();
  },
};

// Comunidade: posts, comentários, grupos, denúncias e metadados de imagens.
// Leituras recebem a coleção; escritas passam por mutate() para persistir de forma atômica.
export const community = {
  read(fn) {
    return fn(db.community);
  },
  async mutate(fn) {
    const result = fn(db.community);
    await persist();
    return result;
  },
};

export const audit = {
  async log(event) {
    db.audit.push({ id: newId(), at: new Date().toISOString(), ...event });
    if (db.audit.length > 5000) db.audit = db.audit.slice(-5000);
    await persist();
  },
  recent(limit = 200, predicate = () => true) {
    const out = [];
    for (let i = db.audit.length - 1; i >= 0 && out.length < limit; i -= 1) {
      if (predicate(db.audit[i])) out.push(db.audit[i]);
    }
    return out;
  },
};

// Uso dos módulos (painel admin). Acessos são frequentes: agrupamos a gravação a cada 5 s.
let analyticsTimer = null;
export const analytics = {
  read(fn) {
    return fn(db.analytics);
  },
  mutate(fn) {
    const result = fn(db.analytics);
    if (!analyticsTimer) {
      analyticsTimer = setTimeout(() => { analyticsTimer = null; persist().catch(() => {}); }, 5000);
      analyticsTimer.unref?.();
    }
    return result;
  },
};

export const flush = () => {
  if (analyticsTimer) { clearTimeout(analyticsTimer); analyticsTimer = null; persist().catch(() => {}); }
  return writing;
};
