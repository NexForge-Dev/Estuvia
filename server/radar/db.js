// Persistência do Radar: JSON local ou estado JSONB próprio no Supabase.
// Separado da base principal para que o atualizador grave sem disputar dados dos usuários.
//
// Coleções (modelo de dados da especificação):
//   sources         SourceRegistry       — fontes monitoradas e sua saúde
//   snapshots       SourceSnapshot       — cada coleta com hash e conteúdo extraído
//   programs        programas oficiais (catálogo da universidade)
//   opportunities   Opportunity          — programa × ano acadêmico
//   windows         AdmissionWindow      — janelas de candidatura por procedimento/curso/fase
//   events          AdmissionEvent       — adjudicações, reclamações, confirmação, resultas…
//   availability    ProgramAvailability  — vagas ofertadas/remanescentes (só com fonte oficial)
//   revisions       OpportunityRevision  — histórico campo a campo, com evidência
//   reviews         fila de revisão (conflitos, extração incerta, alterações críticas)
//   runs            execuções do atualizador
//   subscriptions   OpportunitySubscription
//   alerts          OpportunityAlert
//   agendaLinks     vínculo entre atividade da Agenda e data oficial (para detectar mudanças)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { loadState, loadIfChanged, saveState, usesSupabase } from '../database.js';

const COLLECTIONS = ['sources', 'snapshots', 'programs', 'opportunities', 'windows', 'events', 'availability', 'revisions', 'reviews', 'runs', 'subscriptions', 'alerts', 'agendaLinks'];
const LIMITS = { runs: 1000, snapshots: 600, alerts: 20000, revisions: 20000 };

export const radarFile = () => process.env.RADAR_DATA_FILE || path.join(path.dirname(config.dataFile), 'radar.json');

let db = null;
let writing = Promise.resolve();
let remoteVersion = null;
let lastWriteError = null;

const empty = () => Object.fromEntries(COLLECTIONS.map((c) => [c, []]));

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(radarFile(), 'utf8'));
    return { ...empty(), ...parsed };
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('[radar] falha ao ler base, iniciando vazia:', err.message);
    return empty();
  }
}

export function data() {
  db ??= load();
  return db;
}

const normalize = (parsed) => ({ ...empty(), ...(parsed || {}) });

/** Run before Radar initialization when DB_PROVIDER=supabase. */
export async function initRadarStore() {
  if (!usesSupabase()) return;
  // Primeira execução copia a base local para a linha nova. Em produção, só os dados públicos (programas,
  // prazos, fontes): inscrições, alertas e vínculos com a agenda são de usuários e nunca saem do ambiente de origem.
  const seed = config.appEnv === 'production' ? { ...data(), subscriptions: [], alerts: [], agendaLinks: [] } : data();
  const remote = await loadState('radar', seed);
  db = normalize(remote.state);
  remoteVersion = remote.version;
  lastWriteError = null;
}

/** Recarrega a base do Radar se outra instância gravou (mesma lógica de syncStore em store.js). */
export async function syncRadarStore() {
  if (!usesSupabase() || remoteVersion === null) return;
  await writing;
  const remote = await loadIfChanged('radar', remoteVersion);
  if (!remote) return;
  db = normalize(remote.state);
  remoteVersion = remote.version;
}

export const radarStoreHealth = () => ({ ok: !lastWriteError, erro: lastWriteError });

export function save() {
  const d = data();
  for (const [k, max] of Object.entries(LIMITS)) if (d[k].length > max) d[k] = d[k].slice(-max);
  const snapshot = JSON.stringify(d);
  const file = radarFile();
  writing = writing.then(async () => {
    if (usesSupabase()) {
      if (remoteVersion === null) throw new Error('Supabase Radar store was not initialized before writing.');
      remoteVersion = await saveState('radar', JSON.parse(snapshot), remoteVersion);
      lastWriteError = null;
      return;
    }
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.promises.writeFile(tmp, snapshot, { mode: 0o600 });
    await fs.promises.rename(tmp, file);
  }).catch((err) => {
    lastWriteError = { mensagem: err.message, em: new Date().toISOString() };
    console.error('[radar] falha ao gravar:', err.message);
  });
  return writing;
}

export const flushRadar = () => writing;
export const newId = () => crypto.randomUUID();
export const hash = (value) => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');

/** Apenas para testes: descarta o estado em memória. */
export function resetForTests() {
  db = empty();
  remoteVersion = null;
  lastWriteError = null;
}
