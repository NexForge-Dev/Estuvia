// Persistência do Radar: arquivo JSON próprio (data/radar.json), com escrita atômica — mesmo
// padrão de server/store.js. Separado da base de usuários para que o atualizador de fontes
// grave sem disputar a base principal. Trocável por tabelas PostgreSQL (ver docs/11-radar.md).
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
//   agendaLinks     vínculo entre atividade da Agenda AI e data oficial (para detectar mudanças)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';

const COLLECTIONS = ['sources', 'snapshots', 'programs', 'opportunities', 'windows', 'events', 'availability', 'revisions', 'reviews', 'runs', 'subscriptions', 'alerts', 'agendaLinks'];
const LIMITS = { runs: 1000, snapshots: 600, alerts: 20000, revisions: 20000 };

export const radarFile = () => process.env.RADAR_DATA_FILE || path.join(path.dirname(config.dataFile), 'radar.json');

let db = null;
let writing = Promise.resolve();

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

export function save() {
  const d = data();
  for (const [k, max] of Object.entries(LIMITS)) if (d[k].length > max) d[k] = d[k].slice(-max);
  const snapshot = JSON.stringify(d);
  const file = radarFile();
  writing = writing.then(async () => {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.promises.writeFile(tmp, snapshot, { mode: 0o600 });
    await fs.promises.rename(tmp, file);
  }).catch((err) => console.error('[radar] falha ao gravar:', err.message));
  return writing;
}

export const flushRadar = () => writing;
export const newId = () => crypto.randomUUID();
export const hash = (value) => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');

/** Apenas para testes: descarta o estado em memória. */
export function resetForTests() {
  db = empty();
}
