// Verifica os links das fontes usadas pelo processo de candidatura: fontes oficiais (sources.js) citadas pelas
// regras e os canais conferidos (program-channels.js). Somente leitura; uma requisição por URL, com pausa.
// Uso: node scripts/audit-links.mjs <saida.json>
import fs from 'node:fs';
import { SOURCES } from '../server/content/sources.js';
import { CHANNELS } from '../server/content/program-channels.js';
import { DUA_MASTERES, PROGRAM_SPECIFIC } from '../server/content/application-procedures.js';

const usadas = new Set([...DUA_MASTERES.fontes, DUA_MASTERES.canal.fonte, ...DUA_MASTERES.regras.map((r) => r.fonte), ...DUA_MASTERES.documentos.map((d) => d.fonte), ...PROGRAM_SPECIFIC.map((r) => r.fonte), 'O3', 'O5', 'O8', 'O30']);
const alvos = [
  ...SOURCES.filter((s) => usadas.has(s.id) && s.url).map((s) => ({ origem: `fonte ${s.id}`, titulo: s.titulo, url: s.url, tipo: s.tipo })),
  ...Object.entries(CHANNELS).flatMap(([id, c]) => [c.url ? { origem: `canal ${id}`, titulo: c.categoria || c.tipo, url: c.url, tipo: 'canal' } : null, { origem: `evidência ${id}`, titulo: c.evidencia.fonte, url: c.evidencia.url, tipo: 'evidencia' }].filter(Boolean)),
];
const unicos = [...new Map(alvos.map((a) => [a.url, a])).values()];
const out = [];
for (const a of unicos) {
  let r;
  try {
    const res = await fetch(a.url, { redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0 (Estuvia link check)' } });
    r = { status: res.status, final: res.url, ok: res.ok };
  } catch (e) { r = { status: null, erro: String(e.cause?.code || e.message), ok: false }; }
  out.push({ ...a, ...r, verificadoEm: new Date().toISOString() });
  console.log(r.ok ? 'OK ' : 'FALHA', r.status ?? '-', a.origem, a.url, r.erro || '');
  await new Promise((s) => setTimeout(s, 800));
}
fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
