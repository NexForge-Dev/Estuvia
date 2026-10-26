// Junta o README e todos os docs/*.md num documento único: DOCUMENTACAO.md (raiz do projeto).
// Os arquivos separados continuam sendo a fonte: edite-os e rode de novo.
// Uso: node scripts/build-docs.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'DOCUMENTACAO.md');

// Ordem de leitura: do uso para o técnico.
const PARTS = [
  { titulo: 'Para o estudante', docs: ['23', '08'] },
  { titulo: 'Produto e jornada', docs: ['01', '02', '13', '14', '06'] },
  { titulo: 'Módulos', docs: ['15', '07', '16', '19', '20', '21', '17', '18', '11', '12'] },
  { titulo: 'Técnico', docs: ['22', '03', '05', '04'] },
  { titulo: 'Apresentação e próximos passos', docs: ['09', '10'] },
];

const docsDir = path.join(root, 'docs');
const files = Object.fromEntries(fs.readdirSync(docsDir).filter((f) => /^\d{2}-.*\.md$/.test(f)).map((f) => [f.slice(0, 2), f]));
const listed = PARTS.flatMap((p) => p.docs);
const missing = Object.keys(files).filter((n) => !listed.includes(n));
if (missing.length) throw new Error(`Docs fora do índice em PARTS: ${missing.join(', ')}`);

// Links entre docs viram âncoras internas (#doc-13).
const relink = (md) => md.replace(/\]\((?:\.\/)?(?:docs\/)?(\d{2})-[\w-]+\.md(?:#[^)]*)?\)/g, '](#doc-$1)');

// Desce os títulos `levels` níveis, sem mexer em blocos de código.
function demote(md, levels) {
  let fence = false;
  return md.split('\n').map((line) => {
    if (/^\s*```/.test(line)) fence = !fence;
    if (fence || !/^#{1,6} /.test(line)) return line;
    return '#'.repeat(Math.min(6, line.indexOf(' ') + levels)) + line.slice(line.indexOf(' '));
  }).join('\n');
}

function doc(n) {
  const text = fs.readFileSync(path.join(docsDir, files[n]), 'utf8').replace(/\r\n/g, '\n').trim();
  const [first, ...rest] = text.split('\n');
  const titulo = first.replace(/^#\s*/, '');
  return { titulo, corpo: `<a id="doc-${n}"></a>\n\n## ${titulo}\n\n${demote(relink(rest.join('\n').trim()), 1)}` };
}

// README: introdução, como rodar, telas e estrutura (a tabela de documentação vira o índice abaixo).
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8').replace(/\r\n/g, '\n');
const [readmeHead] = readme.split('\n## Documentação');
const honestidade = readme.match(/\*\*Dados e honestidade:\*\*[^\n]*/)?.[0] || '';
const intro = relink(readmeHead.replace(/^# .*\n/, '').trim());

const parts = PARTS.map((p, i) => ({ ...p, n: i + 1, itens: p.docs.map((d) => ({ n: d, ...doc(d) })) }));
const toc = [
  '- [Visão geral](#visao-geral)',
  ...parts.flatMap((p) => [`- [Parte ${p.n} — ${p.titulo}](#parte-${p.n})`, ...p.itens.map((d) => `  - [${d.titulo}](#doc-${d.n})`)]),
].join('\n');

const out = [
  '# Estuvia — Documentação completa',
  '',
  `> Documento único gerado por \`node scripts/build-docs.mjs\` a partir do \`README.md\` e de \`docs/*.md\` em ${new Date().toISOString().slice(0, 10)}. Para alterar, edite os arquivos de origem e gere de novo.`,
  '',
  '## Índice',
  '',
  toc,
  '',
  '---',
  '',
  '<a id="visao-geral"></a>',
  '',
  '# Visão geral',
  '',
  demote(intro, 0),
  '',
  honestidade,
  ...parts.flatMap((p) => ['', '---', '', `<a id="parte-${p.n}"></a>`, '', `# Parte ${p.n} — ${p.titulo}`, ...p.itens.flatMap((d) => ['', d.corpo])]),
  '',
].join('\n');

fs.writeFileSync(OUT, out);
console.log(`DOCUMENTACAO.md: ${out.split('\n').length} linhas, ${listed.length} documentos.`);
