// Confere que a matriz de conformidade é idêntica nos três formatos (JSON, CSV e MD):
// mesmos mestrados (sem duplicação), mesmo estado por mestrado e mesmos totais.
// Uso: node scripts/audit-verifica-matriz.mjs <prefixo>   (lê <prefixo>.json, .csv e .md)
import fs from 'node:fs';

const prefixo = process.argv[2];
const json = JSON.parse(fs.readFileSync(`${prefixo}.json`, 'utf8'));

// CSV com campos entre aspas e ";" (aspas duplicadas como escape).
function parseCsv(text) {
  const rows = []; let row = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; continue; }
    if (c === '"') q = true; else if (c === ';') { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const csvRows = parseCsv(fs.readFileSync(`${prefixo}.csv`, 'utf8').replace(/^﻿/, ''));
const head = csvRows[0];
const csv = csvRows.slice(1).filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));

// MD: linhas "| n | UNIV | nome (id) | ... | ... | ESTADO | ...".
const md = fs.readFileSync(`${prefixo}.md`, 'utf8').split('\n').filter((l) => /^\| \d+ \| /.test(l)).map((l) => {
  const c = l.split(' | ');
  return { id: /\(([^()]+)\)$/.exec(c[2])?.[1], estado: c[5] };
});
const mdTotais = Object.fromEntries([...fs.readFileSync(`${prefixo}.md`, 'utf8').matchAll(/^\| (VERIFIED|PARTIALLY_VERIFIED|UNVERIFIED|NON_DUA_PROCESS|INSTITUTIONAL_PENDING|INCORRECT) \| (\d+) \|$/gm)].map((m) => [m[1], Number(m[2])]));

const erros = [];
const ids = { json: json.linhas.map((l) => l.id), csv: csv.map((r) => r.id), md: md.map((r) => r.id) };
for (const [f, lista] of Object.entries(ids)) {
  if (new Set(lista).size !== lista.length) erros.push(`${f}: ids duplicados (${lista.length - new Set(lista).size})`);
  if (lista.length !== json.linhas.length) erros.push(`${f}: ${lista.length} linhas, JSON tem ${json.linhas.length}`);
}
const estadoJson = new Map(json.linhas.map((l) => [l.id, l.classe]));
for (const r of csv) if (estadoJson.get(r.id) !== r.estado) erros.push(`CSV ${r.id}: ${r.estado} ≠ JSON ${estadoJson.get(r.id)}`);
for (const r of md) if (estadoJson.get(r.id) !== r.estado) erros.push(`MD ${r.id}: ${r.estado} ≠ JSON ${estadoJson.get(r.id)}`);
for (const [k, v] of Object.entries(mdTotais)) {
  const conta = json.linhas.filter((l) => l.classe === k).length;
  if (json.resumo[k] !== v || conta !== v) erros.push(`Total ${k}: MD ${v}, resumo JSON ${json.resumo[k]}, linhas JSON ${conta}`);
}
const somaCsv = csv.reduce((m, r) => ({ ...m, [r.estado]: (m[r.estado] || 0) + 1 }), {});
for (const [k, v] of Object.entries(somaCsv)) if (mdTotais[k] !== v) erros.push(`Total ${k}: CSV ${v}, MD ${mdTotais[k]}`);

console.log(JSON.stringify({ linhas: { json: ids.json.length, csv: ids.csv.length, md: ids.md.length }, totais: { md: mdTotais, csv: somaCsv }, erros }, null, 1));
process.exit(erros.length ? 1 : 0);
