// E3 (auditoria 2026-11-19): moradia, faixa de preço e guia de cidade para todas as universidades do catálogo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNIVERSITIES } from '../server/content/catalog.js';
import { housingSearchFor, OFFICIAL_HOUSING } from '../server/content/housing.js';
import { DESTINATION_ASSUMPTIONS } from '../server/content/costs.js';
import { CITY_GUIDES } from '../server/content/places.js';
import { sourceById } from '../server/content/sources.js';

test('toda universidade do catálogo tem sites de busca e guia da sua cidade', () => {
  for (const u of UNIVERSITIES) {
    const busca = housingSearchFor(u.cidade, u.id);
    assert.ok(busca, `${u.sigla}: sem sites de busca para ${u.cidade}`);
    assert.equal(busca.sites.length, 4);
    for (const s of busca.sites) assert.match(s.url, /^https:\/\//);
    assert.ok(busca.verificadoEm);
    assert.ok(CITY_GUIDES[u.cidade], `${u.sigla}: sem guia de ${u.cidade}`);
    assert.equal(CITY_GUIDES[u.cidade].cidade, u.cidade);
  }
});

test('Sevilla mostra a página oficial da universidade da jornada; UNIA fica sem página', () => {
  assert.equal(housingSearchFor('Sevilla', 'us').oficial.url, OFFICIAL_HOUSING.us.url);
  assert.equal(housingSearchFor('Sevilla', 'upo').oficial.url, OFFICIAL_HOUSING.upo.url);
  assert.equal(housingSearchFor('Sevilla', 'unia').oficial, null);
  assert.equal(housingSearchFor('Lisboa', 'x'), null);
});

test('faixa de preço só onde há fonte oficial', () => {
  assert.deepEqual(Object.keys(DESTINATION_ASSUMPTIONS).sort(), ['ES', 'Granada', 'Sevilla']);
  const sev = DESTINATION_ASSUMPTIONS.Sevilla.moradia;
  assert.deepEqual(sev.faixa, { min: 300, meio: 350, max: 400 });
  assert.equal(sourceById(sev.fonte).url, 'https://www.upo.es/intl/alojamiento');
});
