// Backup SOMENTE LEITURA do banco no Supabase: todas as tabelas de entidades (0002_entidades.sql)
// e, se ainda existir, a tabela antiga estuvia_state (linhas "main" e "radar").
// Uso: npm run db:backup            (usa SUPABASE_URL/SUPABASE_SECRET_KEY do .env do ambiente atual)
// Saída: data/backups/supabase-<projeto>-<data>.json (fora do git; contém dados pessoais: guarde com cuidado).
// Não altera nada no banco. Os arquivos do Storage (documentos cifrados, imagens) NÃO entram aqui: npm run storage:backup.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const TABLES = [
  'users', 'community_posts', 'community_comments', 'community_groups', 'community_reports', 'community_media',
  'audit_log', 'analytics', 'estuvia_meta',
  'radar_sources', 'radar_snapshots', 'radar_programs', 'radar_opportunities', 'radar_windows', 'radar_events',
  'radar_availability', 'radar_revisions', 'radar_reviews', 'radar_runs', 'radar_subscriptions', 'radar_alerts', 'radar_agenda_links',
];

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL e SUPABASE_SECRET_KEY são necessários para o backup.');
  process.exit(1);
}
const ref = new URL(url).hostname.split('.')[0];
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const missing = (msg) => /does not exist|Could not find the table/i.test(msg || '');

async function dump(table) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select('*').order('id').range(from, from + 999);
    if (error) return missing(error.message) ? null : Promise.reject(new Error(`${table}: ${error.message}`));
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

const out = { projeto: ref, geradoEm: new Date().toISOString(), tabelas: {} };
let ausentes = 0;
for (const t of TABLES) {
  const rows = await dump(t);
  if (rows === null) { ausentes++; continue; }
  out.tabelas[t] = rows;
}
const legacy = await dump('estuvia_state');
if (legacy) out.estuvia_state = legacy; // modelo antigo, mantido como cópia de segurança

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dir = path.join(root, 'data', 'backups');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `supabase-${ref}-${stamp}.json`);
fs.writeFileSync(file, JSON.stringify(out, null, 2), { mode: 0o600 });
console.log(`Backup salvo em ${path.relative(root, file)}`);
for (const [t, rows] of Object.entries(out.tabelas)) if (rows.length) console.log(`  ${t}: ${rows.length} linha(s)`);
if (ausentes) console.log(`  (${ausentes} tabela(s) de entidades ainda não existem neste projeto: aplique supabase/migrations/0002_entidades.sql)`);
if (legacy) console.log(`  estuvia_state (modelo antigo): ${legacy.map((r) => r.id).join(', ')}`);
const meta = out.tabelas.estuvia_meta?.find((r) => r.id === 'main');
console.log(`  ambiente marcado: ${meta?.ambiente || 'nenhum'}`);
