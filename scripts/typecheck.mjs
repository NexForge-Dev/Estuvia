// Checagem de tipos do servidor (TypeScript lendo o JavaScript, via jsconfig.json).
//
// O código antigo ainda tem erros de tipo que são falsos alarmes (objetos sem anotação). Eles ficam
// registrados em scripts/typecheck-baseline.json, contados por arquivo + código + mensagem (sem número de
// linha, para não quebrar quando o arquivo muda). A checagem falha só se aparecer um erro NOVO ou se um
// erro conhecido ficar mais frequente. Ao corrigir erros antigos, rode `npm run typecheck -- --update`.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselineFile = path.join(root, 'scripts', 'typecheck-baseline.json');
const update = process.argv.includes('--update');

let out = '';
try {
  out = execFileSync(process.execPath, [path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'jsconfig.json', '--pretty', 'false'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
} catch (e) {
  out = `${e.stdout || ''}${e.stderr || ''}`;
  if (!/error TS\d+/.test(out)) { console.error(out || e.message); process.exit(2); }
}

const counts = {};
const lines = {};
for (const line of out.split(/\r?\n/)) {
  const m = /^(.+?)\((\d+),\d+\): error (TS\d+): (.*)$/.exec(line);
  if (!m) continue;
  const key = `${m[1].replace(/\\/g, '/')} ${m[3]} ${m[4]}`;
  counts[key] = (counts[key] || 0) + 1;
  (lines[key] ||= []).push(`${m[1]}:${m[2]}`);
}
const total = Object.values(counts).reduce((a, b) => a + b, 0);

if (update) {
  const sorted = Object.fromEntries(Object.keys(counts).sort().map((k) => [k, counts[k]]));
  fs.writeFileSync(baselineFile, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`Base atualizada: ${total} erro(s) conhecidos.`);
  process.exit(0);
}

const baseline = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, 'utf8')) : {};
const novos = Object.keys(counts).filter((k) => counts[k] > (baseline[k] || 0));
const resolvidos = Object.keys(baseline).filter((k) => (counts[k] || 0) < baseline[k]);

if (novos.length) {
  console.error('Erros de tipo novos:\n');
  for (const k of novos) console.error(`  ${k}\n    em ${lines[k].join(', ')}`);
  console.error('\nCorrija o código. Se for falso alarme, descreva o tipo com JSDoc ou, em último caso, rode `npm run typecheck -- --update`.');
  process.exit(1);
}
const known = Object.values(baseline).reduce((a, b) => a + b, 0);
console.log(`Tipos OK: nenhum erro novo (${total} conhecido(s) na base de ${known}).`);
if (resolvidos.length) console.log(`${resolvidos.length} erro(s) da base sumiram: rode \`npm run typecheck -- --update\` para baixar a base.`);
