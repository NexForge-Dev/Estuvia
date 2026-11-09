// Revisões editoriais da Carteira de Documentos, sem mexer no código das telas.
//
// O catálogo (content/document-catalog.js) é a regra base. Quando uma exigência muda (um consulado passa a pedir
// algo, uma fonte é revista), a equipe registra aqui — pelo painel admin (PUT /api/admin/document-rules/:docId):
//   aviso      texto curto mostrado no detalhe do documento ("Desde março, o consulado X pede…")
//   revisadoEm data da última revisão da informação
//   fontes     ids de content/sources.js que passam a valer para o documento
// Persistência: data/document-rules.json (local) ou objeto no Supabase Storage (serverless).

import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { sourceById } from './content/sources.js';
import { readMeta, writeMeta, usesSupabaseStorage } from './storage.js';

const FILE = 'document-rules.json';
const file = () => process.env.DOC_RULES_FILE || path.join(path.dirname(config.dataFile), FILE);
let rules = null;
let writing = Promise.resolve();

function loadLocal() {
  try { return JSON.parse(fs.readFileSync(file(), 'utf8')) || {}; } catch (err) {
    if (err.code !== 'ENOENT') console.error('[documentos] regras editoriais ilegíveis, ignorando:', err.message);
    return {};
  }
}

/** Carrega as regras do storage remoto antes de atender (serverless). No local é síncrono. */
export async function initDocRules() {
  if (!usesSupabaseStorage()) { rules ??= loadLocal(); return; }
  try {
    const obj = await readMeta(FILE);
    rules = obj && typeof obj === 'object' ? obj : {};
  } catch (err) {
    console.error('[documentos] regras editoriais ilegíveis, ignorando:', err.message);
    rules = {};
  }
}

export function docRule(docId) {
  rules ??= usesSupabaseStorage() ? {} : loadLocal();
  return rules[docId] || null;
}

export function allDocRules() {
  rules ??= usesSupabaseStorage() ? {} : loadLocal();
  return rules;
}

/** Grava (ou remove, com null) a revisão de um documento. Valida fontes contra o cadastro. */
export async function setDocRule(docId, value, por) {
  rules ??= usesSupabaseStorage() ? {} : loadLocal();
  if (value === null) delete rules[docId];
  else {
    const fontes = (value.fontes || []).filter((id) => sourceById(id));
    rules[docId] = { ...(value.aviso ? { aviso: value.aviso } : {}), ...(value.revisadoEm ? { revisadoEm: value.revisadoEm } : {}), ...(fontes.length ? { fontes } : {}), atualizadoEm: new Date().toISOString(), por };
  }
  const snapshot = JSON.parse(JSON.stringify(rules));
  writing = writing.then(async () => {
    if (usesSupabaseStorage()) await writeMeta(FILE, snapshot);
    else {
      await fs.promises.mkdir(path.dirname(file()), { recursive: true });
      const tmp = `${file()}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmp, JSON.stringify(snapshot, null, 2));
      await fs.promises.rename(tmp, file());
    }
  }).catch((err) => console.error('[documentos] falha ao gravar regras:', err.message));
  await writing;
  return rules[docId] || null;
}

/** Para testes. */
export const resetDocRules = () => { rules = {}; };
