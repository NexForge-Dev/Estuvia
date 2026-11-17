// Lista de <link rel="modulepreload"> do public/index.html: o grafo de imports ESTÁTICOS de public/js/app.js.
// Sem build, o navegador só descobre um módulo depois de baixar quem o importa (cascata: profundidade × ida e
// volta). Com a lista no <head>, todos são pedidos em paralelo logo após o HTML.
//   node scripts/modulepreload.mjs           mostra o grafo (módulos, bytes, profundidade) e se o HTML está em dia
//   node scripts/modulepreload.mjs --write   regrava o bloco entre os marcadores no public/index.html
// Imports dinâmicos (telas carregadas sob demanda) ficam de fora de propósito.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');
const entry = path.join(pub, 'js', 'app.js');
const STATIC_IMPORT = /^\s*(?:import|export)\s[^'"]*?\sfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm;

export function moduleGraph(start = entry) {
  const graph = new Map();
  const visit = (file) => {
    if (graph.has(file)) return;
    const src = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const deps = [];
    for (const m of src.matchAll(STATIC_IMPORT)) {
      const spec = m[1] || m[2];
      if (spec.startsWith('.')) deps.push(path.resolve(path.dirname(file), spec.split('?')[0]));
    }
    graph.set(file, { deps, bytes: Buffer.byteLength(src) });
    deps.forEach(visit);
  };
  visit(start);
  return graph;
}

const url = (file) => `/${path.relative(pub, file).split(path.sep).join('/')}`;
export function preloadLinks(graph = moduleGraph()) {
  return [...graph.keys()].filter((f) => f !== entry).map(url).sort();
}

const BEGIN = '<!-- modulepreload:begin (gerado por scripts/modulepreload.mjs) -->';
const END = '<!-- modulepreload:end -->';

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const graph = moduleGraph();
  const depth = new Map();
  const d = (f) => { if (depth.has(f)) return depth.get(f); depth.set(f, 0); const v = 1 + Math.max(0, ...graph.get(f).deps.map(d)); depth.set(f, v); return v; };
  const bytes = [...graph.values()].reduce((s, v) => s + v.bytes, 0);
  console.log(`${graph.size} módulos estáticos, ${(bytes / 1024).toFixed(0)} KB, profundidade da cascata ${d(entry)}`);
  const htmlFile = path.join(pub, 'index.html');
  const html = fs.readFileSync(htmlFile, 'utf8');
  const block = [BEGIN, ...preloadLinks(graph).map((h) => `  <link rel="modulepreload" href="${h}">`), `  ${END}`].join('\n');
  const i = html.indexOf(BEGIN);
  const j = html.indexOf(END, i);
  if (i < 0 || j < 0) { console.error('Marcadores do modulepreload não encontrados no public/index.html.'); process.exit(1); }
  const next = html.slice(0, i) + block.trimStart() + html.slice(j + END.length);
  if (process.argv.includes('--write')) { fs.writeFileSync(htmlFile, next); console.log('public/index.html atualizado.'); }
  else console.log(next === html ? 'public/index.html em dia.' : 'public/index.html desatualizado: rode com --write.');
}
