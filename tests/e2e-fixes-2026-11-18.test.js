// Regressões dos 13 problemas graves do E2E de 2026-11-18.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTravel, quoteCost } from '../server/travel-engine.js';
import { ROUTE_TEMPLATES, destinationAirports } from '../server/content/travel.js';
import { applicationProcess, planningCycle } from '../server/application-process.js';
import { ptError } from '../server/zod-pt.js';
import { z } from 'zod';

test('viagem: toda cidade de destino tem percursos e aeroportos', () => {
  for (const c of ['Granada', 'Sevilla', 'Málaga', 'Córdoba', 'Cádiz', 'Huelva', 'Jaén', 'Almería']) {
    assert.ok(ROUTE_TEMPLATES[c]?.length >= 2, c);
    assert.ok(destinationAirports(c).length >= 2, c);
  }
});

test('viagem: cotação sem voo nunca é completa', () => {
  const c = quoteCost({ percursoId: 'via-madri', bagagem: 60, terrestre: 30 });
  assert.equal(c.completo, false);
  assert.ok(c.desconhecidas.includes('voo'));
});

test('viagem: quem estuda em Málaga e chega em Málaga usa o percurso direto, sem trecho por terra', () => {
  const user = { profile: { estado: 'PE' }, journeys: [{ id: 'j1', universidadeId: 'uma' }], travel: { opcoes: [{ id: 'o1', rota: 'Recife → Málaga', voo: 700, malasIncluidas: 1, moeda: 'EUR' }] } };
  const t = computeTravel(user);
  const q = t.cotacoes[0];
  assert.equal(q.percursoId, 'via-malaga');
  assert.equal(q.custo.completo, true);
  assert.deepEqual(q.custo.desconhecidas, []);
});

test('mestrados: ciclo já começado vira referência com alerta, mesmo sem ano na jornada', () => {
  const p = applicationProcess({ id: 'x', nome: 'X', universidadeId: 'ugr' }, { now: new Date('2026-11-18T12:00:00Z') });
  assert.equal(planningCycle(new Date('2026-11-18T12:00:00Z')), '2027/2028');
  assert.match(p.alertas.ciclo, /referência/);
  assert.ok(p.pendencias.some((x) => x.id === 'calendario' && x.texto.includes('2027/2028')));
});

test('validação em português, sem regex nem inglês', () => {
  for (const [s, v] of [[z.string().max(3), 'abcdef'], [z.string().regex(/^\d$/), 'x'], [z.number().positive(), 0], [z.enum(['a']), 'b']]) {
    const m = s.safeParse(v).error.issues[0].message;
    assert.doesNotMatch(m, /expected|Invalid|Too |\/\^/);
  }
  assert.equal(typeof ptError({ code: 'custom' }), 'string');
});
