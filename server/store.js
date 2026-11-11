// Camada de persistência: JSON local ou tabelas por entidade no Supabase (migrations 0002_entidades.sql).
// Toda leitura/escrita passa por estas funções (ver docs/03-arquitetura.md). Em memória a estrutura é a
// mesma nos dois modos; no Supabase, entities.js grava só as linhas que mudaram.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { usesSupabase, checkDatabaseEnvironment, projectRef, assertProjectAllowed, readLegacyState } from './database.js';
import { createEntityStore, arrayCollection, mapCollection } from './entities.js';

const EMPTY_COMMUNITY = () => ({ posts: [], comments: [], groups: [], reports: [], media: [] });
const EMPTY = { users: [], audit: [], community: EMPTY_COMMUNITY(), analytics: { days: {} } };
let db = load();
let writing = Promise.resolve();
let entities = null; // sincronizador das tabelas (só no modo Supabase, depois de initStore)

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

// Coleções da base principal → tabelas. A ordem importa: pais antes dos filhos (chaves estrangeiras).
const setCommunity = (k) => (list) => { db.community[k] = list; };
const mainCollections = () => [
  arrayCollection('users', () => db.users, (l) => { db.users = l; }),
  arrayCollection('community_posts', () => db.community.posts, setCommunity('posts')),
  arrayCollection('community_comments', () => db.community.comments, setCommunity('comments')),
  arrayCollection('community_groups', () => db.community.groups, setCommunity('groups')),
  arrayCollection('community_reports', () => db.community.reports, setCommunity('reports')),
  arrayCollection('community_media', () => db.community.media, setCommunity('media')),
  arrayCollection('audit_log', () => db.audit, (l) => { db.audit = l; }),
  // analytics = { days: { 'AAAA-MM-DD': {...} }, ai: {...}, ... } → linhas "day:AAAA-MM-DD" e uma por chave avulsa.
  mapCollection('analytics', {
    entries() {
      const m = new Map();
      for (const [d, v] of Object.entries(db.analytics.days || {})) if (v != null) m.set(`day:${d}`, v);
      for (const [k, v] of Object.entries(db.analytics)) if (k !== 'days' && v != null) m.set(k, v);
      return m;
    },
    put(id, v) { if (id.startsWith('day:')) (db.analytics.days ||= {})[id.slice(4)] = v; else db.analytics[id] = v; },
    del(id) { if (id.startsWith('day:')) delete db.analytics.days?.[id.slice(4)]; else delete db.analytics[id]; },
  }),
  mapCollection('estuvia_meta', {
    entries: () => new Map(db.meta ? [['main', db.meta]] : []),
    put: (_id, v) => { db.meta = v; },
    del: () => { delete db.meta; },
  }),
];

const hasData = (d) => !!(d && (d.users.length || d.audit.length || d.meta || Object.keys(d.analytics.days || {}).length
  || Object.values(d.community).some((list) => list.length)));

/** Run before accepting requests when DB_PROVIDER=supabase. */
export async function initStore() {
  if (!['json', 'supabase'].includes(config.databaseProvider)) throw new Error('DB_PROVIDER must be json or supabase.');
  if (!usesSupabase()) return;
  const ref = projectRef(config.supabaseUrl);
  assertProjectAllowed(); // barreira por URL (também aplicada em todo cliente Supabase: database.js e storage.js)
  const local = db; // base JSON local (semente de desenvolvimento)
  db = structuredClone(EMPTY);
  const store = createEntityStore(mainCollections(), { label: 'principal' });
  try {
    await store.load();
  } catch (err) {
    if (err.code === 'ESTUVIA_NO_SCHEMA') throw new Error('[store] Tabelas de entidades ausentes: aplique supabase/migrations/0002_entidades.sql no SQL Editor do projeto.');
    throw err;
  }
  db = normalize(db);

  // Tabelas vazias: importa do modelo antigo (estuvia_state, só leitura; a linha antiga fica como cópia de segurança).
  // Sem linha antiga: em desenvolvimento copia a base JSON local; em produção, nunca (dados pessoais de DEV).
  let importFrom = null;
  if (store.isEmpty()) {
    const legacy = await readLegacyState('main');
    if (legacy) importFrom = { origem: 'estuvia_state', data: normalize(legacy) };
    else if (config.appEnv !== 'production' && hasData(local)) importFrom = { origem: 'base JSON local', data: normalize(local) };
    if (importFrom) db = importFrom.data;
  }

  // Barreira DEV × PROD antes de qualquer gravação (inclusive da importação).
  const env = checkDatabaseEnvironment({ appEnv: config.appEnv, ref, prodRef: config.supabaseProdRef, devRef: config.supabaseDevRef, marker: db.meta?.ambiente || null, users: db.users.length });
  if (!env.ok) throw new Error(`[store] ${env.erro}`);
  entities = store;
  lastWriteError = null;
  if (importFrom) {
    await persist();
    console.log(`[store] Importado de ${importFrom.origem} para as tabelas: ${db.users.length} usuário(s), ${db.audit.length} registro(s) de auditoria.`);
  }
  if (env.aviso) console.warn(`[store] ${env.aviso}`);
  if (env.marcar) {
    db.meta = { ...(db.meta || {}), ambiente: env.marcar, marcadoEm: new Date().toISOString() };
    await persist();
    console.log(`[store] Banco ${ref} vazio marcado como "${env.marcar}".`);
  }
}

/**
 * Na Vercel há várias instâncias, cada uma com sua cópia em memória. Antes de cada requisição /api,
 * traz as linhas que outras instâncias gravaram (ex.: conta criada lá → sem isto, esta responde 401).
 * Espera as gravações pendentes desta instância para nunca trocar dados no meio de uma escrita.
 */
export async function syncStore() {
  if (!entities) return;
  await writing;
  await entities.sync();
}

// Última falha de gravação (null quando a última escrita deu certo): exposta em /api/health.
let lastWriteError = null;
export const storeHealth = () => ({ ok: !lastWriteError, erro: lastWriteError });

function persist() {
  // Serializa as escritas. JSON: arquivo temporário + rename (evita JSON corrompido). Supabase: só as linhas
  // que mudaram, numa transação. A promessa devolvida REJEITA se a gravação falhar: quem chamou não pode responder "salvo".
  const snapshot = usesSupabase() ? null : JSON.stringify(db, null, 2);
  const run = writing.then(async () => {
    if (usesSupabase()) {
      if (!entities) throw new Error('Supabase store was not initialized before writing.');
      await entities.persist();
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
