// Gera, a partir do conteúdo da plataforma, os inventários da auditoria integral: processos (rodadas e missões),
// documentos (tipos × categorias × exigência) e fontes oficiais (com idade da conferência).
// Somente leitura. Uso: node scripts/audit-inventarios.mjs <pasta-de-saída> [AAAA-MM-DD]
import fs from 'node:fs';
import path from 'node:path';
import { ROUNDS } from '../server/content/rounds.js';
import { DOC_TYPES, DOC_CATEGORIES, CATEGORY_USES, CATEGORY_DEFAULTS } from '../server/content/document-catalog.js';
import { SOURCES } from '../server/content/sources.js';
import { DUA_MASTERES, PROGRAM_SPECIFIC } from '../server/content/application-procedures.js';

const out = process.argv[2];
const hoje = process.argv[3] || new Date().toISOString().slice(0, 10);
if (!out) { console.error('Uso: node scripts/audit-inventarios.mjs <pasta> [data]'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });

const srcById = new Map(SOURCES.map((s) => [s.id, s]));
const dias = (d) => (d ? Math.round((Date.parse(hoje) - Date.parse(d)) / 86400000) : null);
const esc = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const csv = (rows) => rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n') + '\n';
const oficial = (ids) => (ids || []).some((id) => srcById.get(id)?.tipo === 'oficial');

// ---------- Processos ----------
const proc = [];
for (const r of ROUNDS) {
  for (const m of r.missoes) {
    const fontes = m.fontes || [];
    proc.push({
      rodada: r.numero, rodadaTitulo: r.titulo, id: m.id, titulo: m.titulo, tag: m.tag || '', fontes: fontes.join(' '),
      base: oficial(fontes) ? 'oficial' : fontes.length ? 'só manual/prática' : 'sem fonte',
      condicional: m.regra ? 'sim' : m.condicional ? 'opcional por perfil' : '', soDua: m.soDua ? 'sim' : '',
      documentos: (m.documentos || []).join(' '),
    });
  }
}

// ---------- Documentos ----------
const usos = new Map();
for (const [cat, list] of Object.entries(CATEGORY_USES)) for (const u of list) {
  if (!usos.has(u.doc)) usos.set(u.doc, []);
  usos.get(u.doc).push(`${cat}:${u.classe}${u.cond ? `(${[].concat(u.cond).join('+')})` : ''}`);
}
const docs = DOC_TYPES.map((t) => {
  const def = CATEGORY_DEFAULTS[t.categoria] || {};
  const fontes = t.fontes || def.fontes || [];
  return {
    id: t.id, categoria: t.categoria, nome: t.nome, usos: (usos.get(t.id) || []).join(' '),
    apostila: t.apostila ?? def.apostila ?? '', traducao: t.traducao ?? def.traducao ?? '', validade: t.validade || '',
    onde: t.onde || def.onde || '', quando: t.quando || def.quando || '', fontes: fontes.join(' '),
    base: oficial(fontes) ? 'oficial' : fontes.length ? 'só manual/prática' : 'sem fonte', agregado: t.agregado ? 'sim' : '',
  };
});

// ---------- Fontes ----------
const fontes = SOURCES.map((s) => ({ id: s.id, orgao: s.orgao, titulo: s.titulo, url: s.url || '', tipo: s.tipo, revisadoEm: s.revisadoEm, idadeDias: dias(s.revisadoEm) }));

// ---------- Regras do procedimento DUA ----------
const regras = [
  ...DUA_MASTERES.fases.flatMap((f) => ['quem', 'titulo', 'pagamento'].filter((k) => f[k]).map((k) => ({ id: `fase${f.fase}.${k}`, ...f[k] }))),
  ...DUA_MASTERES.documentos.map((d) => ({ id: `doc.${d.docId}`, ...d })),
  ...DUA_MASTERES.regras,
  ...PROGRAM_SPECIFIC,
].map((r) => ({ id: r.id, texto: r.texto, fonte: r.fonte, artigo: r.artigo, revisadoEm: r.revisadoEm }));

fs.writeFileSync(path.join(out, 'inventario-processos.csv'), csv([Object.keys(proc[0]), ...proc.map(Object.values)]));
fs.writeFileSync(path.join(out, 'inventario-documentos.csv'), csv([Object.keys(docs[0]), ...docs.map(Object.values)]));
fs.writeFileSync(path.join(out, 'fontes-oficiais.csv'), csv([Object.keys(fontes[0]), ...fontes.map(Object.values)]));
fs.writeFileSync(path.join(out, 'regras-dua.csv'), csv([Object.keys(regras[0]), ...regras.map(Object.values)]));

const conta = (arr, k) => arr.reduce((a, x) => ({ ...a, [x[k]]: (a[x[k]] || 0) + 1 }), {});
const md = [
  `# Inventários gerados do código (${hoje})`, '',
  'Gerado por `node scripts/audit-inventarios.mjs`. Os CSVs ao lado têm uma linha por item.', '',
  `## Processos: ${proc.length} missões em ${ROUNDS.length} rodadas`, '',
  `Base das missões: ${Object.entries(conta(proc, 'base')).map(([k, v]) => `${k} ${v}`).join(' · ')}.`, '',
  '| Rodada | Missão | Título | Base | Fontes |', '|---|---|---|---|---|',
  ...proc.map((p) => `| ${p.rodada} | ${p.id} | ${esc(p.titulo)} | ${p.base} | ${p.fontes} |`), '',
  `## Documentos: ${docs.length} tipos em ${DOC_CATEGORIES.length} categorias`, '',
  `Base dos documentos: ${Object.entries(conta(docs, 'base')).map(([k, v]) => `${k} ${v}`).join(' · ')}.`, '',
  '| Documento | Categoria | Usos (categoria:exigência) | Apostila | Tradução | Validade | Base |', '|---|---|---|---|---|---|---|',
  ...docs.map((d) => `| ${esc(d.nome)} (\`${d.id}\`) | ${d.categoria} | ${esc(d.usos)} | ${d.apostila} | ${d.traducao} | ${d.validade} | ${d.base} |`), '',
  `## Fontes: ${fontes.length}`, '',
  '| Id | Órgão | Título | Conferida em | Idade (dias) |', '|---|---|---|---|---|',
  ...fontes.map((f) => `| ${f.id} | ${esc(f.orgao)} | ${f.url ? `[${esc(f.titulo)}](${f.url})` : esc(f.titulo)} | ${f.revisadoEm} | ${f.idadeDias} |`), '',
  `## Regras do procedimento DUA: ${regras.length}`, '',
  '| Id | Regra | Fonte | Artigo |', '|---|---|---|---|',
  ...regras.map((r) => `| ${r.id} | ${esc(r.texto)} | ${r.fonte} | ${esc(r.artigo)} |`), '',
];
fs.writeFileSync(path.join(out, 'inventarios.md'), md.join('\n'));
console.log(`processos ${proc.length} · documentos ${docs.length} · fontes ${fontes.length} · regras ${regras.length}`);
console.log('processos por base', conta(proc, 'base'));
console.log('documentos por base', conta(docs, 'base'));
