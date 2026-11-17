// Camada de persistência: JSON local ou tabelas por entidade no Supabase (migrations 0002_entidades.sql).
// Toda leitura/escrita passa por estas funções (ver docs/03-arquitetura.md). Em memória a estrutura é a
// mesma nos dois modos; no Supabase, entities.js grava só as linhas que mudaram.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { usesSupabase, checkDatabaseEnvironment, projectRef, assertProjectAllowed, readLegacyState } from './database.js';
import { createEntityStore, arrayCollection, mapCollection } from './entities.js';
import { writeFileAtomic } from './storage.js';

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
    if (err.code !== 'ENOENT') {
      // Base ilegível: guarda uma cópia antes de seguir vazia. Sem isto, a primeira gravação sobrescreveria o
      // arquivo e apagaria de vez tudo o que ainda desse para recuperar à mão.
      const copia = `${config.dataFile}.ilegivel-${new Date().toISOString().replace(/[:.]/g, '-')}`;
      try { fs.copyFileSync(config.dataFile, copia); } catch { /* sem arquivo para copiar */ }
      console.error(`[store] falha ao ler base, iniciando vazia (cópia do arquivo em ${copia}):`, err.message);
    }
    return structuredClone(EMPTY);
  }
}

// Os 5 mestrados de exemplo do protótipo foram removidos (16/11/2026): só existem mestrados reais do DUA.
// Jornadas antigas que apontavam para eles ficam com "Mestrado a definir" na mesma universidade, e o
// estudante escolhe o mestrado real na Missão 1.3; as "Minhas opções" deixam de listá-los.
const REMOVED_DEMO_PROGRAMS = { 'ugr-demo-eng': 'ugr', 'ugr-demo-arq': 'ugr', 'ugr-demo-ciencias': 'ugr', 'us-demo-adm': 'us', 'uma-demo-tur': 'uma' };
export function dropRemovedDemoPrograms(data) {
  let changed = 0;
  for (const u of data.users || []) {
    let touched = false;
    for (const jr of u.journeys || []) {
      const uni = REMOVED_DEMO_PROGRAMS[jr.programaId];
      if (!uni) continue;
      jr.universidadeId ||= uni;
      jr.programaId = null;
      touched = true;
    }
    if (Array.isArray(u.choices) && u.choices.some((id) => id in REMOVED_DEMO_PROGRAMS)) {
      u.choices = u.choices.filter((id) => !(id in REMOVED_DEMO_PROGRAMS));
      touched = true;
    }
    if (touched) { u.updatedAt = new Date().toISOString(); changed += 1; }
  }
  return changed;
}
dropRemovedDemoPrograms(db); // base JSON: corrigida em memória e gravada na próxima escrita

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
    await persist({ full: true });
    console.log(`[store] Importado de ${importFrom.origem} para as tabelas: ${db.users.length} usuário(s), ${db.audit.length} registro(s) de auditoria.`);
  }
  const semDemo = dropRemovedDemoPrograms(db);
  if (semDemo) {
    await persist({ full: true });
    console.log(`[store] ${semDemo} estudante(s) com mestrado de exemplo removido: jornada ficou com o mestrado a definir.`);
  }
  if (env.aviso) console.warn(`[store] ${env.aviso}`);
  if (env.marcar) {
    db.meta = { ...(db.meta || {}), ambiente: env.marcar, marcadoEm: new Date().toISOString() };
    await persist({ full: true });
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

// Cada persist() recebe um número; a mutação de quem chamou já está na memória nesse momento. Um conflito
// desfaz na memória TODAS as mudanças pendentes do lote, inclusive as de outras requisições que ainda esperam
// a vez na fila: essas não podem responder "salvo" só porque, quando chegou a vez delas, não havia mais nada
// para gravar. `revertedUpTo` marca até qual chamada as mudanças podem ter sido desfeitas.
let persistTick = 0;
let revertedUpTo = 0;
const revertedError = () => Object.assign(new Error('Os dados mudaram em outra instância do servidor e esta alteração foi desfeita. Tente novamente.'), { code: 'ESTUVIA_CONFLICT' });
export const storeHealth = () => ({ ok: !lastWriteError, erro: lastWriteError });

// ---------- Tabelas sujas ----------
// Comparar TODAS as coleções a cada gravação custava ~80 ms de CPU com 1.000 estudantes e ~370 ms com 5.000
// (cada curtida relia todos os usuários, posts e a auditoria). Cada escrita marca as tabelas que mexeu e a
// gravação compara só essas. Uma comparação completa a cada FULL_DIFF_EVERY gravações pega qualquer mudança
// feita fora destas funções (ex.: grupos iniciais semeados numa leitura).
// dirty: tabela → null (a tabela toda) ou Set de ids (só essas linhas).
const dirty = new Map();
const FULL_DIFF_EVERY = 25;
let sinceFullDiff = 0;
const mark = (...tables) => { for (const t of tables) dirty.set(t, null); };
const markRow = (table, id) => {
  if (!dirty.has(table)) dirty.set(table, new Set());
  dirty.get(table)?.add(String(id));
};
const mergeDirty = (from) => {
  for (const [t, ids] of from) {
    if (ids === null) dirty.set(t, null);
    else ids.forEach((id) => markRow(t, id));
  }
};
const COMMUNITY_TABLES = ['community_posts', 'community_comments', 'community_groups', 'community_reports', 'community_media'];

function persist({ full: forceFull = false } = {}) {
  // Serializa as escritas. JSON: arquivo temporário + rename (evita JSON corrompido). Supabase: só as linhas
  // que mudaram, numa transação. A promessa devolvida REJEITA se a gravação falhar: quem chamou não pode responder "salvo".
  const snapshot = usesSupabase() ? null : JSON.stringify(db, null, 2);
  const tick = ++persistTick;
  const run = writing.then(async () => {
    if (usesSupabase()) {
      if (!entities) throw new Error('Supabase store was not initialized before writing.');
      const full = forceFull || ++sinceFullDiff >= FULL_DIFF_EVERY;
      const only = full ? null : new Map([...dirty].map(([t, ids]) => [t, ids && new Set(ids)]));
      if (full) sinceFullDiff = 0;
      dirty.clear();
      try {
        await entities.persist({ only });
      } catch (err) {
        if (err.code === 'ESTUVIA_CONFLICT') revertedUpTo = persistTick;
        // Falha de rede: as mudanças continuam na memória e a próxima gravação precisa comparar estas tabelas de novo.
        else if (only) mergeDirty(only); else sinceFullDiff = FULL_DIFF_EVERY;
        throw err;
      }
      if (revertedUpTo >= tick) throw revertedError();
      lastWriteError = null;
      return;
    }
    await fs.promises.mkdir(path.dirname(config.dataFile), { recursive: true });
    await writeFileAtomic(config.dataFile, snapshot, { mode: 0o600 });
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

// ---------- Conflito entre instâncias: tenta de novo ----------
// Na Vercel, duas instâncias podem gravar a mesma linha quase ao mesmo tempo (duas pessoas curtindo o mesmo post).
// O banco recusa a segunda (versão otimista) e a mudança é desfeita na memória. Antes isso virava "Algo deu errado"
// para o estudante. Agora a instância traz o que a outra gravou e aplica a MESMA mutação de novo sobre os dados
// atualizados (curtir continua sendo "alternar a curtida", agora sobre a lista certa). `apply` devolve
// { skip: true } quando não há nada a gravar (ex.: usuário não existe mais).
const CONFLICT_TRIES = 4;
async function writeWithRetry(apply) {
  for (let attempt = 1; ; attempt += 1) {
    const result = apply();
    if (result?.skip) return result.value;
    try {
      await persist();
      return result?.value;
    } catch (err) {
      if (err.code !== 'ESTUVIA_CONFLICT' || attempt >= CONFLICT_TRIES) throw err;
      await new Promise((r) => setTimeout(r, 15 * attempt + Math.random() * 25));
      await syncStore();
    }
  }
}

export const users = {
  findByEmail(email) {
    return db.users.find((u) => u.email === email.toLowerCase()) || null;
  },
  findById(id) {
    return db.users.find((u) => u.id === id) || null;
  },
  async create(user) {
    return writeWithRetry(() => {
      if (!db.users.some((u) => u.id === user.id)) db.users.push(user);
      markRow('users', user.id);
      return { value: user };
    });
  },
  async update(id, mutate) {
    return writeWithRetry(() => {
      const user = this.findById(id);
      if (!user) return { skip: true, value: null };
      mutate(user);
      user.updatedAt = new Date().toISOString();
      markRow('users', id);
      return { value: user };
    });
  },
  // Aplica a mesma mutação a vários estudantes (ex.: prazo de edital confirmado pela moderação).
  async updateWhere(predicate, mutate) {
    return writeWithRetry(() => {
      const touched = db.users.filter(predicate);
      if (!touched.length) return { skip: true, value: 0 };
      touched.forEach((u) => { mutate(u); u.updatedAt = new Date().toISOString(); });
      mark('users');
      return { value: touched.length };
    });
  },
  all() {
    return db.users;
  },
  // Registra atividade (último acesso, IP, dias ativos) sem mexer em updatedAt.
  async touch(id, mutate) {
    return writeWithRetry(() => {
      const user = this.findById(id);
      if (!user) return { skip: true, value: null };
      mutate(user);
      markRow('users', id);
      return { value: user };
    });
  },
  async remove(id) {
    await writeWithRetry(() => {
      db.users = db.users.filter((u) => u.id !== id);
      mark('users');
    });
  },
};

// Comunidade: posts, comentários, grupos, denúncias e metadados de imagens.
// Leituras recebem a coleção; escritas passam por mutate() para persistir de forma atômica.
export const community = {
  read(fn) {
    return fn(db.community);
  },
  async mutate(fn) {
    return writeWithRetry(() => {
      const value = fn(db.community);
      mark(...COMMUNITY_TABLES);
      return { value };
    });
  },
};

export const audit = {
  async log(event) {
    const entry = { id: newId(), at: new Date().toISOString(), ...event };
    await writeWithRetry(() => {
      if (!db.audit.some((e) => e.id === entry.id)) db.audit.push(entry);
      if (db.audit.length > 5000) { db.audit = db.audit.slice(-5000); mark('audit_log'); } // poda: exclusões
      else markRow('audit_log', entry.id);
    });
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
    // O uso de IA por estudante (ai-health.js) é anotado no próprio usuário dentro desta mutação.
    mark('analytics', 'users');
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
