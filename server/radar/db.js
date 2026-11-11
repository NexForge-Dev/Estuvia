// Persistência do Radar: JSON local ou tabelas radar_* no Supabase (migrations 0002_entidades.sql).
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
import { usesSupabase, readLegacyState } from '../database.js';
import { createEntityStore, arrayCollection } from '../entities.js';
import { users } from '../store.js';

const COLLECTIONS = ['sources', 'snapshots', 'programs', 'opportunities', 'windows', 'events', 'availability', 'revisions', 'reviews', 'runs', 'subscriptions', 'alerts', 'agendaLinks'];
const LIMITS = { runs: 1000, snapshots: 600, alerts: 20000, revisions: 20000 };

export const radarFile = () => process.env.RADAR_DATA_FILE || path.join(path.dirname(config.dataFile), 'radar.json');

let db = null;
let writing = Promise.resolve();
let entities = null; // sincronizador das tabelas radar_* (só no modo Supabase)
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

// Coleção em memória → tabela.
const TABLE_OF = {
  sources: 'radar_sources', snapshots: 'radar_snapshots', programs: 'radar_programs', opportunities: 'radar_opportunities',
  windows: 'radar_windows', events: 'radar_events', availability: 'radar_availability', revisions: 'radar_revisions',
  reviews: 'radar_reviews', runs: 'radar_runs', subscriptions: 'radar_subscriptions', alerts: 'radar_alerts',
  agendaLinks: 'radar_agenda_links',
};
const radarCollections = () => COLLECTIONS.map((c) => arrayCollection(TABLE_OF[c], () => data()[c], (l) => { data()[c] = l; }));
const USER_OWNED = ['subscriptions', 'alerts', 'agendaLinks'];

/** Run before Radar initialization when DB_PROVIDER=supabase (depois de initStore: as inscrições referenciam usuários). */
export async function initRadarStore() {
  if (!usesSupabase()) return;
  const local = data();
  db = empty();
  const store = createEntityStore(radarCollections(), { label: 'radar' });
  await store.load();
  db = normalize(db);
  entities = store;
  lastWriteError = null;
  if (!store.isEmpty()) return;

  // Tabelas vazias: importa do modelo antigo (estuvia_state, só leitura). Sem linha antiga, copia a base local;
  // em produção, só os dados públicos (programas, prazos, fontes): inscrições, alertas e vínculos com a agenda
  // são de usuários e nunca saem do ambiente de origem.
  const legacy = await readLegacyState('radar');
  const seed = legacy ? normalize(legacy)
    : config.appEnv === 'production' ? { ...normalize(local), subscriptions: [], alerts: [], agendaLinks: [] }
    : normalize(local);
  // Registros de usuários que não existem mais violariam a chave estrangeira: ficam de fora (com aviso).
  const known = new Set(users.all().map((u) => u.id));
  for (const c of USER_OWNED) {
    const before = seed[c].length;
    seed[c] = seed[c].filter((x) => known.has(x.userId));
    if (seed[c].length < before) console.warn(`[radar] importação: ${before - seed[c].length} registro(s) de ${c} sem usuário existente ficaram de fora.`);
  }
  db = seed;
  if (!COLLECTIONS.some((c) => db[c].length)) return;
  await save();
  if (lastWriteError) throw new Error(`[radar] falha ao importar para as tabelas: ${lastWriteError.mensagem}`);
  console.log(`[radar] Importado de ${legacy ? 'estuvia_state' : 'base JSON local'} para as tabelas: ${db.programs.length} programa(s), ${db.opportunities.length} oportunidade(s).`);
}

/** Traz as linhas do Radar que outras instâncias gravaram (mesma lógica de syncStore em store.js). */
export async function syncRadarStore() {
  if (!entities) return;
  await writing;
  await entities.sync();
}

export const radarStoreHealth = () => ({ ok: !lastWriteError, erro: lastWriteError });

export function save() {
  const d = data();
  for (const [k, max] of Object.entries(LIMITS)) if (d[k].length > max) d[k] = d[k].slice(-max);
  const snapshot = usesSupabase() ? null : JSON.stringify(d);
  const file = radarFile();
  writing = writing.then(async () => {
    if (usesSupabase()) {
      if (!entities) throw new Error('Supabase Radar store was not initialized before writing.');
      await entities.persist(); // só as linhas que mudaram
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
  entities = null;
  lastWriteError = null;
}
