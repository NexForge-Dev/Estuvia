// Camada de persistência do MVP: arquivo JSON com escrita atômica.
// Toda leitura/escrita passa por estas funções — para migrar a PostgreSQL basta
// reimplementar esta interface (ver docs/03-arquitetura.md).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

const EMPTY_COMMUNITY = () => ({ posts: [], comments: [], groups: [], reports: [], media: [] });
const EMPTY = { users: [], audit: [], community: EMPTY_COMMUNITY() };
let db = load();
let writing = Promise.resolve();

function load() {
  try {
    const raw = fs.readFileSync(config.dataFile, 'utf8');
    const data = { ...structuredClone(EMPTY), ...JSON.parse(raw) };
    data.community = { ...EMPTY_COMMUNITY(), ...data.community };
    return data;
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('[store] falha ao ler base, iniciando vazia:', err.message);
    return structuredClone(EMPTY);
  }
}

function persist() {
  // Serializa as escritas e grava em arquivo temporário + rename (evita JSON corrompido).
  const snapshot = JSON.stringify(db, null, 2);
  writing = writing.then(async () => {
    await fs.promises.mkdir(path.dirname(config.dataFile), { recursive: true });
    const tmp = `${config.dataFile}.${process.pid}.tmp`;
    await fs.promises.writeFile(tmp, snapshot, { mode: 0o600 });
    await fs.promises.rename(tmp, config.dataFile);
  }).catch((err) => console.error('[store] falha ao gravar:', err.message));
  return writing;
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
};

export const flush = () => writing;
