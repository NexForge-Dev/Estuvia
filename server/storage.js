// Armazenamento de arquivos: disco local (padrão) ou Supabase Storage (necessário em serverless,
// onde o disco é efêmero e somente leitura). A interface isola o resto do servidor.
//
// Provider: STORAGE_PROVIDER=local|supabase. Sem a variável, usa supabase quando DB_PROVIDER=supabase.
// Buckets privados: documentos (cifrados), imagens da comunidade e metadados editoriais.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config } from './config.js';
import { usesSupabase, assertProjectAllowed } from './database.js';

/**
 * Grava um arquivo local de forma atômica: temporário + rename. O nome do temporário é único por chamada
 * (duas gravações simultâneas do mesmo arquivo não escrevem no mesmo temporário). No Windows o rename sobre
 * um arquivo aberto por outro processo (antivírus, indexador, editor) falha com EPERM/EBUSY/EACCES por alguns
 * milissegundos: tenta de novo antes de desistir. Em falha, o temporário é apagado e o original fica intacto.
 */
export async function writeFileAtomic(file, data, options = {}, { tries = 8, rename = fs.promises.rename } = {}) {
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2, 10)}.tmp`;
  await fs.promises.writeFile(tmp, data, options);
  for (let i = 1; ; i++) {
    try {
      await rename(tmp, file);
      return;
    } catch (err) {
      if (i >= tries || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) {
        await fs.promises.unlink(tmp).catch(() => {});
        throw err;
      }
      await new Promise((ok) => setTimeout(ok, 20 * i));
    }
  }
}

const DOCS_BUCKET = process.env.SUPABASE_DOCS_BUCKET || 'estuvia-documents';
const MEDIA_BUCKET = process.env.SUPABASE_MEDIA_BUCKET || 'estuvia-community';
const META_BUCKET = process.env.SUPABASE_META_BUCKET || 'estuvia-meta';

const provider = () => process.env.STORAGE_PROVIDER || (usesSupabase() ? 'supabase' : 'local');
export const usesSupabaseStorage = () => provider() === 'supabase';

let clientPromise = null;
let supabaseClient = null;

async function client() {
  if (!usesSupabaseStorage()) return null;
  if (!config.supabaseUrl) throw new Error('SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL) não definido.');
  assertProjectAllowed(); // DEV nunca toca o Storage de PROD (e vice-versa)
  if (!config.supabaseSecretKey) throw new Error('SUPABASE_SECRET_KEY não definido. Use a chave secret do projeto; nunca a publishable key.');
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) => {
    supabaseClient = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return supabaseClient;
  });
  return clientPromise;
}

const ensured = new Set();
async function bucket(name) {
  const db = await client();
  if (ensured.has(name)) return db.storage.from(name);
  const { data } = await db.storage.getBucket(name);
  if (!data) {
    const { error } = await db.storage.createBucket(name, { public: false });
    // Outra instância pode ter criado o bucket entre o getBucket e o createBucket.
    if (error && !/already exists|duplicate/i.test(error.message)) throw new Error(`Supabase Storage: ${error.message}`);
  }
  ensured.add(name);
  return db.storage.from(name);
}

async function upload(name, key, data, contentType, upsert = false) {
  const b = await bucket(name);
  const { error } = await b.upload(key, data, { contentType, upsert });
  if (error) throw new Error(`Supabase Storage: ${error.message}`);
}

async function download(name, key) {
  const b = await bucket(name);
  const { data, error } = await b.download(key);
  if (error) throw new Error(`Supabase Storage: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

// Arquivo que já não existe não é falha de exclusão; qualquer outro erro sobe para quem chamou.
const ignoreMissing = (err) => { if (err?.code !== 'ENOENT') throw err; };

async function remove(name, keys) {
  if (!keys.length) return;
  const b = await bucket(name);
  const { error } = await b.remove(keys);
  if (error) throw new Error(`Supabase Storage: ${error.message}`);
}

// ---------- Carteira de documentos (cifrados) ----------

const docKey = (userId, id) => `${userId}/${id}.bin`;
const docDir = (userId) => path.join(config.docsDir, userId);
const docPath = (userId, id) => path.join(docDir(userId), `${id}.bin`);

export async function putDocument(userId, id, data) {
  if (!usesSupabaseStorage()) {
    await fs.promises.mkdir(docDir(userId), { recursive: true, mode: 0o700 });
    await fs.promises.writeFile(docPath(userId, id), data, { mode: 0o600 });
    return;
  }
  await upload(DOCS_BUCKET, docKey(userId, id), data, 'application/octet-stream');
}

export async function getDocument(userId, id) {
  if (!usesSupabaseStorage()) return fs.promises.readFile(docPath(userId, id));
  return download(DOCS_BUCKET, docKey(userId, id));
}

export async function deleteDocument(userId, id) {
  if (!usesSupabaseStorage()) {
    await fs.promises.unlink(docPath(userId, id)).catch(ignoreMissing);
    return;
  }
  // O erro sobe: quem chama registra a exclusão pendente (LGPD) em vez de perdê-la em silêncio.
  await remove(DOCS_BUCKET, [docKey(userId, id)]);
}

export async function purgeDocuments(userId) {
  if (!/^[\w-]+$/.test(userId)) return;
  if (!usesSupabaseStorage()) {
    await fs.promises.rm(docDir(userId), { recursive: true, force: true });
    return;
  }
  const b = await bucket(DOCS_BUCKET);
  // Em lotes até a pasta esvaziar: uma listagem só traz até 1000 arquivos (exclusão de conta não pode deixar sobras).
  for (let rodada = 0; rodada < 100; rodada++) {
    const { data, error } = await b.list(userId, { limit: 1000 });
    if (error) throw new Error(`Supabase Storage: ${error.message}`);
    const files = (data || []).filter((f) => f.id);
    if (!files.length) return;
    await remove(DOCS_BUCKET, files.map((f) => `${userId}/${f.name}`));
  }
  throw new Error(`Supabase Storage: arquivos de ${userId} não terminaram de ser excluídos.`);
}

// ---------- Imagens da comunidade ----------

const mediaKey = (id, ext) => `${id}.${ext}`;

export async function putMedia(id, ext, data, mime) {
  if (!usesSupabaseStorage()) {
    await fs.promises.mkdir(config.mediaDir, { recursive: true });
    await fs.promises.writeFile(path.join(config.mediaDir, mediaKey(id, ext)), data, { mode: 0o600 });
    return;
  }
  await upload(MEDIA_BUCKET, mediaKey(id, ext), data, mime);
}

export async function getMedia(id, ext) {
  if (!usesSupabaseStorage()) return fs.promises.readFile(path.join(config.mediaDir, mediaKey(id, ext)));
  return download(MEDIA_BUCKET, mediaKey(id, ext));
}

export async function deleteMedia(id, ext) {
  if (!usesSupabaseStorage()) {
    await fs.promises.unlink(path.join(config.mediaDir, mediaKey(id, ext))).catch(ignoreMissing);
    return;
  }
  await remove(MEDIA_BUCKET, [mediaKey(id, ext)]);
}

// ---------- Metadados (revisões editoriais dos documentos) ----------

export async function readMeta(name) {
  if (!usesSupabaseStorage()) {
    try { return JSON.parse(await fs.promises.readFile(path.join(path.dirname(config.dataFile), name), 'utf8')); } catch { return null; }
  }
  try { return JSON.parse((await download(META_BUCKET, name)).toString('utf8')); } catch { return null; }
}

export async function writeMeta(name, value) {
  const snapshot = Buffer.from(JSON.stringify(value, null, 2));
  if (!usesSupabaseStorage()) {
    const file = path.join(path.dirname(config.dataFile), name);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await writeFileAtomic(file, snapshot);
    return;
  }
  await upload(META_BUCKET, name, snapshot, 'application/json', true);
}

// ---------- Evidências do Radar (HTML original e conteúdo extraído de cada snapshot) ----------
// Endereçadas pelo hash do conteúdo: gravar de novo a mesma página é idempotente e nada é sobrescrito com outro
// conteúdo. Comprimidas (gzip). Ficam no bucket privado de metadados (sem bucket novo) ou, sem Supabase, em disco.
// Não são apagadas pela retenção do Radar (docs/11-radar.md).


const EVIDENCE_PREFIX = 'radar-evidencias';
const evidenceDir = () => process.env.RADAR_EVIDENCE_DIR || path.join(path.dirname(config.dataFile), EVIDENCE_PREFIX);
const evidenceName = (key) => {
  if (!/^[a-f0-9]{64}\.(html|json)$/.test(key)) throw new Error(`Chave de evidência inválida: ${key}`);
  return `${key}.gz`;
};
export const evidenceRef = (key) => `${usesSupabaseStorage() ? `supabase:${META_BUCKET}` : 'local'}/${EVIDENCE_PREFIX}/${key}.gz`;

/** Grava uma evidência (texto). Devolve a referência durável. Lança erro se não conseguir gravar. */
export async function putEvidence(key, text) {
  const name = evidenceName(key);
  const gz = zlib.gzipSync(Buffer.from(String(text), 'utf8'));
  if (!usesSupabaseStorage()) {
    const dir = evidenceDir();
    await fs.promises.mkdir(dir, { recursive: true });
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) await writeFileAtomic(file, gz);
    return evidenceRef(key);
  }
  await upload(META_BUCKET, `${EVIDENCE_PREFIX}/${name}`, gz, 'application/gzip', true);
  return evidenceRef(key);
}

/** Lê uma evidência gravada (texto) ou null se não existir. */
export async function getEvidence(key) {
  const name = evidenceName(key);
  try {
    const gz = usesSupabaseStorage() ? await download(META_BUCKET, `${EVIDENCE_PREFIX}/${name}`) : await fs.promises.readFile(path.join(evidenceDir(), name));
    return zlib.gunzipSync(gz).toString('utf8');
  } catch {
    return null;
  }
}
