// Ajustes de desempenho que não podem quebrar nada: pré-carregamento de módulos, cache de mídia e formatadores de data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isoDayIn, todayMadrid } from '../server/radar/dates.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

test('index.html: todo modulepreload aponta para um módulo que existe (sem script inline, CSP intacta)', () => {
  const hrefs = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((m) => m[1]);
  assert.ok(hrefs.length > 10, 'lista de pré-carregamento presente');
  for (const h of hrefs) {
    assert.match(h, /^\/js\/[\w/.-]+\.js$/, h);
    assert.ok(fs.existsSync(path.join(root, 'public', h)), `${h} não existe (rode node scripts/modulepreload.mjs --write)`);
  }
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), 'nenhum <script> inline');
  assert.ok(!/<style/.test(html), 'nenhum <style> inline');
});

test('vercel.json: só mídia ganha cache longo; JS/CSS continuam revalidando; a função leva index.html e as sementes', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const cache = vercel.headers.filter((r) => r.headers.some((h) => h.key === 'Cache-Control'));
  assert.deepEqual(cache.map((r) => r.source), ['/(img|video)/(.*)']);
  const inc = vercel.functions['api/index.js'].includeFiles;
  assert.ok(inc.includes('public/index.html') && inc.includes('server/radar/seed/**'), inc);
});

test('isoDayIn reaproveita o formatador e dá o mesmo resultado do Intl; fuso inválido continua lançando', () => {
  const instantes = [new Date('2026-03-29T00:30:00Z'), new Date('2026-10-25T23:30:00Z'), new Date('2026-12-31T23:30:00Z')];
  for (const tz of ['Europe/Madrid', 'America/Sao_Paulo', 'America/Manaus']) {
    for (const d of instantes) {
      const esperado = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
      assert.equal(isoDayIn(tz, d), esperado, `${tz} ${d.toISOString()}`);
    }
  }
  assert.equal(todayMadrid(new Date('2026-12-31T23:30:00Z')), '2027-01-01');
  assert.throws(() => isoDayIn('Fuso/Inexistente'), RangeError);
});
