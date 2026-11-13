// UNIA (Universidad Internacional de Andalucía): no DUA, os códigos dela começam com letra (ex.: A04601).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const duaCatalog = await import('../server/radar/connectors/dua-catalog.js');
const duaProgram = await import('../server/radar/connectors/dua-program.js');
const { UNIVERSITIES } = await import('../server/content/catalog.js');

const linha = (codigo, universidad, master) => `<tr> <td>${codigo}</td> <td>${universidad}</td> <td> <div class="border">${master}</div> <span class="pl-3">OFICINA DE ESTUDIOS DE POSGRADO</span> </td> <td><button onclick="ficha('${codigo}')"></button></td> </tr>`;
const pagina = (linhas) => `<p><strong>${linhas.length}</strong> Resultados</p><table><tr><th>Código</th><th>Universidad</th><th>Máster</th><th></th></tr>${linhas.join('')}</table>`;

test('catálogo do DUA: código com letra (UNIA) também vira mestrado', () => {
  const r = duaCatalog.parse(pagina([
    linha('A04601', 'INTERNACIONAL DE ANDALUCIA', 'ACTIVIDAD FÍSICA PARA LA SALUD'),
    linha('A04602', 'INTERNACIONAL DE ANDALUCIA', 'AGRICULTURA Y GANADERÍA ECOLÓGICAS'),
  ]), { anoAcademico: '2026/2027', universidadeId: 'unia' });
  assert.equal(r.ok, true, JSON.stringify(r.avisos));
  assert.deepEqual(r.programas.map((p) => [p.codigo, p.universidadeId]), [['A04601', 'unia'], ['A04602', 'unia']]);
  assert.equal(r.programas[0].id, 'dua-A04601');
});

test('catálogo do DUA: códigos numéricos continuam funcionando e lixo continua de fora', () => {
  const r = duaCatalog.parse(pagina([linha('520708', 'HUELVA', 'ACCESO A LA ABOGACÍA Y LA PROCURA')]), { universidadeId: 'uhu' });
  assert.equal(r.programas[0].codigo, '520708');
  const lixo = duaCatalog.parse(pagina([linha('Código', 'HUELVA', 'X'), linha('ABC123456', 'HUELVA', 'Y')]), { universidadeId: 'uhu' });
  assert.equal(lixo.programas.length, 0);
});

test('ficha do DUA da UNIA: o cabeçalho com código alfanumérico é lido', () => {
  const html = new TextDecoder('windows-1252').decode(fs.readFileSync(new URL('../server/radar/seed/dua-ficha-A04601-unia.html', import.meta.url)));
  const r = duaProgram.parse(html);
  assert.equal(r.dados?.codigoDua, 'A04601', JSON.stringify(r.avisos));
  assert.match(r.dados.titulo, /ACTIVIDAD F[IÍ]SICA PARA LA SALUD/);
});

test('UNIA aparece entre os destinos do onboarding', () => {
  assert.ok(UNIVERSITIES.some((u) => u.id === 'unia' && u.sigla === 'UNIA'));
});
