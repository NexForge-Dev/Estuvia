// Verificação de sintaxe de todo o JavaScript do projeto (servidor e navegador), sem dependências.
// Uso: npm run check
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const roots = ['server', 'public/js', 'scripts', 'tests'];
const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); } else if (/\.(m?js)$/.test(e.name)) files.push(p);
  }
};
roots.filter((r) => fs.existsSync(r)).forEach(walk);

let failed = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (err) {
    failed += 1;
    console.error(`✗ ${f}\n${err.stderr?.toString() || err.message}`);
  }
}
console.log(`${files.length - failed}/${files.length} arquivos sem erro de sintaxe.`);
process.exit(failed ? 1 : 0);
