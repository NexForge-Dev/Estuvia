// Backup SOMENTE LEITURA do Supabase Storage (buckets de documentos cifrados, mídia da comunidade e meta).
// Uso: npm run storage:backup        (usa SUPABASE_URL/SUPABASE_SECRET_KEY do .env do ambiente atual)
// Saída: data/backups/storage-<projeto>-<data>/<bucket>/... (fora do git; contém dados pessoais).
// Os documentos continuam cifrados: só abrem com a DOCUMENTS_KEY do ambiente que os gravou.
// Complementa `npm run db:backup`, que salva só a tabela estuvia_state.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL e SUPABASE_SECRET_KEY são necessários para o backup.');
  process.exit(1);
}
const buckets = [
  process.env.SUPABASE_DOCS_BUCKET || 'estuvia-documents',
  process.env.SUPABASE_MEDIA_BUCKET || 'estuvia-community',
  process.env.SUPABASE_META_BUCKET || 'estuvia-meta',
];
const ref = new URL(url).hostname.split('.')[0];
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(root, 'data', 'backups', `storage-${ref}-${stamp}`);

// Lista recursivamente: no Storage, entradas sem `id` são pastas.
async function listAll(bucket, prefix = '') {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
    for (const item of data || []) {
      const full = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) files.push(full);
      else files.push(...(await listAll(bucket, full)));
    }
    if (!data || data.length < 1000) return files;
  }
}

let total = 0;
let failed = 0;
for (const bucket of buckets) {
  const { error: exists } = await db.storage.getBucket(bucket);
  if (exists) { console.log(`  ${bucket}: não existe neste projeto (${exists.message}), pulando`); continue; }
  const files = await listAll(bucket);
  let bytes = 0;
  for (const name of files) {
    const { data, error } = await db.storage.from(bucket).download(name);
    if (error) { console.error(`  falhou ${bucket}/${name}: ${error.message}`); failed++; continue; }
    const buf = Buffer.from(await data.arrayBuffer());
    const dest = path.join(outDir, bucket, ...name.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf, { mode: 0o600 });
    bytes += buf.length;
  }
  total += files.length;
  console.log(`  ${bucket}: ${files.length} arquivo(s), ${(bytes / 1024).toFixed(1)} KB`);
}
console.log(total ? `Backup do Storage em ${path.relative(root, outDir)} (${total} arquivo(s))` : 'Nenhum arquivo encontrado nos buckets.');
if (failed) { console.error(`${failed} arquivo(s) falharam: não considere este backup completo.`); process.exit(1); }
