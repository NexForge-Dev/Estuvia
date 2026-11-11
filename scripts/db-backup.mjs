// Backup SOMENTE LEITURA do estado no Supabase (tabela estuvia_state: linhas "main" e "radar").
// Uso: npm run db:backup            (usa SUPABASE_URL/SUPABASE_SECRET_KEY do .env do ambiente atual)
// Saída: data/backups/supabase-<projeto>-<data>.json (fora do git; contém dados pessoais: guarde com cuidado).
// Não altera nada no banco. Os arquivos do Storage (documentos cifrados, imagens) NÃO entram aqui.
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
const ref = new URL(url).hostname.split('.')[0];
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await db.from('estuvia_state').select('id,state,version,updated_at');
if (error) {
  console.error(`Falha ao ler estuvia_state: ${error.message}`);
  process.exit(1);
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dir = path.join(root, 'data', 'backups');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `supabase-${ref}-${stamp}.json`);
fs.writeFileSync(file, JSON.stringify({ projeto: ref, geradoEm: new Date().toISOString(), linhas: data }, null, 2), { mode: 0o600 });
const main = data.find((r) => r.id === 'main');
console.log(`Backup salvo em ${path.relative(root, file)}`);
for (const r of data) console.log(`  ${r.id}: versão ${r.version}, atualizado em ${r.updated_at}`);
if (main) console.log(`  main: ${(main.state.users || []).length} usuário(s), ambiente marcado: ${main.state.meta?.ambiente || 'nenhum'}`);
