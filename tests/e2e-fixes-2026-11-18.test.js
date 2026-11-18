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

// ---------- Problemas médios ----------
import { declarePriorProgress } from '../server/journey-engine.js';
import { suggestWeek, todayFor } from '../server/agenda-engine.js';
import { cleanWeb } from '../server/radar/service.js';

test('progresso anterior respeita "preciso solicitar" e não conclui a 1.3 sem mestrado', () => {
  const user = { requisitos: { passaporte: 'preciso' }, journeys: [] };
  const jr = { id: 'j', universidadeId: 'ugr', missions: {}, dados: {}, situacao: {} };
  const marcadas = declarePriorProgress(user, jr, 'documentos-prontos', { confirmo: true });
  assert.ok(!marcadas.includes('2.1'), 'passaporte não vira pronto');
  assert.ok(!marcadas.includes('1.3'), '1.3 só com programa');
  assert.ok(marcadas.includes('2.2'));
});

test('visto aprovado declara também 5.2 e 5.10', () => {
  const jr = { id: 'j', universidadeId: 'ugr', programaId: 'x', missions: {}, dados: {}, situacao: {} };
  const marcadas = declarePriorProgress({ requisitos: {} }, jr, 'visto-aprovado', { confirmo: true });
  assert.ok(marcadas.includes('5.2') && marcadas.includes('5.10'));
});

test('Agenda: organizar de novo não passa da meta nem sugere horário passado', () => {
  const user = { agenda: { disponibilidade: { dias: [1, 2, 3, 4, 5, 6, 7], janelas: [{ inicio: '00:00', fim: '23:45' }], horasSemanais: 2, preferencia: 'curtas', fuso: 'America/Sao_Paulo' } }, journeys: [], planner: [] };
  const today = todayFor(user);
  const now = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  const first = suggestWeek(user, today, today);
  for (const p of first.proposta) if (p.data === today) assert.ok(p.inicio > now, `${p.inicio} já passou (${now})`);
  user.planner = first.proposta.map((p, i) => ({ ...p, id: `e${i}`, origem: 'agenda-ai' }));
  const again = suggestWeek(user, today, today);
  const mins = (p) => (Number(p.fim.slice(0, 2)) * 60 + Number(p.fim.slice(3))) - (Number(p.inicio.slice(0, 2)) * 60 + Number(p.inicio.slice(3)));
  const total = [...first.proposta, ...again.proposta].reduce((s, p) => s + mins(p), 0);
  assert.ok(total <= 120, `total ${total} min passa da meta de 2 h`);
});

test('site do mestrado: "-" e URLs coladas não viram link quebrado', () => {
  assert.equal(cleanWeb('-'), null);
  assert.equal(cleanWeb('http://a.es/x  y  http://a.es/z'), 'http://a.es/x');
});
