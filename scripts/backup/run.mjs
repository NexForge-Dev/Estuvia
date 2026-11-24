// Backup diário (tarefa do Windows "Estuvia Backup"). Só LÊ o Supabase.
// Copia banco e arquivos, restaura a cópia num Postgres isolado, compara e só então apaga cópias antigas.
// Uso: node --env-file=<backup.env> scripts/backup/run.mjs --destino <pasta>
// Saída: 0 = cópia feita e restaurada com sucesso · 1 = falhou · 2 = feita, mas com queda suspeita de dados.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { dumpDatabase, verifyDump, copyStorage, saveCopy, readCopy, listCopies, prune, suspicious, copyName } from './lib.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { values } = parseArgs({ options: { destino: { type: 'string' }, dias: { type: 'string', default: '30' } } });
const status = (dir, s) => fs.writeFileSync(path.join(dir, 'ultima-execucao.json'), JSON.stringify({ em: new Date().toISOString(), ...s }, null, 2));

async function main(dir) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Falta SUPABASE_URL ou SUPABASE_SECRET_KEY no arquivo de configuração (backup.env).');
  const projeto = new URL(url).hostname.split('.')[0];
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const previous = listCopies(dir).at(-1)?.manifesto || null;
  if (previous && previous.projeto !== projeto) throw new Error(`A pasta guarda cópias de ${previous.projeto}, mas a chave é de ${projeto}.`);

  // A cópia não é uma transação única: se a restauração acusar dado pela metade, copia de novo uma vez.
  const migrationsDir = path.join(root, 'supabase', 'migrations');
  let dump;
  let tabelas;
  for (let tentativa = 1; ; tentativa += 1) {
    dump = await dumpDatabase(db, { projeto });
    const ambiente = dump.tabelas.estuvia_meta.find((r) => r.id === 'main')?.ambiente || null;
    if (process.env.BACKUP_AMBIENTE && ambiente !== process.env.BACKUP_AMBIENTE) throw new Error(`O banco está marcado como "${ambiente}", e não "${process.env.BACKUP_AMBIENTE}".`);
    try { tabelas = await verifyDump(dump, { migrationsDir }); break; } catch (e) {
      if (tentativa === 2) throw e;
      console.log(`restauração falhou (${e.message}); copiando de novo`);
    }
  }
  const buckets = [process.env.SUPABASE_DOCS_BUCKET || 'estuvia-documents', process.env.SUPABASE_MEDIA_BUCKET || 'estuvia-community', process.env.SUPABASE_META_BUCKET || 'estuvia-meta'];
  const arquivos = await copyStorage(db, buckets, dir, previous?.arquivos || []);

  const nome = copyName();
  saveCopy(dir, nome, dump, { projeto, geradoEm: dump.geradoEm, restauracaoConferida: true, tabelas, arquivos });
  // Conferência final no que ficou em disco: lê, confere a integridade e restaura de novo.
  await verifyDump(readCopy(dir, nome).dump, { migrationsDir });

  const queda = suspicious(previous?.tabelas, tabelas);
  const apagadas = queda.length ? [] : prune(dir, { dias: Number(values.dias) || 30 });
  const linhas = Object.values(tabelas).reduce((s, t) => s + t.linhas, 0);
  console.log(`${new Date().toISOString()} ${nome}: ${linhas} linha(s), ${tabelas.users.linhas} conta(s), ${arquivos.length} arquivo(s); restauração conferida; ${apagadas.length} cópia(s) antiga(s) apagada(s)`);
  if (queda.length) console.log(`ATENÇÃO, queda de dados desde a última cópia (nenhuma cópia antiga foi apagada): ${queda.join('; ')}`);
  status(dir, { ok: !queda.length, copia: nome, linhas, contas: tabelas.users.linhas, arquivos: arquivos.length, queda });
  return queda.length ? 2 : 0;
}

const dir = path.resolve(values.destino || path.join(process.env.LOCALAPPDATA || root, 'Estuvia', 'backups'));
fs.mkdirSync(dir, { recursive: true });
try {
  process.exitCode = await main(dir);
} catch (e) {
  console.error(`${new Date().toISOString()} FALHOU: ${e.message}`);
  status(dir, { ok: false, erro: e.message });
  process.exitCode = 1;
}
