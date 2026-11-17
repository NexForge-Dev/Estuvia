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
import { writeFileAtomic } from '../storage.js';

const COLLECTIONS = ['sources', 'snapshots', 'programs', 'opportunities', 'windows', 'events', 'availability', 'revisions', 'reviews', 'runs', 'subscriptions', 'alerts', 'agendaLinks'];
// Retenção (docs/11-radar.md, "Proteção de dados do Radar"). Nada é cortado em silêncio: cada poda vai para o log.
// - revisões: nunca são apagadas (histórico de alterações com evidência);
// - snapshots: as RETAIN_SNAPSHOT_VERSIONS versões mais recentes de cada página, mais qualquer versão citada por
//   uma revisão ou por um item da fila de revisão (a evidência que fundamentou uma alteração nunca some);
//   o HTML original fica no Storage, endereçado pelo hash, e não é apagado;
// - alertas: não lidos nunca são apagados; lidos ficam ao menos RETAIN_READ_ALERT_DAYS dias e, além disso,
//   até RETAIN_READ_ALERTS_PER_USER por estudante;
// - execuções: as RETAIN_RUNS mais recentes (só metadados de execução).
export const RETENTION = {
  RETAIN_SNAPSHOT_VERSIONS: 10,
  RETAIN_READ_ALERT_DAYS: 365,
  RETAIN_READ_ALERTS_PER_USER: 500,
  RETAIN_RUNS: 5000,
};

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
    if (err.code !== 'ENOENT') {
      // Base ilegível: guarda uma cópia antes de seguir vazia (a próxima gravação sobrescreveria o arquivo).
      const copia = `${radarFile()}.ilegivel-${new Date().toISOString().replace(/[:.]/g, '-')}`;
      try { fs.copyFileSync(radarFile(), copia); } catch { /* sem arquivo para copiar */ }
      console.error(`[radar] falha ao ler base, iniciando vazia (cópia do arquivo em ${copia}):`, err.message);
    }
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

/** Aplica a política de retenção em memória. Devolve o que foi podado, por coleção (vai para o log). */
export function applyRetention(d = data(), now = Date.now()) {
  const podado = {};
  // Snapshots: por página (sourceId + chave), mantém as versões recentes e as citadas como evidência.
  const citados = new Set([
    ...d.revisions.map((r) => r.evidencia?.snapshotId).filter(Boolean),
    ...d.reviews.filter((r) => r.status === 'aberta').map((r) => r.snapshotId).filter(Boolean),
  ]);
  const porPagina = new Map();
  for (const s of d.snapshots) {
    const k = `${s.sourceId} ${s.chave}`;
    if (!porPagina.has(k)) porPagina.set(k, []);
    porPagina.get(k).push(s);
  }
  const manter = new Set();
  for (const lista of porPagina.values()) {
    lista.sort((a, b) => (b.versao || 0) - (a.versao || 0));
    lista.slice(0, RETENTION.RETAIN_SNAPSHOT_VERSIONS).forEach((s) => manter.add(s.id));
  }
  const antesSnap = d.snapshots.length;
  d.snapshots = d.snapshots.filter((s) => manter.has(s.id) || citados.has(s.id));
  if (d.snapshots.length < antesSnap) podado.snapshots = antesSnap - d.snapshots.length;

  // Alertas: nunca os não lidos; lidos, só depois do prazo e acima da cota por estudante.
  const limite = now - RETENTION.RETAIN_READ_ALERT_DAYS * 86400000;
  const lidosPorUsuario = new Map();
  for (const a of d.alerts) if (a.lidoEm) { if (!lidosPorUsuario.has(a.userId)) lidosPorUsuario.set(a.userId, []); lidosPorUsuario.get(a.userId).push(a); }
  const remover = new Set();
  for (const lista of lidosPorUsuario.values()) {
    lista.sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
    lista.slice(RETENTION.RETAIN_READ_ALERTS_PER_USER).forEach((a) => { if (Date.parse(a.criadoEm || 0) < limite) remover.add(a.id); });
  }
  if (remover.size) { d.alerts = d.alerts.filter((a) => !remover.has(a.id)); podado.alerts = remover.size; }

  if (d.runs.length > RETENTION.RETAIN_RUNS) { podado.runs = d.runs.length - RETENTION.RETAIN_RUNS; d.runs = d.runs.slice(-RETENTION.RETAIN_RUNS); }
  if (Object.keys(podado).length) console.log(`[radar] retenção aplicada (docs/11-radar.md): ${JSON.stringify(podado)}`);
  return podado;
}

// Conflito desfaz na memória TODAS as mudanças pendentes do lote, inclusive as de chamadas que ainda esperam
// na fila: essas não podem responder "salvo" (mesma lógica de store.js).
let saveTick = 0;
let revertedUpTo = 0;
const revertedError = () => Object.assign(new Error('Os dados mudaram em outra instância do servidor e esta alteração foi desfeita. Tente novamente.'), { code: 'ESTUVIA_CONFLICT' });

let failNextWrite = null;
/** Apenas para testes: faz a próxima gravação falhar com este erro (simula o banco recusando). */
export function failNextWriteForTests(err) { failNextWrite = err; }

/**
 * Grava o Radar. A promessa REJEITA se a gravação falhar: quem chamou não pode responder "salvo".
 * A fila de gravações continua andando depois de uma falha (a próxima grava o estado completo).
 */
export function save() {
  const d = data();
  applyRetention(d);
  const snapshot = usesSupabase() ? null : JSON.stringify(d);
  const file = radarFile();
  const tick = ++saveTick;
  const run = writing.then(async () => {
    if (failNextWrite) { const e = failNextWrite; failNextWrite = null; throw e; }
    if (usesSupabase()) {
      if (!entities) throw new Error('Supabase Radar store was not initialized before writing.');
      try {
        await entities.persist(); // só as linhas que mudaram; conflito de versão = erro ESTUVIA_CONFLICT
      } catch (err) {
        if (err.code === 'ESTUVIA_CONFLICT') revertedUpTo = saveTick;
        throw err;
      }
      if (revertedUpTo >= tick) throw revertedError();
    } else {
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      await writeFileAtomic(file, snapshot, { mode: 0o600 });
    }
    lastWriteError = null;
  });
  writing = run.catch((err) => {
    lastWriteError = { mensagem: err.message, codigo: err.code || null, em: new Date().toISOString() };
    console.error(`[radar] falha ao gravar (${usesSupabase() ? 'Supabase' : 'arquivo'}${err.code ? `, ${err.code}` : ''}): ${err.message}`);
  });
  return run;
}

/**
 * Descarta o que está em memória e recarrega do banco (ou do arquivo). Usado depois de uma falha de gravação:
 * sem isto, a memória ficaria com mudanças que o banco não tem, e a próxima gravação as enviaria fora de contexto.
 */
export async function reloadRadarStore() {
  await writing;
  if (!usesSupabase()) { db = load(); return; }
  db = empty();
  const store = createEntityStore(radarCollections(), { label: 'radar' });
  await store.load();
  db = normalize(db);
  entities = store;
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
