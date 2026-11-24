// Prepara a restauração de uma cópia, sem tocar em banco nenhum:
//   restaurar.sql  → aplicar com psql num projeto Supabase VAZIO, depois das migrations
//   arquivos/<bucket>/…  → enviar aos buckets de mesmo nome
// Uso: node scripts/backup/restore.mjs --origem <pasta das cópias> [--copia <nome>] --saida <pasta nova>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { listCopies, readCopy, restoreSql, verifyDump } from './lib.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { values } = parseArgs({ options: { origem: { type: 'string' }, copia: { type: 'string' }, saida: { type: 'string' } } });
const dir = path.resolve(values.origem || path.join(process.env.LOCALAPPDATA || root, 'Estuvia', 'backups'));
const nome = values.copia || listCopies(dir).at(-1)?.nome;
if (!nome || !values.saida) { console.error('Informe --saida (e --origem, se as cópias não estiverem na pasta padrão).'); process.exit(1); }
const out = path.resolve(values.saida);
if (fs.existsSync(out) && fs.readdirSync(out).length) { console.error(`A pasta ${out} não está vazia.`); process.exit(1); }

const { manifesto, dump } = readCopy(dir, nome);
await verifyDump(dump, { migrationsDir: path.join(root, 'supabase', 'migrations') });
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'restaurar.sql'), restoreSql(dump), { mode: 0o600 });
for (const f of manifesto.arquivos) {
  const base = path.join(out, 'arquivos');
  const dest = path.resolve(base, f.bucket, ...f.nome.split('/'));
  if (!dest.startsWith(base + path.sep)) throw new Error(`nome de arquivo inválido: ${f.nome}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(dir, 'arquivos', f.sha256), dest);
}
console.log(`${nome}: restauração conferida. SQL e ${manifesto.arquivos.length} arquivo(s) em ${out}`);
console.log('Os documentos continuam cifrados: só abrem com a mesma DOCUMENTS_KEY da produção.');
